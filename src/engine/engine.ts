import type { Choice, Content, Effects, GameEvent, NamePool, PersonEffect, Stat } from './schema';
import { STATS } from './schema';
import { Rng } from './rng';
import { DEFAULT_NAME, type LifeChanges, type LifeState, type LogEntry, type Person, humanAge, modifier, worldYear, yearsPerEvent } from './state';
import type { ItemIndex } from './items';
import { activePassives, effectiveStats, maxHp } from './items';
import {
  ADULT_AGE,
  ADULT_HP_REGEN,
  ALIGN_CAP,
  CLASSES,
  CLASS_PRIMARY_BONUS,
  CLASS_SECONDARY_BONUS,
  CLERIC_DRIFT_FLAG,
  PROTECTED_AGE,
  RACES,
  REPEAT_GAP,
  REPUTATION_CAP,
  STAT_CAP,
  WORLD_CAP,
  WORLD_KEYS,
  type ClassId,
  type RaceId,
} from './balance';
import { clericDrifted, situationalBonus } from './rules';

export interface Game {
  events: GameEvent[];
  items: ItemIndex;
  names: Map<string, NamePool>;
}

export function makeGame(content: Content): Game {
  return {
    events: content.events,
    items: new Map(content.items.map((i) => [i.id, i])),
    names: new Map(content.names.map((n) => [n.race, n])),
  };
}

const clamp = (n: number, cap: number) => Math.max(-cap, Math.min(cap, n));

interface StateConds {
  gender?: 'm' | 'f' | undefined;
  class?: string | undefined;
  god?: string | undefined;
  world?: Partial<Record<(typeof WORLD_KEYS)[number], [number, number]>> | undefined;
  min_reputation?: Partial<Record<string, number>> | undefined;
  max_reputation?: Partial<Record<string, number>> | undefined;
}

/** เงื่อนไขสถานะโลกและตัวละครที่ใช้ร่วมกันระหว่างเหตุการณ์ (when) และตัวเลือก (requires) */
function stateConditionsMet(life: LifeState, c: StateConds): boolean {
  if (c.gender && life.gender !== c.gender) return false;
  if (c.class && life.classId !== c.class) return false;
  if (c.god && life.god !== c.god) return false;
  for (const [k, range] of Object.entries(c.world ?? {})) {
    const v = life.world[k as keyof typeof life.world];
    if (range && (v < range[0] || v > range[1])) return false;
  }
  for (const [f, min] of Object.entries(c.min_reputation ?? {})) if ((life.reputation[f] ?? 0) < (min ?? 0)) return false;
  for (const [f, max] of Object.entries(c.max_reputation ?? {})) if ((life.reputation[f] ?? 0) > (max ?? 0)) return false;
  return true;
}

export function eligible(life: LifeState, ev: GameEvent): boolean {
  const w = ev.when;
  if (ev.once && life.seen.includes(ev.id)) return false;
  if (w.age) {
    const a = humanAge(life);
    if (a < w.age[0] || a > w.age[1]) return false;
  }
  if (w.year) {
    const y = worldYear(life);
    if (y < w.year[0] || y > w.year[1]) return false;
  }
  if (w.location_tag && w.location_tag !== life.locationTag) return false;
  if (w.flags?.some((f) => !life.flags.includes(f))) return false;
  if (w.not_flags?.some((f) => life.flags.includes(f))) return false;
  if (w.trait && !life.traits.includes(w.trait)) return false;
  return stateConditionsMet(life, w);
}

/** เข้าเงื่อนไขและมีตัวเลือกให้กดอย่างน้อยหนึ่งข้อ เหตุการณ์ที่ไม่มีตัวเลือกเหลือจะไม่ถูกหยิบมาแสดง (กันทางตัน) */
export function playable(life: LifeState, ev: GameEvent): boolean {
  return eligible(life, ev) && ev.choices.some((c) => choiceAvailable(life, c));
}

/**
 * จำนวนเหตุการณ์ที่เหลือก่อนช่วงอายุหรือช่วงปีของเหตุการณ์นี้จะปิด (0 = ครั้งนี้เป็นโอกาสสุดท้าย)
 * ใช้เรียงเหตุการณ์ must ที่พร้อมกันหลายเรื่อง
 */
export function turnsLeft(life: LifeState, ev: GameEvent): number {
  const w = ev.when;
  const byAge = w.age ? Math.floor(w.age[1] - humanAge(life)) : Infinity;
  const byYear = w.year ? Math.floor((w.year[1] - worldYear(life)) / yearsPerEvent(life)) : Infinity;
  return Math.min(byAge, byYear);
}

/** เหตุการณ์ที่เกิดซ้ำได้ซึ่งเพิ่งออกไปใน REPEAT_GAP เหตุการณ์ล่าสุด */
function recentlySeen(life: LifeState, ev: GameEvent): boolean {
  if (ev.once) return false;
  return life.log.slice(-REPEAT_GAP).some((e) => e.eventId === ev.id);
}

/**
 * เลือกเหตุการณ์ถัดไป ลำดับคือ
 * 1. forceId (เช่น ตอนสร้างตัวละครเลือกกำเนิดเอง) ใช้เหตุการณ์นั้นแทนการสุ่ม
 * 2. เหตุการณ์ must ที่เข้าเงื่อนไข ออกทันทีโดยไม่สุ่ม เรื่องที่ช่วงเวลาจะปิดก่อนได้ก่อน ถ้าเท่ากันเรื่องที่ weight สูงกว่าได้ก่อน
 * 3. สุ่มแบบถ่วงน้ำหนักจากเรื่องที่เหลือ โดยเว้นเรื่องเกิดซ้ำที่เพิ่งออกไป (ถ้าไม่มีเรื่องอื่นจึงยอมให้ซ้ำ)
 */
export function pickEvent(game: Game, life: LifeState, forceId?: string): { event: GameEvent | null; life: LifeState } {
  if (forceId) {
    const forced = game.events.find((e) => e.id === forceId) ?? null;
    return { event: forced, life: forced ? { ...life, currentEventId: forced.id } : life };
  }
  const all = game.events.filter((e) => playable(life, e));
  if (all.length === 0) return { event: null, life };
  const must = all.filter((e) => e.must);
  if (must.length) {
    let first = must[0]!;
    let left = turnsLeft(life, first);
    for (const e of must.slice(1)) {
      const t = turnsLeft(life, e);
      if (t < left || (t === left && e.weight > first.weight)) {
        first = e;
        left = t;
      }
    }
    return { event: first, life: { ...life, currentEventId: first.id } };
  }
  const rested = all.filter((e) => !recentlySeen(life, e));
  const pool = rested.length ? rested : all;
  const rng = Rng.fromState(life.rngState);
  const total = pool.reduce((n, e) => n + e.weight, 0);
  let r = rng.next() * total;
  let chosen = pool[pool.length - 1]!;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) {
      chosen = e;
      break;
    }
  }
  return { event: chosen, life: { ...life, rngState: rng.state, currentEventId: chosen.id } };
}

/**
 * ซ่อมชีวิตที่โหลดมาแล้วเล่นต่อไม่ได้: ยังมีชีวิตอยู่แต่ไม่มีเหตุการณ์ปัจจุบัน เหตุการณ์ที่ค้างอยู่ถูกลบหรือเปลี่ยนชื่อไปแล้ว
 * หรือเหตุการณ์นั้นไม่เหลือตัวเลือกให้กด (เนื้อหาเปลี่ยนหลังเซฟ) ให้หยิบเหตุการณ์ใหม่ ถ้าไม่มีให้หยิบถือว่าเรื่องหมด
 */
export function repairLife(game: Game, life: LifeState): LifeState {
  if (!life.alive) return life;
  const ev = game.events.find((e) => e.id === life.currentEventId);
  if (ev && ev.choices.some((c) => choiceAvailable(life, c))) return life;
  const { event, life: next } = pickEvent(game, { ...life, currentEventId: null });
  return event ? next : { ...next, alive: false, endReason: 'content_end' };
}

export function choiceAvailable(life: LifeState, choice: Choice): boolean {
  const r = choice.requires;
  if (!r) return true;
  if (r.trait && !life.traits.includes(r.trait)) return false;
  if (r.flag && !life.flags.includes(r.flag)) return false;
  if (r.not_flags?.some((f) => life.flags.includes(f))) return false;
  if (r.item && !life.inventory.includes(r.item)) return false;
  if (r.min_gold !== undefined && life.gold < r.min_gold) return false;
  for (const [s, min] of Object.entries(r.min_stat ?? {})) {
    if (life.stats[s as keyof typeof life.stats] < (min ?? 0)) return false;
  }
  return stateConditionsMet(life, r);
}

/** เหตุผลที่ตัวเลือกยังใช้ไม่ได้: 'hidden' = ซ่อน (ปลดด้วย trait ของ flag หรือสถานะ), หรือรายการ stat ที่ยังไม่ถึง */
export type LockState = null | 'hidden' | { stat: Stat; min: number }[];

export function choiceLock(life: LifeState, choice: Choice): LockState {
  if (choiceAvailable(life, choice)) return null;
  const r = choice.requires!;
  const { min_stat, ...rest } = r;
  // ถ้าเงื่อนไขอื่นผ่านหมดและติดแค่ stat ให้โชว์เป็นตัวเลือกล็อกพร้อมเหตุผล
  if (!choiceAvailable(life, { ...choice, requires: rest })) return 'hidden';
  const short: { stat: Stat; min: number }[] = [];
  for (const [st, min] of Object.entries(min_stat ?? {})) {
    if (life.stats[st as Stat] < (min ?? 0)) short.push({ stat: st as Stat, min: min ?? 0 });
  }
  return short.length ? short : 'hidden';
}

/** โบนัสรวมของเช็ค (ค่า stat รวมของสวมใส่ + สถานการณ์ + passive) */
export function checkModifier(game: Game, life: LifeState, check: NonNullable<Choice['check']>): number {
  const stats = effectiveStats(life, game.items);
  let mod = modifier(stats[check.stat]) + situationalBonus(life, check.stat, check.foe);
  for (const p of activePassives(life, game.items)) if (p.kind === 'check_bonus' && p.stat === check.stat) mod += p.amount;
  return mod;
}

/** โอกาสสำเร็จ 0 ถึง 1 ตามกติกาเดียวกับ resolveChoice (20 ผ่านเสมอ 1 พลาดเสมอ ทอยใหม่ได้ถ้ามี passive) */
export function checkChance(game: Game, life: LifeState, check: NonNullable<Choice['check']>): number {
  const mod = checkModifier(game, life, check);
  let wins = 0;
  for (let d = 1; d <= 20; d++) if (d === 20 || (d !== 1 && d + mod >= check.dc)) wins++;
  const p = wins / 20;
  const reroll = activePassives(life, game.items).some((x) => x.kind === 'reroll_failed_check');
  return reroll ? 1 - (1 - p) * (1 - p) : p;
}

export const CLOSENESS_CAP = 5;
/** พ่อแม่เริ่มที่ความสนิทเท่านี้ */
export const PARENT_CLOSENESS = 3;
/** คู่ครองปัจจุบัน (life.partner) อยู่ในรายชื่อคนด้วย id นี้ คนเก่าที่ถูกแทนย้ายไปเป็น partner_2, partner_3 ... */
export const PARTNER_PERSON_ID = 'partner';
/** คนรักเริ่มที่ความสนิทเท่านี้ */
export const PARTNER_CLOSENESS = 3;
/** flag ที่เนื้อหาตั้งเมื่อแต่งงาน และเมื่อคู่ครองจากไป */
export const MARRIED_FLAG = 'married';
export const PARTNER_DIED_FLAG = 'partner_died';

/** รวม effects.people เข้ากับรายชื่อเดิม (อ้างด้วย id) คนที่ไม่เคยมีและไม่มีชื่อจะถูกข้าม */
export function applyPeople(people: Person[], fx: PersonEffect[], age: number): Person[] {
  const out = people.map((p) => ({ ...p }));
  for (const e of fx) {
    let p = out.find((x) => x.id === e.id);
    if (!p) {
      if (!e.name) continue;
      p = { id: e.id, name: e.name, closeness: 0, alive: true, metAge: age };
      out.push(p);
    }
    if (e.name) p.name = e.name;
    if (e.gender) p.gender = e.gender;
    if (e.kin) p.kin = e.kin;
    if (e.bond) p.bond = e.bond;
    if (e.closeness) p.closeness = clamp(p.closeness + e.closeness, CLOSENESS_CAP);
    if (e.dies && p.alive) {
      p.alive = false;
      p.diedAge = age;
    }
  }
  return out;
}

function diffLife(before: LifeState, after: LifeState): LifeChanges | undefined {
  const c: LifeChanges = {};
  for (const s of STATS) {
    const d = after.stats[s] - before.stats[s];
    if (d) (c.stats ??= {})[s] = d;
  }
  if (after.hp !== before.hp) c.hp = after.hp - before.hp;
  if (after.gold !== before.gold) c.gold = after.gold - before.gold;
  const items = after.inventory.filter((i) => !before.inventory.includes(i));
  if (items.length) c.items = items;
  const traits = after.traits.filter((t) => !before.traits.includes(t));
  if (traits.length) c.traits = traits;
  if (after.classId && after.classId !== before.classId) c.classId = after.classId;
  return Object.keys(c).length ? c : undefined;
}

export function applyEffects(game: Game, life: LifeState, fx: Effects | undefined): LifeState {
  if (!fx) return life;
  const next: LifeState = {
    ...life,
    stats: { ...life.stats },
    flags: [...life.flags],
    traits: [...life.traits],
    inventory: [...life.inventory],
    world: { ...life.world },
    alignment: { ...life.alignment },
    reputation: { ...life.reputation },
  };
  for (const s of STATS) {
    const d = fx.stats?.[s] ?? 0;
    // ค่าที่เพิ่มหยุดที่ STAT_CAP ค่าที่เกินอยู่แล้ว (โบนัสเผ่าหรืออาชีพ) ไม่ถูกลดลง
    next.stats[s] = d > 0 ? Math.max(next.stats[s], Math.min(STAT_CAP, next.stats[s] + d)) : next.stats[s] + d;
  }
  next.gold = addGold(life.gold, fx.gold ?? 0, fx.debt === true);
  for (const f of fx.flags ?? []) if (!next.flags.includes(f)) next.flags.push(f);
  next.flags = next.flags.filter((f) => !fx.clear_flags?.includes(f));
  for (const t of fx.traits ?? []) if (!next.traits.includes(t)) next.traits.push(t);
  for (const i of fx.items ?? []) if (!next.inventory.includes(i)) next.inventory.push(i);
  if (fx.location_tag) {
    next.locationTag = fx.location_tag;
    next.homeTag ??= fx.location_tag;
  }
  for (const k of WORLD_KEYS) if (fx.world?.[k]) next.world[k] = clamp(next.world[k] + fx.world[k]!, WORLD_CAP);
  if (fx.alignment?.law) next.alignment.law = clamp(next.alignment.law + fx.alignment.law, ALIGN_CAP);
  if (fx.alignment?.moral) next.alignment.moral = clamp(next.alignment.moral + fx.alignment.moral, ALIGN_CAP);
  for (const [f, d] of Object.entries(fx.reputation ?? {})) {
    next.reputation[f] = clamp((next.reputation[f] ?? 0) + (d ?? 0), REPUTATION_CAP);
  }
  if (fx.god) next.god = fx.god;
  if (fx.people?.length) next.people = applyPeople(next.people ?? [], fx.people, next.age);
  if (fx.name_pool) next.namePool = { ...next.namePool, ...fx.name_pool };
  if (fx.partner) {
    next.partner = { name: '', gender: fx.partner.gender, pool: fx.partner.pool ?? defaultPartnerPool(next) };
    // คนรักคนเก่ายังอยู่บนผังความสัมพันธ์ แต่ไม่ใช่คู่ครองแล้ว
    const old = (next.people ?? []).find((p) => p.id === PARTNER_PERSON_ID);
    if (old) {
      const n = (next.people ?? []).filter((p) => /^partner_\d+$/.test(p.id)).length + 2;
      next.people = (next.people ?? []).map((p) => (p === old ? { ...p, id: `partner_${n}`, kin: undefined } : p));
    }
  }
  if (next.partner?.name && (next.people ?? []).some((p) => p.id === PARTNER_PERSON_ID)) {
    const pfx: PersonEffect = { id: PARTNER_PERSON_ID };
    if (fx.flags?.includes(MARRIED_FLAG)) pfx.kin = 'spouse';
    if (fx.flags?.includes(PARTNER_DIED_FLAG)) pfx.dies = true;
    if (pfx.kin || pfx.dies) next.people = applyPeople(next.people, [pfx], next.age);
  }
  let classHp = 0;
  if (fx.class && !next.classId) {
    const def = CLASSES[fx.class as ClassId];
    next.classId = fx.class;
    next.stats[def.primary] += CLASS_PRIMARY_BONUS;
    next.stats[def.secondary] += CLASS_SECONDARY_BONUS;
    next.baseMaxHp += def.hp;
    classHp = def.hp;
  }
  const cap = maxHp(next, game.items);
  next.hp = Math.min(cap, next.hp + (fx.hp ?? 0) + classHp);
  if (next.age < PROTECTED_AGE) {
    // ผู้เล่นตายก่อนอายุ PROTECTED_AGE ไม่ได้ ไม่ว่าเนื้อหาจะเขียนอะไร
    next.hp = Math.max(1, next.hp);
  } else if (fx.die || next.hp <= 0) {
    next.hp = Math.max(0, next.hp);
    next.alive = false;
    next.endReason = 'death';
  }
  return next;
}

/**
 * เงินที่เสีย (ค่าปรับ โดนขโมย ของพัง) เอาไปได้แค่เท่าที่มี เงินติดลบได้เฉพาะ effect ที่มี debt: true คือหนี้ที่เลือกก่อเอง
 * คนที่ติดหนี้อยู่แล้วเสียเงินแบบไม่ใช่หนี้ก็ไม่ติดลบเพิ่ม เพราะไม่มีเหรียญให้เสีย
 */
export function addGold(gold: number, delta: number, debt: boolean): number {
  if (delta >= 0 || debt) return gold + delta;
  return Math.max(Math.min(gold, 0), gold + delta);
}

/** กลุ่มชื่อของคนรักเมื่อเนื้อหาไม่ระบุ: กลุ่มของพ่อแม่ ถ้าไม่มีพ่อแม่ใช้กลุ่มตามเผ่า ถ้ายังไม่มีใช้ human */
function defaultPartnerPool(life: LifeState): string {
  const parents = life.namePool.parents;
  if (parents && parents !== 'none') return parents;
  return life.raceApplied ?? 'human';
}

function pickName(pool: NamePool | undefined, gender: 'm' | 'f', rng: Rng, avoid: string[] = []): string | null {
  const list = (gender === 'm' ? pool?.male : pool?.female) ?? [];
  const free = list.filter((n) => !avoid.includes(n));
  const from = free.length ? free : list;
  return from.length ? from[rng.int(0, from.length - 1)]! : null;
}

/**
 * ค่าที่ต้องคำนวณตามหลังผลของตัวเลือก: โบนัสเผ่า (ครั้งแรกที่มี flag race_<id>), ชื่อตัวละครและพ่อแม่,
 * และ flag cleric_drift ที่ซิงก์กับแนวทางของนักบวช
 */
export function settle(game: Game, life: LifeState, rng: Rng): LifeState {
  let next = life;
  const raceFlag = next.flags.find((f) => f.startsWith('race_'));
  const race = raceFlag?.slice(5);
  if (race && race in RACES && next.raceApplied !== race) {
    const def = RACES[race as RaceId];
    next = { ...next, stats: { ...next.stats }, traits: [...next.traits], raceApplied: race };
    for (const s of STATS) next.stats[s] += (def.bonus as Partial<Record<(typeof STATS)[number], number>>)[s] ?? 0;
    for (const t of def.traits) if (!next.traits.includes(t)) next.traits.push(t);
  }
  if (!next.namesApplied && (race || next.namePool.self || next.namePool.parents)) {
    // กลุ่มชื่อ: effects.name_pool ทับค่าตามเผ่า parents: none = ไม่มีพ่อแม่ที่รู้จัก
    const selfPool = game.names.get(next.namePool.self ?? race ?? '');
    const parentsId = next.namePool.parents ?? race ?? '';
    const parentsPool = parentsId === 'none' ? undefined : game.names.get(parentsId);
    next = { ...next, namesApplied: true };
    const mother = pickName(parentsPool, 'f', rng);
    const father = pickName(parentsPool, 'm', rng);
    if (father && mother) {
      next.parents = { father, mother };
      next.people = applyPeople(next.people ?? [], [
        { id: 'father', name: father, gender: 'm', kin: 'father', bond: 'kin', closeness: PARENT_CLOSENESS },
        { id: 'mother', name: mother, gender: 'f', kin: 'mother', bond: 'kin', closeness: PARENT_CLOSENESS },
      ], next.age);
    }
    if (next.name === DEFAULT_NAME) {
      const own = pickName(selfPool, next.gender, rng, [father ?? '', mother ?? '']);
      if (own) next.name = own;
    }
    const sur = selfPool?.surname ?? [];
    if (sur.length) next.surname = sur[rng.int(0, sur.length - 1)]!;
  }
  if (next.partner && !next.partner.name) {
    const avoid = [next.name, next.parents?.father ?? '', next.parents?.mother ?? ''];
    const pool = game.names.get(next.partner.pool) ?? game.names.get('human');
    const name = pickName(pool, next.partner.gender, rng, avoid);
    if (name) next = { ...next, partner: { ...next.partner, name } };
  }
  if (next.partner?.name && !(next.people ?? []).some((p) => p.id === PARTNER_PERSON_ID)) {
    const married = next.flags.includes(MARRIED_FLAG);
    next = {
      ...next,
      people: applyPeople(next.people ?? [], [
        { id: PARTNER_PERSON_ID, name: next.partner.name, gender: next.partner.gender, bond: 'love', closeness: PARTNER_CLOSENESS, ...(married ? { kin: 'spouse' as const } : {}) },
      ], next.age),
    };
  }
  const drifted = clericDrifted(next);
  const has = next.flags.includes(CLERIC_DRIFT_FLAG);
  if (drifted !== has) {
    next = { ...next, flags: drifted ? [...next.flags, CLERIC_DRIFT_FLAG] : next.flags.filter((f) => f !== CLERIC_DRIFT_FLAG) };
  }
  return next;
}

export interface ChoiceResult {
  life: LifeState;
  entry: LogEntry;
}

/** Resolve a choice: optional d20 check, apply effects, mark event seen, advance age. */
export function resolveChoice(game: Game, life: LifeState, eventId: string, choiceId: string): ChoiceResult {
  const ev = game.events.find((e) => e.id === eventId);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !choice) throw new Error(`ไม่พบตัวเลือก ${eventId}/${choiceId}`);
  if (!choiceAvailable(life, choice)) throw new Error(`ตัวเลือก ${choiceId} ยังใช้ไม่ได้`);

  const rng = Rng.fromState(life.rngState);
  let next = applyEffects(game, life, choice.effects);
  const entry: LogEntry = { age: life.age, eventId, choiceId };
  const texts: string[] = choice.text ? [choice.text] : [];

  if (choice.check) {
    const passives = activePassives(life, game.items);
    const mod = checkModifier(game, life, choice.check);
    // natural 20 always succeeds, natural 1 always fails (SRD convention)
    const passes = (d: number) => d === 20 || (d !== 1 && d + mod >= choice.check!.dc);
    let d20 = rng.d20();
    // ทอยใหม่ทุกครั้งที่ครั้งแรกพลาด รวมถึงทอยได้ 1 ตอนโบนัสสูง ให้ตรงกับโอกาสที่ checkChance โชว์บนปุ่ม
    if (!passes(d20) && passives.some((p) => p.kind === 'reroll_failed_check')) {
      d20 = Math.max(d20, rng.d20());
    }
    const success = passes(d20);
    entry.roll = { d20, mod, dc: choice.check.dc, success };
    const outcome = success ? choice.success : choice.failure;
    next = applyEffects(game, next, outcome?.effects);
    if (outcome?.text) texts.push(outcome.text);
  }
  if (texts.length) entry.text = texts.join('\n\n');

  next = settle(game, next, rng);
  const changes = diffLife(life, next);
  if (changes) entry.changes = changes;
  if (next.alive && life.age >= ADULT_AGE) {
    // ผู้ใหญ่พักแผลได้ปีละ ADULT_HP_REGEN แผลถาวรให้เนื้อหาตั้งเป็น flag แทน
    next = { ...next, hp: Math.min(maxHp(next, game.items), next.hp + ADULT_HP_REGEN) };
  }
  next = {
    ...next,
    rngState: rng.state,
    seen: next.seen.includes(ev.id) ? next.seen : [...next.seen, ev.id],
    age: next.age + yearsPerEvent(next),
    currentEventId: null,
    log: [...next.log, entry],
  };
  return { life: next, entry };
}

import type { Choice, CityCond, Content, DeathCause, Effects, FoeDef, GameEvent, NamePool, OrgCond, PersonEffect, Requires, Shop, Stat } from './schema';
import { STATS } from './schema';
import { Rng } from './rng';
import {
  DEFAULT_NAME,
  type LifeChanges,
  type LifeState,
  type LogEntry,
  type Person,
  type YearEnd,
  ageScale,
  lastRealAge,
  modifier,
  stageAge,
  worldYear,
} from './state';
import type { ItemIndex } from './items';
import { activePassives, effectiveStats, gearCheckBonus, maxHp } from './items';
import {
  ADULT_AGE,
  ALIGN_CAP,
  ARMED_CLASSES,
  CHILD_CLOSENESS,
  CLASSES,
  CLASS_PRIMARY_BONUS,
  CLASS_SECONDARY_BONUS,
  CLERIC_DRIFT_FLAG,
  DECLINE,
  ENCOUNTER,
  GEAR,
  HP_REGEN,
  PROTECTED_AGE,
  RACES,
  REPEAT_GAP,
  REPUTATION_CAP,
  STAT_CAP,
  STORY_END_YEAR,
  TABOO,
  TABOOS,
  THIN_POOL,
  WINTER,
  WORLD_CAP,
  WORLD_KEYS,
  CITY_IDS,
  type CityId,
  type ClassId,
  type ItemTag,
  type MaterialId,
  type OrgId,
  type RaceId,
  type Rarity,
} from './balance';
import { clericDrifted, situationalBonus } from './rules';
import { bindCast, estimateBorn, livingChildren, personYears, yearlyPassings } from './people';
import { mentionsOf, render, type Mention } from './text';
import { countHabit, deathWard, hasBigRoom, isAgeless, traitCheckBonus, traitCheckBonuses, traitMaxHp, traitRegen, traitWinter, type TraitIndex, habitBlockers } from './traits';
import { beginEncounter, openMoves } from './encounter';
import { addItem, coldIron, hasTag, owns, wearYear, wearsMaterial, wearsRarity } from './gear';
import { applyOrgEffects, dutiesDue, dutyResting, eventWeight, fadeHunts, fightsForOrg, huntLevel, isMember, orgCondMet, recordDuty, syncJobOrgs, type DutyResult } from './orgs';
import { applyCityEffects, cityCondMet, cityRank, cityYear, homeHere, moodOf, roofBonus, standingIn, syncCity } from './cities';
import { advanceCourse, applyCourseEffects, courseSlotOpen } from './course';
import { advanceArc, arcDue, arcLastSteps, arcSlotOpen, closeArc, type ArcLast } from './arcs';
import { applyTaboos, tabooCondMet, type TabooCond } from './land';

export interface Game {
  events: GameEvent[];
  items: ItemIndex;
  names: Map<string, NamePool>;
  /** ทะเบียนสิ่งติดตัว */
  traits: TraitIndex;
  /** ศัตรูในการปะทะ */
  foes: Map<string, FoeDef>;
  /** ร้านค้า (content/shops.yaml) */
  shops: Shop[];
  /** ประโยคสั้นที่ระบบเติมในบันทึกชีวิต (ดู Content.lines) */
  lines: Record<string, string[]>;
  /** คนที่ข้อความของเหตุการณ์หรือตัวเลือกเอ่ยถึงด้วยชื่อตายตัว ({partner} {father} {mother} {child}) */
  mentions: WeakMap<object, Mention[]>;
  /** คนที่เนื้อเรื่องเขียนฉากลาไว้ให้แล้ว (มีเหตุการณ์ที่ให้คนนี้จากไปด้วย id ตรงตัว) ระบบไม่เอาไปเงียบๆ ก่อนถึงวัยชรามาก */
  fated: Set<string>;
  /** งานที่องค์กรส่งมา: รหัสเหตุการณ์ → องค์กร (เหตุการณ์ที่มี duty) */
  duties: Map<string, OrgId>;
  /** ตอนสุดท้ายของเส้นเรื่องยาวแต่ละเส้นเท่าที่เนื้อหามี (ดู arcs.ts) */
  arcLast: ArcLast;
}

export function makeGame(content: Content): Game {
  const mentions = new WeakMap<object, Mention[]>();
  const fated = new Set<string>();
  const fate = (people?: PersonEffect[]) => {
    for (const pe of people ?? []) if (pe.dies && !pe.id.startsWith('@')) fated.add(pe.id);
  };
  for (const e of content.events) {
    const m = mentionsOf(e.text);
    if (m.length) mentions.set(e, m);
    fate(e.people);
    const enc = e.encounter;
    if (enc) {
      for (const out of [enc.win, enc.lose, enc.stalemate, enc.flee, enc.parley]) fate(out?.effects?.people);
      // ข้อความของการปะทะเอ่ยถึงใคร เหตุการณ์ทั้งเรื่องต้องมีคนนั้นอยู่
      const texts = [...enc.beats.flatMap((b) => [b.text, ...b.moves.flatMap((mv) => [mv.label, mv.success, mv.failure])]), ...[enc.win, enc.lose, enc.stalemate, enc.flee, enc.parley, enc.death].map((o) => o?.text)];
      const all = [...new Set([...m, ...mentionsOf(...texts)])];
      if (all.length) mentions.set(e, all);
    }
    for (const c of e.choices) {
      for (const fx of [c.effects, c.success?.effects, c.failure?.effects]) fate(fx?.people);
      // ตัวเลือกที่พาคนรักหรือลูกเข้ามาในชีวิตเองเอ่ยชื่อคนนั้นได้
      const brings = [c.effects, c.success?.effects, c.failure?.effects];
      const cm = mentionsOf(c.label, c.text, c.success?.text, c.failure?.text).filter(
        (who) => !(who === 'partner' && brings.some((fx) => fx?.partner)) && !(who === 'child' && brings.some((fx) => fx?.child)),
      );
      if (cm.length) mentions.set(c, cm);
    }
  }
  return {
    events: content.events,
    items: new Map(content.items.map((i) => [i.id, i])),
    names: new Map(content.names.map((n) => [n.race, n])),
    traits: new Map(content.traits.map((t) => [t.id, t])),
    foes: new Map((content.foes ?? []).map((f) => [f.id, f])),
    shops: content.shops ?? [],
    lines: content.lines,
    mentions,
    fated,
    duties: new Map(content.events.flatMap((e) => (e.duty ? [[e.id, e.duty] as const] : []))),
    arcLast: arcLastSteps(content.events),
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
  not_traits?: string[] | undefined;
  big_room?: boolean | undefined;
  has_tag?: ItemTag | undefined;
  wears?: MaterialId | undefined;
  not_wears?: MaterialId[] | undefined;
  wears_rarity?: Rarity | undefined;
  org?: OrgCond | undefined;
  not_orgs?: OrgId[] | undefined;
  min_hunted?: Partial<Record<string, number>> | undefined;
  max_hunted?: Partial<Record<string, number>> | undefined;
  city?: CityCond | undefined;
  taboo?: TabooCond | undefined;
}

/** เงื่อนไขสถานะโลกและตัวละครที่ใช้ร่วมกันระหว่างเหตุการณ์ (when) และตัวเลือก (requires) */
function stateConditionsMet(game: Game, life: LifeState, c: StateConds): boolean {
  if (c.gender && life.gender !== c.gender) return false;
  if (c.class && life.classId !== c.class) return false;
  if (c.god && life.god !== c.god) return false;
  for (const [k, range] of Object.entries(c.world ?? {})) {
    const v = life.world[k as keyof typeof life.world];
    if (range && (v < range[0] || v > range[1])) return false;
  }
  for (const [f, min] of Object.entries(c.min_reputation ?? {})) if ((life.reputation[f] ?? 0) < (min ?? 0)) return false;
  for (const [f, max] of Object.entries(c.max_reputation ?? {})) if ((life.reputation[f] ?? 0) > (max ?? 0)) return false;
  if (c.not_traits?.some((t) => life.traits.includes(t))) return false;
  if (c.big_room !== undefined && hasBigRoom(life, game.traits) !== c.big_room) return false;
  if (c.has_tag && !hasTag(game, life, c.has_tag)) return false;
  if (c.wears && !wearsMaterial(game, life, c.wears)) return false;
  if (c.not_wears?.some((m) => wearsMaterial(game, life, m))) return false;
  if (c.wears_rarity && !wearsRarity(game, life, c.wears_rarity)) return false;
  if (c.org && !orgCondMet(life, c.org)) return false;
  if (c.not_orgs?.some((id) => isMember(life, id))) return false;
  for (const [by, min] of Object.entries(c.min_hunted ?? {})) if (huntLevel(life, by) < (min ?? 0)) return false;
  for (const [by, max] of Object.entries(c.max_hunted ?? {})) if (huntLevel(life, by) > (max ?? 0)) return false;
  if (c.city !== undefined && !cityCondMet(life, c.city)) return false;
  if (c.taboo && !tabooCondMet(life, c.taboo)) return false;
  return true;
}

// ---------- คนที่ข้อความเอ่ยถึง ----------

export const CLOSENESS_CAP = 5;
/** พ่อแม่เริ่มที่ความสนิทเท่านี้ */
export const PARENT_CLOSENESS = 3;
/** คู่ครองปัจจุบัน (life.partner) อยู่ในรายชื่อคนด้วย id นี้ คนเก่าที่ถูกแทนย้ายไปเป็น partner_2, partner_3 ... */
export const PARTNER_PERSON_ID = 'partner';
/** คนรักเริ่มที่ความสนิทเท่านี้ */
export const PARTNER_CLOSENESS = 3;
/** flag ที่เนื้อหาตั้งเมื่อแต่งงาน มีคนรัก และมีลูก */
export const MARRIED_FLAG = 'married';
export const HAS_PARTNER_FLAG = 'has_partner';
export const HAS_CHILD_FLAG = 'has_child';
/**
 * flag ที่ตั้งเมื่อคนสำคัญจากไป ไม่ว่าจะจากเนื้อหาหรือจากวัย เหตุการณ์ที่เล่าถึงคนที่ตายแล้วด้วย {partner} {father} {mother}
 * ต้องมี flag ของคนนั้นใน when.flags ไม่อย่างนั้นระบบไม่ให้ออก
 */
export const PARTNER_DIED_FLAG = 'partner_died';
export const DIED_FLAG: Partial<Record<Mention, string>> = { partner: PARTNER_DIED_FLAG, father: 'father_died', mother: 'mother_died' };
const DIED_ID: Record<string, string> = { [PARTNER_PERSON_ID]: PARTNER_DIED_FLAG, father: 'father_died', mother: 'mother_died' };

const personById = (life: LifeState, id: string) => (life.people ?? []).find((p) => p.id === id);

/** คนที่ข้อความเอ่ยถึงยังอยู่ให้เอ่ยถึงไหม */
function present(life: LifeState, who: Mention): boolean {
  if (who === 'partner') return !!life.partner && personById(life, PARTNER_PERSON_ID)?.alive !== false;
  if (who === 'child') return livingChildren(life).length > 0;
  // ก่อนรู้เผ่า (ยังไม่ได้สุ่มชื่อ) เรื่องเล่าใช้คำว่า "พ่อ" "แม่" ได้ ส่วนเด็กที่ไม่รู้จักพ่อแม่ไม่มีใครให้เอ่ยถึง
  if (!life.namesApplied) return true;
  return !!life.parents && personById(life, who)?.alive !== false;
}

/**
 * ข้อความเอ่ยถึงคนที่ไม่อยู่ และไม่ได้ตั้งใจเล่าถึงคนตาย
 * (เล่าถึงคนตายได้เมื่อ flag ของคนนั้นอยู่ใน when.flags ของเหตุการณ์ หรือเป็น requires.flag ของตัวเลือกนั้น)
 */
function namesTheAbsent(game: Game, life: LifeState, of: GameEvent | Choice, ev?: GameEvent): boolean {
  for (const who of game.mentions.get(of) ?? []) {
    if (present(life, who)) continue;
    const flag = DIED_FLAG[who];
    const meant = flag && (ev?.when.flags?.includes(flag) || ('requires' in of && of.requires?.flag === flag));
    if (meant && life.flags.includes(flag)) continue;
    return true;
  }
  return false;
}

// ---------- เงื่อนไขของเหตุการณ์และตัวเลือก ----------

/** เข้าเงื่อนไขไหม ignoreTime = ไม่ดูช่วงอายุและช่วงปี (ใช้ถามว่าเรื่องนี้จะมาถึงชีวิตนี้ได้ไหม) */
export function eligible(game: Game, life: LifeState, ev: GameEvent, ignoreTime = false): boolean {
  const w = ev.when;
  if (ev.once && life.seen.includes(ev.id)) return false;
  // ตอนกำลังจะตายออกได้แต่ฉากตายของเหตุนั้น และฉากตายไม่ออกตอนอื่น
  if ((ev.stage === 'death') !== !!life.dying) return false;
  if (life.dying && !w.dying?.includes(life.dying)) return false;
  if (life.dying && w.told !== undefined && w.told !== !!life.deathTold) return false;
  // พ้นปีสุดท้ายที่มีเรื่องเขียนไว้ เหลือแต่ฉากตายที่ยังออกได้
  if (!life.dying && worldYear(life) > STORY_END_YEAR) return false;
  if (!ignoreTime) {
    if (w.age) {
      const a = stageAge(life);
      if (a < w.age[0] || a > w.age[1]) return false;
    }
    if (w.year) {
      const y = worldYear(life);
      if (y < w.year[0] || y > w.year[1]) return false;
    }
  }
  if (w.location_tag && w.location_tag !== life.locationTag) return false;
  if (w.flags?.some((f) => !life.flags.includes(f))) return false;
  if (w.not_flags?.some((f) => life.flags.includes(f))) return false;
  if (w.trait && !life.traits.includes(w.trait)) return false;
  // งานขององค์กรออกเฉพาะกับสมาชิก เรื่องถูกตามล่าออกเฉพาะเมื่อฝ่ายนั้นตามอยู่
  if (ev.duty && !isMember(life, ev.duty)) return false;
  if (ev.hunt && huntLevel(life, ev.hunt) < 1) return false;
  // เหตุการณ์ของหลักสูตรออกเฉพาะกับคนที่เรียนอยู่ในปีและสายนั้น
  if (!courseSlotOpen(life, ev.course)) return false;
  // ตอนของเส้นเรื่องยาวออกตามลำดับ เว้นจังหวะ และเปิดค้างพร้อมกันได้จำกัด
  if (!arcSlotOpen(life, ev.arc, game.arcLast)) return false;
  if (!stateConditionsMet(game, life, w)) return false;
  if (namesTheAbsent(game, life, ev, ev)) return false;
  return bindCast(life, ev) !== null;
}

/** เข้าเงื่อนไขและมีตัวเลือกให้กดอย่างน้อยหนึ่งข้อ เหตุการณ์ที่ไม่มีตัวเลือกเหลือจะไม่ถูกหยิบมาแสดง (กันทางตัน) */
export function playable(game: Game, life: LifeState, ev: GameEvent): boolean {
  if (!eligible(game, life, ev)) return false;
  const cast = bindCast(life, ev) ?? {};
  const there = { ...life, cast };
  if (ev.encounter ? !openMoves(game, there, ev, 0).length : !ev.choices.some((c) => choiceAvailable(game, there, c, ev))) return false;
  // เรื่องที่ต้องใช้เวลานานจริงไม่ออกในปีที่เวลาเดินได้สั้นกว่านั้น (ใกล้หมุดของโลก ใกล้ปีสุดท้าย)
  return !ev.min_years || spanOf(game, life, ev) >= ev.min_years;
}

/**
 * จำนวนปีที่เหลือก่อนช่วงอายุหรือช่วงปีของเหตุการณ์นี้จะปิด (0 = ปีนี้เป็นโอกาสสุดท้าย)
 * ใช้เรียงเหตุการณ์ must ที่พร้อมกันหลายเรื่อง และกันไม่ให้เหตุการณ์ที่กินเวลาหลายปีข้ามหมุด
 */
export function turnsLeft(life: LifeState, ev: GameEvent): number {
  const w = ev.when;
  const byAge = w.age ? lastRealAge(w.age[1], life.raceApplied) - life.age : Infinity;
  const byYear = w.year ? w.year[1] - worldYear(life) : Infinity;
  return Math.min(byAge, byYear);
}

/** เหตุการณ์ที่เกิดซ้ำได้ซึ่งเพิ่งออกไปใน REPEAT_GAP เหตุการณ์ล่าสุด */
function recentlySeen(life: LifeState, ev: GameEvent): boolean {
  if (ev.once) return false;
  return life.log.slice(-REPEAT_GAP).some((e) => e.eventId === ev.id);
}

/**
 * จังหวะของการปะทะในชีวิตหนึ่ง: ฉากปะทะพักเมื่อเพิ่งปะทะไปในช่วง ENCOUNTER.gap เหตุการณ์ล่าสุด (สายถืออาวุธพักสั้นกว่า)
 * และฉากที่เกิดซ้ำได้พักถาวรเมื่อออกครบ ENCOUNTER.repeatMax ครั้งแล้ว
 */
export function fightResting(life: LifeState, ev: GameEvent): boolean {
  if (!ev.encounter) return false;
  // สมาชิกขององค์กรที่ออกรบปะทะถี่เท่าสายถืออาวุธ: งานขององค์กรคือที่มาหลักของการปะทะของคนสายนี้
  const armed = (!!life.classId && ARMED_CLASSES.includes(life.classId as ClassId)) || fightsForOrg(life);
  const gap = armed ? ENCOUNTER.gap.armed : ENCOUNTER.gap.calm;
  if (life.log.slice(-gap).some((e) => e.encounter)) return true;
  return !ev.once && life.log.filter((e) => e.eventId === ev.id).length >= ENCOUNTER.repeatMax;
}

/** ตั้งเหตุการณ์ปัจจุบัน ผูกตัวแสดง และกำหนดจำนวนปีที่เหตุการณ์จะกินเวลา (เฉพาะเรื่องที่เล่าหลายปี) */
function withEvent(game: Game, life: LifeState, ev: GameEvent): LifeState {
  const { span: _span, encounter: _enc, ...rest } = life;
  const next: LifeState = { ...rest, currentEventId: ev.id, cast: bindCast(life, ev) ?? {} };
  if (ev.years) next.span = spanOf(game, life, ev);
  const enc = beginEncounter(game, next, ev);
  if (enc) next.encounter = enc;
  return next;
}

/**
 * เลือกเหตุการณ์ถัดไป ลำดับคือ
 * 1. forceId (เช่น ตอนสร้างตัวละครเลือกกำเนิดเอง) ใช้เหตุการณ์นั้นแทนการสุ่ม
 * 2. เหตุการณ์ must ที่เข้าเงื่อนไข ออกทันทีโดยไม่สุ่ม เรื่องที่ช่วงเวลาจะปิดก่อนได้ก่อน ถ้าเท่ากันเรื่องที่ weight สูงกว่าได้ก่อน
 * 3. คนที่กำลังเรียนหลักสูตร: เรื่องถัดไปคือเหตุการณ์ของหลักสูตรในปีที่เรียนอยู่ สุ่มแบบถ่วงน้ำหนักถ้ามีหลายเรื่อง (ปีที่ไม่มีเรื่องของหลักสูตรให้ออก ชีวิตเดินตามปกติ)
 * 4. สมาชิกองค์กรที่ไม่ได้งานมา ORG.dutyGap.max เหตุการณ์ติดกัน: เรื่องถัดไปคืองานขององค์กรนั้น (ถ้ายังมีงานที่ออกได้)
 *    ถ้าไม่มีงานค้าง: เส้นเรื่องยาวที่ตอนถัดไปค้างมาครบ ARC.due ปี เรื่องถัดไปคือตอนนั้น
 * 5. สุ่มแบบถ่วงน้ำหนักจากเรื่องที่เหลือ โดยเว้นเรื่องเกิดซ้ำที่เพิ่งออกไป ฉากปะทะที่ยังพักอยู่ และงานขององค์กรที่เพิ่งมา (ถ้าไม่มีเรื่องอื่นจึงยอมให้ออก)
 *    เหตุการณ์สำรอง (fallback) เข้ากองเฉพาะปีที่เรื่องปกติมีน้อยกว่า THIN_POOL เรื่องถูกตามล่าหนักขึ้นตามระดับภัย (eventWeight)
 * ตอนตัวละครกำลังจะตาย กองมีแต่ฉากตายของเหตุนั้น
 */
export function pickEvent(game: Game, life: LifeState, forceId?: string): { event: GameEvent | null; life: LifeState } {
  if (forceId) {
    const forced = game.events.find((e) => e.id === forceId) ?? null;
    return { event: forced, life: forced ? withEvent(game, life, forced) : life };
  }
  const all = game.events.filter((e) => playable(game, life, e));
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
    return { event: first, life: withEvent(game, life, first) };
  }
  const lessons = life.course ? all.filter((e) => e.course) : [];
  const normal = all.filter((e) => !e.fallback);
  const rested = normal.filter((e) => !recentlySeen(life, e) && !fightResting(life, e) && !dutyResting(life, e, game.duties));
  const due = dutiesDue(life, game.duties);
  const dutyOwed = due.length ? rested.filter((e) => e.duty && due.includes(e.duty)) : [];
  // เส้นเรื่องยาวที่ตอนถัดไปค้างมาครบ ARC.due ปี: ตอนนั้นได้ออกก่อนเรื่องสุ่ม
  const owed = lessons.length ? lessons : dutyOwed.length ? dutyOwed : rested.filter((e) => arcDue(life, e.arc));
  let pool = owed.length ? owed : rested;
  if (!owed.length && rested.length < THIN_POOL) {
    const spare = all.filter((e) => e.fallback);
    const fresh = spare.filter((e) => !recentlySeen(life, e));
    pool = [...rested, ...fresh];
    // ไม่มีเรื่องสดเลย: ให้ฉากปะทะที่ยังพักออกก่อน ถ้าไม่มีอีกจึงยอมให้เรื่องสำรองออกซ้ำ
    if (!pool.length) pool = normal.filter((e) => !recentlySeen(life, e));
    if (!pool.length) pool = spare;
  }
  if (!pool.length) pool = normal.length ? normal : all;
  const rng = Rng.fromState(life.rngState);
  const total = pool.reduce((n, e) => n + eventWeight(life, e), 0);
  let r = rng.next() * total;
  let chosen = pool[pool.length - 1]!;
  for (const e of pool) {
    r -= eventWeight(life, e);
    if (r < 0) {
      chosen = e;
      break;
    }
  }
  return { event: chosen, life: { ...withEvent(game, life, chosen), rngState: rng.state } };
}

/** ชีวิตจบด้วยความตาย (หลังฉากตาย หรือทันทีถ้าไม่มีฉากให้ออก) */
function finishDeath(life: LifeState): LifeState {
  return { ...life, alive: false, endReason: 'death', deathCause: life.dying ?? life.deathCause ?? 'wound', dying: null, hp: Math.max(0, life.hp) };
}

/**
 * ซ่อมชีวิตที่โหลดมาแล้วเล่นต่อไม่ได้: ยังมีชีวิตอยู่แต่ไม่มีเหตุการณ์ปัจจุบัน เหตุการณ์ที่ค้างอยู่ถูกลบหรือเปลี่ยนชื่อไปแล้ว
 * หรือเหตุการณ์นั้นไม่เหลือตัวเลือกให้กด (เนื้อหาเปลี่ยนหลังเซฟ) ให้หยิบเหตุการณ์ใหม่ ถ้าไม่มีให้หยิบถือว่าเรื่องหมด
 * ส่วนคนที่กำลังจะตายแล้วไม่มีฉากตายให้ออก ชีวิตจบตรงนั้น
 */
export function repairLife(game: Game, life: LifeState): LifeState {
  if (!life.alive) return life;
  const ev = game.events.find((e) => e.id === life.currentEventId);
  if (ev?.encounter) {
    // การปะทะที่ค้างอยู่เล่นต่อได้เมื่อจังหวะปัจจุบันยังมีวิธีให้เลือก ถ้าเซฟไม่มีสถานะการปะทะ (เนื้อหาเปลี่ยน) เริ่มการปะทะนี้ใหม่
    if (life.encounter && openMoves(game, life, ev).length) return life;
    const enc = beginEncounter(game, life, ev);
    if (enc && openMoves(game, { ...life, encounter: enc }, ev).length) return { ...life, encounter: enc };
  } else if (ev && ev.choices.some((c) => choiceAvailable(game, life, c, ev))) {
    if (!life.encounter) return life;
    const { encounter: _stale, ...rest } = life;
    return rest;
  }
  const { event, life: next } = pickEvent(game, { ...life, currentEventId: null, cast: {} });
  if (event) return next;
  return next.dying ? finishDeath(next) : { ...next, alive: false, endReason: 'content_end' };
}

export function choiceAvailable(game: Game, life: LifeState, choice: Choice, ev?: GameEvent): boolean {
  if (namesTheAbsent(game, life, choice, ev)) return false;
  // นิสัยที่ติดตัวแล้วปิดทางของนิสัยตรงข้าม (Trait.blocks)
  if (habitBlockers(life, game.traits, choice.habit).length) return false;
  return requiresMet(game, life, choice.requires);
}

/** เงื่อนไข requires ของตัวเลือกหรือของวิธีรับมือในการปะทะ */
export function requiresMet(game: Game, life: LifeState, r: Requires | undefined): boolean {
  if (!r) return true;
  if (r.trait && !life.traits.includes(r.trait)) return false;
  if (r.flag && !life.flags.includes(r.flag)) return false;
  if (r.not_flags?.some((f) => life.flags.includes(f))) return false;
  if (r.item && !owns(life, r.item)) return false;
  if (r.cast?.some((role) => !life.cast?.[role])) return false;
  if (r.min_gold !== undefined && life.gold < r.min_gold) return false;
  for (const [s, min] of Object.entries(r.min_stat ?? {})) {
    if (life.stats[s as keyof typeof life.stats] < (min ?? 0)) return false;
  }
  return stateConditionsMet(game, life, r);
}

/** เหตุผลที่ตัวเลือกยังใช้ไม่ได้: 'hidden' = ซ่อน (ปลดด้วย trait ของ flag หรือสถานะ), หรือรายการ stat ที่ยังไม่ถึง */
export type LockState = null | 'hidden' | { stat: Stat; min: number }[];

export function choiceLock(game: Game, life: LifeState, choice: Choice, ev?: GameEvent): LockState {
  if (choiceAvailable(game, life, choice, ev)) return null;
  const { min_stat, ...rest } = choice.requires ?? {};
  // ถ้าเงื่อนไขอื่นผ่านหมดและติดแค่ stat ให้โชว์เป็นตัวเลือกล็อกพร้อมเหตุผล
  if (!choiceAvailable(game, life, { ...choice, requires: rest }, ev)) return 'hidden';
  const short: { stat: Stat; min: number }[] = [];
  for (const [st, min] of Object.entries(min_stat ?? {})) {
    if (life.stats[st as Stat] < (min ?? 0)) short.push({ stat: st as Stat, min: min ?? 0 });
  }
  return short.length ? short : 'hidden';
}

/**
 * สิ่งติดตัวที่ปิดตัวเลือกนี้อยู่ เมื่อเงื่อนไขอื่นผ่านหมด: ตัวเลือกห้ามไว้เอง (requires.not_traits)
 * หรือนิสัยที่ติดตัวปิดทางของนิสัยที่ตัวเลือกนี้ติดป้าย (Trait.blocks) หน้าจอใช้โชว์ตัวเลือกเป็นล็อกพร้อมชื่อสิ่งติดตัว
 * แทนการซ่อน ผู้เล่นจะได้เห็นราคาของสิ่งที่ติดตัวอยู่ คืนรายการว่างถ้าไม่ได้ติดเพราะสิ่งติดตัว
 */
export function traitBlock(game: Game, life: LifeState, choice: Choice, ev?: GameEvent): string[] {
  const named = (choice.requires?.not_traits ?? []).filter((t) => life.traits.includes(t));
  const held = [...new Set([...named, ...habitBlockers(life, game.traits, choice.habit)])];
  if (!held.length) return [];
  const { not_traits: _n, ...rest } = choice.requires ?? {};
  const { habit: _h, ...plain } = choice;
  return choiceAvailable(game, life, { ...plain, requires: rest }, ev) ? held : [];
}

/** โบนัสรวมของเช็ค (ค่า stat รวมของสวมใส่ + สถานการณ์ + สิ่งติดตัว + passive) */
export function checkModifier(game: Game, life: LifeState, check: NonNullable<Choice['check']>): number {
  const stats = effectiveStats(life, game.items);
  const mod = modifier(stats[check.stat]) + situationalBonus(life, check.stat) + traitCheckBonus(life, game.traits, check.stat, check.foe);
  return mod + gearCheckBonus(life, game.items, check.stat);
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

// ---------- คนในชีวิต ----------

/**
 * รวม effects.people เข้ากับรายชื่อเดิม (อ้างด้วย id) คนที่ไม่เคยมีและไม่มีชื่อจะถูกข้าม
 * ctx.life ใช้จดปีเกิดของคนใหม่ ctx.cast ใช้แปล id แบบ @บท เป็นคนที่เล่นบทนั้น (บทที่ไม่มีคนเล่นถูกข้าม)
 */
export function applyPeople(people: Person[], fx: PersonEffect[], age: number, ctx?: { life?: LifeState; cast?: Record<string, string> }): Person[] {
  const out = people.map((p) => ({ ...p }));
  for (const e of fx) {
    const id = e.id.startsWith('@') ? ctx?.cast?.[e.id.slice(1)] : e.id;
    if (!id) continue;
    let p = out.find((x) => x.id === id);
    if (!p) {
      if (!e.name) continue;
      p = { id, name: e.name, closeness: 0, alive: true, metAge: age };
      out.push(p);
    }
    if (e.name) p.name = e.name;
    if (e.gender) p.gender = e.gender;
    if (e.race) p.race = e.race;
    if (e.kin) p.kin = e.kin;
    if (e.bond) p.bond = e.bond;
    if (p.born === undefined && ctx?.life) {
      const now = { ...ctx.life, age };
      p.born = e.age !== undefined ? worldYear(now) - e.age : estimateBorn(p, now);
    }
    if (e.closeness) p.closeness = clamp(p.closeness + e.closeness, CLOSENESS_CAP);
    if (e.dies && p.alive) {
      p.alive = false;
      p.diedAge = age;
    }
  }
  return out;
}

/** คนสำคัญที่ตายแล้วต้องมี flag ของตัวเอง คู่ครองที่จากไปทำให้ไม่ถือว่าแต่งงานหรือมีคนรักอยู่อีก (ชื่อยังอยู่ใน life.partner ให้เล่าถึงได้) */
function syncDeaths(life: LifeState): LifeState {
  let flags = life.flags;
  for (const p of life.people ?? []) {
    const flag = DIED_ID[p.id];
    if (!flag || p.alive || flags.includes(flag)) continue;
    flags = [...flags, flag];
    if (p.id === PARTNER_PERSON_ID) flags = flags.filter((f) => f !== MARRIED_FLAG && f !== HAS_PARTNER_FLAG);
  }
  return flags === life.flags ? life : { ...life, flags };
}

function diffLife(before: LifeState, after: LifeState): LifeChanges | undefined {
  const c: LifeChanges = {};
  for (const s of STATS) {
    const d = after.stats[s] - before.stats[s];
    if (d) (c.stats ??= {})[s] = d;
  }
  if (after.hp !== before.hp) c.hp = after.hp - before.hp;
  if (after.baseMaxHp !== before.baseMaxHp) c.maxHp = after.baseMaxHp - before.baseMaxHp;
  if (after.gold !== before.gold) c.gold = after.gold - before.gold;
  const items = after.inventory.filter((i) => !before.inventory.includes(i));
  // ของใช้แล้วหมดที่ได้เพิ่ม ขึ้นป้ายหนึ่งครั้งต่อชิ้น
  for (const [id, n] of Object.entries(after.supplies ?? {})) for (let k = before.supplies?.[id] ?? 0; k < n; k++) items.push(id);
  if (items.length) c.items = items;
  const traits = after.traits.filter((t) => !before.traits.includes(t));
  if (traits.length) c.traits = traits;
  const lost = before.traits.filter((t) => !after.traits.includes(t));
  if (lost.length) c.lostTraits = lost;
  for (const t of after.traits) {
    const now = after.traitSteps?.[t] ?? 1;
    if (before.traits.includes(t) && now !== (before.traitSteps?.[t] ?? 1)) (c.steps ??= {})[t] = now;
  }
  if (after.classId && after.classId !== before.classId) c.classId = after.classId;
  for (const id of new Set([...Object.keys(before.orgs ?? {}), ...Object.keys(after.orgs ?? {})]) as Set<OrgId>) {
    const was = before.orgs?.[id], now = after.orgs?.[id];
    if ((was?.rank ?? 0) !== (now?.rank ?? 0)) (c.orgs ??= {})[id] = now?.rank ?? 0;
    if (was && now && now.merit !== was.merit) (c.merit ??= {})[id] = now.merit - was.merit;
  }
  for (const by of new Set([...Object.keys(before.hunted ?? {}), ...Object.keys(after.hunted ?? {})])) {
    if (huntLevel(before, by) !== huntLevel(after, by)) (c.hunted ??= {})[by] = huntLevel(after, by);
  }
  for (const id of CITY_IDS as readonly CityId[]) {
    if (cityRank(before, id) !== cityRank(after, id)) (c.standing ??= {})[id] = cityRank(after, id);
    const was = standingIn(before, id), now = standingIn(after, id);
    if (was && now && now.merit !== was.merit) (c.cityMerit ??= {})[id] = now.merit - was.merit;
    if (moodOf(before, id) !== moodOf(after, id)) (c.moods ??= {})[id] = moodOf(after, id);
  }
  const homeWas = homeHere(before)?.kind ?? 'none', homeNow = homeHere(after)?.kind ?? 'none';
  // บ้านของครอบครัวมาพร้อมการเกิดในเมือง ไม่นับเป็นสิ่งที่เปลี่ยน
  if (homeWas !== homeNow && homeNow !== 'family' && !(homeWas === 'family' && homeNow === 'none')) c.home = homeNow;
  return Object.keys(c).length ? c : undefined;
}

/**
 * ใช้ผลของตัวเลือก cause = เหตุของความตายถ้าผลนี้ทำให้ตายโดยไม่ได้ระบุเหตุ (เช็คที่มี foe คือ fight นอกนั้นคือ wound)
 * ความตายยังไม่จบชีวิตทันที แต่ตั้ง life.dying ให้ฉากตายได้ออกก่อน (ดู resolveChoice)
 */
export function applyEffects(game: Game, life: LifeState, fx: Effects | undefined, cause: DeathCause = 'wound'): LifeState {
  if (!fx) return life;
  const next: LifeState = {
    ...life,
    stats: { ...life.stats },
    flags: [...life.flags],
    traits: [...life.traits],
    traitSteps: { ...(life.traitSteps ?? {}) },
    inventory: [...life.inventory],
    supplies: { ...(life.supplies ?? {}) },
    world: { ...life.world },
    alignment: { ...life.alignment },
    reputation: { ...life.reputation },
  };
  for (const s of STATS) {
    const d = fx.stats?.[s] ?? 0;
    // ค่าที่เพิ่มหยุดที่ STAT_CAP ค่าที่เกินอยู่แล้ว (โบนัสเผ่าหรืออาชีพ) ไม่ถูกลดลง ค่าที่ลดไม่ต่ำกว่า 1
    next.stats[s] = d > 0 ? Math.max(next.stats[s], Math.min(STAT_CAP, next.stats[s] + d)) : Math.max(1, next.stats[s] + d);
  }
  next.gold = addGold(life.gold, fx.gold ?? 0, fx.debt === true);
  for (const f of fx.flags ?? []) if (!next.flags.includes(f)) next.flags.push(f);
  next.flags = next.flags.filter((f) => !fx.clear_flags?.includes(f));

  // ---- ข้อห้ามของแผ่นดิน: ฝืนแล้วคะแนนแผ่นดินขึ้น พรของเจ้าเดิมตนนั้นหลุด (และกลายเป็นคำสาปถ้าทะเบียนเขียนไว้) ขอขมาแล้วคะแนนลง ----
  const gained = [...(fx.traits ?? [])];
  const lost = [...(fx.lose_traits ?? [])];
  if (fx.taboo) {
    const t = applyTaboos(life, fx.taboo);
    next.taboos = t.taboos;
    next.world.land = clamp(next.world.land + t.broke.length * TABOO.land - t.mended.length * TABOO.mend, WORLD_CAP);
    for (const id of t.broke) {
      const boon = TABOOS[id].boon;
      if (!next.traits.includes(boon)) continue;
      lost.push(boon);
      const curse = game.traits.get(boon)?.becomes;
      if (curse) gained.push(curse);
    }
  }
  if (fx.arc?.close) next.arcs = closeArc(next, fx.arc.id).arcs;

  // ---- สิ่งติดตัว: ได้ เสีย ขยับขั้น แล้วปรับพลังชีวิตสูงสุดตามผลที่เปลี่ยน ----
  const hpFromTraits = traitMaxHp(life, game.traits);
  for (const t of gained) {
    if (next.traits.includes(t)) continue;
    // ของใหญ่เกินจำนวนที่ถือได้ไม่ติดตัว (เนื้อหาต้องกันด้วย big_room อยู่แล้ว ตรงนี้กันพลาด)
    if (game.traits.get(t)?.big && !hasBigRoom(next, game.traits)) continue;
    // ผู้สวมเหล็กเย็นรับพรไม่ได้ (พรที่มีอยู่แล้วยังอยู่)
    if (game.traits.get(t)?.kind === 'boon' && coldIron(game, life)) continue;
    next.traits.push(t);
  }
  for (const t of lost) {
    next.traits = next.traits.filter((x) => x !== t);
    delete next.traitSteps[t];
  }
  for (const [t, d] of Object.entries(fx.trait_step ?? {})) {
    const def = game.traits.get(t);
    if (!next.traits.includes(t) || !def?.steps) continue;
    next.traitSteps[t] = Math.max(1, Math.min(def.steps.length, (next.traitSteps[t] ?? 1) + d));
  }
  next.baseMaxHp += traitMaxHp(next, game.traits) - hpFromTraits;
  if (fx.max_hp) next.baseMaxHp += fx.max_hp;

  for (const i of fx.items ?? []) {
    const got = addItem(game, next, i);
    next.inventory = got.inventory;
    next.supplies = got.supplies;
  }
  if (fx.location_tag) {
    next.locationTag = fx.location_tag;
    next.homeTag ??= fx.location_tag;
  }
  // เมือง: ผลที่เหตุการณ์สั่ง แล้วให้เมืองตรงกับถิ่น (ถิ่นที่มีเมืองหลักพาเข้าเมืองนั้นเอง) · หลักสูตร: เข้าเรียน เลือกสาย ออกกลางคัน
  if (fx.city || fx.location_tag) Object.assign(next, syncCity(applyCityEffects(next, fx.city)));
  if (fx.course) {
    const { course, flags } = applyCourseEffects(next, fx.course);
    next.flags = flags;
    if (course) next.course = course;
    else delete next.course;
  }
  for (const k of WORLD_KEYS) if (fx.world?.[k]) next.world[k] = clamp(next.world[k] + fx.world[k]!, WORLD_CAP);
  if (fx.alignment?.law) next.alignment.law = clamp(next.alignment.law + fx.alignment.law, ALIGN_CAP);
  if (fx.alignment?.moral) next.alignment.moral = clamp(next.alignment.moral + fx.alignment.moral, ALIGN_CAP);
  for (const [f, d] of Object.entries(fx.reputation ?? {})) {
    next.reputation[f] = clamp((next.reputation[f] ?? 0) + (d ?? 0), REPUTATION_CAP);
  }
  if (fx.god) next.god = fx.god;
  // องค์กร: ผลที่เหตุการณ์สั่ง แล้วองค์กรที่ผูกกับงานตามงานที่เพิ่งได้หรือเพิ่งเลิก
  if (fx.org || fx.hunted || fx.flags || fx.clear_flags) {
    const o = syncJobOrgs(applyOrgEffects(next, fx));
    next.orgs = o.orgs;
    next.hunted = o.hunted;
  }
  if (fx.people?.length) next.people = applyPeople(next.people ?? [], fx.people, next.age, { life: next, cast: next.cast ?? {} });
  if (fx.name_pool) next.namePool = { ...next.namePool, ...fx.name_pool };
  if (fx.child) next.pendingChildren = [...(next.pendingChildren ?? []), fx.child];
  if (fx.partner) {
    next.partner = { name: '', gender: fx.partner.gender, pool: fx.partner.pool ?? defaultPartnerPool(next) };
    // คนรักคนเก่ายังอยู่บนผังความสัมพันธ์ แต่ไม่ใช่คู่ครองแล้ว
    const old = (next.people ?? []).find((p) => p.id === PARTNER_PERSON_ID);
    if (old) {
      const n = (next.people ?? []).filter((p) => /^partner_\d+$/.test(p.id)).length + 2;
      next.people = (next.people ?? []).map((p) => (p === old ? { ...p, id: `partner_${n}`, kin: undefined } : p));
    }
    // คนรักใหม่: เรื่องของคนเก่าที่จากไปไม่ผูกกับ {partner} อีก
    next.flags = next.flags.filter((f) => f !== PARTNER_DIED_FLAG || fx.flags?.includes(PARTNER_DIED_FLAG));
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
  // แผลถาวรและคำสาปลดพลังชีวิตสูงสุดได้ แต่ไม่ต่ำกว่า 1 พลังชีวิตสูงสุดหมดได้ทางเดียวคือฤดูหนาว
  const short = 1 - maxHp(next, game.items);
  if (short > 0 && next.baseMaxHp < life.baseMaxHp) next.baseMaxHp = Math.min(life.baseMaxHp, next.baseMaxHp + short);
  const cap = maxHp(next, game.items);
  next.hp = Math.min(cap, next.hp + (fx.hp ?? 0) + classHp);
  const synced = syncDeaths(next);
  next.flags = synced.flags;
  if (next.age < PROTECTED_AGE) {
    // ผู้เล่นตายก่อนอายุ PROTECTED_AGE ไม่ได้ ไม่ว่าเนื้อหาจะเขียนอะไร
    next.hp = Math.max(1, next.hp);
  } else if (fx.die || next.hp <= 0) {
    const ward = deathWard(next, game.traits);
    if (ward) {
      // กันตายหนึ่งครั้ง: ของที่กันหายไป (หรือกลายเป็นอย่างอื่น) แล้วรอดมาด้วยพลังชีวิตเดียว
      const hpBefore = traitMaxHp(next, game.traits);
      next.traits = next.traits.filter((t) => t !== ward.trait.id);
      delete next.traitSteps[ward.trait.id];
      if (ward.fx.becomes && !next.traits.includes(ward.fx.becomes)) next.traits.push(ward.fx.becomes);
      if (ward.fx.flag) {
        // โกงความตายครั้งที่สองขึ้นไปได้ flag <ชื่อ>_twice ด้วย (ออสซานับ)
        const flag = next.flags.includes(ward.fx.flag) ? `${ward.fx.flag}_twice` : ward.fx.flag;
        if (!next.flags.includes(flag)) next.flags.push(flag);
      }
      next.baseMaxHp += traitMaxHp(next, game.traits) - hpBefore;
      next.hp = 1;
    } else {
      next.hp = Math.max(0, next.hp);
      if (!next.dying) {
        next.dying = typeof fx.die === 'string' ? fx.die : cause;
        next.deathTold = !!fx.die;
      }
    }
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

/** กลุ่มชื่อของลูก: กลุ่มของคู่ครอง ถ้าไม่มีใช้กลุ่มของพ่อแม่ตัวเอง แล้วจึงกลุ่มตามเผ่า สุดท้ายคือ human */
function childPool(game: Game, life: LifeState): NamePool | undefined {
  const parents = life.namePool.parents;
  for (const id of [life.partner?.pool, parents !== 'none' ? parents : undefined, life.raceApplied, 'human']) {
    const pool = id ? game.names.get(id) : undefined;
    if (pool && (pool.male.length || pool.female.length)) return pool;
  }
  return undefined;
}

/** ลูกที่รอตั้งชื่อ (effects.child) และลูกจากเซฟเก่าที่มีแค่ flag has_child กลายเป็นคนจริงในผัง มีชื่อ เพศ และปีเกิด */
function addChildren(game: Game, life: LifeState, rng: Rng): LifeState {
  const pending = [...(life.pendingChildren ?? [])];
  const kids = (life.people ?? []).filter((p) => p.kin === 'child');
  let legacyAge: number | null = null;
  if (!pending.length && !kids.length && life.flags.includes(HAS_CHILD_FLAG)) {
    // เซฟก่อนมีระบบนี้: ลูกเกิดในปีของเหตุการณ์ลูกคนแรก ถ้าหาไม่เจอถือว่าเกิดปีนี้
    legacyAge = life.log.find((e) => e.eventId.includes('first_child'))?.age ?? life.age;
    pending.push({ horned: life.flags.includes('child_horned') });
  }
  if (!pending.length) return life;
  let people = [...(life.people ?? [])];
  const pool = childPool(game, life);
  for (const spec of pending) {
    const gender = spec.gender ?? (rng.int(0, 1) === 0 ? 'm' : 'f');
    const taken = [life.name, life.partner?.name ?? '', ...people.map((p) => p.name)];
    const name = pickName(pool, gender, rng, taken) ?? (gender === 'm' ? 'ลูกชาย' : 'ลูกสาว');
    const n = people.filter((p) => p.kin === 'child').length + 1;
    const at = legacyAge ?? life.age;
    people.push({
      id: `child_${n}`,
      name,
      gender,
      kin: 'child',
      bond: 'kin',
      closeness: CHILD_CLOSENESS,
      alive: true,
      metAge: at,
      born: life.birthYear + at,
      ...(spec.horned ? { horned: true } : {}),
    });
  }
  const flags = life.flags.includes(HAS_CHILD_FLAG) ? life.flags : [...life.flags, HAS_CHILD_FLAG];
  const { pendingChildren: _done, ...rest } = life;
  return { ...rest, people, flags };
}

/**
 * ค่าที่ต้องคำนวณตามหลังผลของตัวเลือก: โบนัสเผ่า (ครั้งแรกที่มี flag race_<id>), ชื่อตัวละครและพ่อแม่, ชื่อคู่ครองและลูก,
 * และ flag cleric_drift ที่ซิงก์กับแนวทางของนักบวช
 */
export function settle(game: Game, life: LifeState, rng: Rng): LifeState {
  let next = life;
  const raceFlag = next.flags.find((f) => f.startsWith('race_'));
  const race = raceFlag?.slice(5);
  if (race && race in RACES && next.raceApplied !== race) {
    const def = RACES[race as RaceId];
    const hpFromTraits = traitMaxHp(next, game.traits);
    next = { ...next, stats: { ...next.stats }, traits: [...next.traits], raceApplied: race };
    for (const s of STATS) next.stats[s] += (def.bonus as Partial<Record<(typeof STATS)[number], number>>)[s] ?? 0;
    for (const t of def.traits) if (!next.traits.includes(t)) next.traits.push(t);
    next.baseMaxHp += traitMaxHp(next, game.traits) - hpFromTraits;
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
      next.people = applyPeople(
        next.people ?? [],
        [
          { id: 'father', name: father, gender: 'm', kin: 'father', bond: 'kin', closeness: PARENT_CLOSENESS },
          { id: 'mother', name: mother, gender: 'f', kin: 'mother', bond: 'kin', closeness: PARENT_CLOSENESS },
        ],
        next.age,
        { life: next },
      );
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
    // คู่ครองเป็นเผ่าตามกลุ่มชื่อที่มาจากเผ่าอายุยืน จะได้แก่ช้าเท่ากัน
    const race = next.partner.pool in RACES && RACES[next.partner.pool as RaceId].ageScale > 1 ? next.partner.pool : undefined;
    next = {
      ...next,
      people: applyPeople(
        next.people ?? [],
        [{ id: PARTNER_PERSON_ID, name: next.partner.name, gender: next.partner.gender, bond: 'love', closeness: PARTNER_CLOSENESS, ...(married ? { kin: 'spouse' as const } : {}) }],
        next.age,
        { life: next },
      ).map((p) => (p.id === PARTNER_PERSON_ID && race ? { ...p, race, born: estimateBorn({ ...p, race }, next) } : p)),
    };
  }
  next = addChildren(game, next, rng);
  const drifted = clericDrifted(next);
  const has = next.flags.includes(CLERIC_DRIFT_FLAG);
  if (drifted !== has) {
    next = { ...next, flags: drifted ? [...next.flags, CLERIC_DRIFT_FLAG] : next.flags.filter((f) => f !== CLERIC_DRIFT_FLAG) };
  }
  return next;
}

// ---------- สิ้นปี: แผลหาย ร่างกายโรย ฤดูหนาว และคนรอบตัวที่จากไป ----------

/**
 * หยิบประโยคของระบบหนึ่งประโยค (ดู Content.lines) who = คนที่ประโยคนั้นพูดถึง
 * ไล่กุญแจตามลำดับ เอาเฉพาะประโยคที่ชีวิตนี้ยังไม่เคยได้ (used) ชีวิตยาวจึงไม่อ่านประโยคเดิมซ้ำ
 * ใช้หมดทุกกุญแจแล้ว: always = ยอมซ้ำ (ข่าวที่ต้องบอกเสมอ เช่น ใครจากไป) ไม่อย่างนั้นปีนั้นไม่มีประโยค เหลือแต่ตัวเลขที่เปลี่ยน
 */
function pickLine(game: Game, life: LifeState, rng: Rng, keys: string[], used: ReadonlySet<string>, who?: Person, always = false): string | null {
  const said = (k: string) => (game.lines[k] ?? []).map((t) => render(t, life, who ? { who: who.id } : {}));
  for (const k of keys) {
    const fresh = said(k).filter((t) => !used.has(t));
    if (fresh.length) return fresh[rng.int(0, fresh.length - 1)]!;
  }
  if (!always) return null;
  const any = keys.flatMap(said);
  return any.length ? any[rng.int(0, any.length - 1)]! : null;
}

/** พลังชีวิตที่ฟื้นเองต่อปีตามวัย (ยังไม่รวมสิ่งติดตัว) */
export function yearlyRegen(life: LifeState): number {
  const h = stageAge(life);
  return h < ADULT_AGE ? 0 : (HP_REGEN.find(([from]) => h >= from)?.[1] ?? 0);
}

/** อายุ (เทียบมนุษย์) ที่เริ่มเช็คฤดูหนาวของชีวิตนี้ */
export const winterFrom = (life: Pick<LifeState, 'raceApplied'>) => WINTER.fromByRace[life.raceApplied ?? ''] ?? WINTER.from;

/** ความยากของเช็คฤดูหนาวที่อายุเทียบมนุษย์ h */
export function winterDc(life: Pick<LifeState, 'raceApplied'>, h: number): number {
  const years = h - winterFrom(life);
  // แต่ละช่วงของ pace นับปีที่อยู่ในช่วงนั้น แล้วเพิ่ม 1 ทุก every ปี
  return WINTER.pace.reduce<number>((dc, [from, every], i) => {
    const to = WINTER.pace[i + 1]?.[0] ?? Infinity;
    return dc + Math.floor(Math.max(0, Math.min(years, to) - from) / every);
  }, WINTER.dc);
}

/** มีคนดูแลไหม: คู่ครองหรือลูกที่โตแล้ว ยังอยู่ และสนิทพอ */
export function caredFor(life: LifeState): boolean {
  return (life.people ?? []).some(
    (p) => p.alive && p.closeness >= WINTER.careCloseness && (p.kin === 'spouse' || (p.kin === 'child' && personYears(p, life) >= 14)),
  );
}

/**
 * แต้มบวกของเช็คฤดูหนาว (อึดของร่างกาย + สิ่งติดตัว + คนดูแล + ของกันหนาว)
 * ใช้ค่าอึดของร่างกายเอง ไม่นับโบนัสจากของที่สวม: ของช่วยให้ผ่านฤดูหนาวได้ทางเดียวคือของกันหนาว (ไม่เกิน GEAR.winterMax)
 */
export function winterModifier(game: Game, life: LifeState): number {
  // หลังคาของตัวเองในเมือง (cities.ts) นับเป็นของกันหนาวอีกอย่างหนึ่ง รวมกันไม่เกินเพดานเดิม
  const warm = activePassives(life, game.items).reduce((n, p) => n + (p.kind === 'winter' ? p.amount : 0), 0) + roofBonus(life);
  return modifier(life.stats.CON) + traitWinter(life, game.traits) + (caredFor(life) ? WINTER.care : 0) + Math.min(GEAR.winterMax, warm);
}

/** คนรอบตัวตายไปหนึ่งคน (ตามวัยหรือจากเนื้อหา) พร้อม flag ของคนสำคัญ */
function markDead(life: LifeState, id: string): LifeState {
  return syncDeaths({ ...life, people: applyPeople(life.people ?? [], [{ id, dies: true }], life.age) });
}

/**
 * สิ่งที่เกิดเองตอนสิ้นปี เรียงตามนี้: แผลหายตามวัย ร่างกายโรย (ตั้งแต่ 50) เช็คฤดูหนาว (ตั้งแต่ 65) ราคาของวัสดุที่สวม ภัยตามล่าที่เย็นลง
 * ชีวิตในเมือง (ค่าเช่า รายได้ของร้าน สภาพเมืองที่คลายลง) และคนรอบตัวที่จากไปตามวัย
 * บันทึกลง rec ให้หน้าจอแสดง ชีวิตที่พลังชีวิตสูงสุดหมดเพราะฤดูหนาวได้ life.dying = age
 */
export function endOfYear(game: Game, life: LifeState, rng: Rng, rec: YearEnd): LifeState {
  let next = life;
  const h = stageAge(next);
  const used = new Set([...next.log.flatMap((e) => e.year?.lines ?? []), ...(rec.lines ?? [])]);
  const line = (keys: string[], who?: Person) => {
    const text = pickLine(game, next, rng, keys, used, who, !!who);
    if (!text) return;
    (rec.lines ??= []).push(text);
    used.add(text);
  };

  const regen = h < ADULT_AGE ? 0 : Math.max(0, yearlyRegen(next) + traitRegen(next, game.traits));
  if (regen) next = { ...next, hp: Math.min(maxHp(next, game.items), next.hp + regen) };

  if (!isAgeless(next, game.traits)) {
    if (h >= DECLINE.from) {
      // เผ่าอายุยืนแก่ช้า โอกาสต่อปีจริงจึงหารด้วย ageScale
      const chance = Math.min(DECLINE.max, DECLINE.base + DECLINE.perYear * (h - DECLINE.from)) / ageScale(next);
      for (const s of DECLINE.stats) {
        if (next.stats[s] <= DECLINE.floor || rng.next() >= chance) continue;
        next = { ...next, stats: { ...next.stats, [s]: next.stats[s] - 1 } };
        (rec.decline ??= []).push(s);
        line([`decline_${s}`, 'decline']);
      }
    }
    if (h >= winterFrom(next)) {
      const dc = winterDc(next, h);
      const mod = winterModifier(game, next);
      const d20 = rng.d20();
      const success = d20 === 20 || (d20 !== 1 && d20 + mod >= dc);
      // เอาไปได้เท่าที่เหลือ พลังชีวิตสูงสุดจึงไม่ติดลบ
      const lost = success ? 0 : Math.min(WINTER.loss, Math.max(0, maxHp(next, game.items)));
      rec.winter = { d20, mod, dc, success, lost };
      if (lost) {
        next = { ...next, baseMaxHp: next.baseMaxHp - lost };
        const cap = maxHp(next, game.items);
        next = { ...next, hp: Math.max(0, Math.min(next.hp, cap)) };
        if (cap <= 0) next = { ...next, hp: 0, dying: 'age', deathTold: false };
        else line(['winter_fail']);
      }
    }
  }

  // ของที่สวมข้ามปีเก็บราคาของวัสดุ (เงินดาวทิ้งรอยดาว หินถ่านมารทำให้ศาสนจักรจับตา)
  if (!next.dying) {
    const wear = wearYear(game, next);
    next = wear.life;
    if (wear.traits.length) rec.marks = [...(rec.marks ?? []), ...wear.traits];
    for (const key of wear.lines) line([key]);
  }

  // ภัยตามล่าที่ไม่มีใครมาตามนานเข้าก็เย็นลงเอง
  if (!next.dying && Object.keys(next.hunted ?? {}).length) {
    const faded = fadeHunts(next, rng);
    next = faded.life;
    if (faded.cooled.length) {
      rec.cooled = [...(rec.cooled ?? []), ...faded.cooled];
      line(['hunt_cold']);
    }
  }

  // ชีวิตในเมือง: ค่าเช่า รายได้ของร้าน และสภาพเมืองที่คลายลงเอง
  if (!next.dying) {
    const town = cityYear(next, rng, rec);
    next = town.life;
    for (const key of town.lines) line([key]);
  }

  for (const p of yearlyPassings(next, rng, game.fated)) {
    next = markDead(next, p.id);
    (rec.passed ??= []).push(p.id);
    // คู่ครองที่ยังไม่ได้แต่งงานใช้ประโยคของคู่ครอง ไม่ใช่ของคนรักเก่า
    line(p.id === PARTNER_PERSON_ID ? ['news_death_spouse', 'news_death'] : [`news_death_${p.kin ?? ''}`, `news_death_${p.bond ?? ''}`, 'news_death'], p);
  }
  return next;
}

/**
 * จำนวนปีที่เหตุการณ์นี้กินเวลาจริงในชีวิตนี้ เหตุการณ์ปกติคือ 1 เหตุการณ์ที่เล่าหลายปี (years) ถูกตัดให้สั้นลงเมื่อ
 * จะข้ามเข้าวัยที่ต้องเช็คฤดูหนาวทุกปี หรือจะข้ามปีสุดท้ายของหมุด (must) ที่ชีวิตนี้ยังมีสิทธิ์เจอ
 */
export function spanOf(game: Game, life: LifeState, ev: GameEvent): number {
  let span = ev.years ?? 1;
  if (span <= 1) return 1;
  const winterAge = lastRealAge(winterFrom(life) - 1, life.raceApplied) + 1;
  if (life.age < winterAge) span = Math.min(span, winterAge - life.age);
  else return 1;
  // ไม่ข้ามปีสุดท้ายของเรื่อง
  span = Math.min(span, STORY_END_YEAR - worldYear(life) + 1);
  for (const m of game.events) {
    if (!m.must || m === ev || life.seen.includes(m.id)) continue;
    const left = turnsLeft(life, m);
    if (left < 1 || left >= span) continue;
    if (eligible(game, life, m, true)) span = left;
  }
  return Math.max(1, span);
}

export interface ChoiceResult {
  life: LifeState;
  entry: LogEntry;
}

/** มีฉากตายให้ออกสำหรับชีวิตที่กำลังจะตายนี้ไหม */
const hasDeathScene = (game: Game, life: LifeState) => game.events.some((e) => e.stage === 'death' && playable(game, { ...life, currentEventId: null, cast: {} }, e));

/**
 * ตัดสินตัวเลือก: ทอยเช็คถ้ามี ใช้ผล นับนิสัย จดเหตุการณ์ว่าเห็นแล้ว แล้วเดินเวลา (พร้อมสิ่งที่เกิดเองตอนสิ้นปี)
 * ถ้าผลทำให้ตัวละครตาย เวลาหยุดที่ปีนั้น เหตุการณ์ถัดไปคือฉากตาย พอเลือกในฉากตายแล้วชีวิตจึงจบ
 */
export function resolveChoice(game: Game, life: LifeState, eventId: string, choiceId: string): ChoiceResult {
  const ev = game.events.find((e) => e.id === eventId);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !choice) throw new Error(`ไม่พบตัวเลือก ${eventId}/${choiceId}`);
  if (!choiceAvailable(game, life, choice, ev)) throw new Error(`ตัวเลือก ${choiceId} ยังใช้ไม่ได้`);

  const rng = Rng.fromState(life.rngState);
  const cause: DeathCause = choice.check?.foe ? 'fight' : 'wound';
  // คนที่เหตุการณ์พาเข้ามา ไม่ว่าจะเลือกทางไหน แล้วจึงผลของตัวเลือก
  let next = applyEffects(game, ev.people ? applyEffects(game, life, { people: ev.people }) : life, choice.effects, cause);
  const entry: LogEntry = { age: life.age, eventId, choiceId };
  if (Object.keys(life.cast ?? {}).length) entry.cast = { ...life.cast };
  const texts: string[] = choice.text ? [choice.text] : [];
  let outcome: Choice['success'];

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
    const fromTraits = traitCheckBonuses(life, game.traits, choice.check.stat, choice.check.foe);
    entry.roll = { d20, mod, dc: choice.check.dc, success, ...(fromTraits.length ? { traits: fromTraits } : {}) };
    outcome = success ? choice.success : choice.failure;
    next = applyEffects(game, next, outcome?.effects, cause);
    if (outcome?.text) texts.push(outcome.text);
  }
  // งานขององค์กร: ทำสำเร็จได้ผลงาน ปฏิเสธเสียผลงาน ทอยพลาดไม่ได้ไม่เสีย (คนที่ออกจากองค์กรในเหตุการณ์นี้เองไม่มีอะไรให้จด)
  if (ev.duty && !next.dying) {
    const result: DutyResult = choice.refuse ? 'refused' : entry.roll && !entry.roll.success ? 'tried' : 'done';
    next = recordDuty(next, ev.duty, result);
  }

  // นิสัย: นับจากเหตุการณ์ที่ต่างกันเท่านั้น เรื่องที่เวียนกลับมาเล่นซ้ำไม่นับเพิ่ม
  // จดก่อนว่าครั้งนี้ทางของนิสัยไหนมีให้เลือกบ้าง แล้วจึงนับทางที่เลือก (ดู HABIT_COUNT กับ HABIT_SHARE)
  const firstTime = !life.seen.includes(ev.id);
  if (firstTime) {
    const offered = new Set(ev.choices.filter((c) => c.habit && (c === choice || choiceAvailable(game, life, c, ev))).map((c) => c.habit!));
    if (offered.size) {
      const habitOffers = { ...(next.habitOffers ?? {}) };
      for (const h of offered) habitOffers[h] = (habitOffers[h] ?? 0) + 1;
      next = { ...next, habitOffers };
    }
  }
  if (choice.habit && !next.dying && firstTime) {
    const { habits, formed } = countHabit(next, game.traits, choice.habit);
    next = { ...next, habits };
    if (formed) {
      const hpFromTraits = traitMaxHp(next, game.traits);
      next = { ...next, traits: [...next.traits, formed] };
      next.baseMaxHp += traitMaxHp(next, game.traits) - hpFromTraits;
      const gained = game.traits.get(formed)?.gained;
      if (gained) texts.push(gained);
    }
  }
  if (texts.length) entry.text = texts.join('\n\n');
  return concludeEvent(game, ev, life, next, entry, rng, [outcome?.effects, choice.effects]);
}

/**
 * ปิดเหตุการณ์หลังผลของตัวเลือก (หรือของการปะทะ) ถูกใช้แล้ว: ชื่อและค่าที่ต้องคำนวณตามหลัง ป้ายบนเส้นชีวิต ประโยคสุดท้าย
 * สิ่งที่เปลี่ยน ความตายและฉากตาย แล้วเดินเวลาพร้อมสิ่งที่เกิดเองตอนสิ้นปี
 * before = ชีวิตก่อนผลนั้น ใช้เทียบว่าอะไรเปลี่ยน · fx = ผลที่เพิ่งใช้ เรียงจากที่เจาะจงที่สุด (ใช้หา mark epitaph survive)
 */
export function concludeEvent(game: Game, ev: GameEvent, before: LifeState, after: LifeState, entry: LogEntry, rng: Rng, fx: (Effects | undefined)[]): ChoiceResult {
  // จบหนึ่งเรื่องระหว่างเรียน = เรียนไปหนึ่งปี (ดู advanceCourse)
  let next = settle(game, advanceArc(before, advanceCourse(before, after, ev, fx.map((f) => f?.course)), ev), rng);
  const first = <K extends 'mark' | 'epitaph' | 'survive'>(k: K) => fx.find((f) => f?.[k] !== undefined)?.[k];
  const mark = first('mark') ?? ev.mark;
  if (mark) entry.mark = render(mark, next, before.cast ?? {});
  const epitaph = first('epitaph');
  if (epitaph) next = { ...next, epitaph: render(epitaph, next, before.cast ?? {}) };
  const changes = diffLife(before, next);
  if (changes) entry.changes = changes;

  const close = ({ span: _span, encounter: _enc, ...l }: LifeState): LifeState => ({
    ...l,
    rngState: rng.state,
    seen: l.seen.includes(ev.id) ? l.seen : [...l.seen, ev.id],
    currentEventId: null,
    cast: {},
    log: [...l.log, entry],
  });

  // ฉากตายที่ตัวเลือกให้รอด (effects.survive): ความตายถอยไป ชีวิตเดินต่อจากปีนี้ ถ้าร่างยังมีพลังชีวิตสูงสุดเหลือ
  const survives = ev.stage === 'death' && first('survive') && maxHp(next, game.items) > 0;
  if (survives) {
    const { deathTold: _told, ...rest } = next;
    next = { ...rest, dying: null, hp: Math.max(1, next.hp) };
  } else if (ev.stage === 'death' || (next.dying && !hasDeathScene(game, next))) {
    // ฉากตายจบแล้ว หรือไม่มีฉากตายให้ออก: ชีวิตจบในปีนี้
    return { life: close(finishDeath(next)), entry };
  }
  if (next.dying) return { life: close(next), entry };

  // จำนวนปีกำหนดไว้ตั้งแต่ตอนเลือกเหตุการณ์ (ข้อความบอกผู้เล่นไปแล้วว่ากี่ปี) เซฟเก่าที่ไม่มีค่านี้คิดใหม่
  const span = ev.years ? (before.span ?? spanOf(game, next, ev)) : 1;
  if (span > 1) entry.span = span;
  const rec: YearEnd = {};
  for (let i = 0; i < span && !next.dying; i++) {
    next = endOfYear(game, next, rng, rec);
    // ปีที่ฤดูหนาวเอาชีวิตไป เวลาไม่เดินต่อ ฉากตายเกิดในปีนั้น
    if (!next.dying) next = { ...next, age: next.age + 1 };
  }
  if (Object.keys(rec).length) entry.year = rec;
  if (next.dying && !hasDeathScene(game, next)) next = finishDeath(next);
  return { life: close(next), entry };
}

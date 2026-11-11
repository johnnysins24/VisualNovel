/**
 * การปะทะ: เหตุการณ์ที่เดินเป็นจังหวะ 2 ถึง 4 จังหวะกับศัตรูหนึ่งชนิด (content/foes.yaml)
 * แต่ละจังหวะศัตรูส่งสัญญาณ ผู้เล่นเลือกวิธีรับมือหนึ่งวิธี ทอยหนึ่งครั้ง
 *   สำเร็จ = ศัตรูเสียแรงใจหนึ่งขีด (ทอยได้ 20 เสียสองขีด) · พลาด = เสียพลังชีวิตเท่าระดับภัย ลบเกราะ
 * จบได้หกแบบ: ชนะ (แรงใจหมด) แพ้ (พลังชีวิตหมดแต่ไม่ตาย) ตาย หนี เจรจา หรือยัน (ครบทุกจังหวะ)
 * ตัวเลขทั้งหมดอยู่ใน balance.ts (ENCOUNTER, TECHNIQUES) ไฟล์นี้มีแต่วิธีคิด
 */
import type { Encounter, EncounterEnd, FoeDef, GameEvent, Move, Stat } from './schema';
import { ENCOUNTER, GEAR, MOVE_STAT, PROTECTED_AGE, TECHNIQUES, type ClassId, type OrgId, type TechniqueKind } from './balance';
import { modifier, type BeatRecord, type EncounterLog, type EncounterState, type LifeState, type LogEntry, type OddsPart } from './state';
import { Rng } from './rng';
import { activePassives, effectiveStats, gearCheckBonus } from './items';
import { clericDrifted, situationalBonus } from './rules';
import { traitCheckBonuses } from './traits';
import { applyEffects, concludeEvent, requiresMet, type Game } from './engine';
import { EDGE_KINDS, addItem, coldIron, gearEdge, gearTags, heavyArmour, rollLoot, spendSupplyInFight, supplyAid } from './gear';
import { bountyFor, orgTechnique, recordDuty } from './orgs';

/** ศัตรูของฉากหนึ่ง: ค่าของชนิด ทับด้วยค่าที่ฉากกำหนดเอง */
export interface FoeView {
  def: FoeDef;
  name: string;
  threat: number;
  morale: number;
  /** พลังชีวิตหมดในการปะทะนี้คือตาย */
  deadly: boolean;
}

export function foeOf(game: Game, ev: GameEvent): FoeView | null {
  const enc = ev.encounter;
  const def = enc ? game.foes.get(enc.foe) : undefined;
  if (!enc || !def) return null;
  return { def, name: enc.name ?? def.name, threat: enc.threat ?? def.threat, morale: enc.morale ?? def.morale, deadly: enc.deadly ?? def.lethal };
}

/** flag ที่บอกว่าตัวละครรู้จุดอ่อนของศัตรูชนิดนี้แล้ว ติดตัวไปทั้งชีวิต */
export const knowsFlag = (foeId: string) => `knows_${foeId}`;

/** ท่าที่ต้องกดเตรียมก่อนเลือกวิธี ท่าอื่นทำงานเอง */
const ARMED: readonly TechniqueKind[] = ['spell', 'ward', 'sense', 'song', 'at_hand'];

export interface TechniqueView {
  kind: TechniqueKind;
  th: string;
  /** ต้องกดเตรียมก่อนเลือกวิธี (ท่าที่ไม่ต้องกดทำงานเองเมื่อถึงจังหวะของมัน) */
  armable: boolean;
  /** ยังใช้ได้ในการปะทะนี้ */
  ready: boolean;
  /** เหตุที่ใช้ไม่ได้: ใช้ไปแล้ว เลยจังหวะแรก ห่างจากเทพ ไม่ได้อยู่ถิ่นเกิด หรือสวมเหล็กเย็นอยู่ (ร่ายเวทและขอพรไม่ได้) */
  why?: 'used' | 'late' | 'drifted' | 'away' | 'cold_iron';
}

const techniqueDef = (life: LifeState) => TECHNIQUES[(life.classId ?? 'none') as ClassId | 'none'] ?? TECHNIQUES.none;

/** ท่าของอาชีพในการปะทะที่กำลังเดินอยู่ ส่ง game มาด้วยเพื่อดูของที่สวม (เหล็กเย็นปิดเวทและพร) */
export function techniqueOf(life: LifeState, game?: Game): TechniqueView {
  const def = techniqueDef(life);
  const st = life.encounter;
  const view: TechniqueView = { kind: def.kind, th: def.th, armable: ARMED.includes(def.kind), ready: true };
  const off = (why: NonNullable<TechniqueView['why']>): TechniqueView => ({ ...view, ready: false, why });
  if (st?.techUsed) return off('used');
  if (def.kind === 'ambush' && (st?.beat ?? 0) > 0) return off('late');
  if ((def.kind === 'spell' || def.kind === 'ward') && game && coldIron(game, life)) return off('cold_iron');
  if (def.kind === 'ward' && (!life.god || clericDrifted(life))) return off('drifted');
  if (def.kind === 'sense' && !(life.homeTag && life.homeTag === life.locationTag)) return off('away');
  return view;
}

/** ท่าที่เตรียมไว้มีผลกับวิธีนี้ไหม (เวทใช้กับการหนีไม่ได้ เพลงใช้ได้กับการพูดเท่านั้น) */
export function techniqueFits(kind: TechniqueKind, move: Move): boolean {
  if (!ARMED.includes(kind)) return false;
  if (kind === 'spell') return move.kind !== 'flee';
  if (kind === 'song') return move.kind === 'talk';
  return true;
}

export function beginEncounter(game: Game, life: LifeState, ev: GameEvent): EncounterState | null {
  const foe = foeOf(game, ev);
  if (!foe) return null;
  // พรานอ่านสัตว์และสิ่งแปลกปลอมออกตั้งแต่แรกเห็น คนอื่นต้องเคยเจอหรืออ่านทางให้ออกก่อน
  const knew = life.flags.includes(knowsFlag(foe.def.id)) || life.classId === 'ranger';
  return { beat: 0, morale: foe.morale, hpStart: life.hp, techUsed: false, shieldUsed: false, rerollUsed: false, weakKnown: knew, knew, records: [] };
}

/** วิธีรับมือที่เลือกได้ในจังหวะหนึ่ง (ไม่ส่ง beat = จังหวะปัจจุบัน) */
export function openMoves(game: Game, life: LifeState, ev: GameEvent, beat: number = life.encounter?.beat ?? 0): Move[] {
  const foe = foeOf(game, ev);
  const moves = ev.encounter?.beats[beat]?.moves;
  if (!foe || !moves) return [];
  return moves.filter((m) => (!m.ally || !!life.cast?.[m.ally]) && (!m.parley || foe.def.speaks) && requiresMet(game, life, m.requires));
}

const hits = (list: readonly string[], move: Move) => list.includes(move.kind) || move.tags.some((t) => list.includes(t));

export interface MoveOdds {
  stat: Stat;
  dc: number;
  /** แต้มบวกรวมทั้งหมด (ค่าพลัง ของสวมใส่ อาชีพ สิ่งติดตัว และแต้มพิเศษใน parts) */
  mod: number;
  parts: OddsPart[];
  traits: { id: string; amount: number }[];
  /** โอกาสสำเร็จ 0 ถึง 1 รวมการทอยใหม่ที่ยังเหลือ */
  chance: number;
  /** ท่าที่เตรียมไว้ถูกใช้กับวิธีนี้ */
  tech: boolean;
}

const hasReroll = (game: Game, life: LifeState) => activePassives(life, game.items).some((p) => p.kind === 'reroll_failed_check');

/** ทอยใหม่ได้อีกไหมในการปะทะนี้: ท่าของนักรบ ท่าขององค์กร (ยืนแนว) หรือของที่ให้ทอยใหม่ อย่างละครั้ง คืนรหัสองค์กรถ้าเป็นท่าขององค์กร */
function rerollLeft(game: Game, life: LifeState, foe: FoeView): 'tech' | 'item' | OrgId | null {
  const st = life.encounter;
  if (techniqueDef(life).kind === 'reroll' && !st?.techUsed) return 'tech';
  const org = orgTechnique(life, foe.def.side, 'hold');
  if (org) return org;
  if (!st?.rerollUsed && hasReroll(game, life)) return 'item';
  return null;
}

/**
 * ความยาก แต้มบวก และโอกาสของวิธีหนึ่งในจังหวะปัจจุบัน armed = ผู้เล่นกดเตรียมท่าของอาชีพไว้ · supply = ของใช้แล้วหมดที่จะใช้ในจังหวะนี้
 * ของที่สวม: ป้ายของอาวุธ (บุก ชิงจังหวะ) และของมือรอง (ตั้งรับ ใช้ของ) นับเป็นป้ายของวิธีเมื่อเทียบจุดอ่อน ·
 * วัสดุที่ได้เปรียบศัตรูฝ่ายนี้ได้แต้ม edge · เกราะตัวเหล็กดำถ่วงตอนหนี
 */
export function moveOdds(game: Game, life: LifeState, ev: GameEvent, move: Move, armed = false, supply?: string): MoveOdds {
  const foe = foeOf(game, ev)!;
  const st = life.encounter;
  const beat = ev.encounter!.beats[st?.beat ?? 0];
  const tk = techniqueOf(life, game);
  const tech = armed && tk.ready && techniqueFits(tk.kind, move);
  const spell = tech && tk.kind === 'spell';
  const stat: Stat = spell ? 'INT' : (move.stat ?? MOVE_STAT[move.kind] ?? 'WIS');
  const dc = ENCOUNTER.dc[foe.threat - 1]! - (move.kind === 'flee' ? ENCOUNTER.fleeEase : 0);

  const parts: OddsPart[] = [];
  if (beat?.answer && beat.answer === move.kind) parts.push({ kind: 'tell', amount: ENCOUNTER.tell });
  const fromGear = gearTags(game, life, move.kind).find((g) => foe.def.weak.includes(g.tag));
  const aid = supplyAid(game, life, foe.def, move, supply, ENCOUNTER.weak);
  const weak = !!st?.weakKnown && (hits(foe.def.weak, move) || !!fromGear);
  if (weak) parts.push({ kind: 'weak', amount: ENCOUNTER.weak, ...(!hits(foe.def.weak, move) && fromGear ? { by: fromGear.by } : {}) });
  // เวทหนึ่งบททะลุจุดแข็ง และนับเป็นการโดนจุดอ่อนแม้ยังไม่รู้จุดอ่อน
  if (!spell && hits(foe.def.strong, move)) parts.push({ kind: 'strong', amount: -ENCOUNTER.strong });
  if (move.ally && life.cast?.[move.ally]) parts.push({ kind: 'ally', amount: ENCOUNTER.ally });
  if (tech) {
    const amount = spell ? (weak ? 0 : ENCOUNTER.weak) : tk.kind === 'ward' ? 0 : techniqueDef(life).amount;
    parts.push({ kind: 'tech', amount });
  }
  const edge = EDGE_KINDS.includes(move.kind) ? gearEdge(game, life, foe.def) : null;
  if (edge) parts.push({ kind: 'edge', amount: GEAR.edge, by: edge.id });
  const heavy = move.kind === 'flee' ? heavyArmour(game, life) : null;
  if (heavy) parts.push({ kind: 'heavy', amount: -GEAR.heavyFlee, by: heavy.id });
  if (aid) {
    // ของที่ตรงจุดอ่อนได้แต้มจุดอ่อนเต็ม ถ้าวิธีนี้ได้แต้มจุดอ่อนอยู่แล้ว (หรือเวทนับให้แล้ว) ไม่ได้ซ้ำ
    const already = weak || (spell && tech);
    const amount = aid.weak && already ? aid.amount - ENCOUNTER.weak : aid.amount;
    if (amount || aid.heal) parts.push({ kind: 'supply', amount, by: aid.item.id });
  }

  const traits = traitCheckBonuses(life, game.traits, stat, foe.def.side);
  let mod = modifier(effectiveStats(life, game.items)[stat]) + situationalBonus(life, stat) + gearCheckBonus(life, game.items, stat);
  for (const t of traits) mod += t.amount;
  for (const p of parts) mod += p.amount;

  let wins = 0;
  for (let d = 1; d <= 20; d++) if (d === 20 || (d !== 1 && d + mod >= dc)) wins++;
  const p = wins / 20;
  return { stat, dc, mod, parts, traits, chance: rerollLeft(game, life, foe) ? 1 - (1 - p) * (1 - p) : p, tech };
}

/** พลังชีวิตที่เสียเมื่อพลาดหนึ่งจังหวะ ก่อนคิดโล่และพร */
export function hitDamage(game: Game, life: LifeState, foe: FoeView): number {
  const armor = activePassives(life, game.items).reduce((n, p) => n + (p.kind === 'armor' ? p.amount : 0), 0);
  return Math.max(ENCOUNTER.minDamage, ENCOUNTER.damage[foe.threat - 1]! - Math.min(ENCOUNTER.armorMax, armor));
}

export interface MoveResult {
  life: LifeState;
  record: BeatRecord;
  /** การปะทะจบแล้ว: entry คือบันทึกของทั้งการปะทะ */
  done: boolean;
  entry?: LogEntry;
}

/** ประโยคประจำตัวของศัตรูที่ยังไม่ถูกใช้ในการปะทะนี้ */
function stockLine(lines: string[], used: BeatRecord[], foe: FoeView, rng: Rng): string | undefined {
  const all = lines.map((t) => t.replaceAll('{foe}', foe.name));
  const fresh = all.filter((t) => !used.some((r) => r.text === t));
  // ใช้ครบทุกประโยคแล้ว: อย่างน้อยไม่ซ้ำกับจังหวะที่เพิ่งผ่านไป
  const rest = all.filter((t) => t !== used.at(-1)?.text);
  const from = fresh.length ? fresh : rest.length ? rest : all;
  return from.length ? from[rng.int(0, from.length - 1)] : undefined;
}

/**
 * เดินหนึ่งจังหวะ: ทอย ใช้ผลกับแรงใจของศัตรูหรือพลังชีวิตของตัวละคร แล้วดูว่าการปะทะจบหรือยัง
 * ยังไม่จบ = คืนชีวิตที่จังหวะขยับไปหนึ่ง · จบ = ใช้ผลของแบบที่จบ ให้แผลถ้าเจ็บหนัก จดจุดอ่อนที่รู้ แล้วปิดเหตุการณ์เหมือนตัวเลือกปกติ
 */
export function resolveMove(game: Game, life: LifeState, moveId: string, armed = false, supply?: string): MoveResult {
  const ev = game.events.find((e) => e.id === life.currentEventId);
  const enc: Encounter | undefined = ev?.encounter;
  const st = life.encounter;
  const foe = ev ? foeOf(game, ev) : null;
  if (!ev || !enc || !st || !foe) throw new Error('ไม่ได้อยู่ในการปะทะ');
  const move = openMoves(game, life, ev).find((m) => m.id === moveId);
  if (!move) throw new Error(`วิธี ${moveId} ยังใช้ไม่ได้`);

  const rng = Rng.fromState(life.rngState);
  const odds = moveOdds(game, life, ev, move, armed, supply);
  const tk = techniqueOf(life, game);
  // ของใช้แล้วหมดถูกใช้ไปเฉพาะเมื่อมันช่วยวิธีนี้ได้จริง (ได้แต้มหรือฟื้นพลังชีวิต)
  const aid = odds.parts.some((p) => p.kind === 'supply') ? supplyAid(game, life, foe.def, move, supply, ENCOUNTER.weak) : null;
  if (aid) life = { ...spendSupplyInFight(life, aid.item.id), hp: life.hp + aid.heal };
  const passes = (d: number) => d === 20 || (d !== 1 && d + odds.mod >= odds.dc);

  const state: EncounterState = { ...st, records: [...st.records] };
  const record: BeatRecord = { moveId, stat: odds.stat, d20: rng.d20(), mod: odds.mod, dc: odds.dc, success: false };
  if (odds.parts.length) record.parts = odds.parts;
  if (odds.traits.length) record.traits = odds.traits;
  if (odds.tech) {
    record.tech = tk.kind;
    state.techUsed = true;
  }
  if (aid) {
    record.supply = aid.item.id;
    if (aid.heal) record.healed = aid.heal;
    // ของที่ตรงจุดอ่อนทำให้ตัวละครเห็นจุดอ่อนของศัตรู ไม่ว่าจังหวะนี้จะสำเร็จหรือไม่
    if (aid.weak && !state.weakKnown) {
      state.weakKnown = true;
      state.learned = st.beat;
    }
  }
  if (!passes(record.d20)) {
    const again = rerollLeft(game, life, foe);
    if (again) {
      record.d20 = Math.max(record.d20, rng.d20());
      record.rerolled = true;
      if (again === 'tech') {
        state.techUsed = true;
        record.tech = 'reroll';
      } else if (again === 'item') state.rerollUsed = true;
      else {
        // ท่าขององค์กร (ยืนแนว): ทอยใหม่ให้เองเหมือนท่าของนักรบ
        state.orgTechUsed = [...(state.orgTechUsed ?? []), again];
        record.tech ??= TECHNIQUES[again].kind;
      }
    }
  }
  record.success = passes(record.d20);

  let next = life;
  let end: EncounterEnd | null = null;
  if (record.success) {
    if (move.kind === 'flee') end = 'flee';
    else if (move.parley) end = 'parley';
    else {
      let pips = record.d20 === 20 ? ENCOUNTER.critPips : 1;
      if (tk.kind === 'ambush' && tk.ready) {
        pips += techniqueDef(life).amount;
        record.tech = 'ambush';
      } else {
        // ท่าขององค์กร (รู้ทางเขี้ยว): สำเร็จครั้งแรกศัตรูเสียแรงใจเพิ่ม ไม่ทบกับแทงจากเงาในจังหวะเดียวกัน
        const org = orgTechnique(life, foe.def.side, 'quarry');
        if (org) {
          pips += TECHNIQUES[org].amount;
          state.orgTechUsed = [...(state.orgTechUsed ?? []), org];
          record.tech ??= TECHNIQUES[org].kind;
        }
      }
      record.pips = Math.min(pips, state.morale);
      state.morale -= record.pips;
      if (move.kind === 'read' && !state.weakKnown) {
        state.weakKnown = true;
        state.learned = st.beat;
      }
      if (state.morale <= 0) end = 'win';
    }
    const text = move.success ?? (end ? undefined : stockLine(foe.def.hurt, state.records, foe, rng));
    if (text) record.text = text;
  } else {
    const text = move.failure ?? stockLine(foe.def.strike, state.records, foe, rng);
    if (text) record.text = text;
    if (odds.tech && tk.kind === 'ward') record.blocked = 'ward';
    else if (!state.shieldUsed && activePassives(life, game.items).some((p) => p.kind === 'shield')) {
      record.blocked = 'shield';
      state.shieldUsed = true;
    } else {
      const damage = hitDamage(game, life, foe);
      if (life.hp - damage > 0) next = { ...next, hp: life.hp - damage };
      else if (!foe.deadly) {
        // ศัตรูที่ไม่เอาถึงตาย: ล้มลงตรงนั้นด้วยพลังชีวิตเดียว
        next = { ...next, hp: Math.min(life.hp, 1) };
        end = 'lose';
      } else {
        // เอาถึงตาย: เด็กก่อนวัย PROTECTED_AGE กับคนที่มีสิ่งกันตายรอดมาด้วยพลังชีวิตเดียว นอกนั้นตาย
        next = applyEffects(game, next, { hp: -damage }, 'fight');
        end = next.dying ? 'death' : 'lose';
        if (next.dying) next = { ...next, deathTold: !!enc.death?.text };
      }
      record.damage = life.hp - next.hp;
    }
  }
  // แทงจากเงาใช้ได้เฉพาะจังหวะแรก ไม่ว่าจะเข้าหรือไม่
  if (tk.kind === 'ambush') state.techUsed = true;
  state.records.push(record);
  state.beat += 1;
  if (!end && state.beat >= enc.beats.length) end = 'stalemate';

  if (!end) return { life: { ...next, rngState: rng.state, encounter: state }, record, done: false };

  // ---- การปะทะจบ ----
  // สิ่งที่เทียบว่าเปลี่ยนคือผลหลังการปะทะ (ของที่ได้ แผล เงิน) พลังชีวิตที่เสียรายจังหวะบอกไว้ในแต่ละจังหวะแล้ว
  const before: LifeState = { ...life, hp: next.hp };
  if (ev.people) next = applyEffects(game, next, { people: ev.people });
  const outcome = end === 'death' ? undefined : enc[end];
  next = applyEffects(game, next, outcome?.effects, 'fight');
  const texts: string[] = [];
  const closing = end === 'death' ? enc.death?.text : outcome?.text;
  if (closing) texts.push(closing);

  if (!next.dying) {
    // แผลติดตัว: แพ้ หรือเสียพลังชีวิตในการปะทะนี้เกินสัดส่วน heavy ของที่มีตอนเริ่ม ได้แผลแรกของศัตรูชนิดนี้ที่ยังไม่มี
    const lost = st.hpStart - before.hp;
    if (end === 'lose' || lost > st.hpStart * ENCOUNTER.heavy) {
      const wound = foe.def.wounds.find((w) => !next.traits.includes(w) && game.traits.has(w));
      if (wound) {
        next = applyEffects(game, next, { traits: [wound] });
        const gained = game.traits.get(wound)?.gained;
        if (gained) texts.push(gained);
      }
    }
    const flag = knowsFlag(foe.def.id);
    if ((state.weakKnown || end === 'win') && !next.flags.includes(flag)) next = { ...next, flags: [...next.flags, flag] };
  }

  // ของที่ศัตรูทิ้งไว้เมื่อชนะ
  let loot: EncounterLog['loot'];
  if (end === 'win' && !next.dying) {
    for (const got of rollLoot(game, next, foe.def, rng)) {
      if (got.item) next = addItem(game, next, got.item);
      if (got.gold) next = { ...next, gold: next.gold + got.gold };
      loot = { ...(got.item ? { item: got.item } : {}), ...(got.gold ? { gold: got.gold } : {}) };
      if (got.text) texts.push(got.text.replaceAll('{foe}', foe.name));
    }
  }

  // โรงรับเขี้ยวรับซื้อหลักฐานการล่าจากสมาชิกที่ชนะสิ่งที่ไม่ใช่คน
  const bounty = end === 'win' && !next.dying ? bountyFor(next, foe.def.side, foe.threat) : 0;
  if (bounty) {
    next = { ...next, gold: next.gold + bounty };
    const said = (game.lines.bounty ?? []).map((t) => t.replaceAll('{foe}', foe.name));
    if (said.length) texts.push(said[rng.int(0, said.length - 1)]!);
  }
  // งานขององค์กร: ชนะ เจรจาได้ หรือยันไว้ได้คือทำงานสำเร็จ แพ้หรือถอยไม่ได้ผลงาน
  if (ev.duty && !next.dying) next = recordDuty(next, ev.duty, end === 'win' || end === 'parley' || end === 'stalemate' ? 'done' : 'tried');

  const log: EncounterLog = { foe: foe.def.id, name: foe.name, end, morale: foe.morale, records: state.records };
  if (loot) log.loot = loot;
  if (bounty) log.bounty = bounty;
  if (state.knew) log.knew = true;
  if (state.learned !== undefined) log.learned = state.learned;
  const entry: LogEntry = { age: life.age, eventId: ev.id, choiceId: end, encounter: log };
  if (Object.keys(life.cast ?? {}).length) entry.cast = { ...life.cast };
  if (texts.length) entry.text = texts.join('\n\n');
  const result = concludeEvent(game, ev, before, next, entry, rng, [outcome?.effects]);
  return { life: result.life, record, done: true, entry: result.entry };
}

/** อายุที่การปะทะเอาถึงตายได้ (ก่อนหน้านี้ล้มได้แต่ไม่ตาย) ให้หน้าจอใช้บอกผู้เล่น */
export const canDieInFight = (life: LifeState, foe: FoeView) => foe.deadly && life.age >= PROTECTED_AGE;

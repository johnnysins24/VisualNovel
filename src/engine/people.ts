/**
 * คนรอบตัว: ปีเกิดและอายุของทุกคนในผัง ตัวแสดงของเหตุการณ์ และการแก่กับจากไปตามเวลา
 * ทุกอย่างคิดจาก seed ของชีวิตกับ id ของคน จึงได้ผลเดิมทุกครั้ง
 */
import type { CastSpec, GameEvent, KinRole } from './schema';
import { EVEN_AGING_UNTIL, NPC_DEATH, RACES, type RaceId } from './balance';
import { Rng } from './rng';
import { toHumanAge, worldYear, type LifeState, type Person } from './state';

const ELDER_KIN = new Set<string>(['grandfather_paternal', 'grandmother_paternal', 'grandfather_maternal', 'grandmother_maternal']);
/** ญาติสายเลือด: เผ่าเดียวกับผู้เล่น */
const BLOOD_KIN = new Set<string>(['father', 'mother', 'sibling_older', 'sibling_younger', 'child', ...ELDER_KIN]);
/** คนที่มีฉากลาของตัวเอง ระบบไม่เอาไปเงียบๆ จนกว่าจะแก่มากจริง */
const CLOSE_KIN = new Set<string>(['father', 'mother', 'spouse']);

type Ctx = Pick<LifeState, 'seed' | 'birthYear' | 'age' | 'raceApplied'>;

/** ตัวสุ่มคงที่จากข้อความ (ชีวิตเดียวกัน คนเดียวกัน ได้เลขเดิมเสมอ) */
function seeded(key: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return new Rng(h >>> 0);
}

/** เผ่าของคนนี้ ใช้คิดว่าแก่ช้าแค่ไหน: ระบุไว้ก็ใช้ตามนั้น ญาติสายเลือดเป็นเผ่าเดียวกับผู้เล่น คนอื่นนับเป็นมนุษย์ */
export function personRace(p: Pick<Person, 'race' | 'kin'>, life: Pick<LifeState, 'raceApplied'>): RaceId {
  if (p.race && p.race in RACES) return p.race as RaceId;
  if (p.kin && BLOOD_KIN.has(p.kin) && life.raceApplied && life.raceApplied in RACES) return life.raceApplied as RaceId;
  return 'human';
}

/**
 * ปีเกิดที่กะจากบทบาท สำหรับคนที่เนื้อหาไม่ได้บอกอายุ: พ่อแม่แก่กว่าผู้เล่น 20 ถึง 34 ปี ปู่ย่าตายายแก่กว่าพ่อแม่อีก 20 ถึง 29 ปี
 * พี่แก่กว่า 2 ถึง 6 ปี น้องและลูกที่เข้ามาหลังผู้เล่นเกิดคือเกิดปีนั้น ครูแก่กว่า 20 ถึง 34 ปี คู่ครอง เพื่อน และคู่แค้นรุ่นราวคราวเดียวกัน
 */
export function estimateBorn(p: Pick<Person, 'id' | 'kin' | 'bond' | 'metAge' | 'race'>, life: Ctx): number {
  const r = seeded(`born:${life.seed}:${p.id}`);
  const span = (a: number, b: number) => r.int(a, b);
  const kin = p.kin ?? '';
  const met = life.birthYear + (p.metAge ?? 0);
  // ปีเกิดของคน "รุ่นเดียวกับผู้เล่น": คนที่แก่เร็วช้าไม่เท่าผู้เล่นนับจากวัยตอนรู้จักกัน ไม่ใช่ปีเกิดของผู้เล่น
  // (เอลฟ์อายุจริง 150 ร่างกายเท่ามนุษย์อายุ 51 เพื่อนมนุษย์ที่เพิ่งรู้จักต้องอายุราว 51 ไม่ใช่ 150) เผ่าที่แก่เท่ากันได้ปีเกิดของผู้เล่นเหมือนเดิม
  const h = toHumanAge(p.metAge ?? 0, life.raceApplied);
  const scale = RACES[personRace(p, life)].ageScale;
  const peer = met - Math.floor((h <= EVEN_AGING_UNTIL ? h : EVEN_AGING_UNTIL + (h - EVEN_AGING_UNTIL) * scale) + 1e-9);
  if (kin === 'father' || kin === 'mother') return life.birthYear - span(20, 34);
  if (ELDER_KIN.has(kin)) return life.birthYear - span(20, 34) - span(20, 29);
  if (kin === 'sibling_older') return life.birthYear - span(2, 6);
  if (kin === 'sibling_younger') return (p.metAge ?? 0) > 0 ? met : life.birthYear + span(1, 4);
  if (kin === 'child') return met;
  if (p.bond === 'mentor') return peer - span(20, 34);
  if (kin === 'spouse' || p.bond === 'love' || p.bond === 'friend' || p.bond === 'rival') return Math.min(met, peer + span(-3, 3));
  // คนอื่นๆ: อายุห่างจากผู้เล่นไม่มาก และเป็นผู้ใหญ่แล้วตอนรู้จักกัน
  return Math.min(met - 16, peer - span(-5, 15));
}

/** ปีที่ใช้นับอายุของคนนี้: คนที่ยังอยู่นับถึงปีนี้ คนที่จากไปแล้วหยุดที่ปีที่ตาย */
const yearOf = (p: Pick<Person, 'alive' | 'diedAge'>, life: Ctx) => (p.alive === false && p.diedAge !== undefined ? life.birthYear + p.diedAge : worldYear(life));

/** ปีเกิดของคนรอบตัว (เซฟเก่าที่ยังไม่มีปีเกิดใช้ค่าที่กะจากบทบาท) */
export const personBorn = (p: Person, life: Ctx) => p.born ?? estimateBorn(p, life);

/** อายุจริงของคนรอบตัว (ปี) คนที่ตายแล้วคืออายุตอนตาย */
export function personYears(p: Person, life: Ctx): number {
  return Math.max(0, yearOf(p, life) - personBorn(p, life));
}

/** อายุเทียบมนุษย์ของคนรอบตัว (เผ่าอายุยืนแก่ช้าหลังอายุ 40) */
export function personHumanAge(p: Person, life: Ctx): number {
  return toHumanAge(personYears(p, life), personRace(p, life));
}

// ---------- ตัวแสดง ----------

function fits(p: Person, spec: CastSpec, life: LifeState): boolean {
  if (p.alive !== spec.alive) return false;
  if (spec.id && p.id !== spec.id) return false;
  if (spec.kin && !(p.kin && spec.kin.includes(p.kin as KinRole))) return false;
  if (spec.bond && !(p.bond && spec.bond.includes(p.bond))) return false;
  if (spec.min_closeness !== undefined && p.closeness < spec.min_closeness) return false;
  if (spec.max_closeness !== undefined && p.closeness > spec.max_closeness) return false;
  if (spec.min_age !== undefined || spec.max_age !== undefined) {
    const a = Math.floor(personHumanAge(p, life) + 1e-9);
    if (spec.min_age !== undefined && a < spec.min_age) return false;
    if (spec.max_age !== undefined && a > spec.max_age) return false;
  }
  return true;
}

function choose(found: Person[], spec: CastSpec, life: LifeState, role: string, eventId: string): Person {
  const born = (p: Person) => p.born ?? estimateBorn(p, life);
  switch (spec.pick) {
    case 'eldest':
      return found.reduce((a, b) => (born(b) < born(a) ? b : a));
    case 'youngest':
      return found.reduce((a, b) => (born(b) > born(a) ? b : a));
    case 'first':
      return found[0]!;
    case 'random':
      return found[seeded(`cast:${life.seed}:${life.age}:${eventId}:${role}`).int(0, found.length - 1)]!;
    default:
      // สนิทที่สุด (ใช้ค่าสัมบูรณ์กับบทที่ต้องการคนที่ความสนิทติดลบ) เท่ากันเอาคนที่รู้จักก่อน
      return found.reduce((a, b) => {
        const want = spec.max_closeness !== undefined && spec.max_closeness < 0 ? -1 : 1;
        return b.closeness * want > a.closeness * want ? b : a;
      });
  }
}

/**
 * หาคนมาเล่นทุกบทของเหตุการณ์ คืน null ถ้าบทที่บังคับ (ไม่ optional) ไม่มีใครเข้า
 * คนหนึ่งเล่นได้บทเดียวต่อเหตุการณ์ บทถูกเติมตามลำดับที่เขียน
 */
export function bindCast(life: LifeState, ev: Pick<GameEvent, 'id' | 'cast'>): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (!ev.cast) return out;
  const used = new Set<string>();
  for (const [role, spec] of Object.entries(ev.cast)) {
    const found = (life.people ?? []).filter((p) => !used.has(p.id) && fits(p, spec, life));
    if (!found.length) {
      if (spec.optional) continue;
      return null;
    }
    const p = choose(found, spec, life, role, ev.id);
    out[role] = p.id;
    used.add(p.id);
  }
  return out;
}

// ---------- คนรอบตัวแก่และจากไป ----------

/** คนสำคัญที่ควรมีฉากลาของตัวเอง */
export const isClose = (p: Person) => (!!p.kin && CLOSE_KIN.has(p.kin)) || p.closeness >= NPC_DEATH.closeBond;

/** โอกาสที่คนนี้จะจากไปตามวัยในปีนี้ (0 ถึง 1) คิดจากอายุเทียบมนุษย์ เผ่าอายุยืนจึงอยู่ได้นานกว่า */
export function passingChance(p: Person, life: Ctx, fated?: ReadonlySet<string>): number {
  if (!p.alive) return 0;
  const race = personRace(p, life);
  const h = personHumanAge(p, life);
  // คู่ครองไม่จากไปด้วยการทอยประจำปีจนกว่าจะแก่มากจริง: ก่อนหน้านั้นถ้าจะจากไปก่อนต้องเป็นฉากที่เขียนไว้ ไม่อย่างนั้นก็อยู่จนถึงวันที่ตัวละครจากไปเอง
  // คนสำคัญ และคนที่เนื้อเรื่องเขียนฉากลาไว้ให้ (fated) รอฉากของตัวเองก่อน
  const partner = p.kin === 'spouse' || p.id === 'partner';
  const from = partner ? NPC_DEATH.partnerFrom : isClose(p) || fated?.has(p.id) ? NPC_DEATH.closeFrom : NPC_DEATH.from;
  if (h <= from) return 0;
  const chance = NPC_DEATH.perYear * (h - NPC_DEATH.from) + NPC_DEATH.latePerYear * Math.max(0, h - NPC_DEATH.lateFrom);
  return Math.min(NPC_DEATH.max, chance) / RACES[race].ageScale;
}

/** คนที่จากไปตามวัยในปีนี้ (ทอยทีละคนตามลำดับในรายชื่อ) */
export function yearlyPassings(life: LifeState, rng: Rng, fated?: ReadonlySet<string>): Person[] {
  const gone: Person[] = [];
  for (const p of life.people ?? []) {
    const chance = passingChance(p, life, fated);
    if (chance > 0 && rng.next() < chance) gone.push(p);
  }
  return gone;
}

/** ลูกที่ยังมีชีวิต เรียงจากคนโต */
export function livingChildren(life: Pick<LifeState, 'people' | 'seed' | 'birthYear' | 'age' | 'raceApplied'>): Person[] {
  return (life.people ?? [])
    .filter((p) => p.kin === 'child' && p.alive)
    .sort((a, b) => (a.born ?? estimateBorn(a, life)) - (b.born ?? estimateBorn(b, life)));
}

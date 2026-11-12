/**
 * สิ่งติดตัว (ลักษณะ พร คำสาป แผล): อ่านผลจากทะเบียน content/traits.yaml
 * ตัวเลขของแต่ละอย่างอยู่ในทะเบียน ไฟล์นี้มีแต่วิธีคิด
 */
import type { Stat, Trait, TraitEffect } from './schema';
import { BIG_TRAITS_MAX, HABIT_COUNT, HABIT_SHARE, HABIT_TRAITS_MAX, type FoeSide } from './balance';
import type { LifeState } from './state';

export type TraitIndex = Map<string, Trait>;

type Holder = Pick<LifeState, 'traits' | 'traitSteps'>;

/** ขั้นปัจจุบันของสิ่งติดตัว (1 ถ้าไม่มีหลายขั้น) */
export function traitStep(life: Holder, t: Trait): number {
  const max = t.steps?.length ?? 1;
  return Math.max(1, Math.min(max, life.traitSteps?.[t.id] ?? 1));
}

/** ผลที่ใช้อยู่ตอนนี้ของสิ่งติดตัวหนึ่งอย่าง: ของที่มีหลายขั้นใช้ผลของขั้นปัจจุบัน */
export function effectsOf(life: Holder, t: Trait): TraitEffect[] {
  return t.steps ? (t.steps[traitStep(life, t) - 1]?.effects ?? []) : t.effects;
}

/** บรรทัดบวกและลบบนการ์ดของสิ่งติดตัว ตามขั้นปัจจุบัน */
export function traitLines(life: Holder, t: Trait): { name: string; gives: string[]; costs: string[] } {
  const step = t.steps?.[traitStep(life, t) - 1];
  return { name: step?.name ?? t.name, gives: step ? step.gives : t.gives, costs: step ? step.costs : t.costs };
}

export function heldTraits(life: Holder, traits: TraitIndex): Trait[] {
  return life.traits.map((id) => traits.get(id)).filter((t): t is Trait => !!t);
}

function activeEffects(life: Holder, traits: TraitIndex): { trait: Trait; fx: TraitEffect }[] {
  return heldTraits(life, traits).flatMap((trait) => effectsOf(life, trait).map((fx) => ({ trait, fx })));
}

const inPlace = (fx: { locations?: string[] | undefined; not_locations?: string[] | undefined }, tag: string) =>
  (!fx.locations || fx.locations.includes(tag)) && !(fx.not_locations ?? []).includes(tag);

/** โบนัสทอยจากสิ่งติดตัว แยกรายการเพื่อให้หน้าจอบอกที่มาได้ */
export function traitCheckBonuses(life: LifeState, traits: TraitIndex, stat: Stat, foe?: FoeSide): { id: string; amount: number }[] {
  const out: { id: string; amount: number }[] = [];
  for (const { trait, fx } of activeEffects(life, traits)) {
    if (fx.kind !== 'check_bonus') continue;
    if (fx.stats && !fx.stats.includes(stat)) continue;
    // ผลที่เจาะจงฝั่งของศัตรูใช้ได้เฉพาะเช็คที่บอกว่าเผชิญกับฝั่งนั้น
    if (fx.foes && !(foe && fx.foes.includes(foe))) continue;
    if (!inPlace(fx, life.locationTag)) continue;
    out.push({ id: trait.id, amount: fx.amount });
  }
  return out;
}

export const traitCheckBonus = (life: LifeState, traits: TraitIndex, stat: Stat, foe?: FoeSide) =>
  traitCheckBonuses(life, traits, stat, foe).reduce((n, b) => n + b.amount, 0);

const sum = (life: LifeState, traits: TraitIndex, kind: 'max_hp' | 'winter') =>
  activeEffects(life, traits).reduce((n, { fx }) => n + (fx.kind === kind ? fx.amount : 0), 0);

export const traitMaxHp = (life: LifeState, traits: TraitIndex) => sum(life, traits, 'max_hp');
export const traitWinter = (life: LifeState, traits: TraitIndex) => sum(life, traits, 'winter');
export const traitRegen = (life: LifeState, traits: TraitIndex) =>
  activeEffects(life, traits).reduce((n, { fx }) => n + (fx.kind === 'regen' && inPlace(fx, life.locationTag) ? fx.amount : 0), 0);
export const isAgeless = (life: LifeState, traits: TraitIndex) => activeEffects(life, traits).some(({ fx }) => fx.kind === 'ageless');

/** สิ่งติดตัวที่กันตายได้หนึ่งครั้ง (ถ้ามี) */
export function deathWard(life: LifeState, traits: TraitIndex): { trait: Trait; fx: Extract<TraitEffect, { kind: 'cheat_death' }> } | null {
  for (const { trait, fx } of activeEffects(life, traits)) if (fx.kind === 'cheat_death') return { trait, fx };
  return null;
}

/** สิ่งติดตัวที่ปิดตัวเลือกซึ่งติดป้ายนิสัย habit (ดู Trait.blocks) คืน id ของสิ่งที่ปิด */
export const habitBlockers = (life: Holder, traits: TraitIndex, habit: string | undefined): string[] =>
  habit ? heldTraits(life, traits).filter((t) => t.blocks.includes(habit)).map((t) => t.id) : [];

export const bigCount = (life: Holder, traits: TraitIndex) => heldTraits(life, traits).filter((t) => t.big).length;
export const hasBigRoom = (life: Holder, traits: TraitIndex) => bigCount(life, traits) < BIG_TRAITS_MAX;

/**
 * นับนิสัยหนึ่งครั้ง คืนรหัสลักษณะที่ก่อตัวในครั้งนี้ (ถ้ามี) ผู้เรียกนับ life.habitOffers ของครั้งนี้ไว้ก่อนแล้ว
 * ไม่ก่อตัวถ้ามีอยู่แล้ว ยังเลือกไม่ถึง HABIT_SHARE ของครั้งที่มีให้เลือก มีลักษณะตรงข้ามอยู่ หรือมีลักษณะจากนิสัยครบ HABIT_TRAITS_MAX แล้ว
 */
export function countHabit(life: LifeState, traits: TraitIndex, id: string): { habits: Record<string, number>; formed: string | null } {
  const t = traits.get(id);
  const habits = { ...(life.habits ?? {}), [id]: (life.habits?.[id] ?? 0) + 1 };
  if (!t?.habit || life.traits.includes(id) || habits[id]! < HABIT_COUNT) return { habits, formed: null };
  if (habits[id]! < (life.habitOffers?.[id] ?? 0) * HABIT_SHARE) return { habits, formed: null };
  if (t.excludes.some((x) => life.traits.includes(x))) return { habits, formed: null };
  if (heldTraits(life, traits).filter((x) => x.habit).length >= HABIT_TRAITS_MAX) return { habits, formed: null };
  return { habits, formed: id };
}

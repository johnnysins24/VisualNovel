import type { Item, Passive, Stat } from './schema';
import { STATS } from './schema';
import { GEAR } from './balance';
import type { LifeState } from './state';
import { classMaxHpBonus } from './rules';

export type ItemIndex = Map<string, Item>;

export function equippedItems(life: LifeState, items: ItemIndex): Item[] {
  return Object.values(life.equipped)
    .map((id) => (id ? items.get(id) : undefined))
    .filter((i): i is Item => !!i);
}

/** โบนัสค่าพลังจากของที่สวมทุกชิ้น รวมกันไม่เกิน GEAR.statCap ต่อค่าพลังหนึ่งอย่าง (ค่าที่ของลดให้ไม่มีเพดาน) */
export function gearStats(life: LifeState, items: ItemIndex): Record<Stat, number> {
  const out = Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
  for (const item of equippedItems(life, items)) for (const s of STATS) out[s] += item.stats[s] ?? 0;
  for (const s of STATS) out[s] = Math.min(GEAR.statCap, out[s]);
  return out;
}

/** Base stat plus equipment bonuses. */
export function effectiveStats(life: LifeState, items: ItemIndex): Record<Stat, number> {
  const out = { ...life.stats }, gear = gearStats(life, items);
  for (const s of STATS) out[s] += gear[s];
  return out;
}

export function activePassives(life: LifeState, items: ItemIndex): Passive[] {
  return equippedItems(life, items).flatMap((i) => [i.passive, i.also].flatMap((p) => (p ? [p.effect] : [])));
}

/** แต้มทอยจากของที่สวม (check_bonus) ของค่าพลังนั้น รวมกันไม่เกิน GEAR.checkCap */
export function gearCheckBonus(life: LifeState, items: ItemIndex, stat: Stat): number {
  const sum = activePassives(life, items).reduce((n, p) => n + (p.kind === 'check_bonus' && p.stat === stat ? p.amount : 0), 0);
  return Math.min(GEAR.checkCap, sum);
}

/** พลังชีวิตสูงสุด: ร่างกาย + ของที่สวม (max_hp รวมกันไม่เกิน GEAR.hpCap) + อาชีพ */
export function maxHp(life: LifeState, items: ItemIndex): number {
  const bonus = activePassives(life, items).reduce((n, p) => n + (p.kind === 'max_hp' ? p.amount : 0), 0);
  return life.baseMaxHp + Math.min(GEAR.hpCap, bonus) + classMaxHpBonus(life);
}

/** เปลี่ยนของที่สวมได้ไหมตอนนี้: กลางการปะทะไม่มีเวลาเปลี่ยน คนตายและคนที่กำลังจะตายก็เปลี่ยนไม่ได้ */
export const canChangeGear = (life: LifeState): boolean => life.alive && !life.encounter && !life.dying;

/**
 * สวมของลงช่องของมัน (แทนของเดิมในช่องนั้น) ถ้า HP สูงสุดลดลงเพราะของเดิมหลุด HP ปัจจุบันลดตามไม่ให้เกิน
 * ถ้าของเดิมคือสิ่งเดียวที่ยังพยุงร่างไว้ (ถอดแล้ว HP สูงสุดไม่ถึง 1) เปลี่ยนไม่ได้ คืนชีวิตเดิม
 */
export function equip(life: LifeState, item: Item, items: ItemIndex): LifeState {
  if (!item.slot || !life.inventory.includes(item.id) || !canChangeGear(life) || life.equipped[item.slot] === item.id) return life;
  const next = { ...life, equipped: { ...life.equipped, [item.slot]: item.id } };
  const cap = maxHp(next, items);
  return cap < 1 ? life : { ...next, hp: Math.min(next.hp, cap) };
}

/** ถอดของชิ้นนั้นออกจากช่อง ของยังอยู่ในกระเป๋า HP ปัจจุบันลดตามถ้า HP สูงสุดลด ถอดแล้ว HP สูงสุดไม่ถึง 1 = ถอดไม่ได้ คืนชีวิตเดิม */
export function unequip(life: LifeState, itemId: string, items: ItemIndex): LifeState {
  const slot = (Object.keys(life.equipped) as (keyof LifeState['equipped'])[]).find((s) => life.equipped[s] === itemId);
  if (!slot || !canChangeGear(life)) return life;
  const { [slot]: _off, ...equipped } = life.equipped;
  const next = { ...life, equipped };
  const cap = maxHp(next, items);
  return cap < 1 ? life : { ...next, hp: Math.min(next.hp, cap) };
}

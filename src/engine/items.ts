import type { Item, Passive, Stat } from './schema';
import { STATS } from './schema';
import type { LifeState } from './state';
import { classMaxHpBonus } from './rules';

export type ItemIndex = Map<string, Item>;

export function equippedItems(life: LifeState, items: ItemIndex): Item[] {
  return Object.values(life.equipped)
    .map((id) => (id ? items.get(id) : undefined))
    .filter((i): i is Item => !!i);
}

/** Base stat plus equipment bonuses. */
export function effectiveStats(life: LifeState, items: ItemIndex): Record<Stat, number> {
  const out = { ...life.stats };
  for (const item of equippedItems(life, items)) {
    for (const s of STATS) out[s] += item.stats[s] ?? 0;
  }
  return out;
}

export function activePassives(life: LifeState, items: ItemIndex): Passive[] {
  return equippedItems(life, items).flatMap((i) => (i.passive ? [i.passive.effect] : []));
}

export function maxHp(life: LifeState, items: ItemIndex): number {
  const bonus = activePassives(life, items).reduce((n, p) => n + (p.kind === 'max_hp' ? p.amount : 0), 0);
  return life.baseMaxHp + bonus + classMaxHpBonus(life);
}

/** สวมของลงช่องของมัน (แทนของเดิมในช่องนั้น) ถ้า HP สูงสุดลดลงเพราะของเดิมหลุด HP ปัจจุบันลดตามไม่ให้เกิน */
export function equip(life: LifeState, item: Item, items: ItemIndex): LifeState {
  if (!life.inventory.includes(item.id)) return life;
  const next = { ...life, equipped: { ...life.equipped, [item.slot]: item.id } };
  return { ...next, hp: Math.min(next.hp, maxHp(next, items)) };
}

/**
 * ของสวมใส่: งบของแต่ละระดับ ป้ายและวัสดุในการปะทะ ของใช้แล้วหมด ของที่ศัตรูทิ้งไว้ ร้านค้า และราคาของวัสดุตอนสิ้นปี
 * ตัวเลขทั้งหมดอยู่ใน balance.ts (GEAR, MATERIALS, MATERIAL_EDGE) ไฟล์นี้มีแต่วิธีคิด
 */
import type { FoeDef, Item, Move, Passive, Shop } from './schema';
import { STATS } from './schema';
import {
  COLD_IRON_OATH, DEMON_MARK_TRAIT, FOE_TAGS, GEAR, MATERIAL_EDGE, RARITIES, STAR_MARKS_TRAIT, WORLD_CAP, REPUTATION_CAP,
  type FoeTag, type ItemTag, type MaterialId, type MoveKind, type Rarity,
} from './balance';
import { worldYear, type LifeState } from './state';
import { Rng } from './rng';
import { equippedItems, maxHp, unequip } from './items';
import { applyEffects, requiresMet, type Game } from './engine';
import { shopsShut } from './cities';

// ---------- งบและราคา ----------

const passivePoints = (p: Passive | undefined): number => {
  if (!p) return 0;
  switch (p.kind) {
    case 'check_bonus': return Math.max(0, p.amount);
    case 'max_hp': return Math.ceil(Math.max(0, p.amount) / 2);
    case 'armor': return p.amount;
    case 'winter': return p.amount;
    case 'shield': return 1;
    case 'reroll_failed_check': return 2;
  }
};

/** แต้มงบที่ของชิ้นนี้ใช้ (ดู GEAR.budget) ป้าย วัสดุ และค่าที่ของลดให้ไม่นับ */
export function itemBudget(item: Item): number {
  const stats = STATS.reduce((n, s) => n + Math.max(0, item.stats[s] ?? 0), 0);
  return stats + passivePoints(item.passive?.effect) + passivePoints(item.also?.effect);
}

export const isSupply = (item: Item | undefined): boolean => !!item?.use;

/** ราคาที่ร้านรับซื้อคืน null = ขายไม่ได้ (ของที่มีเรื่องของตัวเองไม่มีราคา) */
export const sellPrice = (item: Item): number | null => (item.price === undefined ? null : Math.max(1, Math.floor(item.price * GEAR.sellShare)));

// ---------- ของที่มีอยู่กับตัว ----------

export const supplyCount = (life: LifeState, id: string): number => life.supplies?.[id] ?? 0;

/** ของทุกชิ้นที่อยู่กับตัว: ที่สวมอยู่ ในกระเป๋า และของใช้แล้วหมด */
export function carried(game: Game, life: LifeState): Item[] {
  const ids = [...life.inventory, ...Object.keys(life.supplies ?? {}).filter((id) => supplyCount(life, id) > 0)];
  return ids.map((id) => game.items.get(id)).filter((i): i is Item => !!i);
}

export const owns = (life: LifeState, id: string): boolean => life.inventory.includes(id) || supplyCount(life, id) > 0;
export const hasTag = (game: Game, life: LifeState, tag: ItemTag): boolean => carried(game, life).some((i) => i.tags.includes(tag));
export const wearsMaterial = (game: Game, life: LifeState, m: MaterialId): boolean => equippedItems(life, game.items).some((i) => i.material === m);
export const wearsRarity = (game: Game, life: LifeState, r: Rarity): boolean =>
  equippedItems(life, game.items).some((i) => RARITIES.indexOf(i.rarity) >= RARITIES.indexOf(r));

/** ได้ของหนึ่งชิ้น: ของสวมใส่เข้ากระเป๋า (ชิ้นเดียวต่อรหัส) ของใช้แล้วหมดนับจำนวน ไม่เกิน GEAR.stack */
export function addItem(game: Game, life: LifeState, id: string): LifeState {
  if (isSupply(game.items.get(id))) {
    const n = supplyCount(life, id);
    return n >= GEAR.stack ? life : { ...life, supplies: { ...(life.supplies ?? {}), [id]: n + 1 } };
  }
  return life.inventory.includes(id) ? life : { ...life, inventory: [...life.inventory, id] };
}

/** ของชิ้นหนึ่งหลุดจากมือด้วยผลของเรื่อง (effects.lose_items) ชิ้นที่สวมอยู่หลุดจากช่องด้วย พลังชีวิตปัจจุบันลดตามเพดานใหม่ */
export function loseItem(game: Game, life: LifeState, id: string): LifeState {
  if (!life.inventory.includes(id)) return life;
  const equipped = Object.fromEntries(Object.entries(life.equipped).filter(([, worn]) => worn !== id)) as LifeState['equipped'];
  const next = { ...life, equipped, inventory: life.inventory.filter((i) => i !== id) };
  return { ...next, hp: Math.min(next.hp, Math.max(1, maxHp(next, game.items))) };
}

/** ใช้ของใช้แล้วหมดไปหนึ่งชิ้น ลำดับของที่เหลือไม่ขยับ (หน้าจอเรียงตามลำดับที่ได้มา) */
function spendSupply(life: LifeState, id: string): LifeState {
  const left = Object.entries(life.supplies ?? {}).flatMap(([k, n]): [string, number][] => (k !== id ? [[k, n]] : n > 1 ? [[k, n - 1]] : []));
  return { ...life, supplies: Object.fromEntries(left) };
}

/** ใช้ของใช้แล้วหมดนอกการปะทะ: ได้เฉพาะของที่ฟื้นพลังชีวิต และเมื่อพลังชีวิตยังไม่เต็ม คืน null ถ้าใช้ไม่ได้ */
export function useSupply(game: Game, life: LifeState, id: string): { life: LifeState; healed: number } | null {
  const item = game.items.get(id);
  if (!item?.use?.heal || supplyCount(life, id) < 1 || life.encounter || !life.alive || life.dying) return null;
  const healed = Math.min(item.use.heal, maxHp(life, game.items) - life.hp);
  if (healed <= 0) return null;
  return { life: { ...spendSupply(life, id), hp: life.hp + healed }, healed };
}

// ---------- ของในการปะทะ ----------

const foeTagsOf = (item: Item | undefined): FoeTag[] => (item?.tags ?? []).filter((t): t is FoeTag => (FOE_TAGS as readonly string[]).includes(t));

/**
 * ป้ายที่ของในมือส่งให้วิธีรับมือ: อาวุธส่งให้การบุกและการชิงจังหวะ ของมือรองส่งให้การตั้งรับและการใช้ของ
 * ป้ายเหล่านี้ช่วยได้อย่างเดียวคือตรงจุดอ่อน ไม่ทำให้ชนจุดแข็งของศัตรู
 */
export function gearTags(game: Game, life: LifeState, kind: MoveKind): { tag: FoeTag; by: string }[] {
  const slot = kind === 'attack' || kind === 'quick' ? 'weapon' : kind === 'guard' || kind === 'item' ? 'offhand' : null;
  const item = slot ? game.items.get(life.equipped[slot] ?? '') : undefined;
  return foeTagsOf(item).map((tag) => ({ tag, by: item!.id }));
}

/** ของที่สวมอยู่ชิ้นแรกที่วัสดุได้เปรียบศัตรูชนิดนี้ (ดู MATERIAL_EDGE) ใช้กับการบุก ชิงจังหวะ และตั้งรับ */
export function gearEdge(game: Game, life: LifeState, foe: FoeDef): Item | null {
  const fits = (i: Item) => {
    const edge = i.material ? MATERIAL_EDGE[i.material] : undefined;
    return !!edge && (edge === 'magic' ? foe.magic : edge === foe.side);
  };
  return equippedItems(life, game.items).find(fits) ?? null;
}
export const EDGE_KINDS: readonly MoveKind[] = ['attack', 'quick', 'guard'];

/** เกราะตัวเหล็กดำหนัก หนียากขึ้น */
export const heavyArmour = (game: Game, life: LifeState): Item | null => {
  const body = game.items.get(life.equipped.body ?? '');
  return body?.material === 'black_iron' ? body : null;
};

/** ถือเหล็กเย็นอยู่ (สวมของเหล็กเย็น หรือสาบานเหล็กเย็นไว้): ร่ายเวทและขอพรไม่ได้ รับพรใหม่ก็ไม่ได้ */
export const coldIron = (game: Game, life: LifeState): boolean => wearsMaterial(game, life, 'cold_iron') || life.traits.includes(COLD_IRON_OATH);

export interface SupplyAid {
  item: Item;
  /** แต้มที่ของนี้ให้กับวิธีนี้ในจังหวะนี้ */
  amount: number;
  /** ป้ายของของนี้ตรงจุดอ่อนของศัตรู (ได้แต้มจุดอ่อน และตัวละครรู้จุดอ่อนตั้งแต่นั้น) */
  weak: boolean;
  heal: number;
}

/**
 * ของใช้แล้วหมดชิ้นนี้ช่วยวิธีนี้ได้อย่างไร คืน null ถ้าไม่มีของ หรือของนี้ไม่ช่วยอะไรกับวิธีนี้ (จึงไม่ถูกใช้ไป)
 * ป้ายของของ: ตรงจุดอ่อน = แต้มจุดอ่อนเต็ม แม้ตัวละครยังไม่รู้จุดอ่อน · ชนจุดแข็ง = ไม่ได้อะไร · นอกนั้น = GEAR.thrown
 * ป้ายใช้ไม่ได้กับการหนีและการพูด ส่วน boost บอกเองว่าใช้กับวิธีชนิดไหน
 */
export function supplyAid(game: Game, life: LifeState, foe: FoeDef, move: Move, id: string | undefined, weakAmount: number): SupplyAid | null {
  const item = id ? game.items.get(id) : undefined;
  if (!item?.use || supplyCount(life, item.id) < 1) return null;
  const heal = Math.max(0, Math.min(item.use.heal ?? 0, maxHp(life, game.items) - life.hp));
  let amount = 0, weak = false;
  const tags = foeTagsOf(item);
  if (tags.length && move.kind !== 'flee' && move.kind !== 'talk') {
    if (tags.some((t) => foe.weak.includes(t))) { amount = weakAmount; weak = true; }
    else if (!tags.some((t) => foe.strong.includes(t))) amount = GEAR.thrown;
  }
  if (item.use.boost?.kinds.includes(move.kind)) amount += item.use.boost.amount;
  return amount || heal ? { item, amount, weak, heal } : null;
}

export const spendSupplyInFight = spendSupply;

/** ของชิ้นนี้มีผลในการปะทะอย่างน้อยหนึ่งอย่างไหม: ฟื้นพลังชีวิต ให้แต้มกับวิธีรับมือ หรือมีป้ายที่เทียบกับจุดอ่อนของศัตรู */
export const usableInFight = (item: Item | undefined): boolean => !!item?.use && (!!item.use.heal || !!item.use.boost || foeTagsOf(item).length > 0);

/** ของใช้แล้วหมดที่หยิบใช้ในการปะทะได้ ของที่มีไว้ให้เหตุการณ์ถามหาอย่างเดียว (เช่นของที่มีแต่ป้ายเชือก) ไม่ขึ้น */
export function fightSupplies(game: Game, life: LifeState): { item: Item; count: number }[] {
  return Object.keys(life.supplies ?? {})
    .map((id) => ({ item: game.items.get(id), count: supplyCount(life, id) }))
    .filter((s): s is { item: Item; count: number } => usableInFight(s.item) && s.count > 0);
}

/**
 * ของที่ศัตรูทิ้งไว้เมื่อชนะ: ไล่ตารางของชนิดนั้นตามลำดับ ชิ้นแรกที่ทอยติดคือชิ้นที่ได้
 * ของสวมใส่ที่มีอยู่แล้วและของใช้แล้วหมดที่พกเต็มแล้วถูกข้าม ตารางว่างไม่ทอยเลย (ลำดับสุ่มของชีวิตจึงไม่ขยับ)
 */
export function rollLoot(game: Game, life: LifeState, foe: FoeDef, rng: Rng): { item?: string; gold?: number; text?: string }[] {
  const out: { item?: string; gold?: number; text?: string }[] = [];
  for (const row of foe.loot) {
    if (out.length >= GEAR.lootMax) break;
    if (rng.next() >= row.chance) continue;
    if (row.item) {
      const item = game.items.get(row.item);
      if (!item) continue;
      if (isSupply(item) ? supplyCount(life, item.id) >= GEAR.stack : life.inventory.includes(item.id)) continue;
    }
    out.push({ ...(row.item ? { item: row.item } : {}), ...(row.gold ? { gold: row.gold } : {}), ...(row.text ? { text: row.text } : {}) });
  }
  return out;
}

// ---------- ร้านค้า ----------

/** ร้านในถิ่นที่ตัวละครอยู่ตอนนี้ เด็กก่อนอายุ GEAR.shopAge ยังไม่เดินเข้าร้านเอง */
export function shopsHere(game: Game, life: LifeState): Shop[] {
  if (!life.alive || life.age < GEAR.shopAge) return [];
  return game.shops.filter((s) => s.location === life.locationTag);
}

/** ร้านนี้ขายให้ตัวละครไหม (ร้านของเอลฟ์ไม่ขายให้ทุกคน) ปีที่เมืองที่อยู่จลาจล ร้านปิดทั้งเมือง */
export const shopOpen = (game: Game, life: LifeState, shop: Shop): boolean => !shopsShut(life) && requiresMet(game, life, shop.requires);

/** ประโยคที่บอกว่าทำไมร้านนี้ไม่ขายให้: เมืองจลาจล (content/lines.yaml: shop_riot) หรือประโยคของร้านเอง */
export const shopClosedLine = (game: Game, life: LifeState, shop: Shop): string => (shopsShut(life) ? (game.lines.shop_riot?.[0] ?? '') : (shop.closed ?? ''));

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
const yearRng = (life: LifeState, shop: Shop) => new Rng((hash(shop.id) ^ Math.imul(life.seed + 1, 40503) ^ Math.imul(worldYear(life), 2654435761)) >>> 0);

/** ของบนแผงปีนี้: ของประจำร้านทุกชิ้น กับของหมุนเวียน GEAR.shelf ชิ้น สุ่มใหม่ทุกปี (ปีเดียวกันได้แผงเดิมเสมอ) */
export function shelfOf(game: Game, life: LifeState, shop: Shop): Item[] {
  const rng = yearRng(life, shop);
  const pool = [...shop.stock];
  const picked: string[] = [];
  while (pool.length && picked.length < GEAR.shelf) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  const order = new Map(shop.stock.map((id, i) => [id, i]));
  picked.sort((a, b) => order.get(a)! - order.get(b)!);
  return [...shop.staples, ...picked].map((id) => game.items.get(id)).filter((i): i is Item => !!i && i.price !== undefined);
}

/** คำทักของคนขายปีนี้ */
export function greetOf(life: LifeState, shop: Shop): string {
  const rng = yearRng(life, shop);
  return shop.greet[rng.int(0, shop.greet.length - 1)]!;
}

/** เหตุที่ยังซื้อไม่ได้: ร้านไม่ขายให้ มีอยู่แล้ว พกเต็ม คนขายยังไม่ขายชิ้นนี้ให้ หรือเงินไม่พอ */
export type BuyBlock = 'closed' | 'owned' | 'full' | 'needs' | 'gold';

export function buyBlock(game: Game, life: LifeState, shop: Shop, item: Item): BuyBlock | null {
  if (!shopOpen(game, life, shop)) return 'closed';
  if (isSupply(item)) {
    if (supplyCount(life, item.id) >= GEAR.stack) return 'full';
  } else if (life.inventory.includes(item.id)) return 'owned';
  if (!requiresMet(game, life, item.needs)) return 'needs';
  if (life.gold < (item.price ?? Infinity)) return 'gold';
  return null;
}

/** ซื้อของจากแผงของร้านในถิ่นนี้ จ่ายราคา รับของ และจ่ายสิ่งที่ต้องแลกนอกจากเงิน (toll) ซื้อไม่ได้ = คืนชีวิตเดิม */
export function buy(game: Game, life: LifeState, shopId: string, itemId: string): LifeState {
  const shop = shopsHere(game, life).find((s) => s.id === shopId);
  const item = shop ? shelfOf(game, life, shop).find((i) => i.id === itemId) : undefined;
  if (!shop || !item || life.encounter || life.dying || buyBlock(game, life, shop, item)) return life;
  const paid = addItem(game, { ...life, gold: life.gold - item.price! }, item.id);
  return applyEffects(game, paid, item.toll);
}

/** ขายของให้ร้านในถิ่นนี้ ของที่สวมอยู่ถูกถอดก่อน ขายไม่ได้ = คืนชีวิตเดิม (ไม่มีร้าน ของไม่มีราคา หรือถอดแล้วร่างกายอยู่ไม่ได้) */
export function sell(game: Game, life: LifeState, itemId: string): LifeState {
  const item = game.items.get(itemId);
  const price = item ? sellPrice(item) : null;
  if (!item || price === null || life.encounter || life.dying || !shopsHere(game, life).some((s) => shopOpen(game, life, s))) return life;
  if (isSupply(item)) return supplyCount(life, itemId) > 0 ? { ...spendSupply(life, itemId), gold: life.gold + price } : life;
  if (!life.inventory.includes(itemId)) return life;
  const off = unequip(life, itemId, game.items);
  if (Object.values(off.equipped).includes(itemId)) return life;
  return { ...off, inventory: off.inventory.filter((i) => i !== itemId), gold: off.gold + price };
}

// ---------- ราคาของวัสดุ ตอนสิ้นปี ----------

export interface WearYear {
  life: LifeState;
  /** กุญแจของประโยคที่ระบบเติมท้ายบันทึกของปี (content/lines.yaml) */
  lines: string[];
  /** สิ่งติดตัวที่ได้หรือที่ลุกลามในปีนี้เพราะของที่สวม */
  traits: string[];
}

/**
 * ของที่สวมข้ามปีเก็บราคาของวัสดุ: เงินดาวทิ้งรอยดาว (ครบ GEAR.starSilver.first ปี แล้วลุกลามทุก every ปี ทีฟลิ่งและคนมีตราร้อนไม่ติด)
 * หินถ่านมารทำให้จอมมารรู้ตัว (คะแนนโลก) และศาสนจักรตะเกียงจับตา (ชื่อเสียงลดทุก GEAR.demonCoal.church ปี)
 */
export function wearYear(game: Game, life: LifeState): WearYear {
  const worn = { ...(life.worn ?? {}) };
  const mats = new Set(equippedItems(life, game.items).map((i) => i.material).filter((m): m is MaterialId => !!m));
  for (const m of mats) worn[m] = (worn[m] ?? 0) + 1;
  let next: LifeState = mats.size ? { ...life, worn } : life;
  const lines: string[] = [], traits: string[] = [];

  if (mats.has('star_silver') && !next.traits.includes(DEMON_MARK_TRAIT) && game.traits.has(STAR_MARKS_TRAIT)) {
    const years = worn.star_silver!, { first, every } = GEAR.starSilver;
    if (!next.traits.includes(STAR_MARKS_TRAIT)) {
      if (years >= first) {
        next = applyEffects(game, next, { traits: [STAR_MARKS_TRAIT] });
        if (next.traits.includes(STAR_MARKS_TRAIT)) { lines.push('gear_star_first'); traits.push(STAR_MARKS_TRAIT); }
      }
    } else if (years > first && (years - first) % every === 0) {
      const before = next.traitSteps?.[STAR_MARKS_TRAIT] ?? 1;
      next = applyEffects(game, next, { trait_step: { [STAR_MARKS_TRAIT]: 1 } });
      if ((next.traitSteps?.[STAR_MARKS_TRAIT] ?? 1) > before) { lines.push('gear_star_deeper'); traits.push(STAR_MARKS_TRAIT); }
    }
  }
  if (mats.has('demon_coal')) {
    const world = { ...next.world, demon: Math.min(WORLD_CAP, next.world.demon + GEAR.demonCoal.demon) };
    next = { ...next, world };
    if (worn.demon_coal! % GEAR.demonCoal.church === 0) {
      const rep = Math.max(-REPUTATION_CAP, (next.reputation.lamp_church ?? 0) - 1);
      next = { ...next, reputation: { ...next.reputation, lamp_church: rep } };
      lines.push('gear_coal_church');
    }
  }
  return { life: next, lines, traits };
}

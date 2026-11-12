/**
 * ตรวจ logic ของเกมด้วยการเล่นชีวิตสุ่มจำนวนมาก แล้วสรุปเป็นตัวเลข
 * ใช้ได้ทั้งจากคำสั่ง (scripts/audit-lives.ts) และจากเทสต์ (tests/slow/audit.test.ts)
 * ทุกอย่างคำนวณจาก seed จึงได้ผลเดิมทุกครั้ง
 */
import { choiceAvailable, eligible, fightResting, markLevel, pickEvent, playable, resolveChoice, spanOf, traitBlock, turnsLeft, type Game } from '../src/engine/engine';
import { humanAge, newLife, stageAge, worldYear, type LifeState } from '../src/engine/state';
import { personHumanAge } from '../src/engine/people';
import { Rng } from '../src/engine/rng';
import { STATS } from '../src/engine/schema';
import { equip, maxHp } from '../src/engine/items';
import { ARC, ARC_IDS, ARC_TH, CITIES, CITY, CITY_IDS, CITY_MOOD_TH, CITY_RANKS, COURSES, COURSE_IDS, ERAS, HOME_KINDS, HOME_TH, MARKS, MARK_IDS, MARK_MAX, ORG, ORG_IDS, ORG_RANKS, ORGS, PROTECTED_AGE, RACES, RARITIES, RARITY_TH, REALM_KEYS, REPEAT_GAP, STAR_SIDE_TRAITS, STAT_CAP, TABOOS, TABOO_IDS, WORLD_CAP, WORLD_KEYS, type CityId, type CityMood, type CourseId, type HomeKind, type MarkId, type OrgId, type RaceId, type Rarity } from '../src/engine/balance';
import { openArcs } from '../src/engine/arcs';
import { defiesTaboo, keepsTaboo } from '../src/engine/land';
import { dutiesDue, dutyResting } from '../src/engine/orgs';
import { cityOf, moodOf } from '../src/engine/cities';
import { foeOf, hitDamage, moveOdds, openMoves, resolveMove, techniqueOf } from '../src/engine/encounter';
import { buy, buyBlock, fightSupplies, isSupply, itemBudget, sell, sellPrice, shelfOf, shopOpen, shopsHere, supplyCount, useSupply } from '../src/engine/gear';
import type { Effects, EncounterEnd, GameEvent, Item } from '../src/engine/schema';

const PARTNER = /\{partner\}|\{p:/;
const bump = <K,>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const pct = (n: number, of: number) => `${((100 * n) / Math.max(1, of)).toFixed(1)}%`;
/** ค่าที่ตำแหน่ง q (0 ถึง 1) ของรายการที่เรียงแล้ว */
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))]! : 0;
};

/** ผลของการปะทะที่นับรวม: จำนวนครั้ง วิธีที่จบ จำนวนจังหวะ จังหวะที่สำเร็จ พลังชีวิตที่เสีย และแผลที่ได้ */
export interface FightTally {
  n: number;
  ends: Partial<Record<EncounterEnd, number>>;
  beats: number;
  hits: number;
  hpLost: number;
  /** ผลรวมพลังชีวิตตอนเริ่มการปะทะ (ใช้หาค่าเฉลี่ย) */
  hpStart: number;
  wounds: number;
}
const newTally = (): FightTally => ({ n: 0, ends: {}, beats: 0, hits: 0, hpLost: 0, hpStart: 0, wounds: 0 });

/** ชีวิตหนึ่งกับเมืองและหลักสูตร: สิ่งที่สถานะตอนจบชีวิตไม่ได้เก็บไว้ (ที่อยู่ที่เคยมี สภาพเมืองที่เคยเจอ ช่วงเรียน) */
export interface TownLife {
  /** ปีที่อยู่ในแต่ละเมือง (นับทุกเหตุการณ์ที่ออกตอนอยู่เมืองนั้น) */
  yearsIn: Partial<Record<CityId, number>>;
  /** ที่อยู่ที่เคยมี */
  homes: Set<HomeKind>;
  /** สภาพเมืองที่ไม่สงบที่เคยอยู่ด้วย (เมืองที่ตัวละครอยู่ตอนนั้น) */
  moods: Set<CityMood>;
  /** ปีที่ร้านของเมืองปิดเพราะจลาจลตอนตัวละครอยู่ */
  shutYears: number;
  course?: {
    id: CourseId;
    enteredAge: number;
    /** เรื่องของหลักสูตรที่ได้ และปีเรียนที่ไม่มีเรื่องของหลักสูตรให้ออก (ต้องเป็นศูนย์) */
    lessons: number;
    empty: number;
    track?: string;
    end: 'graduated' | 'left' | 'died' | 'studying';
    /** ปีในโลกที่ใช้ตั้งแต่เข้าเรียนจนพ้นหลักสูตร */
    span: number;
  };
}

/** ชีวิตหนึ่งกับมาตรสองอัน: ขั้นสูงสุดที่เคยถึง จำนวนครั้งที่ถูกเรียก และสิ่งติดตัวจากฟ้าที่เคยมี (สถานะตอนจบชีวิตไม่ได้เก็บสิ่งที่หายไปแล้ว) */
export interface MarkLife {
  peak: Record<MarkId, number>;
  called: Record<MarkId, number>;
  /** สิ่งติดตัวฝั่งฟ้าที่เคยมี ไม่นับรอยดาวเอง */
  sky: Set<string>;
  /** คะแนนโลกสามฝ่ายตอนชีวิตเดินเข้ายุคดาวเร่ง (ไม่มี = ชีวิตจบก่อนยุค) ใช้หาว่าได้เท่าไรระหว่างยุค */
  entry?: Record<Side, number>;
}
/** สามฝ่ายของโลกที่ชีวิตหนึ่งเข้าข้างได้ */
export const SIDES = ['gods', 'star', 'demon'] as const;
export type Side = (typeof SIDES)[number];
/**
 * ตัวเลือกของการจำลอง: partisan = ผู้เล่นที่เลือกทางของฝ่ายนั้นทุกครั้งที่มีทางให้เลือก (ใช้วัดเป้าคะแนนโลกของชุด 5)
 * seedFrom = เลขชีวิตแรก ชีวิตของผู้เล่นแบบนี้ใช้เลขชุดอื่น จึงไม่ปนกับชีวิตหลักของรายงาน
 */
export interface AuditOpts {
  partisan?: Side;
  seedFrom?: number;
}

/** ชีวิตหนึ่งกับองค์กรหนึ่ง: นับตั้งแต่วันที่เข้า แม้ภายหลังจะออก (สถานะในเกมหายไปตอนออก จึงต้องจดไว้ที่นี่) */
export interface OrgLife {
  /** อายุแบบมนุษย์ตอนเข้า และตอนที่เห็นว่ายังเป็นสมาชิกครั้งสุดท้าย */
  joinedAge: number;
  lastAge: number;
  maxRank: number;
  /** งานที่องค์กรส่งมา (นับทุกเรื่องที่ออก) ที่ทำสำเร็จ และที่ปัด */
  duties: number;
  done: number;
  refused: number;
  left: boolean;
  /** เงินค่าหัวที่ได้จากการปะทะ */
  bounty: number;
  /** ปีที่ถึงกำหนดงานแต่ไม่มีงานให้ส่ง (เนื้อหาไม่พอ) */
  starved: number;
  starvedOld: number;
  /** ลัทธิที่ต้องปิดตัวตน: เคยโดนเปิดโปงระหว่างเป็นสมาชิก */
  exposed: boolean;
}

/**
 * ผู้เล่นจำลองสองแบบ สลับกันตามเลขชีวิต: แบบอ่านเกม (เลือกวิธีที่โอกาสสูงสุด ใช้ท่าของอาชีพเมื่อช่วยได้ ถอยเมื่อพลาดอีกครั้งเดียวจะล้ม)
 * กับแบบสุ่ม (กดวิธีไหนก็ได้) ตัวเลขของสองแบบบอกว่าการอ่านสัญญาณมีผลแค่ไหน และคนที่กดมั่วตายบ่อยแค่ไหน
 */
export type FightStyle = 'reads' | 'random';

function pickMove(game: Game, l: LifeState, ev: GameEvent, r: Rng, style: FightStyle, shopper: boolean): { id: string; armed: boolean; supply?: string } {
  const open = openMoves(game, l, ev);
  const tk = techniqueOf(l, game);
  const canArm = tk.armable && tk.ready;
  // ของใช้แล้วหมด: คนกดสุ่มหยิบของมาถือราวหนึ่งในสามของจังหวะ คนอ่านเกมหยิบเมื่อของนั้นเพิ่มโอกาสได้จริง หรือเมื่อต้องกินยา
  const held = shopper ? fightSupplies(game, l) : [];
  if (style === 'random') {
    const base = { id: open[r.int(0, open.length - 1)]!.id, armed: canArm && r.int(0, 1) === 1 };
    return held.length && r.int(0, 2) === 0 ? { ...base, supply: held[r.int(0, held.length - 1)]!.item.id } : base;
  }
  const foe = foeOf(game, ev)!;
  const dmg = hitDamage(game, l, foe);
  const flee = open.find((m) => m.kind === 'flee');
  if (flee && l.hp <= dmg) return { id: flee.id, armed: canArm && tk.kind !== 'spell' && tk.kind !== 'song' };
  let best: { id: string; armed: boolean; chance: number; supply?: string } = { id: open[0]!.id, armed: false, chance: -1 };
  for (const m of open) {
    if (m.kind === 'flee') continue;
    const plain = moveOdds(game, l, ev, m).chance;
    if (plain > best.chance) best = { id: m.id, armed: false, chance: plain };
    if (!canArm) continue;
    // พรของนักบวชไม่เพิ่มโอกาส ใช้เมื่อพลาดอีกสองครั้งจะล้ม ท่าอื่นใช้เมื่อเพิ่มโอกาสได้จริง
    const armed = tk.kind === 'ward' ? (l.hp <= dmg * 2 ? plain + 0.01 : -1) : moveOdds(game, l, ev, m, true).chance;
    if (armed > best.chance + (tk.kind === 'ward' ? 0 : 0.05)) best = { id: m.id, armed: true, chance: armed };
  }
  // ของที่เพิ่มโอกาสของวิธีไหนก็ตามได้เกินหนึ่งในสิบ คุ้มที่จะใช้ ไม่อย่างนั้นเก็บไว้
  let withSupply = best;
  for (const m of open) {
    if (m.kind === 'flee') continue;
    for (const s of held) {
      const chance = moveOdds(game, l, ev, m, false, s.item.id).chance;
      if (chance > withSupply.chance && chance >= best.chance + 0.1) withSupply = { id: m.id, armed: false, chance, supply: s.item.id };
    }
  }
  if (withSupply.supply) return withSupply;
  // พลาดอีกครั้งเดียวจะล้มและไม่มีทางหนี: กินยาไปพร้อมกับวิธีที่ดีที่สุด
  const heal = l.hp <= dmg ? held.find((s) => s.item.use?.heal) : undefined;
  return heal ? { ...best, supply: heal.item.id } : best;
}

/** สิ่งที่ผู้เล่นจำลองแบบเข้าร้านทำกับของในหนึ่งชีวิต */
export interface GearLife {
  /** ของสวมใส่ที่ซื้อ แยกตามระดับ */
  bought: Record<Rarity, number>;
  /** ของใช้แล้วหมดที่ซื้อ */
  supplies: number;
  /** เงินที่จ่ายร้าน และเงินที่ได้จากการขายของเก่าคืน */
  spent: number;
  sold: number;
  /** ของใช้แล้วหมดที่ใช้ในการปะทะ และยาที่ใช้นอกการปะทะ */
  used: number;
  healed: number;
  /** ของที่ได้จากศัตรู */
  loot: number;
  /** ปีที่ถิ่นที่อยู่มีร้าน และปีที่ร้านนั้นไม่ขายให้ */
  shopYears: number;
  closedYears: number;
  firstBuyAge: number | null;
}
const newGearLife = (): GearLife => ({
  bought: { common: 0, uncommon: 0, rare: 0, enchanted: 0, hero: 0 },
  supplies: 0, spent: 0, sold: 0, used: 0, healed: 0, loot: 0, shopYears: 0, closedYears: 0, firstBuyAge: null,
});

/** สวมของในกระเป๋าที่ดีกว่าของในช่องเดียวกัน (วัดด้วยแต้มงบของของ) */
function wearBest(game: Game, life: LifeState): LifeState {
  let l = life;
  for (const id of l.inventory) {
    const it = game.items.get(id);
    if (!it?.slot || l.equipped[it.slot] === id) continue;
    const cur = game.items.get(l.equipped[it.slot] ?? '');
    if (!cur || itemBudget(it) > itemBudget(cur)) l = equip(l, it, game.items);
  }
  return l;
}

/**
 * ปีละครั้ง ผู้เล่นจำลองแบบเข้าร้านจัดของ: สวมของที่ดีกว่า กินยาเมื่อพลังชีวิตหายไปเท่าที่ยาฟื้นได้ แล้วเดินเข้าร้านของถิ่น
 * ซื้อของสวมใส่ปีละชิ้น เลือกชิ้นที่ดีขึ้นจากของในช่องมากที่สุดต่อเหรียญ ขายของเก่าคืน แล้วเติมยาให้มีติดตัวหนึ่งชิ้น
 * คนที่อ่านเกม (careful) เหลือเงินติดตัวไว้สองเหรียญเสมอ และพกของขว้างอีกหนึ่งอย่าง
 * ทุกอย่างคำนวณจากสถานะของชีวิต ไม่ใช้ตัวสุ่ม ผลจึงเหมือนเดิมทุกครั้ง
 */
function shopYear(game: Game, life: LifeState, g: GearLife, careful: boolean, boughtById: Map<string, number>): LifeState {
  let l = wearBest(game, life);
  for (const id of Object.keys(l.supplies ?? {})) {
    const heal = game.items.get(id)?.use?.heal;
    while (heal && supplyCount(l, id) > 0 && maxHp(l, game.items) - l.hp >= heal) {
      const out = useSupply(game, l, id);
      if (!out) break;
      l = out.life;
      g.healed++;
    }
  }
  const shops = shopsHere(game, l);
  if (!shops.length) return l;
  g.shopYears++;
  const open = shops.filter((s) => shopOpen(game, l, s));
  if (!open.length) g.closedYears++;
  const reserve = careful ? 2 : 0;
  const pay = (shopId: string, it: Item): boolean => {
    const next = buy(game, l, shopId, it.id);
    if (next === l) return false;
    l = next;
    g.spent += it.price!;
    g.firstBuyAge ??= l.age;
    bump(boughtById, it.id);
    return true;
  };
  for (const shop of open) {
    const shelf = shelfOf(game, l, shop);
    const can = (it: Item) => !buyBlock(game, l, shop, it) && l.gold - it.price! >= reserve;
    let best: { item: Item; gain: number } | null = null;
    for (const it of shelf) {
      if (isSupply(it) || !it.slot || !can(it)) continue;
      const cur = game.items.get(l.equipped[it.slot] ?? '');
      const gain = itemBudget(it) - (cur ? itemBudget(cur) : 0);
      if (gain > 0 && (!best || gain / it.price! > best.gain / best.item.price!)) best = { item: it, gain };
    }
    if (best && pay(shop.id, best.item)) {
      g.bought[best.item.rarity]++;
      const old = l.equipped[best.item.slot!];
      l = equip(l, best.item, game.items);
      const oldItem = old && old !== best.item.id ? game.items.get(old) : undefined;
      if (oldItem && l.equipped[best.item.slot!] === best.item.id && sellPrice(oldItem) !== null) {
        const after = sell(game, l, oldItem.id);
        if (after !== l) { g.sold += after.gold - l.gold; l = after; }
      }
    }
    const cheapest = (pick: (it: Item) => boolean) => shelf.filter((it) => isSupply(it) && pick(it) && can(it)).sort((a, b) => a.price! - b.price!)[0];
    const carried = fightSupplies(game, l);
    if (!carried.some((x) => x.item.use?.heal)) {
      const heal = cheapest((it) => !!it.use?.heal);
      if (heal && pay(shop.id, heal)) g.supplies++;
    }
    if (careful && !carried.some((x) => !x.item.use?.heal)) {
      const thrown = cheapest((it) => !it.use?.heal && (it.tags.length > 0 || !!it.use?.boost));
      if (thrown && pay(shop.id, thrown)) g.supplies++;
    }
  }
  return l;
}

export interface AuditResult {
  lives: number;
  events: number;
  /** logic ที่ผิดจริง ต้องว่างเสมอ (ข้อความ → จำนวนครั้ง) */
  problems: Map<string, number>;
  /**
   * เหตุการณ์ must สองเรื่องที่ถึงโอกาสสุดท้ายในปีเดียวกัน ระบบเลือกได้เรื่องเดียว อีกเรื่องหลุด
   * เป็นปัญหาของการวางช่วงเวลาในเนื้อหา ไม่ใช่ของ engine (ข้อความ → จำนวนครั้ง)
   */
  collisions: Map<string, number>;
  /** ชีวิตที่เจอการชนกันข้างบน (เผ่าของชีวิตนั้น เรื่องที่หลุด และเรื่องที่ได้ออกแทน) */
  collisionLives: { seed: number; race: string | null; lost: string; to: string }[];
  /** จำนวนชีวิตที่เคยเข้าเงื่อนไขของ must แต่ละเรื่อง และจำนวนที่ได้เห็น */
  must: Map<string, { could: number; seen: number }>;
  finals: LifeState[];
  seenEvents: Map<string, number>;
  endReasons: Map<string, number>;
  deathBy: Map<string, number>;
  /** เหตุของความตาย (age, wound, fight, sacrifice) → จำนวนชีวิต */
  deathCauses: Map<string, number>;
  /** ฉากตายที่ได้ออก → จำนวนชีวิต */
  deathScenes: Map<string, number>;
  poolByAge: Map<number, number[]>;
  /** เหตุการณ์ที่เกิดซ้ำในชีวิตเดียว (id → จำนวนครั้งที่ซ้ำรวมทุกชีวิต) */
  repeats: Map<string, number>;
  /** ซ้ำภายใน REPEAT_GAP เหตุการณ์ เกิดได้เฉพาะเมื่อไม่มีเรื่องอื่นให้ออก */
  closeRepeats: Map<string, number>;
  counts: Map<string, number>;
  /** สิ่งติดตัวที่ปิดตัวเลือก (id → จำนวนครั้งที่ผู้เล่นเห็นตัวเลือกล็อกเพราะสิ่งนี้) */
  traitLocks: Map<string, number>;
  /** สัดส่วนเหตุการณ์ที่ซ้ำกันของสองชีวิต (0 ถึง 1) */
  overlap: { sameOriginAndClass: number; anyTwo: number; eventsPerLife: number };
  /** การปะทะ: รวมตามศัตรู ตามฉาก ตามแบบของผู้เล่นจำลอง และจำนวนครั้งต่อชีวิต (เรียงตรงกับ finals) */
  fights: {
    byFoe: Map<string, FightTally>;
    byEvent: Map<string, FightTally>;
    /** ตามฉาก เฉพาะผู้เล่นจำลองที่อ่านเกม (ใช้เทียบกับเป้าอัตราตายของคนที่เตรียมตัว) */
    byEventReads: Map<string, FightTally>;
    byStyle: Record<FightStyle, FightTally>;
    /** เฉพาะการปะทะที่เอาถึงตาย */
    deadlyByStyle: Record<FightStyle, FightTally>;
    /** การปะทะที่เอาถึงตายของผู้เล่นจำลองที่อ่านเกม แยกตามว่าชีวิตนั้นเข้าร้านและใช้ของหรือไม่ */
    deadlyReadsByGear: Record<'shop' | 'none', FightTally>;
    perLife: number[];
  };
  /** ของและร้านค้า: ครึ่งหนึ่งของชีวิตเข้าร้าน สวมของ และใช้ของในการปะทะ อีกครึ่งไม่แตะของเลย (เทียบกันได้ว่าของมีผลแค่ไหน) */
  gear: {
    /** เรียงตรงกับ finals: null = ชีวิตที่ไม่แตะของ */
    perLife: (GearLife | null)[];
    boughtById: Map<string, number>;
    lootById: Map<string, number>;
  };
  /**
   * องค์กร: เรียงตรงกับ finals ชีวิตเลขคู่ (ผู้เล่นที่อ่านเกม) รับงานทุกครั้งที่รับได้ ชีวิตเลขคี่กดสุ่ม
   * จึงเทียบได้ว่าคนที่ตั้งใจไต่ยศไปถึงไหน และคนที่ปัดงานบ่อยค้างอยู่ที่ไหน
   */
  orgs: {
    perLife: Partial<Record<OrgId, OrgLife>>[];
    /** ฉากตามล่าที่ออก (ฝ่าย → จำนวนครั้งรวมทุกชีวิต) */
    hunts: Map<string, number>;
  };
  /** เมืองและหลักสูตร: เรียงตรงกับ finals */
  towns: TownLife[];
  /** มาตรรอยดาวกับตราร้อน และสิ่งติดตัวจากฟ้า: เรียงตรงกับ finals */
  marks: MarkLife[];
  /** ชีวิตของผู้เล่นที่เข้าข้างฝ่ายเดียวทุกครั้ง (เล่นแยกจากชีวิตหลัก ดู auditPartisans) */
  partisans?: Partial<Record<Side, { finals: LifeState[]; marks: MarkLife[] }>>;
}

export function auditLives(game: Game, lives: number, opts: AuditOpts = {}): AuditResult {
  const res: AuditResult = {
    lives,
    events: game.events.length,
    problems: new Map(),
    collisions: new Map(),
    collisionLives: [],
    must: new Map(),
    finals: [],
    seenEvents: new Map(),
    endReasons: new Map(),
    deathBy: new Map(),
    deathCauses: new Map(),
    deathScenes: new Map(),
    poolByAge: new Map(),
    repeats: new Map(),
    closeRepeats: new Map(),
    counts: new Map(),
    traitLocks: new Map(),
    overlap: { sameOriginAndClass: 0, anyTwo: 0, eventsPerLife: 0 },
    fights: {
      byFoe: new Map(), byEvent: new Map(), byEventReads: new Map(), byStyle: { reads: newTally(), random: newTally() },
      deadlyByStyle: { reads: newTally(), random: newTally() }, deadlyReadsByGear: { shop: newTally(), none: newTally() }, perLife: [],
    },
    gear: { perLife: [], boughtById: new Map(), lootById: new Map() },
    orgs: { perLife: [], hunts: new Map() },
    towns: [],
    marks: [],
  };
  const { problems, collisions, counts, fights } = res;
  const byId = new Map(game.events.map((e) => [e.id, e]));
  const mustEvents = game.events.filter((e) => e.must);

  const seedFrom = opts.seedFrom ?? 1;
  for (let seed = seedFrom; seed < seedFrom + lives; seed++) {
    let l = newLife(seed);
    const r = new Rng(seed * 7919 + 13);
    const inLife = new Map<string, number>();
    const couldMust = new Set<string>();
    const style: FightStyle = seed % 2 ? 'random' : 'reads';
    // ชีวิตเลข 0 กับ 1 ในทุกสี่ชีวิตเข้าร้านและใช้ของ (อ่านเกมหนึ่ง กดสุ่มหนึ่ง) อีกสองชีวิตไม่แตะของ
    const gearLife = seed % 4 < 2 ? newGearLife() : null;
    let shoppedYear = -Infinity;
    let fought = 0;
    const orgLife: Partial<Record<OrgId, OrgLife>> = {};
    /** จดสมาชิกภาพหลังทุกเหตุการณ์: ยศสูงสุด ผลงาน และการออก */
    const noteOrgs = (now: LifeState) => {
      for (const id of ORG_IDS) {
        const m = now.orgs[id];
        const rec = orgLife[id];
        if (m) {
          const o = rec ?? (orgLife[id] = { joinedAge: humanAge(now), lastAge: humanAge(now), maxRank: m.rank, duties: 0, done: 0, refused: 0, left: false, bounty: 0, starved: 0, starvedOld: 0, exposed: false });
          o.lastAge = humanAge(now);
          o.maxRank = Math.max(o.maxRank, m.rank);
          o.done = m.done;
          o.refused = m.refused;
          o.left = false;
          if (ORGS[id].covert && !m.secret) o.exposed = true;
        } else if (rec) rec.left = true;
      }
    };
    const town: TownLife = { yearsIn: {}, homes: new Set(), moods: new Set(), shutYears: 0 };
    /** จดเมือง ที่อยู่ และช่วงเรียนหลังทุกเหตุการณ์ */
    const noteTown = (was: LifeState, now: LifeState) => {
      const here = cityOf(now);
      if (here) {
        town.yearsIn[here] = (town.yearsIn[here] ?? 0) + Math.max(1, now.age - was.age);
        const mood = moodOf(now, here);
        if (mood !== 'calm') town.moods.add(mood);
        if (mood === 'riot') town.shutYears++;
      }
      if (now.home) town.homes.add(now.home.kind);
      if (now.course && !town.course) town.course = { id: now.course.id, enteredAge: humanAge(was), lessons: 0, empty: 0, end: 'studying', span: 0 };
      const c = town.course;
      if (c && c.end === 'studying') {
        if (now.course?.track) c.track = now.course.track;
        c.span = worldYear(now) - (now.course?.since ?? was.course?.since ?? worldYear(now));
        if (!now.course) c.end = now.flags.includes(COURSES[c.id].done) ? 'graduated' : 'left';
        else if (!now.alive) c.end = 'died';
      }
    };
    const markLife: MarkLife = { peak: { star: 0, brand: 0 }, called: { star: 0, brand: 0 }, sky: new Set() };
    /** จดมาตรสองอันหลังทุกเหตุการณ์ */
    const noteMarks = (was: LifeState, now: LifeState) => {
      for (const id of MARK_IDS) {
        markLife.peak[id] = Math.max(markLife.peak[id], markLevel(now, id));
        if (now.flags.includes(MARKS[id].called) && !was.flags.includes(MARKS[id].called)) markLife.called[id]++;
      }
      for (const t of now.traits) if (t !== MARKS.star.trait && STAR_SIDE_TRAITS.includes(t)) markLife.sky.add(t);
    };
    const quickening = ERAS.find((e) => e.id === 'quickening')!;
    /** must ที่เข้าเงื่อนไขแล้วแต่ยังไม่ได้ออก → เรื่องที่แซงไปตอนมันเหลือโอกาสสุดท้าย (ถ้ามี) */
    const waiting = new Map<string, string | null>();

    for (let step = 0; step < 400 && l.alive; step++) {
      if (gearLife && !l.dying && !l.encounter && worldYear(l) !== shoppedYear) {
        shoppedYear = worldYear(l);
        l = shopYear(game, l, gearLife, style === 'reads', res.gear.boughtById);
      }
      const age = stageAge(l);
      const open = game.events.filter((e) => eligible(game, l, e));
      const pool = open.filter((e) => playable(game, l, e));
      // กองตามวัยนับเฉพาะเหตุการณ์ปกติ: ฉากตายและเหตุการณ์สำรองไม่นับว่าเป็นเรื่องของวัยนั้น
      if (!l.dying) (res.poolByAge.get(age) ?? res.poolByAge.set(age, []).get(age)!).push(pool.filter((e) => !e.fallback).length);
      // เรื่องหลายปีที่ปีนี้เหลือเวลาไม่ถึง min_years ไม่ออกโดยตั้งใจ ไม่นับเป็นปัญหา
      const tooShort = (e: (typeof open)[number]) => !!e.min_years && spanOf(game, l, e) < e.min_years;
      // ฉากชวนที่ชีวิตนี้รับไม่ได้สักทาง (เหลือแต่ทางเดินผ่าน) ไม่ออกโดยตั้งใจเช่นกัน
      const passOnly = (e: (typeof open)[number]) => e.choices.some((c) => c.pass && choiceAvailable(game, l, c, e));
      for (const e of open) if (!pool.includes(e) && !tooShort(e) && !passOnly(e)) bump(problems, `${e.id}: เข้าเงื่อนไขแต่ไม่มีตัวเลือกให้กด`);

      // ---- must ที่รออยู่จากปีก่อน: ถ้าช่วงเวลาปิดไปแล้วโดยยังไม่ได้เห็น คือหลุด ----
      for (const [id, lostTo] of waiting) {
        const ev = byId.get(id)!;
        if (l.seen.includes(id)) waiting.delete(id);
        else if (turnsLeft(l, ev) < 0) {
          if (lostTo) {
            bump(collisions, `${id} ชนกับ ${lostTo} ในปีสุดท้ายของทั้งคู่`);
            res.collisionLives.push({ seed, race: l.raceApplied, lost: id, to: lostTo });
          } else bump(problems, `${id}: เหตุการณ์ must หลุดทั้งที่เคยเข้าเงื่อนไข`);
          waiting.delete(id);
        } else if (!playable(game, l, ev)) waiting.delete(id); // เงื่อนไขอื่นเปลี่ยน (flag อาชีพ ถิ่น) ไม่นับว่าหลุด
      }

      const picked = pickEvent(game, l);
      if (!picked.event) {
        l = { ...l, alive: false, endReason: 'content_end' };
        break;
      }
      const ev = picked.event;
      const mustNow = mustEvents.filter((e) => pool.includes(e));
      for (const e of mustNow) couldMust.add(e.id);
      if (mustNow.length && !ev.must) bump(problems, `${ev.id}: ถูกหยิบทั้งที่มี must รออยู่ (${mustNow.map((e) => e.id).join(', ')})`);
      for (const e of mustNow) {
        if (e === ev) waiting.delete(e.id);
        else if (!waiting.get(e.id)) waiting.set(e.id, turnsLeft(l, e) <= 0 ? ev.id : null);
      }
      if (!pool.includes(ev)) bump(problems, `${ev.id}: ถูกหยิบทั้งที่ไม่เข้าเงื่อนไขหรือไม่มีตัวเลือก`);
      if (!ev.once && l.log.slice(-REPEAT_GAP).some((x) => x.eventId === ev.id)) {
        bump(res.closeRepeats, ev.id);
        const others = pool.filter((e) => e.once || !l.log.slice(-REPEAT_GAP).some((x) => x.eventId === e.id));
        if (others.length) bump(problems, `${ev.id}: ออกซ้ำภายใน ${REPEAT_GAP} เหตุการณ์ทั้งที่มีเรื่องอื่นให้ออก`);
      }
      // จังหวะของงานองค์กร: งานไม่ออกติดกัน และงานที่ถึงกำหนดต้องออกก่อนเรื่องสุ่ม
      if (!l.dying) {
        const fresh = (e: GameEvent) => !e.fallback && (e.once || !l.log.slice(-REPEAT_GAP).some((x) => x.eventId === e.id)) && !fightResting(l, e) && !dutyResting(l, e, game.duties);
        if (dutyResting(l, ev, game.duties)) {
          if (pool.some(fresh)) bump(problems, `${ev.id}: งานขององค์กรออกติดกันทั้งที่มีเรื่องอื่นให้ออก`);
          bump(res.counts, 'งานขององค์กรที่ออกติดกัน');
        }
        const due = dutiesDue(l, game.duties);
        // วัยชรา (65 ขึ้นไป) ยังไม่มีงานขององค์กร นับแยกไว้ให้เห็นช่องว่าง ไม่ปนกับปีที่ควรมีงาน
        // สาวกที่โดนเปิดโปงแล้วไม่ได้งานอีก (กองตัดขาด) จึงไม่นับเป็นช่องว่างของเนื้อหา
        const cutOff = (id: OrgId) => !!ORGS[id].covert && !l.orgs[id]?.secret;
        for (const id of due) if (!cutOff(id) && !pool.some((e) => e.duty === id) && orgLife[id]) orgLife[id]![humanAge(l) < 65 ? 'starved' : 'starvedOld']++;
        const owed = pool.filter((e) => e.duty && due.includes(e.duty) && fresh(e));
        // นักเรียนได้เรื่องของหลักสูตรก่อนงานขององค์กร
        if (owed.length && !ev.must && !ev.course && !owed.includes(ev)) bump(problems, `${ev.id}: ถูกหยิบทั้งที่งานขององค์กรถึงกำหนด (${owed[0]!.id})`);
        // หลักสูตร: ระหว่างเรียนต้องได้เรื่องของหลักสูตรทุกปี (เว้นปีที่เหตุการณ์ must ของโลกออก)
        if (l.course && town.course) {
          if (ev.course) town.course.lessons++;
          else if (!ev.must) {
            town.course.empty++;
            bump(problems, `หลักสูตร ${l.course.id} ปี ${l.course.year}${l.course.track ? ` สาย ${l.course.track}` : ''}: ไม่มีเรื่องของหลักสูตรให้ออก (${ev.id} ออกแทน)`);
          }
          const lessons = pool.filter((e) => e.course);
          if (lessons.length && !ev.must && !ev.course) bump(problems, `${ev.id}: ถูกหยิบทั้งที่มีเรื่องของหลักสูตรรออยู่ (${lessons[0]!.id})`);
        }
      }
      if (ev.duty && orgLife[ev.duty]) orgLife[ev.duty]!.duties++;
      if (ev.hunt) bump(res.orgs.hunts, ev.hunt);
      // จังหวะของการปะทะ: ฉากปะทะที่ยังพักอยู่ออกได้เฉพาะเมื่อไม่มีเรื่องอื่นที่สดให้ออก
      if (fightResting(l, ev)) {
        const fresh = pool.filter((e) => !fightResting(l, e) && (e.once || !l.log.slice(-REPEAT_GAP).some((x) => x.eventId === e.id)));
        if (fresh.length) bump(problems, `${ev.id}: การปะทะออกทั้งที่ยังอยู่ในช่วงพักและมีเรื่องอื่นให้ออก`);
        bump(res.counts, 'การปะทะที่ออกทั้งที่ยังพัก');
      }

      l = picked.life;
      bump(res.seenEvents, ev.id);
      bump(inLife, ev.id);

      // ---- ตรวจข้อความกับสถานะ ----
      if (PARTNER.test(ev.text) && !l.partner) bump(problems, `${ev.id}: พูดถึงคนรักที่ไม่มี`);
      const partnerPerson = l.people.find((p) => p.id === 'partner');
      if (PARTNER.test(ev.text) && partnerPerson && !partnerPerson.alive && !(ev.when.flags ?? []).includes('partner_died')) {
        bump(problems, `${ev.id}: พูดถึงคนรักที่ตายแล้ว (ไม่ได้กรอง partner_died)`);
      }
      for (const who of ['father', 'mother'] as const) {
        const p = l.people.find((x) => x.id === who);
        if (ev.text.includes(`{${who}}`) && !l.parents) bump(problems, `${ev.id}: ใช้ {${who}} ตอนไม่มีพ่อแม่ที่รู้จัก`);
        if (ev.text.includes(`{${who}}`) && p && !p.alive && !(ev.when.flags ?? []).includes(`${who}_died`)) bump(problems, `${ev.id}: ใช้ {${who}} หลังคนนั้นตายแล้ว`);
      }
      if (/\{child\}|\{c:/.test(ev.text) && !l.people.some((p) => p.kin === 'child' && p.alive)) bump(problems, `${ev.id}: พูดถึงลูกที่ไม่มีหรือไม่อยู่แล้ว`);
      // ตัวแสดง: ทุกบทที่ข้อความใช้ต้องมีคนเล่น และเป็นคนที่ยังอยู่ (เว้นบทที่ตั้งใจให้เป็นคนตาย)
      for (const [role, spec] of Object.entries(ev.cast ?? {})) {
        const who = l.people.find((p) => p.id === l.cast[role]);
        if (!who && !spec.optional) bump(problems, `${ev.id}: บท ${role} ไม่มีคนเล่น`);
        if (who && who.alive !== spec.alive) bump(problems, `${ev.id}: บท ${role} ได้คนที่${who.alive ? 'ยังอยู่' : 'ตายแล้ว'}ผิดจากที่ต้องการ`);
      }
      if (ev.stage === 'death') bump(res.deathScenes, ev.id);

      const before = l;
      if (!markLife.entry && worldYear(l) >= quickening.from) markLife.entry = { gods: l.world.gods, star: l.world.star, demon: l.world.demon };
      /** ชื่อของสิ่งที่เพิ่งเลือก ใช้ในรายงาน และผลที่เพิ่งใช้ */
      let did: string;
      let fxs: (Effects | undefined)[];
      if (ev.encounter) {
        const foe = foeOf(game, ev);
        if (!foe || !l.encounter) {
          bump(problems, `${ev.id}: การปะทะเริ่มไม่ได้ (ไม่มีศัตรูหรือไม่มีสถานะการปะทะ)`);
          break;
        }
        let end: EncounterEnd | null = null;
        let hits = 0;
        let beats = 0;
        for (let b = 0; b < 8 && !end; b++) {
          if (!openMoves(game, l, ev).length) {
            bump(problems, `${ev.id}: จังหวะ ${b + 1} ไม่มีวิธีให้เลือก (ทางตัน)`);
            break;
          }
          const pick = pickMove(game, l, ev, r, style, !!gearLife);
          const shown = moveOdds(game, l, ev, openMoves(game, l, ev).find((m) => m.id === pick.id)!, pick.armed, pick.supply);
          const out = resolveMove(game, l, pick.id, pick.armed, pick.supply);
          if (out.record.supply && gearLife) gearLife.used++;
          if (out.record.mod !== shown.mod || out.record.dc !== shown.dc) bump(problems, `${ev.id}/${pick.id}: แต้มที่ทอยจริงไม่ตรงกับที่แสดงบนปุ่ม`);
          beats++;
          if (out.record.success) hits++;
          l = out.life;
          if (out.done) end = out.entry!.encounter!.end;
        }
        if (!end) break;
        fought++;
        const lost = l.log.at(-1)!.encounter!.records.reduce((n, rec) => n + (rec.damage ?? 0), 0);
        const wounds = l.traits.filter((t) => !before.traits.includes(t) && foe.def.wounds.includes(t)).length;
        const tallies = [
          fights.byFoe.get(foe.def.id) ?? fights.byFoe.set(foe.def.id, newTally()).get(foe.def.id)!,
          fights.byEvent.get(ev.id) ?? fights.byEvent.set(ev.id, newTally()).get(ev.id)!,
          fights.byStyle[style],
          ...(style === 'reads' ? [fights.byEventReads.get(ev.id) ?? fights.byEventReads.set(ev.id, newTally()).get(ev.id)!] : []),
          ...(foe.deadly ? [fights.deadlyByStyle[style]] : []),
          ...(foe.deadly && style === 'reads' ? [fights.deadlyReadsByGear[gearLife ? 'shop' : 'none']] : []),
        ];
        const loot = l.log.at(-1)!.encounter!.loot;
        if (loot?.item) {
          bump(res.gear.lootById, loot.item);
          if (gearLife) gearLife.loot++;
        }
        for (const t of tallies) {
          t.n++;
          t.ends[end] = (t.ends[end] ?? 0) + 1;
          t.beats += beats;
          t.hits += hits;
          t.hpLost += lost;
          t.hpStart += before.hp;
          t.wounds += wounds;
        }
        if (l.encounter) bump(problems, `${ev.id}: การปะทะจบแล้วแต่สถานะการปะทะยังค้าง`);
        if (end === 'death' && !foe.deadly) bump(problems, `${ev.id}: ตายในการปะทะที่ไม่เอาถึงตาย`);
        if (end === 'death' && before.age < PROTECTED_AGE) bump(problems, `${ev.id}: ตายในการปะทะก่อนวัย ${PROTECTED_AGE}`);
        if (end !== 'death' && !l.dying && l.alive && l.hp < 1) bump(problems, `${ev.id}: จบการปะทะแบบ ${end} ด้วยพลังชีวิตต่ำกว่า 1`);
        bump(counts, 'เหตุการณ์ทั้งหมด');
        did = `${ev.id}/${end}`;
        fxs = end === 'death' ? [{ die: true }] : [ev.encounter[end]?.effects];
      } else {
        const choices = ev.choices.filter((c) => choiceAvailable(game, l, c, ev));
        for (const c of ev.choices) for (const t of traitBlock(game, l, c, ev)) bump(res.traitLocks, t);
        if (!choices.length) {
          bump(problems, `${ev.id}: ไม่มีตัวเลือกให้กด (ทางตัน)`);
          break;
        }
        if (choices.length === 1 && ev.choices.length > 1) bump(counts, 'เหตุการณ์ที่เหลือตัวเลือกเดียว');
        bump(counts, 'เหตุการณ์ทั้งหมด');

        // ผู้เล่นที่อ่านเกมรับงานขององค์กรทุกครั้งที่รับได้ และในเมืองเลือกทางที่คนในย่านจำได้ (ทางที่ให้ผลงานของเมือง) เมื่อมี ผู้เล่นที่กดสุ่มปัดบ้างรับบ้าง
        // และถือข้อห้ามของแผ่นดินทุกครั้งที่มีทางให้ถือ (ผู้เล่นที่ตั้งใจเป็นคนถือข้อห้าม) ผู้เล่นที่กดสุ่มถือบ้างฝืนบ้าง
        const civic = (x: (typeof choices)[number]) => [x.effects, x.success?.effects].some((fx) => (fx?.city?.merit ?? 0) > 0);
        const devout = (x: (typeof choices)[number]) => [x.effects, x.success?.effects].some((fx) => Object.values(fx?.taboo ?? {}).some((a) => a === 'keep' || a === 'mend'));
        const held = style === 'reads' ? choices.filter(devout) : [];
        // วันครบสัญญา: ผู้เล่นที่อ่านเกมและรับงานทุกครั้งคือคนที่ตั้งใจอยู่ในสายงาน จึงต่อสัญญา
        const renew = choices.filter((x) => [x.effects, x.success?.effects].some((fx) => fx?.org?.term));
        const taking = style !== 'reads' ? [] : ev.duty ? choices.filter((x) => !x.refuse) : renew.length ? renew : held.length ? held : cityOf(l) ? choices.filter(civic) : [];
        // ผู้เล่นที่เข้าข้างฝ่ายเดียว: มีทางของฝ่ายนั้นเมื่อไรเลือกทางนั้น
        const sided = opts.partisan ? choices.filter((x) => [x.effects, x.success?.effects].some((fx) => (fx?.world?.[opts.partisan!] ?? 0) > 0)) : [];
        const from = sided.length ? sided : taking.length ? taking : choices;
        const c = from[r.int(0, from.length - 1)]!;
        l = resolveChoice(game, l, ev.id, c.id).life;
        did = `${ev.id}/${c.id}`;
        fxs = [c.effects, c.success?.effects, c.failure?.effects];
      }

      noteOrgs(l);
      noteTown(before, l);
      noteMarks(before, l);
      const paid = l.log.at(-1)?.encounter?.bounty;
      if (paid) for (const id of ORG_IDS) if (ORGS[id].bounty && orgLife[id]) orgLife[id]!.bounty += paid;

      // ---- ตรวจผลของตัวเลือก ----
      for (const fx of fxs) {
        for (const pe of fx?.people ?? []) {
          const was = before.people.find((p) => p.id === pe.id);
          if (was && !was.alive && (pe.closeness || pe.dies)) bump(problems, `${did}: ปรับความสนิทหรือสั่งตายกับ "${pe.id}" ที่ตายไปแล้ว`);
        }
      }
      // ตัวเลือกที่ทำให้ล้มลง (เริ่มตาย) ชีวิตจบจริงหลังฉากตาย
      const cause = l.dying ?? l.deathCause;
      if (!before.dying && cause && (l.dying || !l.alive)) {
        bump(res.deathBy, cause === 'age' ? 'ฤดูหนาว (สิ้นอายุขัย)' : did);
        bump(res.deathCauses, cause);
        if (cause !== 'age' && l.hp > 0 && !fxs.some((fx) => fx?.die)) bump(problems, `${did}: ตายทั้งที่ HP เหลือและไม่มี die`);
      }
      if (!l.alive && l.endReason === 'death' && !l.deathCause) bump(problems, `${did}: ตายโดยไม่มีเหตุของความตาย`);
      if (l.alive && maxHp(l, game.items) < 1 && !l.dying) bump(problems, `${did}: พลังชีวิตสูงสุดหมดแต่ยังไม่ตาย`);
      if (l.age < before.age) bump(problems, `${did}: อายุถอยหลัง`);
      if (openArcs(l, game.arcLast).length > ARC.maxOpen) bump(problems, `${did}: เส้นเรื่องยาวเปิดค้างเกิน ${ARC.maxOpen} เส้น`);
      for (const p of l.people) {
        if (p.alive && personHumanAge(p, l) > 125) bump(problems, `${p.id}: คนรอบตัวอายุเกิน 125 ปีแบบมนุษย์แล้วยังอยู่ (${p.kin ?? p.bond ?? 'คนรู้จัก'})`);
        if (p.born !== undefined && p.born > worldYear(l)) bump(problems, `${p.id}: เกิดหลังปีปัจจุบัน`);
      }
      if (l.hp > Math.max(0, maxHp(l, game.items))) bump(problems, `HP เกินค่าสูงสุดหลัง ${did}`);
      for (const s of STATS) if (l.stats[s] < 1) bump(problems, `${s} ต่ำกว่า 1 หลัง ${did}`);
      if (l.gold < 0 && before.gold >= 0 && !fxs.some((fx) => fx?.debt)) {
        bump(problems, `${did}: เงินติดลบโดยไม่ใช่หนี้`);
      }
      if (l.flags.includes('married') && !l.partner) bump(problems, `${did}: แต่งงานแล้วแต่ไม่มีคู่`);
      if (l.flags.includes('has_child') && !l.flags.includes('married') && !l.flags.includes('partner_died') && !before.flags.includes('has_child')) {
        bump(counts, 'มีลูกโดยไม่ได้แต่งงาน');
      }
    }

    for (const id of couldMust) {
      const m = res.must.get(id) ?? res.must.set(id, { could: 0, seen: 0 }).get(id)!;
      m.could++;
      if (l.seen.includes(id)) m.seen++;
    }
    for (const [id, n] of inLife) if (n > 1) bump(res.repeats, id, n - 1);
    // ---- ตรวจชีวิตทั้งชีวิต ----
    // ประโยคของระบบ (ร่างกายโรย ฤดูหนาว) ห้ามออกซ้ำในชีวิตเดียว ข่าวคนจากไปซ้ำได้เมื่อประโยคหมด จึงไม่นับ
    const said = new Set<string>();
    for (const e of l.log) {
      const news = e.year?.passed?.length ?? 0;
      const own = (e.year?.lines ?? []).slice(0, (e.year?.lines?.length ?? 0) - news);
      for (const t of own) {
        if (said.has(t)) bump(problems, `ประโยคของระบบออกซ้ำในชีวิตเดียว: ${t.replaceAll(l.name, '{name}')}`);
        said.add(t);
      }
    }
    if (l.endReason === 'death') {
      if (!l.epitaph) bump(problems, `ตายโดยไม่มีคำจารึก (ฉากตาย ${l.log.at(-1)?.eventId})`);
      if (!l.log.at(-1)?.mark) bump(problems, `ตายโดยไม่มีป้ายสุดท้ายบนเส้นชีวิต (ฉากตาย ${l.log.at(-1)?.eventId})`);
    }
    bump(res.endReasons, l.endReason ?? 'cap');
    res.finals.push(l);
    res.gear.perLife.push(gearLife);
    res.orgs.perLife.push(orgLife);
    res.towns.push(town);
    res.marks.push(markLife);
    fights.perLife.push(fought);
  }

  res.overlap = measureOverlap(res.finals);
  return res;
}

/** เล่นชีวิตของผู้เล่นที่เข้าข้างฝ่ายเดียวทุกครั้ง ฝ่ายละ n ชีวิต ด้วยเลขชีวิตชุดอื่น แล้วแนบผลไว้กับรายงานหลัก */
export function auditPartisans(game: Game, res: AuditResult, n: number): void {
  res.partisans = {};
  SIDES.forEach((side, i) => {
    const run = auditLives(game, n, { partisan: side, seedFrom: 500_001 + i * 10_000 });
    res.partisans![side] = { finals: run.finals, marks: run.marks };
    for (const [k, v] of run.problems) bump(res.problems, `[ผู้เล่นฝ่าย ${side}] ${k}`, v);
  });
}

/** สองชีวิตเจอเหตุการณ์ซ้ำกันกี่ส่วน (นับเฉพาะชีวิตที่ถึงอายุ 40 เทียบกับชีวิตที่สั้นกว่าในคู่) */
function measureOverlap(finals: LifeState[]): AuditResult['overlap'] {
  const groups = new Map<string, Set<string>[]>();
  const all: Set<string>[] = [];
  for (const l of finals) {
    if (humanAge(l) < 40) continue;
    const key = `${l.flags.find((f) => f.startsWith('origin_')) ?? '?'}|${l.classId ?? 'none'}`;
    const s = new Set(l.seen);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    all.push(s);
  }
  const share = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return n / Math.max(1, Math.min(a.size, b.size));
  };
  let sum = 0;
  let n = 0;
  for (const ls of groups.values()) {
    const top = Math.min(ls.length, 30);
    for (let i = 0; i < top; i++) for (let j = i + 1; j < top; j++, n++) sum += share(ls[i]!, ls[j]!);
  }
  const same = n ? sum / n : 0;
  sum = 0;
  n = 0;
  const top = Math.min(all.length, 300);
  for (let i = 0; i < top; i++) for (let j = i + 1; j < top; j += 7, n++) sum += share(all[i]!, all[j]!);
  return {
    sameOriginAndClass: same,
    anyTwo: n ? sum / n : 0,
    eventsPerLife: all.length ? all.reduce((a, s) => a + s.size, 0) / all.length : 0,
  };
}

const full40 = (finals: LifeState[]) => finals.filter((l) => humanAge(l) >= 40);

/** สิ่งติดตัวที่เนื้อหาตอนนี้ให้ได้จริง: จากผลของเหตุการณ์หรือตัวเลือก จากนิสัย หรือติดมากับเผ่า */
export function traitSources(game: Game): Set<string> {
  const ids = new Set<string>(Object.values(RACES).flatMap((r) => ('traits' in r ? r.traits : [])));
  const take = (fx: { traits?: string[] } | undefined) => fx?.traits?.forEach((t) => ids.add(t));
  for (const ev of game.events) {
    for (const c of ev.choices) {
      take(c.effects);
      take(c.success?.effects);
      take(c.failure?.effects);
      if (c.habit) ids.add(c.habit);
    }
    // การปะทะ: ผลของทางจบ และแผลของศัตรูชนิดนั้น
    const enc = ev.encounter;
    if (enc) {
      for (const out of [enc.win, enc.lose, enc.stalemate, enc.flee, enc.parley]) take(out?.effects);
      game.foes.get(enc.foe)?.wounds.forEach((w) => ids.add(w));
    }
  }
  return ids;
}

export function formatReport(game: Game, res: AuditResult): string {
  const { finals, lives } = res;
  const out: string[] = [];
  const h = (t: string) => out.push('', `## ${t}`);
  out.push(`# ผลตรวจ logic จากการเล่น ${lives} ชีวิต (เนื้อหา ${res.events} เหตุการณ์)`);

  h('ชีวิตจบอย่างไร');
  for (const [k, n] of res.endReasons) out.push(`- ${k}: ${n} (${pct(n, lives)})`);
  const deaths = finals.filter((l) => l.endReason === 'death');
  out.push(`- อายุตอนตาย (เฉพาะคนตาย): ต่ำสุด ${Math.min(...deaths.map((l) => l.age), 999)} กลาง ${median(deaths.map((l) => l.age))} สูงสุด ${Math.max(...deaths.map((l) => l.age), 0)}`);
  out.push(`- อายุสูงสุดที่ไปถึง: ${Math.max(...finals.map((l) => l.age))} · อายุเทียบมนุษย์สูงสุด: ${Math.max(...finals.map((l) => Math.floor(humanAge(l))))}`);
  out.push('- ตัวเลือกที่ฆ่าผู้เล่นบ่อยสุด:');
  for (const [k, n] of [...res.deathBy].sort((a, b) => b[1] - a[1]).slice(0, 8)) out.push(`  - ${k}: ${n}`);

  h('ชีวิตยาว: อายุขัย ความตาย และสิ่งที่ติดตัวไป');
  const raceTh = (r: string) => RACES[r as RaceId]?.th ?? r;
  for (const race of Object.keys(RACES)) {
    const of = finals.filter((l) => l.raceApplied === race);
    if (!of.length) continue;
    const dead = of.filter((l) => l.endReason === 'death');
    const old = dead.filter((l) => l.deathCause === 'age');
    const ha = (l: LifeState) => Math.floor(humanAge(l));
    out.push(
      `- ${raceTh(race)} ${of.length} ชีวิต: ตาย ${pct(dead.length, of.length)} (สิ้นอายุขัย ${pct(old.length, of.length)}) เรื่องหมดก่อน ${pct(of.length - dead.length, of.length)}` +
        ` · อายุจริงตอนสิ้นอายุขัย กลาง ${median(old.map((l) => l.age))} ช่วง 10–90% ${quantile(old.map((l) => l.age), 0.1)}–${quantile(old.map((l) => l.age), 0.9)}` +
        ` · ถึงอายุเทียบมนุษย์ 65: ${pct(of.filter((l) => ha(l) >= 65).length, of.length)} 80: ${pct(of.filter((l) => ha(l) >= 80).length, of.length)} 100: ${pct(of.filter((l) => ha(l) >= 100).length, of.length)}`,
    );
  }
  out.push(`- เหตุของความตาย: ${[...res.deathCauses].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'ไม่มี'}`);
  out.push(`- ฉากตายที่ได้ออก: ${[...res.deathScenes].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace('death.', '')} ${n}`).join(' · ') || 'ไม่มี'}`);
  const unseenDeaths = game.events.filter((e) => e.stage === 'death' && !res.deathScenes.has(e.id)).map((e) => e.id);
  out.push(`- ฉากตายที่ไม่มีชีวิตไหนได้เห็น: ${unseenDeaths.length ? unseenDeaths.join(', ') : 'ไม่มี'}`);
  out.push(`- รอดจากฉากตาย (รับข้อเสนอหรือของกันตาย): ${finals.filter((l) => l.log.some((e) => e.eventId.startsWith('death.')) && (l.alive || l.log.filter((e) => e.eventId.startsWith('death.')).length > 1)).length} ชีวิต`);
  const elders = finals.filter((l) => humanAge(l) >= 65);
  const wed = elders.filter((l) => l.people.some((p) => p.kin === 'spouse'));
  out.push(`- คนที่ถึงวัยชรา ${elders.length} ชีวิต: มีคู่ครอง ${pct(wed.length, elders.length)} ในนั้นคู่จากไปก่อน ${pct(wed.filter((l) => !l.people.find((p) => p.kin === 'spouse')!.alive).length, wed.length)}`);
  const kids = full40(finals).map((l) => l.people.filter((p) => p.kin === 'child').length);
  out.push(`- ลูกต่อชีวิต (ชีวิตที่ถึง 40): กลาง ${median(kids)} สูงสุด ${Math.max(0, ...kids)} · ไม่มีลูก ${pct(kids.filter((k) => k === 0).length, kids.length)}`);
  const held = full40(finals).map((l) => l.traits.length);
  out.push(`- สิ่งติดตัวตอนจบ (ชีวิตที่ถึง 40): กลาง ${median(held)} ช่วง ${Math.min(0, ...held)}–${Math.max(0, ...held)}`);
  const kindOf = (id: string) => game.traits.get(id)?.kind ?? '?';
  const sources = traitSources(game);
  for (const [kind, th] of [['boon', 'พร'], ['curse', 'คำสาป'], ['trait', 'ลักษณะ'], ['wound', 'แผล']] as const) {
    const m = new Map<string, number>();
    for (const l of finals) for (const t of l.traits) if (kindOf(t) === kind) bump(m, t);
    const all = [...game.traits.values()].filter((t) => t.kind === kind);
    // แยกสองแบบ: ทะเบียนมีไว้ล่วงหน้าแต่ยังไม่มีเนื้อเรื่องให้ (รอชุดที่มีที่มาของมัน) กับมีทางได้แล้วแต่ไม่มีชีวิตไหนได้ (ต้องดู)
    const waiting = all.filter((t) => !sources.has(t.id)).length;
    const missed = all.filter((t) => sources.has(t.id) && !m.has(t.id)).map((t) => t.name);
    out.push(
      `  - ${th} ${all.length} อย่าง: ${[...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${game.traits.get(k)?.name ?? k} ${pct(n, lives)}`).join(' · ') || 'ไม่มีใครได้'}` +
        ` · เนื้อเรื่องยังไม่มีทางให้ ${waiting} อย่าง · มีทางได้แต่ไม่มีชีวิตไหนได้: ${missed.length ? missed.join(', ') : 'ไม่มี'}`,
    );
  }
  const locks = [...res.traitLocks].sort((a, b) => b[1] - a[1]);
  out.push(`- ตัวเลือกที่สิ่งติดตัวปิดไว้ (ผู้เล่นเห็นเป็นล็อก): ${locks.length ? locks.map(([k, n]) => `${game.traits.get(k)?.name ?? k} ${(n / lives).toFixed(2)} ครั้งต่อชีวิต`).join(' · ') : 'ไม่เคยเกิด'}`);
  const spans = finals.map((l) => l.log.filter((e) => (e.span ?? 1) > 1));
  out.push(`- เหตุการณ์ที่เล่าหลายปีรวบเดียว: กลาง ${median(spans.map((x) => x.length))} เรื่องต่อชีวิต สูงสุด ${Math.max(0, ...spans.map((x) => x.length))} · กินเวลารวม กลาง ${median(spans.map((x) => x.reduce((n, e) => n + (e.span ?? 1), 0)))} ปี`);
  const marks = finals.filter((l) => l.endReason === 'death').map((l) => l.log.filter((e) => e.mark).length);
  out.push(`- ป้ายบนเส้นชีวิตของคนที่ตาย: กลาง ${median(marks)} ช่วง ${Math.min(0, ...marks)}–${Math.max(0, ...marks)}`);

  h('การปะทะ');
  const { fights } = res;
  const total = fights.byStyle.reads.n + fights.byStyle.random.n;
  if (!total) out.push('- เนื้อหานี้ยังไม่มีการปะทะ');
  else {
    const share = (t: FightTally, k: EncounterEnd) => pct(t.ends[k] ?? 0, t.n);
    const row = (t: FightTally) =>
      `${t.n} ครั้ง · ชนะ ${share(t, 'win')} ยัน ${share(t, 'stalemate')} หนี ${share(t, 'flee')} เจรจา ${share(t, 'parley')} แพ้ ${share(t, 'lose')} ตาย ${share(t, 'death')}` +
      ` · สำเร็จต่อจังหวะ ${pct(t.hits, t.beats)} · พลังชีวิตตอนเริ่มเฉลี่ย ${(t.hpStart / Math.max(1, t.n)).toFixed(1)} เสียเฉลี่ย ${(t.hpLost / Math.max(1, t.n)).toFixed(1)} · ได้แผล ${pct(t.wounds, t.n)}`;
    out.push(`- ผู้เล่นที่อ่านเกม: ${row(fights.byStyle.reads)}`);
    out.push(`- ผู้เล่นที่กดสุ่ม: ${row(fights.byStyle.random)}`);
    out.push(`- เฉพาะการปะทะที่เอาถึงตาย · อ่านเกม: ${row(fights.deadlyByStyle.reads)}`);
    out.push(`- เฉพาะการปะทะที่เอาถึงตาย · กดสุ่ม: ${row(fights.deadlyByStyle.random)}`);
    const armed = (l: LifeState) => l.classId === 'warrior' || l.classId === 'rogue' || l.classId === 'ranger';
    const per = (keep: (l: LifeState) => boolean) => finals.map((l, i) => [l, fights.perLife[i] ?? 0] as const).filter(([l]) => humanAge(l) >= 40 && keep(l)).map(([, n]) => n);
    const span = (xs: number[]) => `กลาง ${median(xs)} ช่วง 10–90% ${quantile(xs, 0.1)}–${quantile(xs, 0.9)} สูงสุด ${Math.max(0, ...xs)}`;
    out.push(`- จำนวนการปะทะต่อชีวิต (ชีวิตที่ถึง 40): สายถืออาวุธ ${span(per(armed))} · สายอื่น ${span(per((l) => !armed(l)))}`);
    out.push(`- การปะทะที่ออกทั้งที่ยังอยู่ในช่วงพัก เพราะไม่มีเรื่องอื่นให้ออก: ${res.counts.get('การปะทะที่ออกทั้งที่ยังพัก') ?? 0} ครั้ง`);
    out.push('- แยกตามศัตรู:');
    for (const [id, t] of [...fights.byFoe].sort((a, b) => b[1].n - a[1].n)) out.push(`  - ${game.foes.get(id)?.name ?? id} (ภัย ${game.foes.get(id)?.threat}): ${row(t)}`);
    const never = game.events.filter((e) => e.encounter && !fights.byEvent.has(e.id)).map((e) => e.id);
    out.push(`- ฉากปะทะที่ไม่มีชีวิตไหนได้เจอ: ${never.length ? never.join(', ') : 'ไม่มี'}`);
    const unwon = [...fights.byEvent].filter(([, t]) => t.n >= 20 && !(t.ends.win ?? 0)).map(([id]) => id);
    out.push(`- ฉากปะทะที่เจอเกิน 20 ครั้งแต่ไม่มีใครชนะ: ${unwon.length ? unwon.join(', ') : 'ไม่มี'}`);
    const grim = [...fights.byEvent].filter(([, t]) => t.n >= 20 && (t.ends.death ?? 0) / t.n > 0.15).map(([id, t]) => `${id} ${share(t, 'death')}`);
    out.push(`- ฉากปะทะที่ตายเกิน 15%: ${grim.length ? grim.join(' · ') : 'ไม่มี'}`);
    const careful = [...fights.byEventReads].filter(([, t]) => t.n >= 10 && (t.ends.death ?? 0) / t.n > 0.08).map(([id, t]) => `${id} ${share(t, 'death')} จาก ${t.n} ครั้ง (ชนะ ${share(t, 'win')})`);
    out.push(`- ฉากปะทะที่ผู้เล่นอ่านเกมยังตายเกิน 8%: ${careful.length ? careful.join(' · ') : 'ไม่มี'}`);
    const hard = [...fights.byEventReads].filter(([, t]) => t.n >= 10 && (t.ends.win ?? 0) + (t.ends.parley ?? 0) < t.n * 0.35).map(([id, t]) => `${id} ชนะหรือเจรจา ${pct((t.ends.win ?? 0) + (t.ends.parley ?? 0), t.n)} จาก ${t.n} ครั้ง`);
    out.push(`- ฉากปะทะที่ผู้เล่นอ่านเกมชนะหรือเจรจาได้ไม่ถึง 35%: ${hard.length ? hard.join(' · ') : 'ไม่มี'}`);
    // ฉากที่เกิดซ้ำได้: ถ้าชีวิตเดียวเจอฉากเดิมหลายรอบเกินไป ผู้เล่นจะอ่านข้อความเดิมซ้ำ
    const repeats = game.events
      .filter((e) => e.encounter && !e.once)
      .map((e) => {
        const seen = finals.map((l) => l.log.filter((x) => x.eventId === e.id).length).filter((n) => n > 0);
        return `${e.id} เจอ ${pct(seen.length, lives)} ของชีวิต กลาง ${median(seen)} ครั้ง สูงสุด ${Math.max(0, ...seen)}`;
      });
    out.push(`- ฉากปะทะที่เกิดซ้ำได้: ${repeats.length ? repeats.join(' · ') : 'ไม่มี'}`);
    const unused = [...game.foes.keys()].filter((id) => !game.events.some((e) => e.encounter?.foe === id));
    out.push(`- ศัตรูที่ยังไม่มีฉากปะทะ: ${unused.length ? `${unused.length} ชนิด (${unused.map((id) => game.foes.get(id)!.name).join(', ')})` : 'ไม่มี'}`);
  }

  h('ของและร้านค้า');
  {
    // เป้า (GEAR ใน balance.ts): ชาวบ้านธรรมดาซื้อของช่างได้สองสามชิ้นทั้งชีวิต ของชั้นครูเป็นของที่ต้องเก็บเงิน ของอาบเวทต้องแลกด้วยอย่างอื่นนอกจากเงิน
    const rows = finals.map((l, i) => [l, res.gear.perLife[i] ?? null] as const).filter(([l]) => humanAge(l) >= 40);
    const shoppers = rows.filter((x): x is readonly [LifeState, GearLife] => !!x[1]);
    const plain = rows.filter(([, g]) => !g).map(([l]) => l);
    const spread = (xs: number[]) => `กลาง ${median(xs)} ช่วง 10–90% ${quantile(xs, 0.1)}–${quantile(xs, 0.9)} สูงสุด ${Math.max(0, ...xs)}`;
    const of = (pick: (g: GearLife) => number) => shoppers.map(([, g]) => pick(g));
    out.push(`- ชีวิตที่เข้าร้านและถึงอายุ 40: ${shoppers.length} (อีก ${plain.length} ชีวิตไม่แตะของ ใช้เทียบ)`);
    out.push(`- ปีที่ถิ่นที่อยู่มีร้าน: ${spread(of((g) => g.shopYears))} · ปีที่ร้านไม่ขายให้: ${spread(of((g) => g.closedYears))} · ไม่เคยอยู่ถิ่นที่มีร้านเลย ${pct(shoppers.filter(([, g]) => !g.shopYears).length, shoppers.length)}`);
    const gearBought = (g: GearLife) => RARITIES.reduce((n, r) => n + g.bought[r], 0);
    out.push(`- ของสวมใส่ที่ซื้อต่อชีวิต: ${spread(of(gearBought))} · ไม่ได้ซื้อเลย ${pct(shoppers.filter(([, g]) => !gearBought(g)).length, shoppers.length)} · อายุตอนซื้อชิ้นแรก กลาง ${median(shoppers.flatMap(([, g]) => (g.firstBuyAge === null ? [] : [g.firstBuyAge])))}`);
    for (const r of RARITIES) {
      const xs = of((g) => g.bought[r]);
      if (r !== 'hero') out.push(`  - ${RARITY_TH[r]}: ${spread(xs)} · ซื้ออย่างน้อยหนึ่งชิ้น ${pct(xs.filter((n) => n > 0).length, xs.length)} · สองชิ้นขึ้นไป ${pct(xs.filter((n) => n > 1).length, xs.length)}`);
    }
    out.push(`- เงินที่จ่ายร้านต่อชีวิต: ${spread(of((g) => g.spent))} · ได้คืนจากการขายของเก่า: ${spread(of((g) => g.sold))}`);
    out.push(`- ของใช้แล้วหมด: ซื้อ ${spread(of((g) => g.supplies))} · ใช้ในการปะทะ ${spread(of((g) => g.used))} · กินยานอกการปะทะ ${spread(of((g) => g.healed))}`);
    out.push(`- ของที่ได้จากศัตรู: ${spread(of((g) => g.loot))} · ได้อย่างน้อยหนึ่งชิ้น ${pct(shoppers.filter(([, g]) => g.loot > 0).length, shoppers.length)}`);
    const worn = (l: LifeState) => Object.keys(l.equipped).length;
    const bonus = (l: LifeState) => Object.values(l.equipped).reduce((n, id) => n + (id && game.items.get(id) ? itemBudget(game.items.get(id)!) : 0), 0);
    out.push(`- ตอนจบ: ช่องที่สวมอยู่ ${spread(shoppers.map(([l]) => worn(l)))} จาก 9 ช่อง · แต้มงบรวมของของที่สวม ${spread(shoppers.map(([l]) => bonus(l)))} · เงินเหลือ กลาง ${median(shoppers.map(([l]) => l.gold))} (คนไม่แตะของ กลาง ${median(plain.map((l) => l.gold))})`);
    const marks = shoppers.filter(([l]) => l.traits.includes('curse_star_marks')).length;
    out.push(`- ราคาของวัสดุ: ได้รอยดาวจากเงินดาว ${pct(marks, shoppers.length)} · สวมหินถ่านมารข้ามปีอย่างน้อยหนึ่งปี ${pct(shoppers.filter(([l]) => (l.worn?.demon_coal ?? 0) > 0).length, shoppers.length)} · สวมเหล็กเย็น ${pct(shoppers.filter(([l]) => (l.worn?.cold_iron ?? 0) > 0).length, shoppers.length)}`);
    const share = (t: FightTally, k: EncounterEnd) => pct(t.ends[k] ?? 0, t.n);
    const fight = (t: FightTally) => `${t.n} ครั้ง ชนะ ${share(t, 'win')} ตาย ${share(t, 'death')} สำเร็จต่อจังหวะ ${pct(t.hits, t.beats)} เสียพลังชีวิตเฉลี่ย ${(t.hpLost / Math.max(1, t.n)).toFixed(1)}`;
    out.push(`- ของช่วยในการปะทะที่เอาถึงตายแค่ไหน (ผู้เล่นอ่านเกม): มีของ ${fight(res.fights.deadlyReadsByGear.shop)} · ไม่มีของ ${fight(res.fights.deadlyReadsByGear.none)}`);
    const ages = (ls: LifeState[]) => median(ls.filter((l) => l.endReason === 'death').map((l) => Math.floor(humanAge(l))));
    out.push(`- อายุตอนตาย (เทียบมนุษย์ ทุกชีวิต): คนเข้าร้าน กลาง ${ages(finals.filter((_, i) => res.gear.perLife[i]))} · คนไม่แตะของ กลาง ${ages(finals.filter((_, i) => !res.gear.perLife[i]))}`);
    // เป้าข้อ D2 แยกกลุ่ม: ของยืดอายุได้แค่ไหน (ของกันหนาวกับของที่เพิ่มพลังชีวิตสูงสุด)
    const d2 = (shop: boolean) => {
      const humans = finals.filter((l, i) => !!res.gear.perLife[i] === shop && l.raceApplied === 'human');
      const aged = humans.filter((l) => l.deathCause === 'age').map((l) => l.age);
      const in80s = aged.filter((a) => a >= 80 && a <= 90).length;
      return `กลาง ${median(aged)} ช่วง 10–90% ${quantile(aged, 0.1)}–${quantile(aged, 0.9)} ไปในช่วง 80 ถึง 90 ${pct(in80s, aged.length)} · ถึง 100 ปี ${pct(humans.filter((l) => l.age >= 100).length, humans.length)}`;
    };
    out.push(`- มนุษย์ที่สิ้นอายุขัย (เป้าข้อ D2): คนเข้าร้าน ${d2(true)} · คนไม่แตะของ ${d2(false)}`);
    const name = (id: string) => game.items.get(id)?.name ?? id;
    const sold = [...res.gear.boughtById].sort((a, b) => b[1] - a[1]);
    out.push(`- ของที่ซื้อบ่อยสุด: ${sold.slice(0, 10).map(([id, n]) => `${name(id)} ${n}`).join(' · ') || 'ไม่มี'}`);
    const onShelves = new Set(game.shops.flatMap((sh) => [...sh.staples, ...sh.stock]));
    const unsold = [...onShelves].filter((id) => !res.gear.boughtById.has(id));
    const tier = (r: Rarity) => unsold.filter((id) => !isSupply(game.items.get(id)) && game.items.get(id)?.rarity === r);
    out.push(`- ของบนแผงที่ไม่มีชีวิตไหนซื้อ: ${unsold.length} จาก ${onShelves.size} ชิ้น (${RARITIES.filter((r) => tier(r).length).map((r) => `${RARITY_TH[r]} ${tier(r).length}`).join(' · ')} · ของใช้แล้วหมด ${unsold.filter((id) => isSupply(game.items.get(id))).length})`);
    const loot = [...res.gear.lootById].sort((a, b) => b[1] - a[1]);
    out.push(`- ของจากศัตรูที่ได้บ่อยสุด: ${loot.slice(0, 8).map(([id, n]) => `${name(id)} ${n}`).join(' · ') || 'ไม่มี'}`);
    const drops = new Set([...game.foes.values()].flatMap((f) => f.loot.flatMap((row) => (row.item ? [row.item] : []))));
    const undropped = [...drops].filter((id) => !res.gear.lootById.has(id));
    out.push(`- ของจากศัตรูที่ไม่มีชีวิตไหนได้: ${undropped.length ? undropped.map(name).join(', ') : 'ไม่มี'}`);
  }

  h('องค์กร');
  {
    const rows = finals.map((l, i) => ({ life: l, dutiful: i % 2 === 1, orgs: res.orgs.perLife[i] ?? {} }));
    for (const id of ORG_IDS) {
      const members = rows.flatMap((x) => (x.orgs[id] ? [{ ...x, o: x.orgs[id]! }] : []));
      out.push(`- ${ORGS[id].th}: เคยเป็นสมาชิก ${members.length} ชีวิต (${pct(members.length, lives)}) · เข้าตอนอายุกลาง ${median(members.map((x) => x.o.joinedAge))} · ออกก่อนจบชีวิต ${pct(members.filter((x) => x.o.left).length, members.length)}${ORGS[id].covert ? ` · โดนเปิดโปง ${pct(members.filter((x) => x.o.exposed).length, members.length)}` : ''}`);
      if (!members.length) continue;
      for (const [label, dutiful] of [['รับงานทุกครั้ง', true], ['กดสุ่ม', false]] as const) {
        const all = members.filter((x) => x.dutiful === dutiful);
        // ยศต้องใช้เวลา: วัดจากคนที่อยู่ในองค์กรครบ 20 ปี
        const long = all.filter((x) => x.o.lastAge - x.o.joinedAge >= 20);
        const ranks = Array.from({ length: ORG_RANKS }, (_, k) => `${ORGS[id].ranks[k]} ${pct(long.filter((x) => x.o.maxRank === k + 1).length, long.length)}`);
        out.push(`  - ${label}: ${all.length} ชีวิต · อยู่ครบ 20 ปี ${long.length} ชีวิต ยศสูงสุด: ${ranks.join(' · ')}`);
        out.push(`    งานที่ได้ กลาง ${median(long.map((x) => x.o.duties))} (ทำสำเร็จ กลาง ${median(long.map((x) => x.o.done))} · ปัด กลาง ${median(long.map((x) => x.o.refused))}) · ถึงกำหนดงานแต่ไม่มีงานให้ส่ง กลาง ${median(long.map((x) => x.o.starved))} ครั้งก่อนอายุ 65 และ ${median(long.map((x) => x.o.starvedOld))} ครั้งหลังจากนั้น${ORGS[id].bounty ? ` · ค่าหัว กลาง ${median(long.map((x) => x.o.bounty))} เหรียญ สูงสุด ${Math.max(0, ...long.map((x) => x.o.bounty))}` : ''}`);
      }
    }
    const hunts = [...res.orgs.hunts].sort((a, b) => b[1] - a[1]);
    out.push(`- ฉากตามล่าที่ออก: ${hunts.length ? hunts.map(([k, n]) => `${k} ${n} ครั้ง`).join(' · ') : 'ไม่มี'} · ชีวิตที่จบโดยยังโดนตามล่า ${pct(finals.filter((l) => Object.values(l.hunted).some((v) => v > 0)).length, lives)}`);
    out.push(`- งานขององค์กรที่ออกติดกันเพราะไม่มีเรื่องอื่น: ${res.counts.get('งานขององค์กรที่ออกติดกัน') ?? 0} ครั้ง · เกณฑ์ผลงานของยศ 2 ถึง ${ORG_RANKS}: ${ORG.merit.join(' ')}`);
  }

  h('เมืองและหลักสูตร');
  {
    const rows = finals.map((l, i) => ({ life: l, keen: i % 2 === 1, t: res.towns[i]! }));
    const years = (l: LifeState) => l.log.flatMap((e) => (e.year ? [e.year] : []));
    for (const id of CITY_IDS) {
      const lived = rows.filter((x) => x.t.yearsIn[id]);
      const ranks = CITY_RANKS.map((th, k) => `${th} ${pct(lived.filter((x) => x.life.standing[id]?.rank === k + 1).length, lived.length)}`);
      out.push(`- ${CITIES[id].th}: เคยอยู่ ${lived.length} ชีวิต (${pct(lived.length, lives)}) · ปีที่อยู่ กลาง ${median(lived.map((x) => x.t.yearsIn[id]!))} · ชั้นตอนจบ: ${ranks.join(' · ')}`);
      // คนที่อยู่เมืองนี้ครบ 15 ปี แยกผู้เล่นที่เลือกทางของย่านทุกครั้งที่มี กับผู้เล่นที่กดสุ่ม (แบบเดียวกับหัวข้อองค์กร)
      for (const [label, keen] of [['เลือกทางของย่าน', true], ['กดสุ่ม', false]] as const) {
        const long = lived.filter((x) => x.keen === keen && x.t.yearsIn[id]! >= 15);
        if (long.length) out.push(`  - ${label} อยู่ครบ 15 ปี ${long.length} ชีวิต: ${CITY_RANKS.map((th, k) => `${th} ${pct(long.filter((x) => x.life.standing[id]?.rank === k + 1).length, long.length)}`).join(' · ')}`);
      }
    }
    const urban = rows.filter((x) => Object.keys(x.t.yearsIn).length);
    out.push(`- ที่อยู่ที่เคยมี (จากชีวิตที่เคยอยู่เมือง ${urban.length} ชีวิต): ${HOME_KINDS.map((k) => `${HOME_TH[k]} ${pct(urban.filter((x) => x.t.homes.has(k)).length, urban.length)}`).join(' · ')} · ไม่เคยมีที่อยู่ ${pct(urban.filter((x) => !x.t.homes.size).length, urban.length)}`);
    const rent = (key: 'paid' | 'behind' | 'evicted') => urban.map((x) => years(x.life).filter((y) => y.rent?.[key]).length);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    out.push(`- ค่าเช่า (${CITY.rent} เหรียญทุก ${CITY.rentEvery} ปี): จ่าย ${sum(rent('paid'))} ครั้ง · ค้าง ${sum(rent('behind'))} ครั้ง · เสียห้อง ${sum(rent('evicted'))} ครั้ง (${pct(rent('evicted').filter((n) => n > 0).length, urban.length)} ของชีวิตในเมือง) · รายได้ของร้าน ${sum(urban.map((x) => years(x.life).filter((y) => y.income).length))} ครั้ง`);
    const moods = (['tense', 'riot', 'plague'] as const).map((m) => `${CITY_MOOD_TH[m]} ${pct(urban.filter((x) => x.t.moods.has(m)).length, urban.length)}`);
    out.push(`- สภาพเมืองที่เคยอยู่ด้วย: ${moods.join(' · ')} · ปีที่ร้านปิดเพราะจลาจล กลาง ${median(urban.filter((x) => x.t.shutYears).map((x) => x.t.shutYears))} (จาก ${urban.filter((x) => x.t.shutYears).length} ชีวิต) · จบชีวิตโดยเมืองยังไม่สงบ ${pct(finals.filter((l) => Object.keys(l.moods ?? {}).length).length, lives)}`);
    for (const id of COURSE_IDS) {
      const def = COURSES[id];
      const took = rows.flatMap((x) => (x.t.course?.id === id ? [x.t.course] : []));
      const ends = (['graduated', 'left', 'died', 'studying'] as const).map((e) => `${{ graduated: 'จบ', left: 'ออกกลางคัน', died: 'ตายระหว่างเรียน', studying: 'ยังเรียนอยู่ตอนชีวิตจบ' }[e]} ${pct(took.filter((c) => c.end === e).length, took.length)}`);
      out.push(`- ${def.th}: เข้าเรียน ${took.length} ชีวิต (${pct(took.length, lives)}) · อายุตอนเข้า กลาง ${median(took.map((c) => c.enteredAge))} · ${ends.join(' · ')}`);
      if (!took.length) continue;
      const grads = took.filter((c) => c.end === 'graduated');
      out.push(`  - สำนัก: ${Object.entries(def.tracks).map(([t, th]) => `${th} ${pct(took.filter((c) => c.track === t).length, took.length)}`).join(' · ')} · ยังไม่ได้เลือก ${pct(took.filter((c) => !c.track).length, took.length)}`);
      out.push(`  - คนที่จบ: ใช้เวลา กลาง ${median(grads.map((c) => c.span))} ปี (หลักสูตร ${def.years} ปี) สูงสุด ${Math.max(0, ...grads.map((c) => c.span))} · ปีเรียนที่ไม่มีเรื่องของหลักสูตรให้ออก รวม ${sum(took.map((c) => c.empty))} ปี (ต้องเป็นศูนย์)`);
    }
  }

  h('แผ่นดิน: ข้อห้ามและเส้นเรื่องยาว');
  {
    // ชีวิตเลขคู่ (ลำดับคี่ใน finals เพราะชีวิตแรกคือเลข 1) คือผู้เล่นที่ถือข้อห้ามทุกครั้งที่มีทางให้ถือ ชีวิตเลขคี่กดสุ่ม
    const grown = finals.map((l, i) => ({ l, keen: i % 2 === 1 })).filter((x) => humanAge(x.l) >= 40);
    const taught = TABOO_IDS.filter((id) => grown.some((x) => x.l.taboos?.[id]));
    if (!taught.length) out.push('- เนื้อหานี้ยังไม่มีข้อห้ามของแผ่นดิน');
    for (const id of taught) {
      const knows = grown.filter((x) => x.l.taboos?.[id]);
      const line = (xs: typeof knows) =>
        `ถือครบเกณฑ์ ${pct(xs.filter((x) => keepsTaboo(x.l, id)).length, xs.length)} · ฝืนซ้ำ ${pct(xs.filter((x) => defiesTaboo(x.l, id)).length, xs.length)} · ได้พร ${pct(xs.filter((x) => x.l.traits.includes(TABOOS[id].boon)).length, xs.length)}`;
      out.push(`- ${TABOOS[id].th}: รู้ข้อห้าม ${knows.length} ชีวิต (${pct(knows.length, grown.length)}) · คนถือข้อห้าม ${line(knows.filter((x) => x.keen))} · กดสุ่ม ${line(knows.filter((x) => !x.keen))}`);
    }
    const lands = grown.map((x) => x.l.world.land);
    if (lands.length) out.push(`- คะแนนแผ่นดินตอนจบ: กลาง ${median(lands)} ช่วง 10–90% ${quantile(lands, 0.1)}–${quantile(lands, 0.9)} สูงสุด ${Math.max(...lands)} ต่ำสุด ${Math.min(...lands)}`);

    const arcs = ARC_IDS.filter((id) => game.arcLast[id]);
    if (!arcs.length) out.push('- เนื้อหานี้ยังไม่มีเส้นเรื่องยาว');
    const perLife = grown.map((x) => Object.values(x.l.arcs ?? {}).filter((a) => a!.step >= 1 && !(a!.closed && a!.step === 1)).length);
    if (arcs.length) out.push(`- เส้นเรื่องที่ชีวิตหนึ่งเดินเข้าไป (ชีวิตที่ถึง 40 ไม่นับเส้นที่ปัดตั้งแต่ตอนแรก): กลาง ${median(perLife)} ช่วง 10–90% ${quantile(perLife, 0.1)}–${quantile(perLife, 0.9)} สูงสุด ${Math.max(0, ...perLife)} · ไม่มีสักเส้น ${pct(perLife.filter((n) => !n).length, perLife.length)}`);
    for (const id of arcs) {
      const last = game.arcLast[id]!;
      const met = grown.filter((x) => x.l.arcs?.[id]);
      const at = (n: number) => met.filter((x) => x.l.arcs![id]!.step >= n).length;
      const steps = Array.from({ length: last }, (_, i) => `ตอน ${i + 1}: ${at(i + 1)}`).join(' · ');
      const closed = met.filter((x) => x.l.arcs![id]!.closed).length;
      // เส้นที่เปิดอยู่ ยังมีตอนถัดไป แต่ชีวิตจบก่อนตอนนั้นจะมา ทั้งที่ผ่านกำหนดไปแล้ว = เงื่อนไขของตอนถัดไปแคบเกิน
      const stuck = met.filter((x) => {
        const a = x.l.arcs![id]!;
        return !a.closed && a.step >= 1 && a.step < last && worldYear(x.l) - a.at > ARC.due + 1;
      }).length;
      const gaps: number[] = [];
      for (const x of met) {
        const ages = x.l.log.filter((e) => game.events.find((g) => g.id === e.eventId)?.arc?.id === id).map((e) => e.age);
        for (let i = 1; i < ages.length; i++) gaps.push(ages[i]! - ages[i - 1]!);
      }
      out.push(`- ${ARC_TH[id]}: เจอตอนแรก ${met.length} ชีวิต (${pct(met.length, grown.length)}) · ${steps} · ปิดเรื่อง ${closed} · ค้างเลยกำหนด ${stuck}${gaps.length ? ` · ระยะระหว่างตอน กลาง ${median(gaps)} ปี` : ''}`);
    }
  }

  h('ยุคดาวเร่ง: มาตรสองอัน สิ่งจากฟ้า และคะแนนโลก');
  {
    const first = ERAS.find((e) => e.id === 'quickening');
    const rows = finals.map((l, i) => ({ l, m: res.marks[i]! }));
    const lastYear = (l: LifeState) => l.birthYear + l.age;
    const era = first ? rows.filter((x) => lastYear(x.l) >= first.from) : [];
    if (!first || !era.length) out.push('- ไม่มีชีวิตไหนอยู่ถึงยุคดาวเร่ง');
    else {
      out.push(`- ชีวิตที่อยู่ถึงปี ${first.from}: ${era.length} (${pct(era.length, lives)}) · อยู่จนพ้นยุค (ปี ${first.to + 1}) ${pct(era.filter((x) => lastYear(x.l) > first.to).length, era.length)}`);
      const born = (x: (typeof era)[number], id: MarkId) => !!MARKS[id].born && x.l.flags.includes(MARKS[id].born!);
      for (const id of MARK_IDS) {
        // คนที่เกิดมาพร้อมมาตร (ทีฟลิ่งกับตราร้อน) นับแยก เพราะขั้น 1 ของเขาไม่ได้มาจากการเลือก
        const own = era.filter((x) => !born(x, id));
        const peaks = Array.from({ length: MARK_MAX + 1 }, (_, k) => `ขั้น ${k} ${pct(own.filter((x) => x.m.peak[id] === k).length, own.length)}`);
        const calledOnce = own.filter((x) => x.m.called[id] > 0).length;
        const taken = own.filter((x) => x.l.deathCause === 'taken' && x.l.flags.includes(id === 'star' ? 'answered_the_sky' : 'walked_east_at_the_call')).length;
        const natives = era.filter((x) => born(x, id));
        out.push(`- ${game.traits.get(MARKS[id].trait)?.name ?? id} (ขั้นสูงสุดที่เคยถึง จาก ${own.length} ชีวิต): ${peaks.join(' · ')} · ถูกเรียก ${pct(calledOnce, own.length)} (เกินหนึ่งครั้ง ${pct(own.filter((x) => x.m.called[id] > 1).length, own.length)}) · ไปตามเสียงเรียก ${pct(taken, own.length)} · ยังติดตัวตอนจบ ${pct(own.filter((x) => markLevel(x.l, id) > 0).length, own.length)}`);
        if (natives.length) out.push(`  - เกิดมาพร้อมมาตรนี้ ${natives.length} ชีวิต: ขั้นสูงสุด ${Array.from({ length: MARK_MAX }, (_, k) => `ขั้น ${k + 1} ${pct(natives.filter((x) => x.m.peak[id] === k + 1).length, natives.length)}`).join(' · ')} · ถูกเรียก ${pct(natives.filter((x) => x.m.called[id] > 0).length, natives.length)}`);
      }
      const sky = STAR_SIDE_TRAITS.filter((t) => t !== MARKS.star.trait && game.traits.has(t));
      out.push(`- สิ่งติดตัวจากฟ้าที่เคยมี: ${sky.map((t) => `${game.traits.get(t)!.name} ${pct(era.filter((x) => x.m.sky.has(t)).length, era.length)} (ยังอยู่ตอนจบ ${pct(era.filter((x) => x.l.traits.includes(t)).length, era.length)})`).join(' · ')}`);
      out.push(`- มีสิ่งจากฟ้าอย่างน้อยหนึ่งอย่าง ${pct(era.filter((x) => x.m.sky.size > 0).length, era.length)} · สองอย่างขึ้นไป ${pct(era.filter((x) => x.m.sky.size > 1).length, era.length)}`);
      // คะแนนโลกของชีวิตที่อยู่จนพ้นยุค: ฝ่ายที่สูงสุดของแต่ละชีวิตคือฝ่ายที่ชีวิตนั้นเอนไปหา (เป้าของชุด 5: คนที่เข้าข้างฝ่ายเดียวตลอดยุคได้ 12 ถึง 16)
      const through = era.filter((x) => lastYear(x.l) > first.to);
      const sides = SIDES;
      const line = (xs: number[]) => (xs.length ? `กลาง ${median(xs)} ช่วง 10–90% ${quantile(xs, 0.1)}–${quantile(xs, 0.9)} สูงสุด ${Math.max(...xs)}` : 'ไม่มี');
      for (const k of sides) out.push(`- คะแนนโลกฝ่าย ${k} ตอนจบ (ชีวิตที่พ้นยุค ${through.length}): ${line(through.map((x) => x.l.world[k]))}`);
      out.push(`- ฝ่ายที่สูงสุดของแต่ละชีวิต: ${line(through.map((x) => Math.max(...sides.map((k) => x.l.world[k]))))} · ถึง 12 ขึ้นไป ${pct(through.filter((x) => Math.max(...sides.map((k) => x.l.world[k])) >= 12).length, through.length)} · ชนเพดาน ${WORLD_CAP} ${pct(through.filter((x) => Math.max(...sides.map((k) => x.l.world[k])) >= WORLD_CAP).length, through.length)}`);
      const gain = (x: { l: LifeState; m: MarkLife }, k: Side) => x.l.world[k] - (x.m.entry?.[k] ?? 0);
      out.push(`- ได้ระหว่างยุค (ปี ${first.from} ถึงจบชีวิต ของชีวิตที่พ้นยุค): ${sides.map((k) => `${k} ${line(through.map((x) => gain(x, k)))}`).join(' · ')}`);
      // ผู้เล่นที่เข้าข้างฝ่ายเดียวทุกครั้งที่มีทาง: เป้าคือได้ 12 ถึง 16 ระหว่างยุค
      for (const k of sides) {
        const p = res.partisans?.[k];
        if (!p) continue;
        const ps = p.finals.map((l, i) => ({ l, m: p.marks[i]! })).filter((x) => lastYear(x.l) > first.to && x.m.entry);
        out.push(`- ผู้เล่นที่เข้าข้างฝ่าย ${k} ทุกครั้งที่มีทาง (${p.finals.length} ชีวิต พ้นยุค ${ps.length}): ได้ระหว่างยุค ${line(ps.map((x) => gain(x, k)))} · ตอนจบ ${line(ps.map((x) => x.l.world[k]))} · ถูกเรียก ${pct(ps.filter((x) => x.m.called.star + x.m.called.brand > 0).length, ps.length)} · ไปตามเสียงเรียก ${pct(p.finals.filter((l) => l.deathCause === 'taken').length, p.finals.length)}`);
      }
      const pins = game.events.filter((e) => e.must && e.id.startsWith('adult.world_') && (e.when.year?.[0] ?? 0) >= first.from && (e.when.year?.[0] ?? 0) <= first.to + 1);
      out.push(`- หมุดของยุค (ชีวิตที่ได้เจอ): ${pins.map((e) => `${e.id.replace('adult.world_', '')} ${res.seenEvents.get(e.id) ?? 0}`).join(' · ') || 'ไม่มี'}`);
    }
  }

  h('เผ่าและอาชีพ');
  const tally = (key: (l: LifeState) => string) => {
    const m = new Map<string, number>();
    for (const l of finals) bump(m, key(l));
    return [...m].map(([k, n]) => `${k} ${pct(n, lives)}`).join(' · ');
  };
  out.push(`- เผ่า: ${tally((l) => l.raceApplied ?? 'ไม่มี')}`);
  out.push(`- อาชีพ: ${tally((l) => l.classId ?? 'ไม่มี')}`);

  h('ตัวละครตอนจบ (เฉพาะชีวิตที่ถึงอายุ 40)');
  const full = finals.filter((l) => humanAge(l) >= 40);
  out.push(`- จำนวน: ${full.length}`);
  for (const s of STATS) {
    const xs = full.map((l) => l.stats[s]);
    out.push(`- ${s}: กลาง ${median(xs)} สูงสุด ${Math.max(...xs)} · ถึงเพดาน ${STAT_CAP}: ${pct(xs.filter((x) => x >= STAT_CAP).length, xs.length)}`);
  }
  const top = full.map((l) => Math.max(...STATS.map((s) => l.stats[s])));
  out.push(`- ค่าสูงสุดของแต่ละคน: กลาง ${median(top)} · มีอย่างน้อยหนึ่งค่าถึงเพดาน ${pct(top.filter((x) => x >= STAT_CAP).length, top.length)}`);
  const sum = full.map((l) => STATS.reduce((n, s) => n + l.stats[s], 0));
  out.push(`- ผลรวมหกค่า: กลาง ${median(sum)} ต่ำสุด ${Math.min(...sum)} สูงสุด ${Math.max(...sum)}`);
  const gold = full.map((l) => l.gold);
  out.push(`- เงิน: กลาง ${median(gold)} ต่ำสุด ${Math.min(...gold)} สูงสุด ${Math.max(...gold)} · ติดหนี้ ${pct(gold.filter((g) => g < 0).length, gold.length)}`);
  const hpMax = full.map((l) => maxHp(l, game.items));
  out.push(`- HP สูงสุด: กลาง ${median(hpMax)} ช่วง ${Math.min(...hpMax)}–${Math.max(...hpMax)}`);
  out.push(`- คนที่รู้จัก: กลาง ${median(full.map((l) => l.people.length))} · มีคู่ ${pct(full.filter((l) => l.partner).length, full.length)} · แต่งงาน ${pct(full.filter((l) => l.flags.includes('married')).length, full.length)} · มีลูก ${pct(full.filter((l) => l.flags.includes('has_child')).length, full.length)}`);
  out.push(`- ของในถุง: กลาง ${median(full.map((l) => l.inventory.length))} · สวมอยู่: กลาง ${median(full.map((l) => Object.keys(l.equipped).length))}`);
  for (const k of WORLD_KEYS) {
    const xs = full.map((l) => l.world[k]);
    out.push(`- คะแนนโลก ${k}: กลาง ${median(xs)} ช่วง ${Math.min(...xs)}–${Math.max(...xs)}${(REALM_KEYS as readonly string[]).includes(k) ? ` · ชีวิตที่ขยับค่านี้เอง ${pct(xs.filter((x) => x !== 0).length, xs.length)} (ไม่นับที่ประวัติศาสตร์ขยับให้)` : ''}`);
  }

  h('กองเหตุการณ์ต่ออายุ (จำนวนเหตุการณ์ที่ออกได้ตอนสุ่ม)');
  const thin: string[] = [];
  for (const [age, xs] of [...res.poolByAge].sort((a, b) => a[0] - b[0])) {
    const min = Math.min(...xs);
    if (min <= 2) thin.push(`อายุ ${age}: ต่ำสุด ${min} กลาง ${median(xs)}`);
  }
  out.push(thin.length ? `- อายุที่กองบางมาก (ต่ำสุด ≤ 2): ${thin.join(' · ')}` : '- ไม่มีอายุไหนที่กองบางกว่า 3');

  h('เหตุการณ์ที่ต้องเกิด (must)');
  const mustRows = [...res.must].sort((a, b) => a[0].localeCompare(b[0]));
  const missed = mustRows.filter(([, m]) => m.seen < m.could);
  out.push(`- ${mustRows.length} เรื่องที่มีชีวิตเข้าเงื่อนไข · เห็นครบทุกชีวิต ${mustRows.length - missed.length} เรื่อง`);
  for (const [id, m] of missed) out.push(`  - ${id}: เข้าเงื่อนไข ${m.could} ชีวิต ไม่ได้เห็น ${m.could - m.seen} (${pct(m.could - m.seen, m.could)}) รวมชีวิตที่ตายก่อนถึงคิว`);
  const col = [...res.collisions].sort((a, b) => b[1] - a[1]);
  out.push(col.length ? col.map(([k, n]) => `- ชนกัน: ${k} · ${n} ชีวิต`).join('\n') : '- ไม่มี must ที่ชนกัน');

  h('ความหลากหลาย');
  out.push(`- สองชีวิตที่ถิ่นกำเนิดและอาชีพเดียวกันเจอเหตุการณ์ซ้ำกัน ${pct(res.overlap.sameOriginAndClass, 1)}`);
  out.push(`- สองชีวิตใดๆ เจอเหตุการณ์ซ้ำกัน ${pct(res.overlap.anyTwo, 1)}`);
  out.push(`- เหตุการณ์ที่เห็นต่อชีวิต: ${res.overlap.eventsPerLife.toFixed(1)}`);

  h('เหตุการณ์ที่ไม่มีใครได้เห็น');
  const never = game.events.filter((e) => !res.seenEvents.has(e.id)).map((e) => e.id);
  out.push(`- ${never.length} จาก ${res.events}${never.length ? `: ${never.join(', ')}` : ''}`);
  const rare = game.events
    .filter((e) => (res.seenEvents.get(e.id) ?? 0) > 0 && (res.seenEvents.get(e.id) ?? 0) < lives / 400)
    .map((e) => `${e.id} (${res.seenEvents.get(e.id)})`);
  out.push(`- เห็นน้อยกว่า 1 ใน 400 ชีวิต: ${rare.length}${rare.length ? `: ${rare.join(', ')}` : ''}`);

  h('เหตุการณ์ที่เกิดซ้ำในชีวิตเดียว');
  const rep = [...res.repeats].sort((a, b) => b[1] - a[1]);
  out.push(rep.length ? rep.slice(0, 15).map(([k, n]) => `- ${k}: ซ้ำ ${n} ครั้งรวมทุกชีวิต`).join('\n') : '- ไม่มี');
  const close = [...res.closeRepeats].sort((a, b) => b[1] - a[1]);
  out.push(close.length ? `- ซ้ำภายใน ${REPEAT_GAP} เหตุการณ์เพราะไม่มีเรื่องอื่นให้ออก: ${close.map(([k, n]) => `${k} ${n}`).join(' · ')}` : `- ไม่มีเรื่องไหนซ้ำภายใน ${REPEAT_GAP} เหตุการณ์`);

  h('ตัวเลือก');
  out.push(`- เหตุการณ์ที่เหลือตัวเลือกเดียวให้กด: ${pct(res.counts.get('เหตุการณ์ที่เหลือตัวเลือกเดียว') ?? 0, res.counts.get('เหตุการณ์ทั้งหมด') ?? 1)}`);
  out.push(`- มีลูกโดยไม่ได้แต่งงาน: ${res.counts.get('มีลูกโดยไม่ได้แต่งงาน') ?? 0} ครั้ง`);

  h('ปัญหาที่พบ');
  const list = [...res.problems].sort((a, b) => b[1] - a[1]);
  out.push(list.length ? list.map(([k, n]) => `- ${k} · ${n} ครั้ง`).join('\n') : '- ไม่พบ');

  return out.join('\n');
}

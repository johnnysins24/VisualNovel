/**
 * ตรวจ logic ของเกมด้วยการเล่นชีวิตสุ่มจำนวนมาก แล้วสรุปเป็นตัวเลข
 * ใช้ได้ทั้งจากคำสั่ง (scripts/audit-lives.ts) และจากเทสต์ (tests/slow/audit.test.ts)
 * ทุกอย่างคำนวณจาก seed จึงได้ผลเดิมทุกครั้ง
 */
import { choiceAvailable, eligible, fightResting, pickEvent, playable, resolveChoice, spanOf, traitBlock, turnsLeft, type Game } from '../src/engine/engine';
import { humanAge, newLife, stageAge, worldYear, type LifeState } from '../src/engine/state';
import { personHumanAge } from '../src/engine/people';
import { Rng } from '../src/engine/rng';
import { STATS } from '../src/engine/schema';
import { equip, maxHp } from '../src/engine/items';
import { PROTECTED_AGE, RACES, RARITIES, RARITY_TH, REPEAT_GAP, STAT_CAP, type RaceId, type Rarity } from '../src/engine/balance';
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
}

export function auditLives(game: Game, lives: number): AuditResult {
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
  };
  const { problems, collisions, counts, fights } = res;
  const byId = new Map(game.events.map((e) => [e.id, e]));
  const mustEvents = game.events.filter((e) => e.must);

  for (let seed = 1; seed <= lives; seed++) {
    let l = newLife(seed);
    const r = new Rng(seed * 7919 + 13);
    const inLife = new Map<string, number>();
    const couldMust = new Set<string>();
    const style: FightStyle = seed % 2 ? 'random' : 'reads';
    // ชีวิตเลข 0 กับ 1 ในทุกสี่ชีวิตเข้าร้านและใช้ของ (อ่านเกมหนึ่ง กดสุ่มหนึ่ง) อีกสองชีวิตไม่แตะของ
    const gearLife = seed % 4 < 2 ? newGearLife() : null;
    let shoppedYear = -Infinity;
    let fought = 0;
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
      for (const e of open) if (!pool.includes(e) && !tooShort(e)) bump(problems, `${e.id}: เข้าเงื่อนไขแต่ไม่มีตัวเลือกให้กด`);

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

        const c = choices[r.int(0, choices.length - 1)]!;
        l = resolveChoice(game, l, ev.id, c.id).life;
        did = `${ev.id}/${c.id}`;
        fxs = [c.effects, c.success?.effects, c.failure?.effects];
      }

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
      for (const p of l.people) {
        if (p.alive && personHumanAge(p, l) > 125) bump(problems, `คนรอบตัวอายุเกิน 125 ปีแบบมนุษย์แล้วยังอยู่ (${p.kin ?? p.bond ?? 'คนรู้จัก'})`);
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
    fights.perLife.push(fought);
  }

  res.overlap = measureOverlap(res.finals);
  return res;
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
  for (const k of ['gods', 'demon', 'star'] as const) {
    const xs = full.map((l) => l.world[k]);
    out.push(`- คะแนนโลก ${k}: กลาง ${median(xs)} ช่วง ${Math.min(...xs)}–${Math.max(...xs)}`);
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

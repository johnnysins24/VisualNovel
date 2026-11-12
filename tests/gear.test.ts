import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, checkModifier, endOfYear, makeGame, pickEvent, requiresMet, winterModifier } from '../src/engine/engine';
import { moveOdds, openMoves, resolveMove, techniqueOf } from '../src/engine/encounter';
import { effectiveStats, equip, unequip, maxHp } from '../src/engine/items';
import { addItem, buy, buyBlock, fightSupplies, itemBudget, sell, sellPrice, shelfOf, shopsHere, supplyCount, useSupply } from '../src/engine/gear';
import { ENCOUNTER, GEAR, STAR_MARKS_TRAIT } from '../src/engine/balance';
import { newLife, type LifeState } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับตรวจกติกาของ: ของสวมใส่ ของใช้แล้วหมด ร้าน และศัตรูสามฝ่าย
const gear = (id: string, slot: string, extra: object = {}) => ({ id, name: id, slot, price: 2, ...extra });
const raw = {
  items: [
    gear('ring_a', 'accessory', { stats: { STR: 1 } }),
    gear('ring_b', 'cloak', { rarity: 'uncommon', price: 5, stats: { STR: 2 } }),
    gear('ring_c', 'head', { rarity: 'uncommon', price: 5, stats: { STR: 2 } }),
    gear('lens_a', 'hands', { passive: { description: 'x', effect: { kind: 'check_bonus', stat: 'INT', amount: 1 } } }),
    gear('lens_b', 'feet', { passive: { description: 'x', effect: { kind: 'check_bonus', stat: 'INT', amount: 1 } } }),
    gear('lens_c', 'legs', { passive: { description: 'x', effect: { kind: 'check_bonus', stat: 'INT', amount: 1 } } }),
    gear('charm', 'accessory', { rarity: 'uncommon', price: 5, passive: { description: 'x', effect: { kind: 'max_hp', amount: 4 } } }),
    { id: 'charm_b', name: 'charm_b', slot: 'legs', rarity: 'uncommon', passive: { description: 'x', effect: { kind: 'max_hp', amount: 4 } } },
    gear('spear', 'weapon', { tags: ['pierce'], stats: { STR: 1 } }),
    gear('silver_knife', 'weapon', { pattern: 'dagger', material: 'star_silver', stats: { DEX: 1 } }),
    gear('coal_knife', 'weapon', { pattern: 'dagger', material: 'demon_coal', stats: { DEX: 1 } }),
    gear('cold_ring', 'accessory', { pattern: 'ring', material: 'cold_iron', stats: { CON: 1 } }),
    gear('iron_coat', 'body', { pattern: 'mail', material: 'black_iron', passive: { description: 'x', effect: { kind: 'armor', amount: 1 } } }),
    gear('wool', 'cloak', { passive: { description: 'x', effect: { kind: 'winter', amount: 1 } } }),
    gear('wand', 'offhand', {
      rarity: 'enchanted', price: 30, stats: { INT: 2 }, caveat: 'x', needs: { min_reputation: { royal_institute: 2 } }, needs_text: 'x',
      toll: { max_hp: -1 }, passive: { description: 'x', effect: { kind: 'check_bonus', stat: 'WIS', amount: 1 } }, also: { description: 'x', effect: { kind: 'max_hp', amount: 2 } },
    }),
    { id: 'heirloom', name: 'heirloom', slot: 'accessory', stats: { CHA: 1 } },
    { id: 'oil', name: 'oil', price: 1, tags: ['fire'], use: { text: 'x' } },
    { id: 'water', name: 'water', price: 1, tags: ['water'], use: { text: 'x' } },
    { id: 'bandage', name: 'bandage', price: 1, tags: ['medicine'], use: { heal: 3, text: 'x' } },
    { id: 'smoke', name: 'smoke', price: 1, use: { boost: { kinds: ['flee'], amount: 2 }, text: 'x' } },
    { id: 'rope', name: 'rope', price: 1, tags: ['rope'], use: { text: 'x' } },
  ],
  traits: [
    { id: 'wound_knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['x'] },
    { id: 'curse_brand', name: 'ตรา', kind: 'curse', how: 'x', gives: ['x'], cures: ['a', 'b'], live_with: 'x' },
    { id: 'boon_lamp', name: 'พร', kind: 'boon', how: 'x', breaks: 'x' },
    {
      id: STAR_MARKS_TRAIT, name: 'รอยดาว', kind: 'curse', how: 'x', cures: ['a', 'b'], live_with: 'x',
      steps: [{ gives: ['x'], costs: ['x'], effects: [] }, { gives: ['x'], costs: ['x'], effects: [{ kind: 'max_hp', amount: -1 }] }, { gives: ['x'], costs: ['x'], effects: [{ kind: 'max_hp', amount: -3 }] }],
    },
  ],
  foes: [
    { id: 'imp', name: 'ภูต', side: 'demon', threat: 2, morale: 3, weak: ['pierce', 'water'], strong: ['fire'], magic: true, lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'], loot: [{ item: 'ring_a', chance: 1, text: 'เจอแหวนใน{foe}' }, { gold: 2, chance: 1 }] },
    { id: 'eye', name: 'ตา', side: 'star', threat: 2, morale: 3, weak: ['fire'], lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'], loot: [{ item: 'oil', chance: 1 }] },
  ],
  shops: [
    { id: 'stall', name: 'แผง', location: 'ventras', greet: ['a', 'b'], staples: ['bandage', 'oil'], stock: ['rope', 'ring_a', 'ring_b', 'ring_c', 'lens_a', 'lens_b', 'lens_c', 'charm', 'spear', 'wand', 'wool', 'water', 'smoke'] },
    { id: 'elf', name: 'เอลฟ์', location: 'ileth', greet: ['a'], staples: ['silver_knife', 'coal_knife', 'cold_ring', 'iron_coat'], requires: { flag: 'race_elf' }, closed: 'x' },
  ],
  events: [
    ...(['imp', 'eye'] as const).map((foe) => ({
      id: `adult.${foe}`, stage: 'adult', once: false, text: 'x', ...(foe === 'eye' ? { when: { not_traits: ['curse_brand'] } } : {}),
      encounter: {
        foe,
        beats: [1, 2, 3].map((n) => ({ text: `${n}`, moves: [{ id: `hit${n}`, label: 'hit', kind: 'attack' }, { id: `hold${n}`, label: 'hold', kind: 'guard' }, { id: `say${n}`, label: 'say', kind: 'talk' }, { id: `run${n}`, label: 'run', kind: 'flee' }] })),
        win: { text: 'ชนะ' }, lose: { text: 'แพ้' }, stalemate: { text: 'ยัน' }, flee: { text: 'หนี' }, death: { text: 'ตาย' },
      },
    })),
    {
      id: 'adult.plain', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'elf', label: 'x', effects: { flags: ['race_elf'], location_tag: 'ileth' } },
        { id: 'city', label: 'x', effects: { location_tag: 'ventras', items: ['heirloom'] } },
        { id: 'lamp', label: 'x', text: 'x', requires: { has_tag: 'medicine' } },
        { id: 'fine', label: 'x', text: 'x', requires: { wears_rarity: 'uncommon' } },
        { id: 'iron', label: 'x', text: 'x', requires: { not_wears: ['black_iron'] } },
        { id: 'needs_oil', label: 'x', text: 'x', requires: { item: 'oil' } },
        { id: 'gift', label: 'x', effects: { items: ['charm_b'] } },
      ],
    },
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const item = (id: string) => game.items.get(id)!;

const base = (patch: Partial<LifeState> = {}): LifeState => ({ ...newLife(1), age: 30, hp: 10, baseMaxHp: 10, gold: 20, locationTag: 'ventras', namesApplied: true, ...patch });
/** ชีวิตที่มีของเหล่านี้และสวมทุกชิ้นที่สวมได้ */
const wearing = (ids: string[], patch: Partial<LifeState> = {}): LifeState =>
  ids.reduce((l, id) => equip({ ...l, inventory: [...l.inventory, id] }, item(id), game.items), base(patch));
function rolls(...want: number[]): number {
  for (let s = 1; s < 5_000_000; s++) {
    const r = Rng.fromState(s);
    if (want.every((w) => r.d20() === w)) return s;
  }
  throw new Error('หาสถานะสุ่มไม่เจอ');
}
const fight = (life: LifeState, foe: 'imp' | 'eye') => pickEvent(game, life, `adult.${foe}`).life;
const odds = (life: LifeState, moveId: string, armed = false, supply?: string) => {
  const e = game.events.find((x) => x.id === life.currentEventId)!;
  return moveOdds(game, life, e, openMoves(game, life, e).find((m) => m.id === moveId)!, armed, supply);
};
const play = (life: LifeState, moveId: string, d20: number | number[], supply?: string) => resolveMove(game, { ...life, rngState: rolls(...[d20].flat()) }, moveId, false, supply);
const part = (life: LifeState, moveId: string, kind: string, supply?: string) => odds(life, moveId, false, supply).parts.find((p) => p.kind === kind);

describe('gear numbers', () => {
  it('the test content passes the linter', () => expect(lintContent(content)).toEqual([]));

  it('gear adds at most +3 to one stat, +2 to one kind of roll and +6 to max HP', () => {
    const strong = wearing(['ring_a', 'ring_b', 'ring_c']);
    expect(effectiveStats(strong, game.items).STR).toBe(10 + GEAR.statCap);
    const sharp = wearing(['lens_a', 'lens_b', 'lens_c']);
    expect(checkModifier(game, sharp, { stat: 'INT', dc: 10 })).toBe(GEAR.checkCap);
    expect(maxHp(wearing(['charm']), game.items)).toBe(10 + 4);
    expect(maxHp(wearing(['charm', 'charm_b', 'wand']), game.items)).toBe(10 + GEAR.hpCap);
  });

  it('budget counts stats, roll bonuses, hit points, armour, shields and rerolls', () => {
    expect(itemBudget(item('ring_b'))).toBe(2);
    expect(itemBudget(item('charm'))).toBe(2);
    expect(itemBudget(item('wand'))).toBe(4);
    expect(itemBudget(item('oil'))).toBe(0);
  });

  it('the linter catches gear outside its tier, without a source, or sold for the wrong price', () => {
    const bad = ContentSchema.parse({
      ...raw,
      items: [
        ...raw.items,
        { id: 'too_good', name: 'x', slot: 'weapon', stats: { STR: 2 } },
        { id: 'too_cheap', name: 'x', slot: 'weapon', rarity: 'rare', price: 3, stats: { STR: 1 } },
        { id: 'plain_magic', name: 'x', slot: 'weapon', rarity: 'enchanted', price: 30, stats: { STR: 3 } },
        { id: 'dud', name: 'x', price: 1, use: { text: 'x' } },
        { id: 'no_mat', name: 'x', slot: 'weapon', pattern: 'dagger' },
      ],
      shops: [...raw.shops, { id: 'bad', name: 'x', location: 'nowhere', greet: ['x'], staples: ['heirloom', 'ghost', 'too_cheap', 'plain_magic', 'dud'] }],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('items/too_good: ใช้งบ 2 แต้ม เกินงบ');
    expect(p).toContain('items/too_good: ไม่มีทางได้มา');
    expect(p).toContain('items/too_cheap: ใช้งบ 1 แต้ม น้อยกว่างบ');
    expect(p).toContain('items/too_cheap: ราคา 3 อยู่นอกช่วง');
    expect(p).toContain('items/plain_magic: ของอาบเวทต้องมีข้อแม้');
    expect(p).toContain('items/plain_magic: ของอาบเวทที่ร้านขายต้องแลกด้วยอย่างอื่น');
    expect(p).toContain('items/dud: ของใช้แล้วหมดต้องมีผล');
    expect(p).toContain('items/no_mat: ของที่มีแบบ');
    expect(p).toContain('shops/bad: ไม่มีเหตุการณ์ไหนพาไปถิ่น "nowhere"');
    expect(p).toContain('shops/bad: "heirloom" ไม่มีราคา');
    expect(p).toContain('shops/bad: ไม่มีของ "ghost"');
  });
});

describe('wearing and carrying', () => {
  it('taking off the thing that keeps the body alive is refused', () => {
    const frail = wearing(['charm'], { baseMaxHp: -2, hp: 2 });
    expect(unequip(frail, 'charm', game.items)).toBe(frail);
    expect(equip({ ...frail, inventory: ['charm', 'ring_a'] }, item('ring_a'), game.items).equipped.accessory).toBe('charm');
    const well = wearing(['charm'], { hp: 14 });
    expect(unequip(well, 'charm', game.items)).toMatchObject({ equipped: {}, hp: 10 });
  });

  it('consumables stack up to the limit, count for requires.item, and gear stays one of a kind', () => {
    let l = base();
    for (let i = 0; i < GEAR.stack + 2; i++) l = applyEffects(game, l, { items: ['oil', 'ring_a'] });
    expect(supplyCount(l, 'oil')).toBe(GEAR.stack);
    expect(l.inventory).toEqual(['ring_a']);
    const plain = game.events.find((e) => e.id === 'adult.plain')!;
    const open = (life: LifeState, id: string) => requiresMet(game, life, plain.choices.find((c) => c.id === id)!.requires);
    expect(open(l, 'needs_oil')).toBe(true);
    expect(open(base(), 'needs_oil')).toBe(false);
  });

  it('events can ask for a tag, a material or a tier of what is worn', () => {
    const plain = game.events.find((e) => e.id === 'adult.plain')!;
    const open = (life: LifeState, id: string) => requiresMet(game, life, plain.choices.find((c) => c.id === id)!.requires);
    expect(open(base(), 'lamp')).toBe(false);
    expect(open(addItem(game, base(), 'bandage'), 'lamp')).toBe(true);
    expect(open(wearing(['ring_a']), 'fine')).toBe(false);
    expect(open(wearing(['ring_b']), 'fine')).toBe(true);
    expect(open(wearing(['iron_coat']), 'iron')).toBe(false);
    // ของที่อยู่ในกระเป๋าแต่ไม่ได้สวมไม่นับว่าสวม
    expect(open(base({ inventory: ['iron_coat'] }), 'iron')).toBe(true);
  });

  it('a bandage heals outside a fight, only when hurt, and is used up', () => {
    const hurt = addItem(game, base({ hp: 8 }), 'bandage');
    const used = useSupply(game, hurt, 'bandage')!;
    expect(used).toMatchObject({ healed: 2, life: { hp: 10, supplies: {} } });
    expect(useSupply(game, addItem(game, base(), 'bandage'), 'bandage')).toBeNull();
    expect(useSupply(game, addItem(game, base({ hp: 5 }), 'oil'), 'oil')).toBeNull();
  });

  it('warm clothes help the winter roll; a ring that adds toughness helps checks but not the winter', () => {
    expect(winterModifier(game, wearing(['wool'])) - winterModifier(game, base())).toBe(1);
    const odd = { stats: { ...newLife(1).stats, CON: 11 } };
    const con = { stat: 'CON' as const, dc: 10 };
    expect(checkModifier(game, wearing(['cold_ring'], odd), con) - checkModifier(game, base(odd), con)).toBe(1);
    expect(winterModifier(game, wearing(['cold_ring'], odd))).toBe(winterModifier(game, base(odd)));
  });
});

describe('gear in a fight', () => {
  it('a weapon tag hits the weak point only once the weakness is known', () => {
    const blind = fight(wearing(['spear']), 'imp');
    expect(part(blind, 'hit1', 'weak')).toBeUndefined();
    const knows = fight(wearing(['spear'], { flags: ['knows_imp'] }), 'imp');
    expect(part(knows, 'hit1', 'weak')).toEqual({ kind: 'weak', amount: ENCOUNTER.weak, by: 'spear' });
    // ป้ายของอาวุธไม่ช่วยการตั้งรับหรือการพูด
    expect(part(knows, 'hold1', 'weak')).toBeUndefined();
    expect(part(knows, 'say1', 'weak')).toBeUndefined();
  });

  it('star silver bites the demon side, demon coal the star side, cold iron anything uncanny', () => {
    expect(part(fight(wearing(['silver_knife']), 'imp'), 'hit1', 'edge')).toEqual({ kind: 'edge', amount: GEAR.edge, by: 'silver_knife' });
    expect(part(fight(wearing(['silver_knife']), 'eye'), 'hit1', 'edge')).toBeUndefined();
    expect(part(fight(wearing(['coal_knife']), 'eye'), 'hold1', 'edge')?.by).toBe('coal_knife');
    expect(part(fight(wearing(['cold_ring']), 'imp'), 'hit1', 'edge')?.by).toBe('cold_ring');
    expect(part(fight(wearing(['cold_ring']), 'eye'), 'hit1', 'edge')).toBeUndefined();
    // ไม่ทบกันหลายชิ้น และไม่ช่วยตอนพูดหรือหนี
    const both = fight(wearing(['silver_knife', 'cold_ring']), 'imp');
    expect(odds(both, 'hit1').parts.filter((p) => p.kind === 'edge')).toHaveLength(1);
    expect(part(both, 'say1', 'edge')).toBeUndefined();
    expect(part(both, 'run1', 'edge')).toBeUndefined();
  });

  it('black iron armour takes a point off every hit and makes running harder', () => {
    const clad = fight(wearing(['iron_coat']), 'imp');
    expect(part(clad, 'run1', 'heavy')).toEqual({ kind: 'heavy', amount: -GEAR.heavyFlee, by: 'iron_coat' });
    expect(play(clad, 'hit1', 2).record.damage).toBe(ENCOUNTER.damage[1]! - 1);
  });

  it('cold iron shuts off the spell and the prayer, and no new boon takes hold', () => {
    const mage = fight(wearing(['cold_ring'], { classId: 'wizard' }), 'eye');
    expect(techniqueOf(mage, game)).toMatchObject({ ready: false, why: 'cold_iron' });
    expect(odds(mage, 'hit1', true).tech).toBe(false);
    expect(techniqueOf(fight(base({ classId: 'wizard' }), 'eye'), game).ready).toBe(true);
    expect(applyEffects(game, wearing(['cold_ring']), { traits: ['boon_lamp'] }).traits).toEqual([]);
    expect(applyEffects(game, base(), { traits: ['boon_lamp'] }).traits).toEqual(['boon_lamp']);
  });

  it('a thrown thing that fits the weakness scores in full, shows the weakness, and is used up', () => {
    const l = fight(addItem(game, addItem(game, base(), 'water'), 'water'), 'imp');
    expect(part(l, 'hit1', 'supply', 'water')).toEqual({ kind: 'supply', amount: ENCOUNTER.weak, by: 'water' });
    const r = play(l, 'hit1', 2, 'water');
    expect(r.record).toMatchObject({ supply: 'water', success: false });
    expect(supplyCount(r.life, 'water')).toBe(1);
    expect(r.life.encounter).toMatchObject({ weakKnown: true, learned: 0 });
  });

  it('a thrown thing the foe shrugs off gives nothing and stays in the bag; anything else is a small help', () => {
    const l = fight(addItem(game, base(), 'oil'), 'imp');
    expect(part(l, 'hit1', 'supply', 'oil')).toBeUndefined();
    expect(supplyCount(play(l, 'hit1', 15, 'oil').life, 'oil')).toBe(1);
    const e = fight(addItem(game, base(), 'water'), 'eye');
    expect(part(e, 'hit1', 'supply', 'water')?.amount).toBe(GEAR.thrown);
    // ป้ายใช้กับการพูดและการหนีไม่ได้ ของจึงไม่ถูกใช้ไป
    expect(part(e, 'say1', 'supply', 'water')).toBeUndefined();
    expect(supplyCount(play(e, 'say1', 15, 'water').life, 'water')).toBe(1);
  });

  it('a weak point is counted once, however many things hit it', () => {
    const l = fight(addItem(game, wearing(['spear'], { flags: ['knows_imp'] }), 'water'), 'imp');
    const weak = odds(l, 'hit1', false, 'water').parts.filter((p) => p.kind === 'weak' || p.kind === 'supply').reduce((n, p) => n + p.amount, 0);
    expect(weak).toBe(ENCOUNTER.weak);
  });

  it('smoke helps only the escape, and a bandage can be used mid-fight', () => {
    const l = fight(addItem(game, addItem(game, base({ hp: 6 }), 'smoke'), 'bandage'), 'imp');
    expect(part(l, 'run1', 'supply', 'smoke')?.amount).toBe(2);
    expect(part(l, 'hit1', 'supply', 'smoke')).toBeUndefined();
    const r = play(l, 'hit1', 15, 'bandage');
    expect(r.record).toMatchObject({ supply: 'bandage', healed: 3, success: true });
    expect(r.life.hp).toBe(9);
    expect(supplyCount(r.life, 'bandage')).toBe(0);
  });

  it('a beaten foe leaves the first thing on its table that the character can still take', () => {
    const win = (life: LifeState) => {
      let l = fight(life, 'imp');
      for (const m of ['hit1', 'hit2', 'hit3']) {
        const r = play(l, m, 15);
        l = r.life;
        if (r.done) return r;
      }
      throw new Error('การปะทะไม่จบ');
    };
    const first = win(base({ gold: 0 }));
    expect(first.entry?.encounter).toMatchObject({ end: 'win', loot: { item: 'ring_a' } });
    expect(first.life.inventory).toEqual(['ring_a']);
    expect(first.entry?.text).toContain('เจอแหวนในภูต');
    expect(first.entry?.changes?.items).toEqual(['ring_a']);
    // มีแหวนอยู่แล้ว: ได้เหรียญแทน
    const second = win(base({ gold: 0, inventory: ['ring_a'] }));
    expect(second.entry?.encounter?.loot).toEqual({ gold: 2 });
    expect(second.life.gold).toBe(2);
  });
});

describe('gear changes and the order of the bag', () => {
  it('nothing is put on or taken off in the middle of a fight', () => {
    const calm = wearing(['spear'], { inventory: ['spear', 'silver_knife'] });
    const mid = fight(calm, 'imp');
    expect(mid.encounter).toBeTruthy();
    expect(equip(mid, item('silver_knife'), game.items)).toBe(mid);
    expect(unequip(mid, 'spear', game.items)).toBe(mid);
    expect(equip(calm, item('silver_knife'), game.items).equipped.weapon).toBe('silver_knife');
  });

  it('using one of a stack leaves the rest where they were', () => {
    const l = base({ hp: 4, supplies: { oil: 1, bandage: 2, smoke: 1 } });
    expect(Object.keys(useSupply(game, l, 'bandage')!.life.supplies)).toEqual(['oil', 'bandage', 'smoke']);
    expect(Object.keys(useSupply(game, { ...l, supplies: { oil: 1, bandage: 1, smoke: 1 } }, 'bandage')!.life.supplies)).toEqual(['oil', 'smoke']);
  });

  it('a thing that only events ask for is carried but not offered in a fight', () => {
    const l = fight(base({ supplies: { rope: 1, oil: 1, bandage: 1, smoke: 1 } }), 'imp');
    expect(fightSupplies(game, l).map((s) => s.item.id)).toEqual(['oil', 'bandage', 'smoke']);
    expect(requiresMet(game, l, { item: 'rope' })).toBe(true);
  });
});

describe('shops', () => {
  const stall = game.shops[0]!;
  it('a shop is where it is, and children do not shop', () => {
    expect(shopsHere(game, base()).map((s) => s.id)).toEqual(['stall']);
    expect(shopsHere(game, base({ locationTag: 'hordun' }))).toEqual([]);
    expect(shopsHere(game, base({ age: GEAR.shopAge - 1 }))).toEqual([]);
  });

  it('the shelf holds the staples and a few rotating things, the same all year, different next year', () => {
    const now = shelfOf(game, base(), stall).map((i) => i.id);
    expect(now.slice(0, 2)).toEqual(['bandage', 'oil']);
    expect(now).toHaveLength(2 + GEAR.shelf);
    expect(shelfOf(game, base({ gold: 3, hp: 4 }), stall).map((i) => i.id)).toEqual(now);
    const years = new Set(Array.from({ length: 6 }, (_, k) => shelfOf(game, base({ age: 30 + k }), stall).map((i) => i.id).join()));
    expect(years.size).toBeGreaterThan(3);
  });

  it('buying takes the price, gives the thing, and refuses for the right reason', () => {
    const shelf = (l: LifeState) => shelfOf(game, l, stall);
    const l = base({ gold: 3 });
    const got = buy(game, l, 'stall', 'bandage');
    expect(got).toMatchObject({ gold: 2, supplies: { bandage: 1 } });
    expect(buyBlock(game, base({ gold: 0 }), stall, item('bandage'))).toBe('gold');
    expect(buyBlock(game, base({ supplies: { bandage: GEAR.stack } }), stall, item('bandage'))).toBe('full');
    expect(buyBlock(game, base({ inventory: ['ring_a'] }), stall, item('ring_a'))).toBe('owned');
    expect(buyBlock(game, base({ gold: 99 }), stall, item('wand'))).toBe('needs');
    // ของที่ไม่อยู่บนแผงปีนี้ซื้อไม่ได้
    const off = stall.stock.find((id) => !shelf(l).some((i) => i.id === id))!;
    expect(buy(game, base({ gold: 99 }), 'stall', off).gold).toBe(99);
  });

  it('an enchanted thing costs more than coin', () => {
    let year = 0;
    while (!shelfOf(game, base({ age: 30 + year }), stall).some((i) => i.id === 'wand')) year++;
    const l = base({ age: 30 + year, gold: 40, reputation: { royal_institute: 2 } });
    expect(buy(game, l, 'stall', 'wand')).toMatchObject({ gold: 10, baseMaxHp: 9, inventory: ['wand'] });
  });

  it('a shop that does not sell to strangers stays shut, and nothing sells without a shop', () => {
    const elf = game.shops[1]!;
    const stranger = base({ locationTag: 'ileth', inventory: ['ring_a'] });
    expect(buyBlock(game, stranger, elf, item('silver_knife'))).toBe('closed');
    expect(buy(game, stranger, 'elf', 'silver_knife')).toBe(stranger);
    expect(sell(game, stranger, 'ring_a')).toBe(stranger);
    expect(buy(game, { ...stranger, flags: ['race_elf'] }, 'elf', 'silver_knife').inventory).toContain('silver_knife');
  });

  it('selling pays back part of the price, takes the thing off first, and story things are not for sale', () => {
    expect(sellPrice(item('ring_b'))).toBe(Math.floor(5 * GEAR.sellShare));
    expect(sellPrice(item('oil'))).toBe(1);
    expect(sellPrice(item('heirloom'))).toBeNull();
    const l = wearing(['ring_b', 'heirloom'], { gold: 0 });
    expect(sell(game, l, 'ring_b')).toMatchObject({ gold: 2, inventory: ['heirloom'], equipped: { accessory: 'heirloom' } });
    expect(sell(game, l, 'heirloom')).toBe(l);
    const frail = wearing(['charm'], { baseMaxHp: -2, hp: 2 });
    expect(sell(game, frail, 'charm')).toBe(frail);
  });
});

describe('what a material costs', () => {
  const year = (life: LifeState, n: number) => {
    let l = life;
    for (let i = 0; i < n; i++) l = { ...endOfYear(game, l, new Rng(7 + i), {}), age: l.age + 1 };
    return l;
  };

  it('star silver worn for years leaves star marks, then they deepen', () => {
    const { first, every } = GEAR.starSilver;
    const l = wearing(['silver_knife']);
    expect(year(l, first - 1).traits).toEqual([]);
    const marked = year(l, first);
    expect(marked.traits).toEqual([STAR_MARKS_TRAIT]);
    expect(year(l, first + every - 1).traitSteps[STAR_MARKS_TRAIT] ?? 1).toBe(1);
    const deeper = year(l, first + every);
    expect(deeper.traitSteps[STAR_MARKS_TRAIT]).toBe(2);
    expect(deeper.baseMaxHp).toBe(9);
    // ในกระเป๋าไม่นับ และคนมีตราร้อนไม่ติดรอยดาว
    expect(year(base({ inventory: ['silver_knife'] }), first + 2).traits).toEqual([]);
    expect(year(wearing(['silver_knife'], { traits: ['curse_brand'] }), first + 2).traits).toEqual(['curse_brand']);
  });

  it('the year a mark appears is written in the year record', () => {
    const rec: { marks?: string[] } = {};
    endOfYear(game, wearing(['silver_knife'], { worn: { star_silver: GEAR.starSilver.first - 1 } }), new Rng(3), rec);
    expect(rec.marks).toEqual([STAR_MARKS_TRAIT]);
  });

  it('demon coal draws the demon lord a little closer every year, and the church notices', () => {
    const { demon, church } = GEAR.demonCoal;
    const l = year(wearing(['coal_knife']), church);
    expect(l.world.demon).toBe(demon * church);
    expect(l.reputation.lamp_church).toBe(-1);
    expect(year(wearing(['coal_knife']), church - 1).reputation.lamp_church ?? 0).toBe(0);
  });

  it('worn demon coal stops moving the world once it has given its share', () => {
    const { demon, demonMax } = GEAR.demonCoal;
    const years = Math.floor(demonMax / demon);
    expect(year(wearing(['coal_knife']), years).world.demon).toBe(years * demon);
    expect(year(wearing(['coal_knife']), years + 9).world.demon).toBe(years * demon);
  });
});

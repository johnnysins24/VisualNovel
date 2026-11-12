import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, eligible, endOfYear, makeGame, markLevel, pickEvent, requiresMet, resolveChoice } from '../src/engine/engine';
import { equip } from '../src/engine/items';
import { ERAS, GEAR, MARKS, MARK_MAX, eraOf } from '../src/engine/balance';
import { newLife, type LifeState } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับกติกาของชุด 5: มาตรรอยดาวกับตราร้อน ฉากถูกเรียก และยุคของโลก
const step = (n: number) => ({ gives: ['x'], costs: ['x'], effects: [{ kind: 'max_hp', amount: -n }] });
const curse = (id: string) => ({ id, name: id, kind: 'curse', how: 'x', cures: ['a', 'b'], live_with: 'x' });
const raw = {
  items: [{ id: 'coal_knife', name: 'มีดถ่าน', slot: 'weapon', price: 2, pattern: 'dagger', material: 'demon_coal', stats: { DEX: 1 } }],
  traits: [
    { ...curse('curse_star_marks'), steps: [step(0), step(1), step(3)] },
    { ...curse('curse_brand'), steps: [step(0), step(0), step(2)] },
    { ...curse('curse_glass'), gives: ['x'] },
  ],
  lines: { gear_coal_brand: ['x'], gear_coal_church: ['x'] },
  foes: [],
  events: [
    {
      id: 'adult.start', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'listen', label: 'x', requires: { not_traits: ['curse_brand'] }, effects: { marks: { star: 1 } } },
        { id: 'deal', label: 'x', requires: { not_traits: ['curse_star_marks'] }, effects: { marks: { brand: 1 } } },
        { id: 'deep', label: 'x', requires: { marks: { star: [2, 3] } }, text: 'x' },
        { id: 'clean', label: 'x', requires: { marks: { star: [0, 0], brand: [0, 0] } }, effects: { items: ['coal_knife'] } },
      ],
    },
    {
      id: 'adult.star_called', stage: 'adult', must: true, once: false, when: { flags: ['star_called'] }, text: 'x',
      choices: [
        { id: 'go', label: 'x', effects: { die: 'taken' } },
        { id: 'stay', label: 'x', effects: { marks: { star: -1 }, clear_flags: ['star_called'], max_hp: -1 } },
      ],
    },
    { id: 'adult.marked_only', stage: 'adult', once: false, when: { marks: { brand: [2, 3] } }, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice', 'taken'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const base = (extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(11), age: 40, hp: 10, baseMaxHp: 10, ...extra });
const up = (l: LifeState, id: 'star' | 'brand', n = 1) => applyEffects(game, l, { marks: { [id]: n } });
const event = (id: string) => game.events.find((e) => e.id === id)!;

describe('the two marks: star marks and the hot brand', () => {
  it('a mark is gained at step one, deepens one step at a time and stops at the last step', () => {
    let l = up(base(), 'star');
    expect(l.traits).toEqual(['curse_star_marks']);
    expect(markLevel(l, 'star')).toBe(1);
    l = up(l, 'star');
    expect(markLevel(l, 'star')).toBe(2);
    expect(l.baseMaxHp).toBe(9);
    l = up(l, 'star');
    expect(markLevel(l, 'star')).toBe(MARK_MAX);
    expect(l.baseMaxHp).toBe(7);
    expect(l.flags).not.toContain(MARKS.star.called);
  });

  it('pushing past the last step calls the character, and the mark stays at the last step', () => {
    const l = up(up(base(), 'star', 3), 'star');
    expect(markLevel(l, 'star')).toBe(MARK_MAX);
    expect(l.flags).toContain(MARKS.star.called);
    // ดันทีเดียวหลายขั้นก็ถูกเรียกเมื่อเกินขั้นสุดท้าย
    expect(up(base(), 'brand', 4).flags).toContain(MARKS.brand.called);
  });

  it('the two marks never sit in the same person', () => {
    const branded = up(base(), 'brand');
    expect(up(branded, 'star').traits).toEqual(['curse_brand']);
    const starred = up(base(), 'star');
    expect(up(starred, 'brand').traits).toEqual(['curse_star_marks']);
    // ทางตรงผ่าน traits ก็ไม่ติด และคำสาปของผู้อยู่นอกฟ้าไม่ติดคนมีตราร้อน
    expect(applyEffects(game, branded, { traits: ['curse_star_marks', 'curse_glass'] }).traits).toEqual(['curse_brand']);
    expect(applyEffects(game, starred, { traits: ['curse_brand', 'curse_glass'] }).traits).toEqual(['curse_star_marks', 'curse_glass']);
  });

  it('a mark fades step by step and falls off below step one, except a brand someone was born with', () => {
    let l = up(base(), 'star', 2);
    l = up(l, 'star', -1);
    expect(markLevel(l, 'star')).toBe(1);
    expect(l.baseMaxHp).toBe(10);
    l = up(l, 'star', -1);
    expect(l.traits).toEqual([]);
    expect(l.traitSteps).toEqual({});
    const born = up(base({ flags: ['race_tiefling'], traits: ['curse_brand'] }), 'brand', -3);
    expect(markLevel(born, 'brand')).toBe(1);
    expect(markLevel(up(up(base(), 'brand'), 'brand', -1), 'brand')).toBe(0);
  });

  it('events and choices can ask how deep a mark is', () => {
    const deep = event('adult.start').choices.find((c) => c.id === 'deep')!;
    const clean = event('adult.start').choices.find((c) => c.id === 'clean')!;
    expect(requiresMet(game, base(), deep.requires)).toBe(false);
    expect(requiresMet(game, base(), clean.requires)).toBe(true);
    const two = up(base(), 'star', 2);
    expect(requiresMet(game, two, deep.requires)).toBe(true);
    expect(requiresMet(game, two, clean.requires)).toBe(false);
    expect(eligible(game, base(), event('adult.marked_only'))).toBe(false);
    expect(eligible(game, up(base(), 'brand', 2), event('adult.marked_only'))).toBe(true);
  });

  it('the calling scene comes at once, and comes again after a second call', () => {
    const called = up(base(), 'star', 4);
    const picked = pickEvent(game, called);
    expect(picked.event?.id).toBe('adult.star_called');
    const stayed = resolveChoice(game, picked.life, 'adult.star_called', 'stay').life;
    expect(stayed.flags).not.toContain(MARKS.star.called);
    expect(markLevel(stayed, 'star')).toBe(2);
    expect(pickEvent(game, stayed).event?.id).toBe('adult.start');
    // ถูกเรียกอีกครั้งหลังรอยลึกกลับขึ้นไป
    expect(pickEvent(game, up(stayed, 'star', 2)).event?.id).toBe('adult.star_called');
  });

  it('following the call ends the life as taken', () => {
    const picked = pickEvent(game, up(base(), 'star', 4));
    const gone = resolveChoice(game, picked.life, 'adult.star_called', 'go').life;
    expect(gone.dying).toBe('taken');
    expect(pickEvent(game, gone).event?.id).toBe('death.any');
  });

  it('demon coal worn for years deepens a brand that is already there, up to the last step and no further', () => {
    const { first, every } = GEAR.demonCoal.brand;
    const year = (life: LifeState, n: number) => {
      let l = life;
      for (let i = 0; i < n; i++) l = { ...endOfYear(game, l, new Rng(7 + i), {}), age: l.age + 1 };
      return l;
    };
    const wearing = (extra: Partial<LifeState> = {}) => equip(base({ inventory: ['coal_knife'], ...extra }), game.items.get('coal_knife')!, game.items);
    const branded = wearing({ traits: ['curse_brand'] });
    expect(markLevel(year(branded, first - 1), 'brand')).toBe(1);
    expect(markLevel(year(branded, first), 'brand')).toBe(2);
    expect(markLevel(year(branded, first + every), 'brand')).toBe(3);
    const late = year(branded, first + every * 3);
    expect(markLevel(late, 'brand')).toBe(MARK_MAX);
    expect(late.flags).not.toContain(MARKS.brand.called);
    // คนไม่มีตราไม่ได้ตราจากของ
    expect(year(wearing(), first + every).traits).toEqual([]);
  });
});

describe('the story linter and the marks', () => {
  const withEvent = (ev: object) => lintContent(ContentSchema.parse({ ...raw, events: [...raw.events, ev] }));
  it('accepts the test content', () => {
    expect(lintContent(content)).toEqual([]);
  });
  it('a choice that deepens one mark must be closed to holders of the other', () => {
    const problems = withEvent({ id: 'adult.open_jar', stage: 'adult', text: 'x', choices: [{ id: 'touch', label: 'x', effects: { traits: ['curse_glass'] } }, { id: 'sign', label: 'x', effects: { marks: { brand: 1 } } }] });
    expect(problems.filter((p) => p.includes('มาตร'))).toHaveLength(2);
  });
  it('a calling scene that can leave the call standing would come back every year', () => {
    const problems = withEvent({ id: 'adult.brand_called', stage: 'adult', must: true, once: false, when: { flags: ['brand_called'] }, text: 'x', choices: [{ id: 'go', label: 'x', effects: { die: 'taken' } }, { id: 'wait', label: 'x', text: 'x' }] });
    expect(problems.some((p) => p.includes('adult.brand_called') && p.includes('once: false'))).toBe(true);
  });
});

describe('eras of the world', () => {
  it('every year of the written story falls in one era', () => {
    expect(eraOf(312).id).toBe('starlight');
    expect(eraOf(339).id).toBe('starlight');
    expect(eraOf(340).id).toBe('quickening');
    expect(eraOf(379).id).toBe('quickening');
    expect(eraOf(380).id).toBe('two_perils');
    for (let i = 1; i < ERAS.length; i++) expect(ERAS[i]!.from).toBe(ERAS[i - 1]!.to + 1);
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../scripts/content';
import { lintContent } from '../src/engine/lint';
import { applyEffects, choiceAvailable, eligible, makeGame, resolveChoice, settle } from '../src/engine/engine';
import { newLife } from '../src/engine/state';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { alignmentCell, bucket, clericDrifted, godDistance, hasDemonMark, situationalBonus } from '../src/engine/rules';
import { paragraphs, render } from '../src/engine/text';
import { commitLife, newMeta } from '../src/engine/meta';
import { migrate } from '../src/engine/save';
import {
  ALIGN_CAP,
  CLASSES,
  CLASS_IDS,
  CLERIC_DRIFT_FLAG,
  CLERIC_WIS_BONUS,
  DEMON_MARK_BONUS,
  GODS,
  GOD_IDS,
  RACES,
  REPUTATION_CAP,
  WORLD_CAP,
} from '../src/engine/balance';
import { maxHp } from '../src/engine/items';

const game = makeGame(loadContent('tests/fixtures/content'));
const withFlags = (flags: string[]) => settle(game, applyEffects(game, newLife(1), { flags }), new Rng(1));

describe('birth: gender, year, names', () => {
  it('gender and birth year come from the seed', () => {
    expect(newLife(77).gender).toBe(newLife(77).gender);
    expect(newLife(77).birthYear).toBe(newLife(77).birthYear);
    for (let s = 0; s < 200; s++) {
      const l = newLife(s);
      expect(l.birthYear).toBeGreaterThanOrEqual(270);
      expect(l.birthYear).toBeLessThanOrEqual(300);
    }
    const genders = new Set(Array.from({ length: 50 }, (_, s) => newLife(s).gender));
    expect(genders).toEqual(new Set(['m', 'f']));
  });
  it('when.year checks birth_year + age', () => {
    const ev = game.events.find((e) => e.id === 'youth.test_hound')!;
    const base = { ...newLife(1), age: 20, flags: [] as string[] };
    expect(eligible({ ...base, birthYear: 250 }, ev)).toBe(false); // ปี 270 ยังไม่ถึง 280
    expect(eligible({ ...base, birthYear: 270 }, ev)).toBe(true); // ปี 290
    expect(eligible({ ...base, birthYear: 270, age: 10 }, ev)).toBe(false); // อายุยังไม่ถึง
  });
});

describe('templating', () => {
  const m = { ...newLife(1), gender: 'm' as const, name: 'กา', parents: { father: 'พ่อกา', mother: 'แม่กา' } };
  it('fills name, parents and gendered words', () => {
    expect(render('{name} มอง{เขา|เธอ} {father} {mother}', m)).toBe('กา มองเขา พ่อกา แม่กา');
    expect(render('{เขา|เธอ}', { ...m, gender: 'f' })).toBe('เธอ');
  });
  it('falls back before race (parents unknown) and leaves unknown keys', () => {
    expect(render('{father} {mother}', newLife(1))).toBe('พ่อ แม่');
    expect(render('{zzz}', m)).toBe('{zzz}');
  });
  it('splits paragraphs on blank lines', () => {
    expect(paragraphs('ก\nต่อ\n\nข\n\n\nค')).toEqual(['ก\nต่อ', 'ข', 'ค']);
  });
});

describe('race and class', () => {
  it('race flag gives SRD bonus once, parents and a name from the pool', () => {
    const l = withFlags(['race_elf']);
    expect(l.stats.DEX).toBe(12);
    expect(l.parents).not.toBeNull();
    expect(l.name).toBe('[ทดสอบ]จ'.replace('จ', l.gender === 'm' ? 'จ' : 'ฉ'));
    const again = settle(game, l, new Rng(2));
    expect(again.stats.DEX).toBe(12);
    expect(again).toEqual(l);
  });
  it('human gets +1 to everything; tiefling gets demon mark', () => {
    expect(Object.values(withFlags(['race_human']).stats)).toEqual([11, 11, 11, 11, 11, 11]);
    const t = withFlags(['race_tiefling']);
    expect(t.stats.CHA).toBe(12);
    expect(hasDemonMark(t)).toBe(true);
    expect(hasDemonMark(withFlags(['race_human']))).toBe(false);
  });
  it('race without a name pool keeps the default name and generic parents', () => {
    const l = withFlags(['race_dwarf']);
    expect(l.stats.CON).toBe(12);
    expect(l.parents).toBeNull();
    expect(render('{father}', l)).toBe('พ่อ');
  });
  it('class gives stats and hp once and ignores a second class', () => {
    let l = applyEffects(game, newLife(1), { class: 'warrior' });
    expect(l.stats.STR).toBe(12);
    expect(l.stats.CON).toBe(11);
    expect(l.baseMaxHp).toBe(14);
    expect(maxHp(l, game.items)).toBe(16); // +2 นักรบ
    l = applyEffects(game, l, { class: 'wizard' });
    expect(l.classId).toBe('warrior');
    expect(l.stats.INT).toBe(10);
  });
  it('every class has distinct primary and secondary stat', () => {
    for (const id of CLASS_IDS) expect(CLASSES[id].primary).not.toBe(CLASSES[id].secondary);
  });
  it('ranger is stronger at home than away', () => {
    let l = applyEffects(game, newLife(1), { class: 'ranger', location_tag: 'forest' });
    const home = situationalBonus(l, 'DEX');
    l = applyEffects(game, l, { location_tag: 'mine' });
    expect(home).toBeGreaterThan(situationalBonus(l, 'DEX'));
  });
});

describe('alignment and cleric', () => {
  it('buckets scores into 3 cells', () => {
    expect([bucket(-10), bucket(-3), bucket(-2), bucket(0), bucket(2), bucket(3)]).toEqual([-1, -1, 0, 0, 0, 1]);
  });
  it('god distance counts diagonal as one step', () => {
    const l = applyEffects(game, newLife(1), { alignment: { law: 5, moral: 5 } }); // ระเบียบ ดี = เวรัส
    expect(godDistance(l, 'verus')).toBe(0);
    expect(godDistance(l, 'isel')).toBe(1);
    expect(godDistance(l, 'ossa')).toBe(1);
    expect(godDistance(l, 'talis')).toBe(2);
    expect(godDistance(l, 'belek')).toBe(2);
  });
  it('cleric loses power past one step, flag follows, and recovers', () => {
    const start = { ...newLife(1), age: 17 };
    let l = settle(game, applyEffects(game, start, { class: 'cleric', god: 'verus', alignment: { law: 4, moral: 4 } }), new Rng(1));
    expect(clericDrifted(l)).toBe(false);
    expect(situationalBonus(l, 'WIS')).toBe(CLERIC_WIS_BONUS);
    l = settle(game, applyEffects(game, l, { alignment: { law: -8, moral: -8 } }), new Rng(1));
    expect(clericDrifted(l)).toBe(true);
    expect(l.flags).toContain(CLERIC_DRIFT_FLAG);
    expect(situationalBonus(l, 'WIS')).toBe(0);
    const drifted = game.events.find((e) => e.id === 'youth.test_drifted')!;
    expect(eligible(l, drifted)).toBe(true);
    l = settle(game, applyEffects(game, l, { alignment: { law: 10, moral: 10 } }), new Rng(1));
    expect(l.flags).not.toContain(CLERIC_DRIFT_FLAG);
  });
  it('non clerics never drift', () => {
    const l = applyEffects(game, newLife(1), { god: 'verus', alignment: { law: -10, moral: -10 } });
    expect(clericDrifted(l)).toBe(false);
  });
  it('scores are capped', () => {
    const l = applyEffects(game, newLife(1), { alignment: { law: 99, moral: -99 }, world: { gods: 99, demon: -99 } });
    expect(l.alignment).toEqual({ law: ALIGN_CAP, moral: -ALIGN_CAP });
    expect(l.world.gods).toBe(WORLD_CAP);
    expect(l.world.demon).toBe(-WORLD_CAP);
  });
  it('god grid values stay on the 3x3 grid', () => {
    for (const id of GOD_IDS) for (const v of [GODS[id].law, GODS[id].moral]) expect([-1, 0, 1]).toContain(v);
    expect(alignmentCell(newLife(1))).toEqual({ law: 0, moral: 0 });
  });
});

describe('world scores, demon mark, reputation', () => {
  it('when.world and requires.world gate content', () => {
    const l = applyEffects(game, newLife(1), { world: { demon: 5 } });
    const c = ContentSchema.parse({
      items: [],
      events: [{ id: 'youth.w', stage: 'youth', when: { world: { demon: [3, 10] } }, text: 't', choices: [{ id: 'a', label: 'a', requires: { world: { star: [1, 9] } }, effects: { gold: 1 } }] }],
    });
    const ev = c.events[0]!;
    expect(eligible(l, ev)).toBe(true);
    expect(eligible(newLife(1), ev)).toBe(false);
    expect(choiceAvailable(l, ev.choices[0]!)).toBe(false);
  });
  it('demon mark helps against demon and star foes only, silently', () => {
    const t = withFlags(['race_tiefling']);
    expect(situationalBonus(t, 'STR', 'demon')).toBe(DEMON_MARK_BONUS.demon);
    expect(situationalBonus(t, 'STR', 'star')).toBe(DEMON_MARK_BONUS.star);
    expect(situationalBonus(t, 'STR', 'nature')).toBe(0);
    expect(situationalBonus(t, 'STR')).toBe(0);
    expect(situationalBonus(withFlags(['race_human']), 'STR', 'demon')).toBe(0);
  });
  it('a check roll uses the demon mark bonus', () => {
    const t = { ...withFlags(['race_tiefling']), age: 20, currentEventId: 'youth.test_hound' };
    const { entry } = resolveChoice(game, t, 'youth.test_hound', 'fight');
    expect(entry.roll!.mod).toBe(0 + DEMON_MARK_BONUS.demon); // STR 10 -> mod 0
  });
  it('reputation is capped, gates content and carries across lives', () => {
    let l = applyEffects(game, newLife(1), { reputation: { belek_bank: -99, wardens: 4 } });
    expect(l.reputation.belek_bank).toBe(-REPUTATION_CAP);
    const ev = ContentSchema.parse({
      items: [],
      events: [{ id: 'youth.r', stage: 'youth', when: { min_reputation: { wardens: 3 }, max_reputation: { belek_bank: -5 } }, text: 't', choices: [{ id: 'a', label: 'a', text: 'x' }] }],
    }).events[0]!;
    expect(eligible(l, ev)).toBe(true);
    const meta = commitLife(newMeta(), { ...l, alive: false });
    expect(meta.lives).toBe(1);
    const next = newLife(2, meta);
    expect(next.reputation).toEqual({ belek_bank: -REPUTATION_CAP, wardens: 4 });
    l = applyEffects(game, next, { reputation: { wardens: -4 } });
    expect(commitLife(meta, l).reputation).toEqual({ belek_bank: -REPUTATION_CAP });
    expect(commitLife(meta, l).lives).toBe(2);
  });
});

describe('choice text', () => {
  it('shows text for a plain choice and joins it with a check outcome', () => {
    const c = ContentSchema.parse({
      items: [],
      events: [
        { id: 'youth.t', stage: 'youth', text: 't', choices: [
          { id: 'plain', label: 'a', text: 'ผลลัพธ์' },
          { id: 'roll', label: 'b', text: 'ก่อน', check: { stat: 'STR', dc: 1 }, success: { text: 'หลัง' }, failure: { text: 'หลัง' } },
        ] },
      ],
    });
    const g = makeGame(c);
    expect(resolveChoice(g, newLife(1), 'youth.t', 'plain').entry.text).toBe('ผลลัพธ์');
    expect(resolveChoice(g, newLife(1), 'youth.t', 'roll').entry.text).toBe('ก่อน\n\nหลัง');
  });
});

describe('save migration', () => {
  it('upgrades a v1 save with defaults from its seed', () => {
    const v1 = { ...newLife(5), version: 1, gold: 9 } as Record<string, unknown>;
    for (const k of ['gender', 'birthYear', 'world', 'alignment', 'reputation', 'parents', 'classId', 'god', 'homeTag', 'raceApplied']) delete v1[k];
    const l = migrate(v1);
    expect(l.version).toBe(2);
    expect(l.gold).toBe(9);
    expect(l.world).toEqual({ gods: 0, demon: 0, star: 0 });
    expect(l.birthYear).toBe(newLife(5).birthYear);
  });
  it('rejects junk', () => expect(() => migrate({ seed: 1, version: 9 })).toThrow());
});

describe('linter for new fields', () => {
  it('flags unknown placeholders, bad race flags and duplicate name pools', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [{ id: 'youth.x', stage: 'youth', text: 'สวัสดี {nmae}', choices: [{ id: 'a', label: '{a|b|c}', effects: { flags: ['race_gnome'] } }] }],
      names: [{ race: 'orc', male: ['x'] }, { race: 'orc', male: ['y'] }],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('{nmae}');
    expect(p).toContain('{a|b|c}');
    expect(p).toContain('race_gnome');
    expect(p).toContain('id กลุ่มชื่อซ้ำ');
  });
  it('fixtures lint clean', () => expect(lintContent(loadContent('tests/fixtures/content'))).toEqual([]));
  it('race table covers all four races', () => expect(Object.keys(RACES).sort()).toEqual(['dwarf', 'elf', 'human', 'tiefling']));
});

describe('name pools', () => {
  const born = (fx: Record<string, unknown>, gender: 'm' | 'f' = 'm') =>
    settle(game, applyEffects(game, { ...newLife(1), gender }, fx as never), new Rng(3));
  it('name_pool overrides the race default, and parents none keeps the fallback', () => {
    const l = born({ flags: ['race_tiefling'], name_pool: { self: 'temple_foundling', parents: 'none' } });
    expect(l.name).toBe('[ทดสอบ]ฝนเช้า');
    expect(l.parents).toBeNull();
    expect(render('{father}', l)).toBe('พ่อ');
    expect(l.stats.CHA).toBe(12); // โบนัสทีฟลิ่งยังใช้ตามเผ่า
    expect(born({ flags: ['race_tiefling'], name_pool: { self: 'temple_foundling', parents: 'none' } }, 'f').name).toBe('[ทดสอบ]ระฆังสาม');
  });
  it('surname comes from the self pool and parents from the parents pool', () => {
    const l = born({ flags: ['race_human'], name_pool: { self: 'noble_human', parents: 'noble_human' } });
    expect(l.surname).toBe('[ทดสอบ]คอร์ดิส');
    expect(l.parents?.father).toBe('[ทดสอบ]ม');
    expect(render('{name} {surname}', l)).toContain('คอร์ดิส');
    expect(render('{surname}', newLife(1))).toBe('');
  });
  it('names are drawn once only', () => {
    const l = born({ flags: ['race_human'] });
    const again = settle(game, applyEffects(game, l, { name_pool: { self: 'temple_foundling' } }), new Rng(9));
    expect(again.name).toBe(l.name);
  });
  it('linter checks pool ids', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [{ id: 'youth.n', stage: 'youth', text: '{surname}', choices: [{ id: 'a', label: 'a', effects: { name_pool: { self: 'ghost', parents: 'none' } } }, { id: 'b', label: 'b', effects: { name_pool: { self: 'none' } } }] }],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('ghost');
    expect(p).toContain('self ใช้ none ไม่ได้');
    expect(p).not.toContain('{surname}');
  });
});

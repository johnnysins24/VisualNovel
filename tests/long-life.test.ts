// กติกาของชุด 1 "รากของชีวิตยาว": ร่างกายโรย เช็คฤดูหนาว ฉากตาย ตัวแสดง คนรอบตัวแก่และจากไป ลูกมีชื่อ
// สิ่งติดตัว (ทะเบียน ขั้น นิสัย ของใหญ่ กันตาย) เหตุการณ์ที่เล่าหลายปี เหตุการณ์สำรอง และการย้ายเซฟรุ่นเก่า
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  applyEffects,
  caredFor,
  choiceAvailable,
  eligible,
  endOfYear,
  makeGame,
  pickEvent,
  playable,
  repairLife,
  resolveChoice,
  settle,
  spanOf,
  traitBlock,
  winterDc,
  winterFrom,
  winterModifier,
  type Game,
} from '../src/engine/engine';
import { lintContent } from '../src/engine/lint';
import { bindCast, estimateBorn, isClose, livingChildren, passingChance, personHumanAge, personYears, yearlyPassings } from '../src/engine/people';
import { migrate } from '../src/engine/save';
import { ContentSchema } from '../src/engine/schema';
import { newLife, worldYear, type LifeState, type Person, type YearEnd } from '../src/engine/state';
import { render } from '../src/engine/text';
import { bigCount, countHabit, habitBlockers, traitCheckBonuses, traitLines, traitStep } from '../src/engine/traits';
import { maxHp } from '../src/engine/items';
import { BIG_TRAITS_MAX, DECLINE, HABIT_COUNT, HABIT_SHARE, HABIT_TRAITS_MAX, NPC_DEATH, STORY_END_YEAR, THIN_POOL, WINTER } from '../src/engine/balance';

type Raw = Record<string, unknown>;
const ev = (id: string, extra: Raw = {}): Raw => ({ id, stage: 'adult', text: id, choices: [{ id: 'ok', label: 'ok', text: 'x' }], ...extra });
const death = (id: string, causes: string[], extra: Raw = {}): Raw => ({
  id,
  stage: 'death',
  when: { dying: causes },
  text: id,
  choices: [{ id: 'go', label: 'go', text: 'ลา', effects: { epitaph: '{name} จากไป' } }],
  ...extra,
});
const names = [{ race: 'human', male: ['ทอเบล', 'เดรัน', 'ฮาริค', 'โอเรน', 'เบริค', 'ซาเวล'], female: ['คอเดีย', 'มาริส', 'เวสลิน', 'เอดา', 'โรเสน', 'ทีรา'] }];
const gameOf = (events: Raw[], more: Raw = {}): Game => makeGame(ContentSchema.parse({ events, items: [], names, ...more }));
const at = (age: number, n = 1, extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(1), age, rngState: new Rng(n).state, ...extra });
const person = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, closeness: 0, alive: true, metAge: 0, ...extra });
/** หยิบเหตุการณ์ (ผูกตัวแสดง) แล้วเลือก */
const play = (game: Game, life: LifeState, id: string, choice = 'ok') => resolveChoice(game, pickEvent(game, life, id).life, id, choice);

describe('physical decline from 50', () => {
  const game = gameOf([ev('adult.year', { once: false })]);
  const yearEnd = (life: LifeState, n: number) => {
    const rec: YearEnd = {};
    return { life: endOfYear(game, life, new Rng(n), rec), rec };
  };
  it('never touches anyone younger than 50', () => {
    for (let n = 1; n <= 300; n++) expect(yearEnd(at(49, n), n).rec.decline).toBeUndefined();
  });
  it('wears down strength and speed only, one point at a time, at about the stated chance', () => {
    let hits = 0;
    const runs = 4000;
    for (let n = 1; n <= runs; n++) {
      const { life, rec } = yearEnd(at(70, n, { baseMaxHp: 40, hp: 40, stats: { ...newLife(1).stats, CON: 30 } }), n);
      for (const s of rec.decline ?? []) {
        expect(DECLINE.stats).toContain(s);
        hits++;
      }
      expect(life.stats.INT).toBe(10);
      expect(life.stats.WIS).toBe(10);
      expect(life.stats.CHA).toBe(10);
      expect(life.stats.CON).toBe(30);
      expect(10 - life.stats.STR).toBe((rec.decline ?? []).filter((s) => s === 'STR').length);
    }
    const want = DECLINE.base + DECLINE.perYear * 20;
    expect(Math.abs(hits / (runs * 2) - want)).toBeLessThan(0.03);
  });
  it(`stops at ${DECLINE.floor}`, () => {
    const weak = { ...newLife(1).stats, STR: DECLINE.floor, DEX: DECLINE.floor };
    for (let n = 1; n <= 300; n++) expect(yearEnd(at(95, n, { stats: weak, baseMaxHp: 99, hp: 99 }), n).rec.decline).toBeUndefined();
  });
  it('is ten times rarer per year for an elf of the same body age', () => {
    let human = 0;
    let elf = 0;
    for (let n = 1; n <= 6000; n++) {
      human += yearEnd(at(60, n), n).rec.decline?.length ?? 0;
      elf += yearEnd(at(240, n, { raceApplied: 'elf' }), n).rec.decline?.length ?? 0; // เทียบมนุษย์ 60
    }
    expect(elf).toBeGreaterThan(0);
    expect(human / elf).toBeGreaterThan(6);
    expect(human / elf).toBeLessThan(16);
  });
});

describe('winter check from 65', () => {
  const game = gameOf([ev('adult.year', { once: false }), death('death.age', ['age'])]);
  const old = (age: number, n: number, extra: Partial<LifeState> = {}) => at(age, n, { baseMaxHp: 12, hp: 12, ...extra });
  it('starts at 65 (70 for a tiefling): one harder every three years, every eight from 83, every two from 100', () => {
    expect(winterFrom(at(1))).toBe(WINTER.from);
    expect(winterFrom(at(1, 1, { raceApplied: 'tiefling' }))).toBe(70);
    expect([65, 67, 68, 80, 83, 90, 91, 99, 100, 101, 102, 107, 115].map((h) => winterDc(at(1), h))).toEqual([8, 8, 9, 13, 14, 14, 15, 16, 16, 16, 17, 19, 23]);
    // ทีฟลิ่งเริ่มช้ากว่าห้าปี เส้นเดียวกันเลื่อนไปทั้งเส้น
    expect([70, 88, 96, 104, 105, 107].map((h) => winterDc(at(1, 1, { raceApplied: 'tiefling' }), h))).toEqual([8, 14, 15, 16, 16, 17]);
    for (let n = 1; n <= 200; n++) {
      expect(resolveChoice(game, old(63, n), 'adult.year', 'ok').entry.year?.winter).toBeUndefined();
      expect(resolveChoice(game, old(65, n), 'adult.year', 'ok').entry.year?.winter).toBeDefined();
      expect(resolveChoice(game, old(69, n, { raceApplied: 'tiefling' }), 'adult.year', 'ok').entry.year?.winter).toBeUndefined();
    }
  });
  it('a failed check takes max HP for good; the roll follows the d20 rules', () => {
    let fails = 0;
    for (let n = 1; n <= 2000; n++) {
      const before = old(85, n);
      const { life, entry } = resolveChoice(game, before, 'adult.year', 'ok');
      const w = entry.year!.winter!;
      expect(w.dc).toBe(14);
      expect(w.mod).toBe(0);
      expect(w.success).toBe(w.d20 === 20 || (w.d20 !== 1 && w.d20 + w.mod >= w.dc));
      expect(life.baseMaxHp).toBe(before.baseMaxHp - w.lost);
      expect(w.lost).toBe(w.success ? 0 : WINTER.loss);
      expect(life.hp).toBeLessThanOrEqual(maxHp(life, game.items));
      if (!w.success) fails++;
    }
    expect(Math.abs(fails / 2000 - 13 / 20)).toBeLessThan(0.04);
  });
  it('the last winter: max HP runs out, time stops, the death scene comes, then the life ends of old age', () => {
    let seen = 0;
    for (let n = 1; n <= 400 && seen < 25; n++) {
      const res = resolveChoice(game, old(90, n, { baseMaxHp: 2, hp: 2 }), 'adult.year', 'ok');
      if (res.entry.year!.winter!.success) continue;
      seen++;
      const l = res.life;
      expect(l).toMatchObject({ dying: 'age', alive: true, age: 90, hp: 0 });
      const next = pickEvent(game, l);
      expect(next.event?.id).toBe('death.age');
      const end = resolveChoice(game, next.life, 'death.age', 'go').life;
      expect(end).toMatchObject({ alive: false, endReason: 'death', deathCause: 'age', dying: null, age: 90 });
      expect(end.epitaph).toBe(`${l.name} จากไป`);
    }
    expect(seen).toBe(25);
  });
  it('someone to look after you is worth +1: a living spouse or grown child who is close', () => {
    const spouse = person('partner', { kin: 'spouse', closeness: 3 });
    const kid = (born: number, closeness = 3) => person('child_1', { kin: 'child', closeness, born });
    const l = old(70, 1);
    expect(caredFor(l)).toBe(false);
    expect(caredFor({ ...l, people: [spouse] })).toBe(true);
    expect(caredFor({ ...l, people: [{ ...spouse, alive: false }] })).toBe(false);
    expect(caredFor({ ...l, people: [{ ...spouse, closeness: 1 }] })).toBe(false);
    expect(caredFor({ ...l, people: [kid(worldYear(l) - 30)] })).toBe(true);
    expect(caredFor({ ...l, people: [kid(worldYear(l) - 5)] })).toBe(false);
    expect(winterModifier(game, { ...l, people: [spouse] })).toBe(winterModifier(game, l) + WINTER.care);
  });
  it('toughness counts', () => {
    expect(winterModifier(game, old(70, 1, { stats: { ...newLife(1).stats, CON: 16 } }))).toBe(3);
    expect(winterModifier(game, old(70, 1, { stats: { ...newLife(1).stats, CON: 6 } }))).toBe(-2);
  });
});

describe('dying and death scenes', () => {
  const events = [
    ev('adult.risk', {
      once: false,
      choices: [
        { id: 'hurt', label: 'h', effects: { hp: -99 } },
        { id: 'give', label: 'g', effects: { die: 'sacrifice' } },
        { id: 'duel', label: 'd', check: { stat: 'STR', dc: 30, foe: 'human' }, success: { text: 'w' }, failure: { effects: { hp: -99 } } },
        { id: 'safe', label: 's', text: 'x' },
      ],
    }),
    death('death.wound', ['wound']),
    death('death.blade', ['fight']),
    death('death.gift', ['sacrifice']),
    death('death.bed', ['age']),
  ];
  const game = gameOf(events);
  it.each([
    ['hurt', 'wound', 'death.wound'],
    ['give', 'sacrifice', 'death.gift'],
    ['duel', 'fight', 'death.blade'],
  ])('%s leads to the %s scene, and the choice in it ends the life', (choice, cause, scene) => {
    // หาเมล็ดที่ทอยไม่ได้ 20 (ทอย 20 ผ่านเสมอ)
    let n = 1;
    while (new Rng(n).d20() === 20) n++;
    const l = resolveChoice(game, at(30, n), 'adult.risk', choice).life;
    expect(l).toMatchObject({ alive: true, dying: cause, age: 30, hp: l.hp });
    // ตอนกำลังจะตาย ออกได้แต่ฉากตายของเหตุนั้น
    const open = game.events.filter((e) => playable(game, l, e)).map((e) => e.id);
    expect(open).toEqual([scene]);
    const picked = pickEvent(game, l);
    const end = resolveChoice(game, picked.life, scene, 'go');
    expect(end.life).toMatchObject({ alive: false, endReason: 'death', deathCause: cause, dying: null, age: 30 });
    expect(end.life.log.at(-1)!.eventId).toBe(scene);
    expect(end.entry.year).toBeUndefined();
  });
  it('death scenes never come up for the living', () => {
    for (let n = 1; n <= 200; n++) expect(pickEvent(game, at(30, n)).event?.id).toBe('adult.risk');
    expect(eligible(game, at(30), game.events[1]!)).toBe(false);
  });
  it('a death scene with a condition waits for it, and the fallback scene covers the rest', () => {
    const g = gameOf([events[0]!, death('death.with_kin', ['wound'], { weight: 1000, when: { dying: ['wound'], flags: ['married'] } }), death('death.alone', ['wound'])]);
    const dying = (flags: string[]) => resolveChoice(g, at(30, 2, { flags }), 'adult.risk', 'hurt').life;
    for (let n = 1; n <= 30; n++) expect(pickEvent(g, { ...dying([]), rngState: new Rng(n).state }).event?.id).toBe('death.alone');
    const withKin = new Set(Array.from({ length: 60 }, (_, n) => pickEvent(g, { ...dying(['married']), rngState: new Rng(n + 1).state }).event?.id));
    expect(withKin.has('death.with_kin')).toBe(true);
  });
  it('with no scene to show, the life ends on the spot', () => {
    const g = gameOf([events[0]!]);
    const end = resolveChoice(g, at(30), 'adult.risk', 'hurt').life;
    expect(end).toMatchObject({ alive: false, endReason: 'death', deathCause: 'wound', dying: null, hp: 0 });
  });
  it('no year passes and nothing heals between the blow and the death scene', () => {
    const l = resolveChoice(game, at(30, 3, { baseMaxHp: 20, hp: 5 }), 'adult.risk', 'hurt').life;
    expect(l.hp).toBe(0);
    expect(l.age).toBe(30);
  });
  it('the linter wants a scene that can always play for every cause, and keeps epitaphs in death scenes', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [
        death('death.only_wound', ['wound']),
        death('death.gated', ['age'], { when: { dying: ['age'], flags: ['married'] } }),
        ev('adult.wrong', { when: { dying: ['wound'] } }),
        ev('adult.epitaph', { choices: [{ id: 'a', label: 'a', effects: { epitaph: 'x', flags: ['married'] } }] }),
      ],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('เหตุ "age" ที่ยังไม่ได้เล่าความตาย (told: false) ไม่มีฉากที่ออกได้เสมอ');
    expect(p).toContain('เหตุ "fight" ที่ยังไม่ได้เล่าความตาย (told: false) ไม่มีฉากที่ออกได้เสมอ');
    expect(p).toContain('เหตุ "sacrifice" ที่เล่าความตายไปแล้ว (told: true) ไม่มีฉากที่ออกได้เสมอ');
    // ฉากที่ไม่ระบุ told ใช้ได้ทั้งสองแบบ
    expect(p).not.toContain('เหตุ "wound"');
    expect(p).toContain('adult.wrong: ฉากตาย (stage: death) ต้องคู่กับ when.dying เสมอ');
    expect(p).toContain('adult.epitaph/a: epitaph ใช้ได้เฉพาะในฉากตาย');
  });
  it('the linter wants every way out of a death scene to leave a mark and a last line, unless the character lives', () => {
    const scene = (id: string, choices: Raw[], extra: Raw = {}) => ({ id, stage: 'death', when: { dying: ['wound', 'fight', 'sacrifice', 'age'] }, text: id, choices, ...extra });
    const p = lintContent(
      ContentSchema.parse({
        items: [],
        events: [
          scene('death.bare', [{ id: 'go', label: 'go' }]),
          scene('death.marked', [{ id: 'go', label: 'go', effects: { epitaph: 'x' } }, { id: 'stay', label: 'stay', effects: { survive: true, max_hp: 4 } }], { mark: 'จากไป' }),
          scene('death.rolled', [{ id: 'try', label: 'try', check: { stat: 'CON', dc: 10 }, success: { effects: { survive: true } }, failure: { effects: { mark: 'ไม่ไหว' } } }]),
        ],
      }),
    ).join('\n');
    expect(p).toContain('death.bare/go: ฉากตายต้องมี mark');
    expect(p).toContain('death.bare/go: ฉากตายต้องมี epitaph');
    expect(p).not.toContain('death.marked');
    expect(p).not.toContain('death.rolled/try: ฉากตายต้องมี mark');
    expect(p).toContain('death.rolled/try: ฉากตายต้องมี epitaph');
  });
});

describe('cast: events about the people in this life', () => {
  const friend = person('rowen', { name: 'โรวีน', gender: 'f', bond: 'friend', closeness: 4, born: 285 });
  const rival = person('kedra', { name: 'เคดรา', gender: 'f', bond: 'rival', closeness: -3, born: 284 });
  const mentor = person('garven', { name: 'การ์เวน', gender: 'm', bond: 'mentor', closeness: 2, born: 250 });
  const visit = ev('adult.visit', {
    cast: { who: { bond: ['friend'] }, other: { bond: ['rival'], optional: true } },
    text: '{who} มาหา {who:เขา|เธอ}ยืนอยู่หน้าประตู',
    mark: 'ลา{who}',
    choices: [
      { id: 'ok', label: 'คุยกับ{who}', text: '{who}ยิ้ม', effects: { people: [{ id: '@who', closeness: 1 }] } },
      { id: 'both', label: 'เรียก{other}มาด้วย', requires: { cast: ['other'] }, text: '{other}มา', effects: { people: [{ id: '@other', closeness: 1 }] } },
      { id: 'bury', label: 'ฝัง', effects: { people: [{ id: '@who', dies: true }] } },
    ],
  });
  const game = gameOf([visit, ev('adult.other', { weight: 1 })]);
  const base = at(30, 1, { birthYear: 291, people: [friend, mentor] });

  it('an event needs someone for every required role', () => {
    expect(eligible(game, base, game.events[0]!)).toBe(true);
    expect(eligible(game, at(30), game.events[0]!)).toBe(false);
    expect(eligible(game, at(30, 1, { people: [{ ...friend, alive: false }] }), game.events[0]!)).toBe(false);
    expect(bindCast(base, game.events[0]!)).toEqual({ who: 'rowen' });
    expect(bindCast({ ...base, people: [friend, rival] }, game.events[0]!)).toEqual({ who: 'rowen', other: 'kedra' });
  });
  it('picking the event binds the cast, text and effects use it, and the log keeps it', () => {
    const picked = pickEvent(game, base, 'adult.visit');
    expect(picked.life.cast).toEqual({ who: 'rowen' });
    expect(render(visit.text as string, picked.life)).toBe('โรวีน มาหา เธอยืนอยู่หน้าประตู');
    const { life, entry } = resolveChoice(game, picked.life, 'adult.visit', 'ok');
    expect(life.people.find((p) => p.id === 'rowen')!.closeness).toBe(5);
    expect(entry.cast).toEqual({ who: 'rowen' });
    expect(entry.mark).toBe('ลาโรวีน');
    expect(life.cast).toEqual({});
    expect(render(entry.text!, life, entry.cast)).toBe('โรวีนยิ้ม');
  });
  it('a choice that needs an optional role hides when nobody plays it', () => {
    const alone = pickEvent(game, base, 'adult.visit').life;
    const both = pickEvent(game, { ...base, people: [friend, rival] }, 'adult.visit').life;
    const choice = game.events[0]!.choices[1]!;
    expect(choiceAvailable(game, alone, choice, game.events[0]!)).toBe(false);
    expect(choiceAvailable(game, both, choice, game.events[0]!)).toBe(true);
    expect(resolveChoice(game, both, 'adult.visit', 'both').life.people.find((p) => p.id === 'kedra')!.closeness).toBe(-2);
  });
  it('one person plays one role only', () => {
    const g = gameOf([ev('adult.two', { cast: { a: { bond: ['friend'] }, b: { bond: ['friend'] } }, text: '{a} {b}' })]);
    expect(bindCast(base, g.events[0]!)).toBeNull();
    const second = person('doran', { bond: 'friend', closeness: 1 });
    expect(bindCast({ ...base, people: [friend, second] }, g.events[0]!)).toEqual({ a: 'rowen', b: 'doran' });
  });
  it('picks the closest by default, the most hated for a negative role, or by age', () => {
    const pool = [friend, person('ilsa', { bond: 'friend', closeness: 2, born: 270 }), person('pim', { bond: 'friend', closeness: 1, born: 299 })];
    const l = { ...base, people: pool };
    const cast = (spec: Raw) => bindCast(l, ContentSchema.parse({ items: [], events: [ev('adult.c', { cast: { who: spec }, text: '{who}' })] }).events[0]!);
    expect(cast({ bond: ['friend'] })).toEqual({ who: 'rowen' });
    expect(cast({ bond: ['friend'], pick: 'eldest' })).toEqual({ who: 'ilsa' });
    expect(cast({ bond: ['friend'], pick: 'youngest' })).toEqual({ who: 'pim' });
    expect(cast({ bond: ['friend'], max_closeness: 2 })).toEqual({ who: 'ilsa' });
    expect(cast({ bond: ['friend'], min_age: 50 })).toEqual({ who: 'ilsa' }); // เกิดปี 270 อายุ 51 ในปี 321
    expect(cast({ bond: ['friend'], max_age: 30 })).toEqual({ who: 'pim' });
    expect(cast({ id: 'pim' })).toEqual({ who: 'pim' });
    expect(cast({ bond: ['friend'], min_closeness: 5 })).toBeNull();
    const foes = { ...base, people: [rival, person('vex', { bond: 'rival', closeness: -5 })] };
    const hated = ContentSchema.parse({ items: [], events: [ev('adult.h', { cast: { who: { bond: ['rival'], max_closeness: -1 } }, text: '{who}' })] }).events[0]!;
    expect(bindCast(foes, hated)).toEqual({ who: 'vex' });
  });
  it('a role for the horned child takes that child, not an older ward', () => {
    const ward = person('ward_kin', { kin: 'child', bond: 'kin', closeness: 2, born: 300 });
    const own = { ...person('child_1', { kin: 'child', bond: 'kin', closeness: 3, born: 305 }), horned: true };
    const l = { ...base, people: [ward, own] };
    const cast = (spec: Raw) => bindCast(l, ContentSchema.parse({ items: [], events: [ev('adult.c', { cast: { kid: spec }, text: '{kid}' })] }).events[0]!);
    expect(cast({ kin: ['child'], pick: 'eldest' })).toEqual({ kid: 'ward_kin' });
    expect(cast({ kin: ['child'], pick: 'eldest', horned: true })).toEqual({ kid: 'child_1' });
    expect(cast({ kin: ['child'], pick: 'youngest', horned: false })).toEqual({ kid: 'ward_kin' });
    expect(bindCast({ ...base, people: [ward] }, ContentSchema.parse({ items: [], events: [ev('adult.c', { cast: { kid: { kin: ['child'], horned: true } }, text: '{kid}' })] }).events[0]!)).toBeNull();
  });
  it('a death through a role is a real death, dated', () => {
    const { life } = play(game, base, 'adult.visit', 'bury');
    expect(life.people.find((p) => p.id === 'rowen')).toMatchObject({ alive: false, diedAge: 30 });
    expect(eligible(game, { ...life, seen: [] }, game.events[0]!)).toBe(false);
  });
  it('the linter checks roles', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [
        ev('adult.bad', {
          cast: { who: { bond: ['friend'] }, maybe: { bond: ['rival'], optional: true } },
          text: '{who} {maybe} {nobody}',
          choices: [
            { id: 'a', label: '{maybe}', text: 'x' },
            { id: 'b', label: 'b', requires: { cast: ['ghost'] }, effects: { people: [{ id: '@ghost', closeness: 1 }] } },
          ],
        }),
      ],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('{nobody}');
    expect(p).toContain('ข้อความของเหตุการณ์ใช้บท "maybe"');
    expect(p).toContain('adult.bad/a: ใช้บท "maybe"');
    expect(p).toContain('requires.cast "ghost"');
    expect(p).toContain('people "@ghost"');
  });
});

describe('text never names someone who is not there', () => {
  const game = gameOf([
    ev('adult.with_partner', { text: '{partner} นั่งอยู่ข้างเตา' }),
    ev('adult.grave', { when: { flags: ['partner_died'] }, text: 'หลุมของ{partner}' }),
    ev('adult.child', { text: '{child} วิ่งมา {c:เขา|เธอ}หัวเราะ' }),
    ev('adult.father', { text: '{father} มา' }),
    ev('adult.choice', { choices: [{ id: 'ok', label: 'ok', text: 'x' }, { id: 'ask', label: 'ถาม{mother}', text: 'x' }] }),
  ]);
  const byId = (id: string) => game.events.find((e) => e.id === id)!;
  const born = settle(game, applyEffects(game, at(25), { flags: ['race_human'] }), new Rng(4));
  const wed = settle(game, applyEffects(game, born, { partner: { gender: 'f', pool: 'human' }, flags: ['married', 'has_partner'] }), new Rng(5));

  it('partner scenes need a living partner', () => {
    expect(eligible(game, born, byId('adult.with_partner'))).toBe(false);
    expect(eligible(game, wed, byId('adult.with_partner'))).toBe(true);
    expect(eligible(game, wed, byId('adult.grave'))).toBe(false);
  });
  it('a love interest the story named beforehand keeps that name and takes the other gender', () => {
    const met = settle(game, applyEffects(game, born, { partner: { gender: 'opposite', name: 'ไวเลน' }, flags: ['has_partner'] }), new Rng(5));
    expect(met.partner).toMatchObject({ name: 'ไวเลน', gender: born.gender === 'm' ? 'f' : 'm' });
    expect(met.people.find((p) => p.id === 'partner')).toMatchObject({ name: 'ไวเลน', bond: 'love' });
  });
  it('when the partner dies the engine sets the flag, ends the marriage, and only grave scenes may name them', () => {
    const widowed = applyEffects(game, wed, { people: [{ id: 'partner', dies: true }] });
    expect(widowed.flags).toContain('partner_died');
    expect(widowed.flags).not.toContain('married');
    expect(widowed.flags).not.toContain('has_partner');
    expect(widowed.partner?.name).toBe(wed.partner!.name);
    expect(eligible(game, widowed, byId('adult.with_partner'))).toBe(false);
    expect(eligible(game, widowed, byId('adult.grave'))).toBe(true);
    // เนื้อหารุ่นเก่าที่ตั้ง flag เองก็ได้ผลเดียวกัน
    const old = applyEffects(game, wed, { flags: ['partner_died'], clear_flags: ['married'] });
    expect(old.people.find((p) => p.id === 'partner')!.alive).toBe(false);
  });
  it('a new love after a death no longer counts as the one who died', () => {
    const widowed = applyEffects(game, wed, { people: [{ id: 'partner', dies: true }] });
    const again = settle(game, applyEffects(game, widowed, { partner: { gender: 'm', pool: 'human' }, flags: ['has_partner'] }), new Rng(8));
    expect(again.flags).not.toContain('partner_died');
    expect(again.people.find((p) => p.id === 'partner_2')).toMatchObject({ name: wed.partner!.name, alive: false });
    expect(eligible(game, again, byId('adult.with_partner'))).toBe(true);
    expect(eligible(game, again, byId('adult.grave'))).toBe(false);
  });
  it('parents: gone means not named, in events and in choices', () => {
    expect(eligible(game, born, byId('adult.father'))).toBe(true);
    const orphan = applyEffects(game, born, { people: [{ id: 'father', dies: true }, { id: 'mother', dies: true }] });
    expect(orphan.flags).toEqual(expect.arrayContaining(['father_died', 'mother_died']));
    expect(eligible(game, orphan, byId('adult.father'))).toBe(false);
    const ch = byId('adult.choice');
    expect(choiceAvailable(game, born, ch.choices[1]!, ch)).toBe(true);
    expect(choiceAvailable(game, orphan, ch.choices[1]!, ch)).toBe(false);
    expect(playable(game, orphan, ch)).toBe(true);
    // ก่อนรู้เผ่า ข้อความใช้คำว่า "พ่อ" "แม่" ได้ ส่วนเด็กวิหารที่ไม่รู้จักพ่อแม่ไม่มีใครให้เอ่ยถึง
    expect(eligible(game, at(0), byId('adult.father'))).toBe(true);
    const foundling = settle(game, applyEffects(game, at(0), { flags: ['race_human'], name_pool: { parents: 'none' } }), new Rng(4));
    expect(foundling.parents).toBeNull();
    expect(eligible(game, foundling, byId('adult.father'))).toBe(false);
  });
  it('the choice that brings someone into the life may name them, and a choice may be about the dead', () => {
    const g = gameOf([
      ev('adult.meet', { choices: [{ id: 'ok', label: 'ช่วย{partner}ยกของ', text: '{partner}ยิ้ม', effects: { partner: { gender: 'f', pool: 'human' }, flags: ['has_partner'] } }] }),
      ev('adult.birth', { choices: [{ id: 'ok', label: 'อุ้ม{child}', effects: { child: {} } }] }),
      ev('adult.forty', { choices: [{ id: 'ok', label: 'ok', text: 'x' }, { id: 'cups', label: 'รินสองถ้วย', text: 'ถ้วยของ{partner}ยังอยู่', requires: { flag: 'partner_died' } }] }),
    ]);
    expect(playable(g, born, g.events[0]!)).toBe(true);
    expect(playable(g, born, g.events[1]!)).toBe(true);
    const cups = g.events[2]!.choices[1]!;
    expect(choiceAvailable(g, wed, cups, g.events[2]!)).toBe(false);
    const widowed = applyEffects(g, wed, { people: [{ id: 'partner', dies: true }] });
    expect(choiceAvailable(g, widowed, cups, g.events[2]!)).toBe(true);
  });
  it('child scenes need a living child', () => {
    expect(eligible(game, wed, byId('adult.child'))).toBe(false);
    const parent = settle(game, applyEffects(game, wed, { child: {} }), new Rng(6));
    expect(eligible(game, parent, byId('adult.child'))).toBe(true);
    const lost = applyEffects(game, parent, { people: [{ id: 'child_1', dies: true }] });
    expect(eligible(game, lost, byId('adult.child'))).toBe(false);
  });
});

describe('children are people', () => {
  const game = gameOf([
    ev('adult.birth', { once: false, choices: [{ id: 'ok', label: 'ok', effects: { child: {} } }, { id: 'girl', label: 'g', effects: { child: { gender: 'f', horned: true } } }] }),
  ]);
  const born = settle(game, applyEffects(game, at(26), { flags: ['race_human'] }), new Rng(4));
  it('a birth makes a named child with a gender, a birth year and the has_child flag', () => {
    const { life } = play(game, born, 'adult.birth');
    const kid = life.people.find((p) => p.id === 'child_1')!;
    expect(kid).toMatchObject({ kin: 'child', bond: 'kin', closeness: 3, alive: true, metAge: 26, born: born.birthYear + 26 });
    expect(['m', 'f']).toContain(kid.gender);
    expect(names[0]![kid.gender === 'm' ? 'male' : 'female']).toContain(kid.name);
    expect([born.name, born.parents!.father, born.parents!.mother]).not.toContain(kid.name);
    expect(life.flags).toContain('has_child');
    expect(life.pendingChildren).toBeUndefined();
    expect(render('{child} {c:เขา|เธอ}', life)).toBe(`${kid.name} ${kid.gender === 'm' ? 'เขา' : 'เธอ'}`);
    expect(personYears(kid, { ...life, age: 40 })).toBe(14);
  });
  it('a second child is child_2 with another name; {child} stays the eldest living', () => {
    let l = play(game, born, 'adult.birth').life;
    l = play(game, { ...l, age: 29 }, 'adult.birth', 'girl').life;
    const [a, b] = livingChildren(l);
    expect([a!.id, b!.id]).toEqual(['child_1', 'child_2']);
    expect(b).toMatchObject({ gender: 'f', horned: true, born: born.birthYear + 29 });
    expect(a!.name).not.toBe(b!.name);
    expect(render('{child}', l)).toBe(a!.name);
    const lost = applyEffects(game, l, { people: [{ id: 'child_1', dies: true }] });
    expect(render('{child}', lost)).toBe(b!.name);
  });
  it('an old save with only the has_child flag gets its child, born in the year of the first-child event', () => {
    const old: LifeState = { ...born, age: 35, flags: [...born.flags, 'has_child', 'child_horned'], log: [{ age: 28, eventId: 'adult.life_first_child_horned', choiceId: 'a' }] };
    const l = settle(game, old, new Rng(2));
    expect(l.people.filter((p) => p.kin === 'child')).toHaveLength(1);
    expect(l.people.find((p) => p.id === 'child_1')).toMatchObject({ born: born.birthYear + 28, metAge: 28, horned: true });
    expect(settle(game, l, new Rng(3)).people).toEqual(l.people);
  });
  it('without any name pool the child is still someone', () => {
    const bare = makeGame(ContentSchema.parse({ items: [], events: [ev('adult.birth', { choices: [{ id: 'ok', label: 'ok', effects: { child: { gender: 'm' } } }] })] }));
    expect(play(bare, at(30), 'adult.birth').life.people[0]!.name).toBe('ลูกชาย');
  });
});

describe('everyone has a birth year and grows old', () => {
  const life = at(30, 1, { seed: 77, birthYear: 290 });
  it('estimates by role, the same every time', () => {
    const born = (p: Partial<Person>) => estimateBorn(person('x', p), life);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const f = estimateBorn(person(id, { kin: 'father' }), life);
      expect(f).toBeLessThanOrEqual(270);
      expect(f).toBeGreaterThanOrEqual(256);
      expect(estimateBorn(person(id, { kin: 'father' }), life)).toBe(f);
      const g = estimateBorn(person(id, { kin: 'grandmother_maternal' }), life);
      expect(g).toBeLessThanOrEqual(250);
      expect(g).toBeGreaterThanOrEqual(227);
      const o = estimateBorn(person(id, { kin: 'sibling_older' }), life);
      expect(o).toBeLessThan(290);
      expect(o).toBeGreaterThanOrEqual(284);
      const fr = estimateBorn(person(id, { bond: 'friend', metAge: 8 }), life);
      expect(Math.abs(fr - 290)).toBeLessThanOrEqual(3);
      const m = estimateBorn(person(id, { bond: 'mentor', metAge: 14 }), life);
      expect(m).toBeLessThanOrEqual(270);
      // คนแปลกหน้าที่รู้จักตอนผู้เล่นยังเด็กเป็นผู้ใหญ่แล้ว
      expect(estimateBorn(person(id, { metAge: 5 }), life)).toBeLessThanOrEqual(290 + 5 - 16);
    }
    expect(born({ kin: 'child', metAge: 27 })).toBe(317);
    expect(born({ kin: 'sibling_younger', metAge: 6 })).toBe(296);
    // เพื่อนที่รู้จักตั้งแต่แรกเกิดเกิดไม่ทีหลังปีที่รู้จัก
    expect(born({ bond: 'friend', metAge: 0 })).toBeLessThanOrEqual(290);
  });
  it('people met through an event get a birth year then, or the age the event states', () => {
    const game = gameOf([
      ev('adult.meet', {
        choices: [{ id: 'ok', label: 'ok', effects: { people: [{ id: 'hasken', name: 'ฮัสเกน', bond: 'rival', closeness: -1 }, { id: 'nan', name: 'ยายนัน', age: 71, closeness: 1 }] } }],
      }),
    ]);
    const { life: l } = play(game, life, 'adult.meet');
    expect(l.people.find((p) => p.id === 'hasken')!.born).toBe(estimateBorn(person('hasken', { bond: 'rival', metAge: 30 }), life));
    expect(l.people.find((p) => p.id === 'nan')!.born).toBe(290 + 30 - 71);
    expect(personYears(l.people.find((p) => p.id === 'nan')!, l)).toBe(72); // ผ่านไปหนึ่งปี
  });
  it('the dead stop ageing, and long-lived kin age slowly', () => {
    const dead = person('d', { born: 250, alive: false, diedAge: 20 });
    expect(personYears(dead, life)).toBe(60);
    expect(personYears(dead, { ...life, age: 70 })).toBe(60);
    const elfLife = { ...life, raceApplied: 'elf' };
    expect(personHumanAge(person('m', { kin: 'mother', born: 150 }), elfLife)).toBe(53); // อายุจริง 170
    expect(personHumanAge(person('s', { bond: 'friend', born: 250 }), elfLife)).toBe(70); // เพื่อนมนุษย์
    expect(personHumanAge(person('p', { bond: 'love', born: 150, race: 'elf' }), life)).toBe(53);
  });
  it('someone a long-lived player meets late in life is a peer by looks, not by birth year', () => {
    // เอลฟ์อายุจริง 150 ร่างกายเท่ามนุษย์อายุ 51: เพื่อนมนุษย์ที่เพิ่งรู้จักต้องอายุราว 51 ไม่ใช่ 150
    const elf = { ...life, age: 150, raceApplied: 'elf' };
    for (const id of ['a', 'b', 'c', 'd']) {
      const friend = person(id, { bond: 'friend', metAge: 150 });
      expect(Math.abs(personHumanAge({ ...friend, born: estimateBorn(friend, elf) }, elf) - 51)).toBeLessThanOrEqual(3);
      const mentor = person(id, { bond: 'mentor', metAge: 150 });
      expect(personHumanAge({ ...mentor, born: estimateBorn(mentor, elf) }, elf)).toBeLessThanOrEqual(51 + 34);
      // คู่ครองเผ่าเดียวกันแก่เท่ากัน จึงเกิดใกล้ปีเกิดของผู้เล่นเหมือนเดิม
      const love = person(id, { bond: 'love', metAge: 150, race: 'elf' });
      expect(Math.abs(estimateBorn(love, elf) - elf.birthYear)).toBeLessThanOrEqual(3);
      // มนุษย์รู้จักใครตอนไหนก็ได้ปีเกิดใกล้ตัวเองเหมือนเดิม
      expect(Math.abs(estimateBorn(person(id, { bond: 'friend', metAge: 55 }), { ...life, age: 55 }) - life.birthYear)).toBeLessThanOrEqual(3);
    }
  });
  it('parents are born before the player when names are drawn', () => {
    const game = gameOf([ev('adult.a')]);
    for (let s = 1; s <= 40; s++) {
      const l = settle(game, applyEffects(game, newLife(s), { flags: ['race_human'] }), new Rng(s));
      for (const p of l.people) {
        expect(p.born).toBeDefined();
        expect(l.birthYear - p.born!).toBeGreaterThanOrEqual(20);
        expect(l.birthYear - p.born!).toBeLessThanOrEqual(34);
      }
    }
  });
});

describe('the people around you pass away', () => {
  const life = at(40, 1, { birthYear: 290 });
  const aged = (years: number, extra: Partial<Person> = {}) => person(`p${years}`, { born: 330 - years, ...extra });
  it('the chance starts after 60, grows every year and faster after 90, up to a half', () => {
    expect(passingChance(aged(60), life)).toBe(0);
    expect(passingChance(aged(61), life)).toBeCloseTo(NPC_DEATH.perYear);
    expect(passingChance(aged(80), life)).toBeCloseTo(0.06);
    expect(passingChance(aged(90), life)).toBeCloseTo(0.09);
    expect(passingChance(aged(100), life)).toBeCloseTo(0.32);
    expect(passingChance(aged(140), life)).toBe(NPC_DEATH.max);
    expect(passingChance({ ...aged(90), alive: false }, life)).toBe(0);
  });
  it('a partner does not pass by the yearly roll before 100: their going is a written scene, or they outlive the character', () => {
    expect(passingChance(aged(99, { kin: 'spouse', closeness: 3 }), life)).toBe(0);
    expect(passingChance({ ...aged(100), id: 'partner', bond: 'love' }, life)).toBe(0);
    expect(passingChance(aged(99, { bond: 'love' }), life)).toBeGreaterThan(0);
    // แก่กว่านั้นแล้วไม่มีใครอยู่ค้ำฟ้า
    expect(passingChance(aged(101, { kin: 'spouse', closeness: 3 }), life)).toBeCloseTo(0.343);
    expect(passingChance({ ...aged(101), id: 'partner', bond: 'love' }, life)).toBeCloseTo(0.343);
  });
  it('those who deserve a farewell scene wait for it until 88', () => {
    const father = aged(80, { kin: 'father', closeness: 1 });
    const dear = aged(80, { bond: 'friend', closeness: 3 });
    expect(isClose(father)).toBe(true);
    expect(isClose(dear)).toBe(true);
    expect(isClose(aged(80, { bond: 'friend', closeness: 2 }))).toBe(false);
    expect(passingChance(father, life)).toBe(0);
    expect(passingChance(dear, life)).toBe(0);
    expect(passingChance(aged(89, { kin: 'father' }), life)).toBeCloseTo(0.087);
  });
  it('elves outlast humans', () => {
    const elf = aged(300, { race: 'elf' });
    expect(personHumanAge(elf, life)).toBe(66);
    expect(passingChance(elf, life)).toBeCloseTo((6 * NPC_DEATH.perYear) / 10);
  });
  it('a passing is recorded, dated, told in a line, and sets the flag for a parent', () => {
    const game = gameOf([ev('adult.year', { once: false })], { lines: { news_death: ['ข่าวมาว่า{who}ไม่อยู่แล้ว'], news_death_father: ['{who}จากไปในปีนี้ {who:เขา|เธอ}ไปเงียบๆ'] } });
    const father = person('father', { name: 'ทอเบล', gender: 'm', kin: 'father', born: 190 });
    const smith = person('smith', { name: 'ฮาริค', gender: 'm', born: 190 });
    let told = 0;
    for (let n = 1; n <= 60; n++) {
      const start = { ...life, rngState: new Rng(n).state, parents: { father: 'ทอเบล', mother: 'คอเดีย' }, people: [father, smith] };
      const { life: l, entry } = resolveChoice(game, start, 'adult.year', 'ok');
      for (const id of entry.year?.passed ?? []) {
        expect(l.people.find((p) => p.id === id)).toMatchObject({ alive: false, diedAge: 40 });
      }
      if (entry.year?.passed?.includes('father')) {
        told++;
        expect(l.flags).toContain('father_died');
        expect(entry.year.lines).toContain('ทอเบลจากไปในปีนี้ เขาไปเงียบๆ');
      }
      if (entry.year?.passed?.includes('smith')) expect(entry.year.lines).toContain('ข่าวมาว่าฮาริคไม่อยู่แล้ว');
      expect(entry.year?.passed?.length ?? 0).toBe(l.people.filter((p) => !p.alive).length);
    }
    expect(told).toBeGreaterThan(10);
  });
  it('a partner past a hundred goes by the yearly roll, told in the line for a partner even when unmarried', () => {
    const game = gameOf([ev('adult.year', { once: false })], { lines: { news_death: ['ข่าวมาว่า{who}ไม่อยู่แล้ว'], news_death_spouse: ['{who}จากไปก่อน'], news_death_love: ['คนรักเก่า{who}จากไป'] } });
    const mate = person('partner', { name: 'มาริส', gender: 'f', bond: 'love', closeness: 3, born: 225 });
    let told = 0;
    for (let n = 1; n <= 60; n++) {
      const start = { ...life, rngState: new Rng(n).state, partner: { name: 'มาริส', gender: 'f' as const, pool: 'human' }, flags: ['has_partner'], people: [mate] };
      const { life: l, entry } = resolveChoice(game, start, 'adult.year', 'ok');
      if (!entry.year?.passed?.includes('partner')) continue;
      told++;
      expect(entry.year.lines).toEqual(['มาริสจากไปก่อน']);
      expect(l.flags).toContain('partner_died');
      expect(l.flags).not.toContain('has_partner');
    }
    expect(told).toBeGreaterThan(10);
  });
  it('yearlyPassings rolls once per person in list order', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => person(`c${i}`, { born: 190 }));
    const gone = yearlyPassings({ ...life, people: crowd }, new Rng(5));
    expect(gone.length).toBeGreaterThan(8);
    expect(gone.length).toBeLessThan(32);
  });
});

describe('trait registry', () => {
  const traits = [
    { id: 'tough', name: 'หนังเหนียว', kind: 'trait', how: 'x', gives: ['พลังชีวิตสูงสุด +3'], effects: [{ kind: 'max_hp', amount: 3 }] },
    { id: 'river', name: 'พรท้องน้ำ', kind: 'boon', how: 'x', gives: ['ฟื้นเร็วริมน้ำ'], breaks: 'เทของเสียลงน้ำ', effects: [{ kind: 'regen', amount: 2, locations: ['river'] }, { kind: 'winter', amount: 2 }] },
    { id: 'knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['ว่องไว −1'], effects: [{ kind: 'check_bonus', amount: -1, stats: ['DEX'] }] },
    {
      id: 'glass',
      name: 'ผิวแก้ว',
      kind: 'curse',
      how: 'x',
      cures: ['a', 'b'],
      live_with: 'c',
      steps: [
        { name: 'ผิวแก้ว ขั้นหนึ่ง', gives: ['ญาณ +1'], costs: [], effects: [{ kind: 'check_bonus', amount: 1, stats: ['WIS'] }] },
        { gives: ['ญาณ +2'], costs: ['พลังชีวิตสูงสุด −2'], effects: [{ kind: 'check_bonus', amount: 2, stats: ['WIS'] }, { kind: 'max_hp', amount: -2 }] },
        { gives: ['ญาณ +3'], costs: ['พลังชีวิตสูงสุด −4'], effects: [{ kind: 'check_bonus', amount: 3, stats: ['WIS'] }, { kind: 'max_hp', amount: -4 }] },
      ],
    },
    { id: 'door', name: 'ประตูปิด', kind: 'curse', big: true, how: 'x', gives: ['ไม่แก่'], cures: ['a', 'b'], live_with: 'c', effects: [{ kind: 'ageless' }] },
    { id: 'hero', name: 'พรผู้กล้า', kind: 'boon', big: true, how: 'x', breaks: 'y', gives: ['กำลัง +2'], effects: [{ kind: 'check_bonus', amount: 2, stats: ['STR'] }] },
    { id: 'hero2', name: 'พรผู้กล้าสอง', kind: 'boon', big: true, how: 'x', breaks: 'y', gives: ['a'] },
    { id: 'charm', name: 'เครื่องราง', kind: 'boon', how: 'x', breaks: 'ใช้แล้วหมด', gives: ['รอดตายหนึ่งครั้ง'], effects: [{ kind: 'cheat_death', flag: 'cheated_death', becomes: 'scarred' }] },
    { id: 'scarred', name: 'แผลจากวันนั้น', kind: 'wound', how: 'x', costs: ['พลังชีวิตสูงสุด −1'], effects: [{ kind: 'max_hp', amount: -1 }] },
    { id: 'hot', name: 'ใจร้อน', kind: 'trait', habit: true, how: 'x', excludes: ['cool'], gained: '{name}เป็นคนใจร้อนไปแล้ว', gives: ['กำลัง +1'], effects: [{ kind: 'check_bonus', amount: 1, stats: ['STR'] }] },
    { id: 'cool', name: 'ใจเย็น', kind: 'trait', habit: true, how: 'x', excludes: ['hot'], gained: 'เย็น' },
    { id: 'h3', name: 'สาม', kind: 'trait', habit: true, how: 'x', gained: 'สาม' },
    { id: 'h4', name: 'สี่', kind: 'trait', habit: true, how: 'x', gained: 'สี่' },
    { id: 'h5', name: 'ห้า', kind: 'trait', habit: true, how: 'x', gained: 'ห้า' },
  ];
  const fx = (effects: Raw, requires?: Raw) => ({ id: 'ok', label: 'ok', effects, ...(requires ? { requires } : {}) });
  const events = [
    ev('adult.year', { once: false }),
    ev('adult.rush', { once: false, choices: [{ id: 'ok', label: 'ok', text: 'พุ่งเข้าไป', habit: 'hot' }, { id: 'wait', label: 'w', text: 'รอ', habit: 'cool' }] }),
    ev('adult.h', { once: false, choices: ['h3', 'h4', 'h5'].map((h) => ({ id: h, label: h, text: h, habit: h })) }),
    ev('adult.swing', { once: false, choices: [{ id: 'ok', label: 'ok', check: { stat: 'STR', dc: 10 }, success: { text: 'a' }, failure: { text: 'b' } }, { id: 'dex', label: 'd', check: { stat: 'DEX', dc: 10 }, success: { text: 'a' }, failure: { text: 'b' } }] }),
    ev('adult.fall', { once: false, choices: [fx({ hp: -99 })] }),
    death('death.any', ['wound', 'fight', 'sacrifice', 'age']),
  ];
  const game = gameOf(events, { traits });
  const have = (ids: string[], extra: Partial<LifeState> = {}) => applyEffects(game, at(30, 1, extra), { traits: ids });

  it('a trait that changes max HP changes it when gained and gives it back when lost', () => {
    const l = have(['tough']);
    expect(l.baseMaxHp).toBe(13);
    expect(applyEffects(game, l, { lose_traits: ['tough'] }).baseMaxHp).toBe(10);
    expect(applyEffects(game, l, { traits: ['tough'] }).baseMaxHp).toBe(13); // ได้ซ้ำไม่บวกซ้ำ
  });
  it('check bonuses apply to the right rolls and show in the roll', () => {
    const l = have(['knee', 'hero'], { rngState: new Rng(3).state });
    expect(resolveChoice(game, l, 'adult.swing', 'ok').entry.roll!.mod).toBe(2);
    expect(resolveChoice(game, l, 'adult.swing', 'dex').entry.roll!.mod).toBe(-1);
  });
  it('regen and winter effects, with a place condition', () => {
    const hurt = have(['river'], { hp: 2, baseMaxHp: 20 });
    expect(resolveChoice(game, hurt, 'adult.year', 'ok').life.hp).toBe(5);
    expect(resolveChoice(game, { ...hurt, locationTag: 'river' }, 'adult.year', 'ok').life.hp).toBe(7);
    expect(winterModifier(game, hurt)).toBe(2);
  });
  it('steps: a curse grows, its effects and card lines follow the step', () => {
    let l = have(['glass']);
    const def = game.traits.get('glass')!;
    expect(traitStep(l, def)).toBe(1);
    expect(traitLines(l, def)).toEqual({ name: 'ผิวแก้ว ขั้นหนึ่ง', gives: ['ญาณ +1'], costs: [] });
    l = applyEffects(game, l, { trait_step: { glass: 1 } });
    expect(traitStep(l, def)).toBe(2);
    expect(l.baseMaxHp).toBe(8);
    expect(traitLines(l, def).name).toBe('ผิวแก้ว');
    l = applyEffects(game, l, { trait_step: { glass: 5 } });
    expect(traitStep(l, def)).toBe(3);
    expect(l.baseMaxHp).toBe(6);
    l = applyEffects(game, l, { trait_step: { glass: -1 } });
    expect(l.baseMaxHp).toBe(8);
    l = applyEffects(game, l, { lose_traits: ['glass'] });
    expect(l.baseMaxHp).toBe(10);
    expect(l.traitSteps.glass).toBeUndefined();
    // ขยับขั้นของที่ไม่ได้ถืออยู่ไม่มีผล
    expect(applyEffects(game, at(30), { trait_step: { glass: 1 } }).traitSteps).toEqual({});
  });
  it('a curse can lower max HP but never below 1', () => {
    const frail = applyEffects(game, at(30, 1, { baseMaxHp: 3, hp: 3 }), { traits: ['glass'], trait_step: { glass: 2 } });
    expect(maxHp(frail, game.items)).toBe(1);
    expect(frail.hp).toBe(1);
    expect(frail.dying).toBeNull();
    expect(applyEffects(game, at(30, 1, { baseMaxHp: 2, hp: 2 }), { max_hp: -9 }).baseMaxHp).toBe(1);
  });
  it(`no more than ${BIG_TRAITS_MAX} big ones, and content can ask for room`, () => {
    const l = have(['door', 'hero', 'hero2']);
    expect(bigCount(l, game.traits)).toBe(BIG_TRAITS_MAX);
    expect(l.traits).toEqual(['door', 'hero']);
    const gated = ContentSchema.parse({ items: [], events: [ev('adult.gift', { when: { big_room: true }, choices: [fx({ traits: ['hero2'] })] })] }).events[0]!;
    expect(eligible(game, l, gated)).toBe(false);
    expect(eligible(game, have(['door']), gated)).toBe(true);
    const p = lintContent(ContentSchema.parse({ items: [], traits, events: [ev('adult.gift', { choices: [fx({ traits: ['hero2'] })] }), ev('adult.ok', { choices: [fx({ traits: ['hero'] }, { big_room: true })] })] })).join('\n');
    expect(p).toContain('adult.gift/ok: ให้ของใหญ่ "hero2" ต้องกันด้วย big_room: true');
    expect(p).not.toContain('adult.ok/ok');
  });
  it('ageless: no decline and no winter check', () => {
    for (let n = 1; n <= 150; n++) {
      const { entry } = resolveChoice(game, have(['door'], { age: 90, rngState: new Rng(n).state }), 'adult.year', 'ok');
      expect(entry.year?.decline).toBeUndefined();
      expect(entry.year?.winter).toBeUndefined();
    }
  });
  it('cheating death once: the charm is spent, leaves its mark and a flag', () => {
    const l = have(['charm'], { rngState: new Rng(2).state });
    const saved = resolveChoice(game, l, 'adult.fall', 'ok').life;
    expect(saved).toMatchObject({ alive: true, dying: null, hp: 1 + 3, age: 31 }); // รอดมาด้วยพลังชีวิตเดียว แล้วแผลหายตามปี
    expect(saved.traits).toEqual(['scarred']);
    expect(saved.flags).toContain('cheated_death');
    expect(saved.baseMaxHp).toBe(9);
    const second = resolveChoice(game, { ...saved, hp: 1 }, 'adult.fall', 'ok').life;
    expect(second.dying).toBe('wound');
    // ครั้งที่สองที่โกงได้ ออสซานับ
    const again = resolveChoice(game, applyEffects(game, saved, { traits: ['charm'] }), 'adult.fall', 'ok').life;
    expect(again.flags).toEqual(expect.arrayContaining(['cheated_death', 'cheated_death_twice']));
    expect(again.dying).toBeNull();
  });
  // นิสัยนับจากเหตุการณ์ที่ต่างกัน เทสต์ใช้เหตุการณ์เดิมแทนเรื่องใหม่ที่มีทางเดียวกัน จึงล้าง seen ก่อนเล่นทุกครั้ง
  const anew = (l: LifeState): LifeState => ({ ...l, seen: [] });
  it(`a habit becomes a trait on the ${HABIT_COUNT}rd time, with a line in the log`, () => {
    let l = at(30);
    for (let i = 1; i < HABIT_COUNT; i++) {
      const r = resolveChoice(game, anew(l), 'adult.rush', 'ok');
      expect(r.life.traits).toEqual([]);
      expect(r.life.habits.hot).toBe(i);
      expect(r.life.habitOffers).toEqual({ hot: i, cool: i });
      l = r.life;
    }
    const r = resolveChoice(game, anew(l), 'adult.rush', 'ok');
    expect(r.life.traits).toEqual(['hot']);
    expect(r.entry.changes?.traits).toEqual(['hot']);
    expect(r.entry.text).toBe('พุ่งเข้าไป\n\n{name}เป็นคนใจร้อนไปแล้ว');
    // ลักษณะตรงข้ามไม่ก่อตัวอีก
    l = r.life;
    for (let i = 0; i < HABIT_COUNT + 1; i++) l = resolveChoice(game, anew(l), 'adult.rush', 'wait').life;
    expect(l.traits).toEqual(['hot']);
  });
  it('the same event coming round again does not count towards a habit', () => {
    let l = resolveChoice(game, at(30), 'adult.rush', 'ok').life;
    expect(l.habits).toEqual({ hot: 1 });
    for (let i = 0; i < HABIT_COUNT + 2; i++) l = resolveChoice(game, l, 'adult.rush', 'ok').life;
    expect(l.habits).toEqual({ hot: 1 });
    expect(l.habitOffers).toEqual({ hot: 1, cool: 1 });
    expect(l.traits).toEqual([]);
  });
  it(`a habit only forms when its way was taken at least ${HABIT_SHARE * 100}% of the times it was on offer`, () => {
    const g = gameOf([ev('adult.rush', { once: false, choices: [{ id: 'ok', label: 'ok', habit: 'hot' }, { id: 'pass', label: 'p' }] })], { traits });
    // ทางใจร้อนมีให้เลือกสี่ครั้ง ไม่ได้เลือกเลย
    let l = at(30);
    for (let i = 0; i < 4; i++) l = resolveChoice(g, anew(l), 'adult.rush', 'pass').life;
    expect(l.habitOffers).toEqual({ hot: 4 });
    // เลือกครบสามครั้งแล้ว แต่เป็นสามในเจ็ดครั้งที่มีให้เลือก ยังไม่ใช่นิสัย
    for (let i = 0; i < HABIT_COUNT; i++) l = resolveChoice(g, anew(l), 'adult.rush', 'ok').life;
    expect(l.habits.hot).toBe(HABIT_COUNT);
    expect(l.habitOffers.hot).toBe(4 + HABIT_COUNT);
    expect(l.traits).toEqual([]);
    // เลือกต่อจนถึงครึ่งหนึ่งของครั้งที่มีให้เลือก (สี่ในแปด) จึงก่อตัว
    expect(resolveChoice(g, anew(l), 'adult.rush', 'ok').life.traits).toEqual(['hot']);
  });
  it('a choice that could not be picked is not an offer', () => {
    const g = gameOf([ev('adult.rush', { once: false, choices: [{ id: 'ok', label: 'ok', habit: 'hot', requires: { min_gold: 99 } }, { id: 'pass', label: 'p' }] })], { traits });
    expect(resolveChoice(g, at(30), 'adult.rush', 'pass').life.habitOffers).toEqual({});
  });
  it(`a life holds at most ${HABIT_TRAITS_MAX} habit traits`, () => {
    let l = at(30);
    for (const [id, choice] of [['adult.rush', 'ok'], ['adult.h', 'h3'], ['adult.h', 'h4']] as const) {
      for (let i = 0; i < HABIT_COUNT; i++) l = resolveChoice(game, anew(l), id, choice).life;
    }
    expect(l.traits).toEqual(['hot', 'h3', 'h4']);
    // นิสัยที่สี่เลือกครบและเลือกทุกครั้งที่มีให้เลือก ก็ไม่ก่อตัวเพราะเต็มแล้ว
    const full = { ...l, habits: { ...l.habits, h5: HABIT_COUNT - 1 }, habitOffers: { ...l.habitOffers, h5: HABIT_COUNT } };
    expect(countHabit(full, game.traits, 'h5')).toEqual({ habits: { ...full.habits, h5: HABIT_COUNT }, formed: null });
    expect(countHabit({ ...full, traits: ['hot', 'h3'] }, game.traits, 'h5').formed).toBe('h5');
  });
  it('the linter enforces the rules of the world on the registry', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [ev('adult.x', { choices: [{ id: 'ok', label: 'ok', habit: 'free_boon', effects: { traits: ['ghost', 'bare_curse'], trait_step: { free_boon: 1 } } }] })],
      traits: [
        { id: 'free_boon', name: 'พรฟรี', kind: 'boon', how: 'x', gives: ['a'] },
        { id: 'bare_curse', name: 'คำสาปเปล่า', kind: 'curse', how: 'x', cures: ['a'] },
        { id: 'habit_wound', name: 'x', kind: 'wound', how: 'x', habit: true, excludes: ['nobody'] },
      ],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('traits/free_boon: พรต้องมีราคา');
    expect(p).toContain('traits/bare_curse: คำสาปต้องมีของแถม');
    expect(p).toContain('traits/bare_curse: คำสาปต้องมีทางแก้อย่างน้อยสองทาง');
    expect(p).toContain('traits/bare_curse: คำสาปต้องมีทางอยู่กับมัน');
    expect(p).toContain('traits/bare_curse: มีเหตุการณ์ที่ให้คำสาปนี้ แต่ไม่มีเหตุการณ์ไหนถอดออกได้');
    expect(p).toContain('traits/habit_wound: habit ใช้ได้กับชนิด trait เท่านั้น');
    expect(p).toContain('traits/habit_wound: อ้างถึง "nobody"');
    expect(p).toContain('ไม่มีสิ่งติดตัว "ghost" ในทะเบียน');
    expect(p).toContain('habit "free_boon" ไม่ใช่ลักษณะที่ก่อตัวจากนิสัย');
    expect(p).toContain('trait_step "free_boon" ไม่ใช่สิ่งติดตัวที่มีหลายขั้น');
    expect(lintContent(ContentSchema.parse({ items: [], events: [ev('adult.year', { once: false })], traits }))).toEqual([]);
  });
});

describe('traits on choices: what helps a roll, and what a trait closes', () => {
  const traits = [
    { id: 'hot', name: 'ใจร้อน', kind: 'trait', habit: true, how: 'x', excludes: ['cool'], blocks: ['cool'], gained: 'ร้อน', gives: ['กำลัง +1'], costs: ['ทางที่ต้องรอบางทางเลือกไม่ได้'], effects: [{ kind: 'check_bonus', amount: 1, stats: ['STR'] }] },
    { id: 'cool', name: 'ใจเย็น', kind: 'trait', habit: true, how: 'x', excludes: ['hot'], gained: 'เย็น' },
    { id: 'knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['กำลัง −1 เมื่อเผชิญสัตว์'], effects: [{ kind: 'check_bonus', amount: -1, foes: ['nature'] }] },
    { id: 'nosy', name: 'ขี้สงสัย', kind: 'trait', habit: true, how: 'x', gained: 'สงสัย' },
  ];
  const events = [
    ev('adult.gate', {
      once: false,
      choices: [
        { id: 'ok', label: 'ชิงเข้าไป', habit: 'hot', check: { stat: 'STR', dc: 10, foe: 'nature' }, success: { text: 'a' }, failure: { text: 'b' } },
        { id: 'wait', label: 'ซุ่มดูก่อน', text: 'รอ', habit: 'cool' },
        { id: 'pass', label: 'เดินผ่านไป', text: 'ผ่าน', requires: { not_traits: ['nosy'] } },
        { id: 'pay', label: 'จ่ายแล้วซุ่มดู', text: 'จ่าย', habit: 'cool', requires: { min_gold: 5 } },
        { id: 'plain', label: 'กลับบ้าน', text: 'กลับ' },
      ],
    }),
  ];
  const game = gameOf(events, { traits });
  const gate = game.events[0]!;
  const pick = (id: string) => gate.choices.find((c) => c.id === id)!;
  const have = (ids: string[], extra: Partial<LifeState> = {}) => applyEffects(game, at(30, 3, extra), { traits: ids });

  it('the roll records which traits moved it and by how much', () => {
    const l = have(['hot', 'knee']);
    expect(traitCheckBonuses(l, game.traits, 'STR', 'nature')).toEqual([{ id: 'hot', amount: 1 }, { id: 'knee', amount: -1 }]);
    const { entry } = resolveChoice(game, l, 'adult.gate', 'ok');
    expect(entry.roll!.traits).toEqual([{ id: 'hot', amount: 1 }, { id: 'knee', amount: -1 }]);
    // ไม่มีสิ่งติดตัวที่เกี่ยวกับการทอยนี้ ก็ไม่มีรายการ
    expect(resolveChoice(game, have([]), 'adult.gate', 'ok').entry.roll!.traits).toBeUndefined();
    expect(resolveChoice(game, have(['nosy']), 'adult.gate', 'ok').entry.roll!.traits).toBeUndefined();
  });

  it('a habit you hold closes the choices of the habit it blocks, and says which trait did it', () => {
    const calm = have([]);
    expect(choiceAvailable(game, calm, pick('wait'), gate)).toBe(true);
    expect(traitBlock(game, calm, pick('wait'), gate)).toEqual([]);
    const l = have(['hot']);
    expect(habitBlockers(l, game.traits, 'cool')).toEqual(['hot']);
    expect(choiceAvailable(game, l, pick('wait'), gate)).toBe(false);
    expect(traitBlock(game, l, pick('wait'), gate)).toEqual(['hot']);
    // ทางของนิสัยตัวเองและทางที่ไม่ติดป้ายยังเลือกได้
    expect(choiceAvailable(game, l, pick('ok'), gate)).toBe(true);
    expect(choiceAvailable(game, l, pick('plain'), gate)).toBe(true);
    // ใจเย็นไม่ได้ปิดอะไร (ไม่มี blocks) จึงยังชิงลงมือได้
    expect(choiceAvailable(game, have(['cool']), pick('ok'), gate)).toBe(true);
  });

  it('a choice can name the traits that close it (requires.not_traits)', () => {
    const l = have(['nosy']);
    expect(choiceAvailable(game, l, pick('pass'), gate)).toBe(false);
    expect(traitBlock(game, l, pick('pass'), gate)).toEqual(['nosy']);
    expect(traitBlock(game, have([]), pick('pass'), gate)).toEqual([]);
  });

  it('a choice closed for another reason too is not shown as closed by the trait', () => {
    const poor = have(['hot'], { gold: 0 });
    expect(traitBlock(game, poor, pick('pay'), gate)).toEqual([]);
    expect(traitBlock(game, have(['hot'], { gold: 9 }), pick('pay'), gate)).toEqual(['hot']);
  });

  it('an event is not offered when a trait closes every choice it has', () => {
    const g = gameOf([ev('adult.only_wait', { once: false, choices: [{ id: 'ok', label: 'รอ', text: 'รอ', habit: 'cool' }] }), ev('adult.other', { once: false })], { traits });
    const l = applyEffects(g, at(30), { traits: ['hot'] });
    expect(playable(g, l, g.events[0]!)).toBe(false);
    expect(playable(g, at(30), g.events[0]!)).toBe(true);
  });

  it('lint: blocks must point at a habit, be paid for on the card, and leave every event a way out', () => {
    const bad = [
      { id: 'a', name: 'ก', kind: 'trait', habit: true, how: 'x', gained: 'g', blocks: ['a', 'w', 'zzz'], costs: ['c'] },
      { id: 'b', name: 'ข', kind: 'trait', habit: true, how: 'x', gained: 'g', blocks: ['a'] },
      { id: 'w', name: 'ค', kind: 'wound', how: 'x', costs: ['c'] },
    ];
    const content = ContentSchema.parse({
      items: [],
      names,
      traits: bad,
      events: [ev('adult.trap', { choices: [{ id: 'ok', label: 'ok', text: 'x', habit: 'a' }] })],
    });
    const p = lintContent(content).join('\n');
    expect(p).toContain('traits/a: blocks ตัวเองไม่ได้');
    expect(p).toContain('traits/a: blocks "w" ต้องเป็นลักษณะจากนิสัย (habit) ในทะเบียน');
    expect(p).toContain('traits/a: blocks "zzz" ต้องเป็นลักษณะจากนิสัย (habit) ในทะเบียน');
    expect(p).toContain('traits/b: มี blocks ต้องเขียนราคานี้ไว้ใน costs ด้วย');
    expect(p).toContain('traits/b: ปิดตัวเลือกทุกข้อของเหตุการณ์ adult.trap');
    expect(lintContent(ContentSchema.parse({ items: [], names, traits, events })).filter((x) => x.includes('blocks'))).toEqual([]);
  });
});

describe('passage events (years) and spare events (fallback)', () => {
  const pass = ev('adult.pass', { once: false, years: 5, fallback: true, when: { age: [41, 64] } });
  it('a passage event moves several years, with a year end for each', () => {
    const game = gameOf([pass]);
    const { life, entry } = resolveChoice(game, at(45, 1, { hp: 1, baseMaxHp: 30 }), 'adult.pass', 'ok');
    expect(life.age).toBe(50);
    expect(entry.span).toBe(5);
    expect(life.hp).toBe(1 + 3 * 5);
    expect(life.log).toHaveLength(1);
  });
  it('stops at the door of winter, and is one year from there on', () => {
    const game = gameOf([ev('adult.long', { once: false, years: 10 })]);
    expect(spanOf(game, at(60), game.events[0]!)).toBe(5);
    expect(resolveChoice(game, at(60), 'adult.long', 'ok').life.age).toBe(65);
    expect(spanOf(game, at(64), game.events[0]!)).toBe(1);
    expect(spanOf(game, at(65), game.events[0]!)).toBe(1);
    expect(spanOf(game, at(80), game.events[0]!)).toBe(1);
    expect(spanOf(game, at(66, 1, { raceApplied: 'tiefling' }), game.events[0]!)).toBe(4);
    // เอลฟ์: วัย 64 จบที่อายุจริง 289 ฤดูหนาวแรกคือ 290
    expect(spanOf(game, at(285, 1, { raceApplied: 'elf', birthYear: 20 }), game.events[0]!)).toBe(5);
  });
  it('never jumps over the last year of a pin this life can still get', () => {
    const life = at(45);
    const year = worldYear(life);
    const game = gameOf([
      pass,
      ev('adult.pin', { must: true, when: { year: [year + 2, year + 3] } }),
      ev('adult.not_mine', { must: true, when: { year: [year + 1, year + 1], flags: ['never'] } }),
      ev('adult.setter', { when: { age: [1, 1] }, choices: [{ id: 'ok', label: 'ok', effects: { flags: ['never'] } }] }),
    ]);
    expect(spanOf(game, life, game.events[0]!)).toBe(3);
    const after = resolveChoice(game, life, 'adult.pass', 'ok').life;
    expect(after.age).toBe(48);
    expect(pickEvent(game, after).event?.id).toBe('adult.pin');
    // หมุดที่เห็นไปแล้วไม่กันอีก
    expect(spanOf(game, { ...life, seen: ['adult.pin'] }, game.events[0]!)).toBe(5);
  });
  it('two pins on their last year both play, in the same year', () => {
    const life = at(40);
    const year = worldYear(life);
    const game = gameOf([
      ev('adult.forty', { must: true, weight: 100000, when: { age: [40, 40] } }),
      // เรื่องประจำถิ่นที่ชีวิตนี้เพิ่งเข้าเงื่อนไขในปีสุดท้ายของมัน
      ev('adult.land_year', { must: true, weight: 500, when: { year: [year - 1, year] } }),
      // หมุดที่ยังเหลือปีหน้า ไม่รั้งเวลา
      ev('adult.next_pin', { must: true, when: { year: [year, year + 1] } }),
    ]);
    expect(pickEvent(game, life).event?.id).toBe('adult.forty');
    const mid = resolveChoice(game, life, 'adult.forty', 'ok').life;
    expect(mid.age).toBe(40);
    expect(pickEvent(game, mid).event?.id).toBe('adult.land_year');
    const after = resolveChoice(game, mid, 'adult.land_year', 'ok').life;
    expect(after.age).toBe(41);
    expect(after.log.map((e) => e.age)).toEqual([40, 40]);
    expect(pickEvent(game, after).event?.id).toBe('adult.next_pin');
    // หมุดที่ออกซ้ำได้และยังเข้าเงื่อนไขอยู่ไม่รั้งปีไว้เป็นวง
    const loop = gameOf([ev('adult.again', { must: true, once: false, weight: 9, when: { age: [40, 40] } }), ev('adult.forty', { must: true, weight: 1, when: { age: [40, 40] } })]);
    let l = at(40);
    for (let i = 0; i < 6 && l.age === 40; i++) l = resolveChoice(loop, l, pickEvent(loop, l).event!.id, 'ok').life;
    expect(l.age).toBe(41);
  });
  it('a death in the first winter of a span stops the clock there', () => {
    const game = gameOf([ev('adult.long', { once: false, years: 4 }), death('death.age', ['age'])]);
    // ทีฟลิ่งอายุ 67 ยังไม่ถึงฤดูหนาว (70) ช่วงถูกตัดเหลือ 3 ปี
    expect(resolveChoice(game, at(67, 1, { raceApplied: 'tiefling' }), 'adult.long', 'ok').life.age).toBe(70);
  });
  it(`spare events join the pool only when fewer than ${THIN_POOL} normal events are ready`, () => {
    const spare = ev('adult.spare', { once: false, fallback: true, weight: 100000 });
    const full = gameOf([spare, ev('adult.a'), ev('adult.b'), ev('adult.c')]);
    for (let n = 1; n <= 100; n++) expect(pickEvent(full, at(30, n)).event?.id).not.toBe('adult.spare');
    const thin = gameOf([spare, ev('adult.a'), ev('adult.b')]);
    const got = new Set(Array.from({ length: 50 }, (_, n) => pickEvent(thin, at(30, n + 1)).event?.id));
    expect(got.has('adult.spare')).toBe(true);
    const none = gameOf([spare]);
    expect(pickEvent(none, at(30)).event?.id).toBe('adult.spare');
    // ตัวสำรองที่เพิ่งออกยังได้พักถ้ามีเรื่องอื่น
    const rested = at(30, 1, { log: [{ age: 29, eventId: 'adult.spare', choiceId: 'ok' }] });
    for (let n = 1; n <= 50; n++) expect(pickEvent(thin, { ...rested, rngState: new Rng(n).state }).event?.id).not.toBe('adult.spare');
    expect(pickEvent(none, rested).event?.id).toBe('adult.spare');
  });
  it('the linter keeps must apart from years and fallback', () => {
    const bad = ContentSchema.parse({ items: [], events: [ev('adult.m', { must: true, years: 3, when: { age: [5, 5] } }), ev('adult.f', { must: true, fallback: true, when: { age: [5, 5] } })] });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('adult.m: must ใช้กับ fallback หรือ years ไม่ได้');
    expect(p).toContain('adult.f: must ใช้กับ fallback หรือ years ไม่ได้');
  });
});

describe('marks on the life line and system lines', () => {
  it('an event mark is stored rendered; a choice or outcome mark wins over it', () => {
    const game = gameOf([
      ev('adult.wed', {
        mark: 'วันสำคัญ',
        choices: [
          { id: 'ok', label: 'ok', text: 'x' },
          { id: 'own', label: 'o', effects: { mark: '{name}ออกเดินทาง' } },
          { id: 'roll', label: 'r', check: { stat: 'STR', dc: 1 }, success: { effects: { mark: 'ชนะ' } }, failure: { effects: { mark: 'ชนะ' } } },
        ],
      }),
    ]);
    const l = at(30, 1, { name: 'กา' });
    expect(resolveChoice(game, l, 'adult.wed', 'ok').entry.mark).toBe('วันสำคัญ');
    expect(resolveChoice(game, l, 'adult.wed', 'own').entry.mark).toBe('กาออกเดินทาง');
    expect(resolveChoice(game, l, 'adult.wed', 'roll').entry.mark).toBe('ชนะ');
  });
  it('decline and winter lines come from content/lines.yaml, and unknown keys are flagged', () => {
    const lines = { decline_STR: ['แขน{name}ไม่เหมือนเดิม'], decline: ['ร่างกายช้าลง'], winter_fail: ['หนาวปีนี้เอาบางอย่างไป'] };
    const game = gameOf([ev('adult.year', { once: false })], { lines });
    const got = new Set<string>();
    for (let n = 1; n <= 300; n++) {
      const { entry } = resolveChoice(game, at(88, n, { name: 'กา', baseMaxHp: 30, hp: 30 }), 'adult.year', 'ok');
      for (const s of entry.year?.lines ?? []) got.add(s);
      expect(entry.year?.lines?.length ?? 0).toBe((entry.year?.decline?.length ?? 0) + (entry.year?.winter?.lost ? 1 : 0));
    }
    expect(got).toEqual(new Set(['แขนกาไม่เหมือนเดิม', 'ร่างกายช้าลง', 'หนาวปีนี้เอาบางอย่างไป']));
    const p = lintContent(ContentSchema.parse({ items: [], events: [], lines: { nonsense: ['x'], news_death_friend: ['{who} {zzz}'], decline: ['{who}'] } })).join('\n');
    expect(p).toContain('lines/nonsense: ระบบไม่ใช้กุญแจนี้');
    expect(p).toContain('lines/news_death_friend: placeholder ไม่รู้จัก {zzz}');
    expect(p).toContain('lines/decline: placeholder ไม่รู้จัก {who}');
  });
  it('a life never reads the same system line twice; when the lines run out the year just has no line', () => {
    const lines = { decline_STR: ['แขนหนึ่ง', 'แขนสอง'], decline: ['ช้าลง'], winter_fail: ['หนาวหนึ่ง', 'หนาวสอง'] };
    const game = gameOf([ev('adult.year', { once: false })], { lines });
    let l = at(80, 5, { name: 'กา', baseMaxHp: 400, hp: 400, stats: { STR: 18, DEX: 3, CON: 1, INT: 10, WIS: 10, CHA: 10 } });
    const seen: string[] = [];
    let declines = 0;
    let fails = 0;
    for (let i = 0; i < 40 && l.alive; i++) {
      const picked = pickEvent(game, l);
      const res = resolveChoice(game, picked.life, 'adult.year', 'ok');
      l = res.life;
      seen.push(...(res.entry.year?.lines ?? []));
      declines += res.entry.year?.decline?.length ?? 0;
      fails += res.entry.year?.winter?.lost ? 1 : 0;
    }
    // ร่างกายโรยและแพ้ฤดูหนาวมากกว่าจำนวนประโยคที่มี แต่ไม่มีประโยคไหนออกซ้ำ
    expect(declines).toBeGreaterThan(3);
    expect(fails).toBeGreaterThan(2);
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(['แขนหนึ่ง', 'แขนสอง', 'ช้าลง', 'หนาวหนึ่ง', 'หนาวสอง']));
  });
  it('news that someone passed away is always told, even when its lines have all been used', () => {
    const lines = { news_death: ['{who}จากไปแล้ว'] };
    const game = gameOf([ev('adult.year', { once: false })], { lines });
    const old = (id: string) => person(id, { name: id, born: 100, bond: 'friend' });
    let l = at(30, 2, { name: 'กา', birthYear: 280, people: [old('ยายหนึ่ง'), old('ยายหนึ่ง')].map((p, i) => ({ ...p, id: `p${i}` })) });
    const told: string[] = [];
    for (let i = 0; i < 30 && l.people.some((p) => p.alive); i++) {
      const res = resolveChoice(game, pickEvent(game, l).life, 'adult.year', 'ok');
      l = res.life;
      told.push(...(res.entry.year?.lines ?? []));
    }
    // สองคนชื่อเดียวกัน ประโยคที่เติมชื่อแล้วจึงเหมือนกันทุกตัวอักษร แต่ข่าวต้องมาครบทั้งสองคน
    expect(l.people.every((p) => !p.alive)).toBe(true);
    expect(told).toEqual(['ยายหนึ่งจากไปแล้ว', 'ยายหนึ่งจากไปแล้ว']);
  });
  it('{newborn} names the child who joined the family last, {child} the eldest', () => {
    const l = at(30, 1, { people: [person('c1', { name: 'พี่', kin: 'child', born: 300 }), person('c2', { name: 'น้อง', kin: 'child', born: 305 })] });
    expect(render('{child} {newborn}', l)).toBe('พี่ น้อง');
    expect(render('{newborn}', at(30))).toBe('ลูก');
  });
});

describe('deaths already told, the last year of the story, and people an event brings', () => {
  const risk = ev('adult.risk', {
    once: false,
    choices: [
      { id: 'hurt', label: 'h', effects: { hp: -99 } },
      { id: 'fall', label: 'f', effects: { die: true } },
      { id: 'give', label: 'g', effects: { die: 'sacrifice' } },
    ],
  });
  const game = gameOf([
    risk,
    death('death.wound_untold', ['wound'], { when: { dying: ['wound'], told: false } }),
    death('death.wound_told', ['wound'], { when: { dying: ['wound'], told: true } }),
    death('death.gift', ['sacrifice'], { when: { dying: ['sacrifice'], told: true } }),
    death('death.bed', ['age'], { when: { dying: ['age'], told: false } }),
  ]);
  const scenes = (l: LifeState) => game.events.filter((e) => playable(game, l, e)).map((e) => e.id);
  it('hp running out leaves the death untold, a die outcome has told it', () => {
    const hurt = resolveChoice(game, at(30), 'adult.risk', 'hurt').life;
    expect(hurt).toMatchObject({ dying: 'wound', deathTold: false });
    expect(scenes(hurt)).toEqual(['death.wound_untold']);
    const fall = resolveChoice(game, at(30), 'adult.risk', 'fall').life;
    expect(fall).toMatchObject({ dying: 'wound', deathTold: true });
    expect(scenes(fall)).toEqual(['death.wound_told']);
    const give = resolveChoice(game, at(30), 'adult.risk', 'give').life;
    expect(give).toMatchObject({ dying: 'sacrifice', deathTold: true });
    expect(scenes(give)).toEqual(['death.gift']);
  });
  it('a death of old age is never told beforehand', () => {
    const frail = at(90, 1, { baseMaxHp: 1, hp: 1, stats: { ...newLife(1).stats, CON: 1 } });
    let dead: LifeState | undefined;
    for (let n = 1; n <= 200 && !dead; n++) {
      const l = endOfYear(game, frail, new Rng(n), {});
      if (l.dying) dead = l;
    }
    expect(dead).toMatchObject({ dying: 'age', deathTold: false });
    expect(scenes(dead!)).toEqual(['death.bed']);
  });
  it('a death scene can let the character live on (survive)', () => {
    const offer = death('death.offer', ['age'], {
      choices: [
        { id: 'go', label: 'go', effects: { epitaph: 'x' } },
        { id: 'take', label: 'take', effects: { survive: true, max_hp: 8, flags: ['took_winters'] } },
        { id: 'empty', label: 'empty', effects: { survive: true } },
      ],
    });
    const g = gameOf([risk, offer, ev('adult.year', { once: false })]);
    const dying = at(90, 1, { baseMaxHp: 0, hp: 0, dying: 'age', deathTold: false });
    const lived = resolveChoice(g, pickEvent(g, dying).life, 'death.offer', 'take').life;
    expect(lived.alive).toBe(true);
    expect(lived.dying).toBeNull();
    expect(lived.deathTold).toBeUndefined();
    expect(lived.hp).toBeGreaterThanOrEqual(1);
    expect(lived.flags).toContain('took_winters');
    // ฉากนั้นกินเวลาหนึ่งปีเหมือนเหตุการณ์อื่น (ถ้าฤดูหนาวปีนั้นไม่เอาไปอีก)
    if (!lived.dying) expect(lived.age).toBe(91);
    // ไม่มีพลังชีวิตสูงสุดคืนมา ก็ไม่มีอะไรให้อยู่ต่อ
    const gone = resolveChoice(g, pickEvent(g, dying).life, 'death.offer', 'empty').life;
    expect(gone).toMatchObject({ alive: false, endReason: 'death', deathCause: 'age' });
    const p = lintContent(ContentSchema.parse({ items: [], events: [ev('adult.x', { choices: [{ id: 'a', label: 'a', effects: { survive: true } }] })] })).join('\n');
    expect(p).toContain('adult.x/a: survive ใช้ได้เฉพาะในฉากตาย');
  });
  it('told is only for death scenes', () => {
    const p = lintContent(ContentSchema.parse({ items: [], events: [ev('adult.x', { when: { told: true } })] })).join('\n');
    expect(p).toContain('adult.x: when.told ใช้ได้เฉพาะในฉากตาย');
  });

  it('nothing but a death scene plays after the last year of the story', () => {
    const g = gameOf([ev('adult.year', { once: false }), ev('adult.long', { once: false, years: 10 }), death('death.any', ['wound', 'age'])]);
    const last = at(30, 1, { birthYear: STORY_END_YEAR - 30 });
    expect(worldYear(last)).toBe(STORY_END_YEAR);
    expect(eligible(g, last, g.events[0]!)).toBe(true);
    // ปีสุดท้ายเล่นได้ แล้วชีวิตจบเพราะเรื่องหมด ไม่ใช่เพราะตาย
    const after = resolveChoice(g, last, 'adult.year', 'ok').life;
    expect(worldYear(after)).toBe(STORY_END_YEAR + 1);
    expect(eligible(g, after, g.events[0]!)).toBe(false);
    expect(repairLife(g, after)).toMatchObject({ alive: false, endReason: 'content_end' });
    // คนที่กำลังจะตายหลังปีสุดท้ายยังได้ฉากตาย
    expect(eligible(g, { ...after, dying: 'wound', deathTold: false }, g.events[2]!)).toBe(true);
  });
  it('a passage never crosses the last year of the story', () => {
    const g = gameOf([ev('adult.long', { once: false, years: 10 })]);
    expect(spanOf(g, at(30, 1, { birthYear: STORY_END_YEAR - 33 }), g.events[0]!)).toBe(4);
    expect(spanOf(g, at(30, 1, { birthYear: STORY_END_YEAR - 30 }), g.events[0]!)).toBe(1);
    const end = resolveChoice(g, at(30, 1, { birthYear: STORY_END_YEAR - 33 }), 'adult.long', 'ok').life;
    expect(worldYear(end)).toBe(STORY_END_YEAR + 1);
  });

  it('a passage states the years it really takes: {years} is fixed when the event is picked', () => {
    const g = gameOf([ev('adult.long', { once: false, years: 5, text: '{years}ปีผ่านไป', choices: [{ id: 'ok', label: 'ok', text: 'ครบ{years}ปี' }] })]);
    const picked = pickEvent(g, at(41), 'adult.long').life;
    expect(picked.span).toBe(5);
    expect(render(g.events[0]!.text, picked)).toBe('ห้าปีผ่านไป');
    // ใกล้วัยที่เช็คฤดูหนาว เหตุการณ์สั้นลง ข้อความก็บอกตามนั้น
    const late = pickEvent(g, at(62), 'adult.long').life;
    expect(render(g.events[0]!.text, late)).toBe('สามปีผ่านไป');
    const done = resolveChoice(g, late, 'adult.long', 'ok');
    expect(done.life.age).toBe(65);
    expect(done.entry.span).toBe(3);
    expect(done.life.span).toBeUndefined();
    // อ่านย้อนหลังใช้จำนวนปีของเหตุการณ์นั้น ไม่ใช่ของเหตุการณ์ปัจจุบัน
    expect(render(done.entry.text!, done.life, {}, done.entry.span)).toBe('ครบสามปี');
    // เหตุการณ์ปีเดียวไม่มี span ค้าง
    const g2 = gameOf([ev('adult.year', { once: false })]);
    expect(pickEvent(g2, { ...picked }, 'adult.year').life.span).toBeUndefined();
    const bad = ContentSchema.parse({ items: [], events: [ev('adult.y', { text: '{years}ปี' })] });
    expect(lintContent(bad).some((p) => p.includes('{years} ใช้ได้เฉพาะเหตุการณ์ที่มี years'))).toBe(true);
  });

  it('a passage that needs many years stays away when time can only move a little', () => {
    const g = gameOf([ev('adult.gen', { once: false, years: 18, min_years: 8, fallback: true }), ev('adult.short', { once: false, years: 3, fallback: true })]);
    const elf = (birthYear: number) => at(100, 1, { raceApplied: 'elf', birthYear });
    expect(playable(g, elf(200), g.events[0]!)).toBe(true);
    // เหลือห้าปีก่อนปีสุดท้ายของเรื่อง: เรื่องสิบแปดปีไม่ออก เรื่องสั้นยังออก
    const late = elf(STORY_END_YEAR - 104);
    expect(spanOf(g, late, g.events[0]!)).toBe(5);
    expect(playable(g, late, g.events[0]!)).toBe(false);
    expect(pickEvent(g, late).event?.id).toBe('adult.short');
    const bad = ContentSchema.parse({ items: [], events: [ev('adult.a', { min_years: 3 }), ev('adult.b', { years: 3, min_years: 5 })] });
    expect(lintContent(bad).filter((p) => p.includes('min_years ต้องใช้คู่กับ years')).length).toBe(2);
  });

  it('an event registers its people whatever the choice, before the choice has its say', () => {
    const g = gameOf([
      ev('adult.meet', {
        people: [{ id: 'kedra', name: 'เคดรา', gender: 'f', bond: 'rival', closeness: -1 }],
        choices: [
          { id: 'ok', label: 'ok', text: 'x' },
          { id: 'hit', label: 'hit', text: 'x', effects: { people: [{ id: 'kedra', closeness: -2 }] } },
        ],
      }),
    ]);
    const met = resolveChoice(g, at(25), 'adult.meet', 'ok').life.people.find((p) => p.id === 'kedra');
    expect(met).toMatchObject({ name: 'เคดรา', gender: 'f', bond: 'rival', closeness: -1, alive: true, metAge: 25 });
    const hit = resolveChoice(g, at(25), 'adult.meet', 'hit').life.people.find((p) => p.id === 'kedra');
    expect(hit).toMatchObject({ name: 'เคดรา', closeness: -3 });
    // คนที่มีอยู่แล้วไม่ถูกเขียนชื่อทับ และยังอยู่ครบคนเดียว
    const again = resolveChoice(g, at(25, 1, { people: [person('kedra', { name: 'เคดรา', bond: 'rival', closeness: -4 })] }), 'adult.meet', 'ok').life.people.filter((p) => p.id === 'kedra');
    expect(again).toHaveLength(1);
  });
  it('people whose farewell is written wait for it', () => {
    const g = gameOf([
      ev('adult.meet', { people: [{ id: 'garven', name: 'การ์เวน', gender: 'm', bond: 'mentor', age: 45 }] }),
      ev('adult.farewell', { when: { age: [50, 50] }, people: [{ id: 'garven', dies: true }] }),
      ev('adult.year', { once: false }),
    ]);
    expect(g.fated).toEqual(new Set(['garven']));
    const life = at(40);
    const old = person('garven', { bond: 'mentor', born: worldYear(life) - 75 });
    const other = person('stranger', { born: worldYear(life) - 75 });
    expect(passingChance(old, life)).toBeGreaterThan(0);
    expect(passingChance(old, life, g.fated)).toBe(0);
    expect(passingChance(other, life, g.fated)).toBeGreaterThan(0);
    // แก่มากจริงแล้วฉากยังไม่มา ระบบจึงเอาไปเอง
    expect(passingChance({ ...old, born: worldYear(life) - (NPC_DEATH.closeFrom + 1) }, life, g.fated)).toBeGreaterThan(0);
    for (let n = 1; n <= 200; n++) {
      const l = endOfYear(g, at(40, n, { people: [old] }), new Rng(n), {});
      expect(l.people[0]!.alive).toBe(true);
    }
  });
  it('the linter knows people an event brings', () => {
    const ok = ContentSchema.parse({
      items: [],
      events: [
        ev('adult.meet', { people: [{ id: 'kedra', name: 'เคดรา', gender: 'f', bond: 'rival', closeness: -1 }] }),
        ev('adult.later', { choices: [{ id: 'ok', label: 'ok', text: 'x', effects: { people: [{ id: 'kedra', closeness: 1 }] } }] }),
      ],
    });
    expect(lintContent(ok)).toEqual([]);
  });
});

describe('old saves', () => {
  it('a version 2 save gets the new fields, registry ids and birth years', () => {
    const v2 = {
      ...newLife(5),
      version: 2,
      age: 33,
      traits: ['demon_mark', 'born_empty_day', 'demon_mark'],
      people: [
        { id: 'father', name: 'ทอเบล', kin: 'father', bond: 'kin', closeness: 3, alive: true, metAge: 0 },
        { id: 'partner', name: 'มาริส', bond: 'love', closeness: 3, alive: true, metAge: 22 },
      ],
    } as Record<string, unknown>;
    for (const k of ['traitSteps', 'habits', 'habitOffers', 'dying', 'deathCause', 'epitaph', 'cast']) delete v2[k];
    const l = migrate(v2);
    expect(l.version).toBe(3);
    expect(l.traits).toEqual(['curse_brand', 'empty_day']);
    expect(l).toMatchObject({ traitSteps: {}, habits: {}, habitOffers: {}, dying: null, deathCause: null, epitaph: '', cast: {} });
    for (const p of l.people) expect(p.born).toBe(estimateBorn(p, l));
    expect(l.birthYear - l.people[0]!.born!).toBeGreaterThanOrEqual(20);
    expect(migrate(l)).toEqual(l);
  });
});

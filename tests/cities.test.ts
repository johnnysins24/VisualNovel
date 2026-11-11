import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, endOfYear, makeGame, pickEvent, resolveChoice, winterModifier } from '../src/engine/engine';
import { cityOf, cityPromotionReady, cityRank, homeHere, moodOf } from '../src/engine/cities';
import { shopClosedLine, shopOpen, shopsHere } from '../src/engine/gear';
import { commitLife, newMeta } from '../src/engine/meta';
import { migrate } from '../src/engine/save';
import { CITY, COURSES } from '../src/engine/balance';
import { newLife, type LifeState, type YearEnd } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับตรวจกติกาของเมือง (ที่อยู่ ค่าเช่า ร้าน ชั้นของคนเมือง สภาพเมือง) และของหลักสูตร (ปีเรียน สาย จบ ออกกลางคัน)
const ok = [{ id: 'ok', label: 'x', text: 'x' }];
const lesson = (id: string, year: number | [number, number], extra: object = {}, choices: object[] = ok) => ({
  id: `youth.${id}`, stage: 'youth', text: 'x', course: { id: 'institute', year }, choices, ...extra,
});
const raw = {
  items: [{ id: 'bread', name: 'ขนมปัง', price: 1, use: { heal: 1, text: 'x' } }],
  traits: [],
  lines: { rent_paid: ['จ่ายแล้ว'], rent_behind: ['ค้าง'], rent_evicted: ['ออก'], shop_income: ['กำไร'], mood_riot_eases: ['ไฟดับ'], shop_riot: ['ร้านปิดเพราะจลาจล'] },
  shops: [{ id: 'dock', name: 'ตลาดท่า', location: 'ventras', staples: ['bread'], greet: ['x'] }],
  events: [
    {
      id: 'adult.start', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'to_ventras', label: 'x', effects: { location_tag: 'ventras' } },
        { id: 'to_market', label: 'x', effects: { city: { move: 'market_town', district: 'mill_lane' } } },
        { id: 'to_ashland', label: 'x', effects: { location_tag: 'ashland' } },
        { id: 'refinery_child', label: 'x', effects: { flags: ['origin_refinery'], location_tag: 'ventras' } },
        { id: 'enrol', label: 'x', effects: { location_tag: 'ventras', course: { enter: 'institute' } } },
      ],
    },
    {
      id: 'adult.town', stage: 'adult', once: false, when: { city: 'any' }, text: 'x',
      choices: [
        { id: 'rent', label: 'x', effects: { city: { home: 'room' } } },
        { id: 'buy', label: 'x', requires: { min_gold: 10 }, effects: { gold: -10, city: { home: 'house' } } },
        { id: 'open', label: 'x', requires: { min_gold: 14 }, effects: { gold: -14, city: { home: 'shop' } } },
        { id: 'help', label: 'x', effects: { city: { merit: 3 } } },
        { id: 'riot', label: 'x', effects: { city: { mood: 'riot' } } },
        { id: 'plague_far', label: 'x', effects: { city: { mood: 'plague', of: 'kardin' } } },
      ],
    },
    {
      id: 'adult.rise', stage: 'adult', must: true, when: { city: { max_rank: 1, ready: true } }, text: 'x',
      choices: [{ id: 'take', label: 'x', effects: { city: { promote: true } } }],
    },
    { id: 'adult.elders', stage: 'adult', when: { city: { id: 'ventras', min_rank: 2 } }, text: 'x', choices: ok },
    { id: 'adult.quiet', stage: 'adult', once: false, text: 'x', choices: ok },
    { id: 'adult.omen', stage: 'adult', must: true, when: { flags: ['omen_due'] }, text: 'x', choices: [{ id: 'see', label: 'x', effects: { clear_flags: ['omen_due'] } }] },
    { id: 'adult.omen_due', stage: 'adult', once: false, when: { flags: ['never'] }, text: 'x', choices: [{ id: 'a', label: 'x', effects: { flags: ['omen_due', 'never'] } }] },
    lesson('dorm', 1),
    lesson('schools', 2, {}, [
      { id: 'stars', label: 'x', effects: { course: { track: 'stars' } } },
      { id: 'war', label: 'x', effects: { course: { track: 'war' } } },
      { id: 'quit', label: 'x', effects: { course: { leave: true }, flags: ['left_the_institute'] } },
      { id: 'again', label: 'x', effects: { course: { hold: true } } },
    ]),
    ...Object.keys(COURSES.institute.tracks).map((t) => lesson(`third_${t}`, [3, 5], { once: false, course: { id: 'institute', year: [3, 5], track: t } })),
    lesson('finals', 6),
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const adult = (extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(7), age: 30, hp: 12, baseMaxHp: 12, ...extra });
const play = (life: LifeState, event: string, choice: string) => resolveChoice(game, { ...life, currentEventId: event }, event, choice).life;
const start = (life: LifeState, choice: string) => play(life, 'adult.start', choice);
const town = (life: LifeState, choice: string) => play(life, 'adult.town', choice);
/** เดินเวลาไป n ปีโดยไม่มีเหตุการณ์ คืนชีวิตกับบันทึกสิ้นปีของแต่ละปี */
function years(life: LifeState, n: number, seed = 1): { life: LifeState; recs: YearEnd[] } {
  const rng = new Rng(seed);
  const recs: YearEnd[] = [];
  let next = life;
  for (let i = 0; i < n; i++) {
    const rec: YearEnd = {};
    next = endOfYear(game, next, rng, rec);
    next = { ...next, age: next.age + 1 };
    recs.push(rec);
  }
  return { life: next, recs };
}
const next = (life: LifeState) => pickEvent(game, life).event?.id;

describe('เมือง', () => {
  it('the test content is valid', () => {
    expect(lintContent(content)).toEqual([]);
  });

  it('moving to a region with a main city puts a newcomer in its first district, with no home and the lowest standing', () => {
    const l = start(adult(), 'to_ventras');
    expect(l).toMatchObject({ city: 'ventras', district: 'sky_docks', locationTag: 'ventras', home: null });
    expect(l.standing.ventras).toEqual({ rank: 1, merit: 0, since: l.birthYear + 30 });
  });

  it('a child born in the city starts as a local in the home district, living in the family home', () => {
    const l = start(adult(), 'refinery_child');
    expect(l).toMatchObject({ city: 'ventras', district: 'refineries', home: { kind: 'family', city: 'ventras', district: 'refineries' } });
    expect(cityRank(l)).toBe(CITY.nativeRank);
    expect(cityPromotionReady(l)).toBe(false);
  });

  it('a town is reached only by its own move, and it sets the region the shops and scenes read', () => {
    const l = start(adult(), 'to_market');
    expect(l).toMatchObject({ city: 'market_town', district: 'mill_lane', locationTag: 'arvel_village' });
  });

  it('leaving for the country drops a rented room but keeps a house that was bought, and the standing waits for a return', () => {
    const renter = town(start(adult(), 'to_ventras'), 'rent');
    expect(homeHere(renter)?.kind).toBe('room');
    expect(start(renter, 'to_ashland')).toMatchObject({ city: null, district: null, home: null, locationTag: 'ashland' });

    const owner = town(town(start(adult({ gold: 12 }), 'to_ventras'), 'help'), 'buy');
    expect(owner.gold).toBe(2);
    const away = start(owner, 'to_ashland');
    expect(away.home).toMatchObject({ kind: 'house', city: 'ventras' });
    expect(homeHere(away)).toBeNull();
    const back = start(away, 'to_ventras');
    expect(homeHere(back)?.kind).toBe('house');
    expect(back.standing.ventras).toMatchObject({ rank: 1, merit: 3 });
  });

  it('rent comes due every few years; a renter who cannot pay falls behind once, then loses the room, and never goes into debt', () => {
    const renter = town(start(adult({ gold: 1 }), 'to_ventras'), 'rent');
    const first = years(renter, CITY.rentEvery);
    expect(first.recs.map((r) => r.rent)).toEqual([undefined, undefined, undefined, { paid: CITY.rent }]);
    expect(first.life.gold).toBe(0);
    const second = years(first.life, CITY.rentEvery);
    expect(second.recs.at(-1)).toMatchObject({ rent: { behind: true }, lines: ['ค้าง'] });
    expect(second.life).toMatchObject({ gold: 0, home: { kind: 'room', behind: true } });
    const third = years(second.life, CITY.rentEvery);
    expect(third.recs.at(-1)?.rent).toEqual({ evicted: true });
    expect(third.life).toMatchObject({ gold: 0, home: null, city: 'ventras' });
    // จ่ายทันในรอบถัดไป หนี้ค่าเช่าหายไป
    const paid = years({ ...second.life, gold: 2 }, CITY.rentEvery);
    expect(paid.life).toMatchObject({ gold: 1, home: { kind: 'room', behind: false } });
  });

  it('a shop of your own pays out every few years, but not in a riot year, and a riot shuts every shop in the city', () => {
    const keeper = town(start(adult({ gold: 14 }), 'to_ventras'), 'open');
    expect(keeper.gold).toBe(0);
    expect(years(keeper, CITY.shopEvery).life.gold).toBe(CITY.shopIncome);
    const dock = shopsHere(game, keeper)[0]!;
    expect(shopOpen(game, keeper, dock)).toBe(true);
    const riot = town(keeper, 'riot');
    expect(moodOf(riot, 'ventras')).toBe('riot');
    expect(shopOpen(game, riot, dock)).toBe(false);
    expect(shopClosedLine(game, riot, dock)).toBe('ร้านปิดเพราะจลาจล');
    // ปีจลาจลไม่มีรายได้ (ตรึงสภาพเมืองไว้ด้วยการตั้งซ้ำทุกปี)
    let l = { ...riot, age: keeper.age };
    for (let i = 0; i < CITY.shopEvery; i++) l = years({ ...l, moods: { ventras: { mood: 'riot', since: l.birthYear + l.age } } }, 1).life;
    expect(l.gold).toBe(0);
  });

  it('a roof of your own counts as winter cover', () => {
    const base = start(adult({ gold: 10 }), 'to_ventras');
    expect(winterModifier(game, town(base, 'buy')) - winterModifier(game, base)).toBe(CITY.roof);
    expect(winterModifier(game, town(base, 'rent'))).toBe(winterModifier(game, base));
  });

  it('standing rises only in the rise scene, once merit reaches the mark', () => {
    const l = start(adult(), 'to_ventras');
    expect(next(l)).not.toBe('adult.rise');
    const helped = town(l, 'help');
    expect(cityPromotionReady(helped)).toBe(true);
    expect(cityRank(helped)).toBe(1);
    expect(next(helped)).toBe('adult.rise');
    const risen = play(helped, 'adult.rise', 'take');
    expect(cityRank(risen)).toBe(2);
    expect(cityPromotionReady(risen)).toBe(false);
  });

  it('a troubled city calms one step at a time, and what is left when the life ends is the city the next life is born into', () => {
    const riot = town(start(adult(), 'to_ventras'), 'riot');
    let l = riot;
    let eased: YearEnd | undefined;
    for (let i = 0; i < 40 && moodOf(l, 'ventras') === 'riot'; i++) {
      const y = years(l, 1, 100 + i);
      l = y.life;
      eased = y.recs[0];
    }
    expect(moodOf(l, 'ventras')).toBe('tense');
    expect(eased).toMatchObject({ eased: { ventras: 'tense' }, lines: ['ไฟดับ'] });

    const far = town(riot, 'plague_far');
    expect(moodOf(far, 'kardin')).toBe('plague');
    const meta = commitLife(newMeta(), far);
    expect(meta.moods).toMatchObject({ ventras: { mood: 'riot' }, kardin: { mood: 'plague' } });
    const heir = newLife(8, meta);
    expect(moodOf(heir, 'ventras')).toBe('riot');
    expect(moodOf(newLife(8, newMeta()), 'ventras')).toBe('calm');
  });

  it('an old save from before cities wakes up in the main city of its region', () => {
    const { city: _c, district: _d, home: _h, standing: _s, moods: _m, ...old } = { ...adult(), locationTag: 'hordun', flags: ['origin_dwarf_clan'] };
    const l = migrate(JSON.parse(JSON.stringify(old)));
    expect(l).toMatchObject({ city: 'tundar', district: 'clan_levels', home: { kind: 'family' }, moods: {} });
    expect(cityRank(l)).toBe(CITY.nativeRank);
    const { city: _c2, district: _d2, home: _h2, standing: _s2, moods: _m2, ...farm } = { ...adult(), locationTag: 'arvel_village' };
    expect(cityOf(migrate(JSON.parse(JSON.stringify(farm))))).toBeNull();
  });

  it('the checker refuses a house sold for less than its floor price or to someone who cannot pay', () => {
    const broken = (choice: object) =>
      lintContent(ContentSchema.parse({ ...raw, events: [...raw.events, { id: 'adult.deal', stage: 'adult', when: { city: 'ventras' }, text: 'x', choices: [choice] }] }));
    expect(broken({ id: 'cheap', label: 'x', requires: { min_gold: 5 }, effects: { gold: -5, city: { home: 'house' } } }).join()).toMatch(/อย่างน้อย 10 เหรียญ/);
    expect(broken({ id: 'broke', label: 'x', effects: { gold: -10, city: { home: 'house' } } }).join()).toMatch(/requires\.min_gold: 10/);
    expect(broken({ id: 'nowhere', label: 'x', effects: { city: { district: 'coal_yard' } } }).join()).toMatch(/ไม่มีย่าน "coal_yard"/);
  });
});

describe('หลักสูตร', () => {
  const student = () => start(adult({ age: 15 }), 'enrol');
  const { student: STUDENT, done: DONE, years: YEARS } = COURSES.institute;

  it('a student gets the lesson of the year before any ordinary story, and each lesson is a year of the course', () => {
    const l = student();
    expect(l.course).toEqual({ id: 'institute', year: 1, since: l.birthYear + 15 });
    expect(l.flags).toContain(STUDENT);
    for (let i = 0; i < 20; i++) expect(next({ ...l, rngState: i + 1 })).toBe('youth.dorm');
    const second = play(l, 'youth.dorm', 'ok');
    expect(second.course?.year).toBe(2);
    expect(next(second)).toBe('youth.schools');
  });

  it('choosing a school is kept for life, and the later years are the lessons of that school only', () => {
    const l = play(play(student(), 'youth.dorm', 'ok'), 'youth.schools', 'stars');
    expect(l.course).toMatchObject({ year: 3, track: 'stars' });
    expect(l.flags).toContain('school_stars');
    for (let i = 0; i < 20; i++) expect(next({ ...l, rngState: i + 1 })).toBe('youth.third_stars');
  });

  it('a world event that must happen still comes first, and does not use up a year of study', () => {
    const l = { ...student(), flags: [...student().flags, 'omen_due'] };
    expect(next(l)).toBe('adult.omen');
    const after = play(l, 'adult.omen', 'see');
    expect(after.course?.year).toBe(1);
    expect(next(after)).toBe('youth.dorm');
  });

  it('the last year ends the course: the student flag goes and the graduate flag stays', () => {
    let l = play(play(student(), 'youth.dorm', 'ok'), 'youth.schools', 'war');
    for (let y = 3; y < YEARS; y++) l = play(l, 'youth.third_war', 'ok');
    expect(l.course?.year).toBe(YEARS);
    expect(next(l)).toBe('youth.finals');
    const done = play(l, 'youth.finals', 'ok');
    expect(done.course).toBeUndefined();
    expect(done.flags).toContain(DONE);
    expect(done.flags).toContain('school_war');
    expect(done.flags).not.toContain(STUDENT);
    // เข้าเรียนหนึ่งปี แล้วเรียนอีกหกปี
    expect(done.age).toBe(15 + 1 + YEARS);
  });

  it('leaving ends the course without the graduate flag; repeating a year keeps the year', () => {
    const second = play(student(), 'youth.dorm', 'ok');
    const out = play(second, 'youth.schools', 'quit');
    expect(out.course).toBeUndefined();
    expect(out.flags).not.toContain(STUDENT);
    expect(out.flags).not.toContain(DONE);
    expect(out.flags).toContain('left_the_institute');
    const held = play(second, 'youth.schools', 'again');
    expect(held.course?.year).toBe(2);
  });

  it('a year with no lesson left still counts, so a student can never be stuck in the same year for life', () => {
    // เรียนซ้ำปีสองหลังใช้เรื่องของปีสองไปแล้ว: ไม่มีบทเรียนให้ออก เรื่องธรรมดาออกแทน และปีเรียนเดินต่อ
    const held = play(play(student(), 'youth.dorm', 'ok'), 'youth.schools', 'again');
    const id = next(held)!;
    expect(game.events.find((e) => e.id === id)?.course).toBeUndefined();
    expect(play(held, 'adult.quiet', 'ok').course?.year).toBe(3);
  });

  it('the checker wants a lesson for every year of a course that can be entered', () => {
    const without = (id: string) => lintContent(ContentSchema.parse({ ...raw, events: raw.events.filter((e) => e.id !== id) })).join();
    expect(without('youth.finals')).toMatch(/หลักสูตร institute: ปี 6/);
    expect(without('youth.third_healing')).toMatch(/ปี 3 ไม่มีเรื่องของสาย healing/);
    expect(applyEffects(game, adult(), { course: { track: 'stars' } }).flags).not.toContain('school_stars');
  });
});

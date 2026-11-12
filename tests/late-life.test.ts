// กติกาของชุด 6 "วัยปลาย": หลานเป็นคนจริงในผังครอบครัว บทของพ่อแม่ของหลาน คำที่หลานเรียกตัวละคร และความสัมพันธ์แบบศิษย์
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { applyEffects, caredFor, makeGame, pickEvent, playable, resolveChoice, settle, type Game } from '../src/engine/engine';
import { lintContent } from '../src/engine/lint';
import { bindCast, livingGrandchildren, personYears } from '../src/engine/people';
import { migrate } from '../src/engine/save';
import { ContentSchema } from '../src/engine/schema';
import { newLife, worldYear, type LifeState, type Person } from '../src/engine/state';
import { render } from '../src/engine/text';
import { GRANDCHILD_CLOSENESS, PARENT_MIN_AGE } from '../src/engine/balance';

type Raw = Record<string, unknown>;
const ev = (id: string, extra: Raw = {}): Raw => ({ id, stage: 'adult', text: id, choices: [{ id: 'ok', label: 'ok', text: 'x' }], ...extra });
const names = [{ race: 'human', male: ['ทอเบล', 'เดรัน', 'ฮาริค', 'โอเรน', 'เบริค', 'ซาเวล'], female: ['คอเดีย', 'มาริส', 'เวสลิน', 'เอดา', 'โรเสน', 'ทีรา'] }];
const gameOf = (events: Raw[]): Game => makeGame(ContentSchema.parse({ events, items: [], names }));
const lint = (events: Raw[]) => lintContent(ContentSchema.parse({ events, items: [], names }));
const person = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, closeness: 2, alive: true, metAge: 0, ...extra });
const play = (game: Game, life: LifeState, id: string, choice = 'ok') => resolveChoice(game, pickEvent(game, life, id).life, id, choice);

const birth = ev('adult.grandchild_born', {
  once: false,
  mark: '{newborn}เกิด',
  cast: { kid: { kin: ['child'], min_age: 20, pick: 'eldest' } },
  choices: [{ id: 'ok', label: 'ok', effects: { grandchild: { of: '@kid' } } }],
});
const minding = ev('adult.minding', {
  once: false,
  cast: { cub: { kin: ['grandchild'], pick: 'youngest' }, kid: { kin: ['child'], parent_of: 'cub' } },
  text: '{cub} {grand:cub} {kid}',
});
const game = gameOf([birth, minding, ev('adult.other', { once: false })]);

/** คนอายุ 62 ที่มีลูกโตแล้วสองคน: ลูกชายคนโตกับลูกสาวคนเล็ก */
const elder = (extra: Partial<LifeState> = {}): LifeState => {
  const l = settle(game, applyEffects(game, { ...newLife(3), age: 62, rngState: new Rng(5).state }, { flags: ['race_human'] }), new Rng(4));
  const year = worldYear(l);
  return {
    ...l,
    people: [person('child_1', { name: 'พี่', gender: 'm', kin: 'child', bond: 'kin', born: year - 34 }), person('child_2', { name: 'น้อง', gender: 'f', kin: 'child', bond: 'kin', born: year - 30 })],
    ...extra,
  };
};

describe('grandchildren are real people on the family map', () => {
  it('a birth adds a named grandchild who knows their parent, and sets has_grandchild', () => {
    const start = elder();
    const { life, entry } = play(game, start, 'adult.grandchild_born');
    const cub = life.people.find((p) => p.id === 'grandchild_1')!;
    expect(cub).toMatchObject({ kin: 'grandchild', bond: 'kin', closeness: GRANDCHILD_CLOSENESS, alive: true, parent: 'child_1', born: worldYear(start) });
    expect(['m', 'f']).toContain(cub.gender);
    expect(names[0]![cub.gender === 'm' ? 'male' : 'female']).toContain(cub.name);
    expect(life.people.filter((p) => p.name === cub.name)).toHaveLength(1);
    expect(life.flags).toContain('has_grandchild');
    expect(life.pendingGrandchildren).toBeUndefined();
    // ป้ายบนเส้นชีวิตใช้ชื่อของหลานที่เพิ่งเกิด
    expect(entry.mark).toBe(`${cub.name}เกิด`);
    expect(livingGrandchildren(life).map((p) => p.id)).toEqual(['grandchild_1']);
  });

  it('a second grandchild gets the next id and another name; a horned parent has a horned child', () => {
    let l = play(game, elder(), 'adult.grandchild_born').life;
    l = { ...l, people: l.people.map((p) => (p.id === 'child_1' ? { ...p, horned: true } : p)) };
    l = play(game, l, 'adult.grandchild_born').life;
    const [first, second] = [l.people.find((p) => p.id === 'grandchild_1')!, l.people.find((p) => p.id === 'grandchild_2')!];
    expect(second.name).not.toBe(first.name);
    expect(first.horned).toBeUndefined();
    expect(second.horned).toBe(true);
  });

  it('no grandchild is born to a house without a grown child', () => {
    const start = elder();
    const young = { ...start, people: start.people.map((p) => ({ ...p, born: worldYear(start) - 12 })) };
    expect(playable(game, young, game.events.find((e) => e.id === 'adult.grandchild_born')!)).toBe(false);
    // ผลที่อ้างบทซึ่งไม่มีคนเล่นไม่ทำให้มีหลานเกิด
    const none = settle(game, applyEffects(game, { ...start, cast: {} }, { grandchild: { of: '@kid' } }), new Rng(1));
    expect(none.people.some((p) => p.kin === 'grandchild')).toBe(false);
    expect(none.flags).not.toContain('has_grandchild');
  });

  it('parent_of casts the parent of the grandchild in the scene, not just any child', () => {
    let l = play(game, elder(), 'adult.grandchild_born').life;
    // หลานคนที่สองเป็นลูกของลูกสาวคนเล็ก
    l = settle(game, applyEffects(game, { ...l, cast: { kid: 'child_2' } }, { grandchild: { of: '@kid' } }), new Rng(9));
    const cast = bindCast(l, game.events.find((e) => e.id === 'adult.minding')!)!;
    expect(cast).toEqual({ cub: 'grandchild_2', kid: 'child_2' });
    // พ่อแม่ที่ไม่อยู่แล้วทำให้บทนั้นไม่มีคนเล่น เหตุการณ์ที่ต้องมีพ่อแม่จึงไม่ออก
    const orphaned = { ...l, people: l.people.map((p) => (p.id === 'child_2' ? { ...p, alive: false } : p)) };
    expect(bindCast({ ...orphaned, people: orphaned.people.filter((p) => p.id !== 'grandchild_1') }, game.events.find((e) => e.id === 'adult.minding')!)).toBeNull();
  });

  it('{grand:role} is what that grandchild calls the character', () => {
    let l = play(game, elder({ gender: 'f' }), 'adult.grandchild_born').life;
    l = settle(game, applyEffects(game, { ...l, cast: { kid: 'child_2' } }, { grandchild: { of: '@kid' } }), new Rng(9));
    const viaSon = { cub: 'grandchild_1' };
    const viaDaughter = { cub: 'grandchild_2' };
    expect(render('{grand:cub}', l, viaSon)).toBe('ย่า');
    expect(render('{grand:cub}', l, viaDaughter)).toBe('ยาย');
    expect(render('{grand:cub}', { ...l, gender: 'm' }, viaSon)).toBe('ปู่');
    expect(render('{grand:cub}', { ...l, gender: 'm' }, viaDaughter)).toBe('ตา');
    // บทที่ไม่มีคนเล่นคงข้อความไว้ให้เห็นว่าผิด
    expect(render('{grand:cub}', l, {})).toBe('{grand:cub}');
  });

  it('a close grandchild who has grown counts as someone who looks after the old', () => {
    const l = elder();
    const year = worldYear(l);
    const cub = (born: number, closeness = 2) => person('grandchild_1', { kin: 'grandchild', bond: 'kin', parent: 'child_1', born, closeness });
    expect(caredFor({ ...l, people: [cub(year - 15)] })).toBe(true);
    expect(caredFor({ ...l, people: [cub(year - 6)] })).toBe(false);
    expect(caredFor({ ...l, people: [cub(year - 15, 1)] })).toBe(false);
  });

  it('the validator holds the grandchild rules', () => {
    const bad = (cast: Raw, choice: Raw = {}) =>
      lint([ev('adult.x', { cast, choices: [{ id: 'ok', label: 'ok', effects: { grandchild: { of: '@kid' } }, ...choice }] })]).join('\n');
    expect(lint([birth, minding])).toEqual([]);
    expect(bad({ pal: { bond: ['friend'] } })).toMatch(/ไม่มีบทนี้/);
    expect(bad({ kid: { kin: ['child', 'sibling_younger'], min_age: 20 } })).toMatch(/รับเฉพาะลูก/);
    expect(bad({ kid: { kin: ['child'], min_age: PARENT_MIN_AGE - 1 } })).toMatch(/min_age/);
    expect(bad({ kid: { kin: ['child'], min_age: 20, optional: true } })).toMatch(/requires\.cast/);
    expect(bad({ kid: { kin: ['child'], min_age: 20, optional: true } }, { requires: { cast: ['kid'] } })).toBe('');
    const order = lint([ev('adult.y', { cast: { kid: { kin: ['child'], parent_of: 'cub' }, cub: { kin: ['grandchild'] } } })]).join('\n');
    expect(order).toMatch(/ต้องเป็นบทที่เขียนไว้ก่อน/);
    // บทที่อาจไม่มีคนเล่นใช้ {grand:...} ได้เฉพาะในตัวเลือกที่มี requires.cast
    const loose = lint([ev('adult.z', { cast: { cub: { kin: ['grandchild'], optional: true } }, text: '{grand:cub}' })]).join('\n');
    expect(loose).toMatch(/optional/);
    expect(lint([ev('adult.w', { text: '{grand:nobody}' })]).join('\n')).toMatch(/placeholder/);
  });
});

describe('pupils', () => {
  const g = gameOf([
    ev('adult.takes_pupil', { choices: [{ id: 'ok', label: 'ok', effects: { people: [{ id: 'late_pupil', name: 'เคริน', gender: 'm', bond: 'pupil', closeness: 1 }] } }] }),
    ev('elder.pupil_day', { once: false, cast: { hand: { bond: ['pupil'] } }, text: '{hand}' }),
  ]);
  it('a pupil joins the map young, and scenes can cast them by that bond', () => {
    const start: LifeState = { ...newLife(2), age: 63, rngState: new Rng(2).state };
    expect(playable(g, start, g.events.find((e) => e.id === 'elder.pupil_day')!)).toBe(false);
    const { life } = play(g, start, 'adult.takes_pupil');
    const pupil = life.people.find((p) => p.id === 'late_pupil')!;
    expect(pupil.bond).toBe('pupil');
    const years = personYears(pupil, { ...life, age: 63 });
    expect(years).toBeGreaterThanOrEqual(12);
    expect(years).toBeLessThanOrEqual(17);
    expect(bindCast(life, g.events.find((e) => e.id === 'elder.pupil_day')!)).toEqual({ hand: 'late_pupil' });
  });
  it('an old save keeps its pupil: the friend named pupil becomes a pupil on load', () => {
    const old = { ...newLife(1), age: 50, people: [person('pupil', { name: 'ทิลวา', bond: 'friend' }), person('pal', { bond: 'friend' })] };
    const life = migrate(JSON.parse(JSON.stringify(old)));
    expect(life.people.find((p) => p.id === 'pupil')!.bond).toBe('pupil');
    expect(life.people.find((p) => p.id === 'pal')!.bond).toBe('friend');
  });
});

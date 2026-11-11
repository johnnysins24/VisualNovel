import { describe, expect, it } from 'vitest';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, eligible, makeGame, pickEvent, resolveChoice } from '../src/engine/engine';
import { keepsTaboo, defiesTaboo } from '../src/engine/land';
import { openArcs } from '../src/engine/arcs';
import { migrate } from '../src/engine/save';
import { ARC, TABOO } from '../src/engine/balance';
import { newLife, worldYear, type LifeState } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับตรวจกติกาของชุด 4: ข้อห้ามของแผ่นดิน (ถือ ฝืน ขอขมา พรที่หลุด) และเส้นเรื่องยาว (ลำดับ จังหวะ กำหนด จำนวนที่เปิดค้าง)
const ok = [{ id: 'ok', label: 'x', text: 'x' }];
const ep = (arc: string, step: number, extra: object = {}, choices: object[] = ok) => ({ id: `adult.${arc}_${step}`, stage: 'adult', text: 'x', arc: { id: arc, step }, choices, ...extra });
const raw = {
  items: [],
  traits: [
    { id: 'old_forest', name: 'พรแห่งป่าไม้', kind: 'boon', how: 'x', breaks: 'โค่นไม้เป็น', becomes: 'curse_woodcutter', effects: [{ kind: 'max_hp', amount: 2 }] },
    { id: 'curse_woodcutter', name: 'คนตัดไม้', kind: 'curse', how: 'x', gives: ['x'], cures: ['x', 'y'], live_with: 'x' },
    { id: 'old_river', name: 'พรท้องน้ำ', kind: 'boon', how: 'x', breaks: 'เทของเสียลงน้ำ' },
  ],
  events: [
    {
      id: 'adult.woods', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'taught', label: 'x', effects: { taboo: { forest: 'learn' } } },
        { id: 'spare', label: 'x', effects: { taboo: { forest: 'keep' } } },
        { id: 'fell', label: 'x', effects: { taboo: { forest: 'break' } } },
        { id: 'plant', label: 'x', effects: { taboo: { forest: 'mend' }, lose_traits: ['curse_woodcutter'] } },
        { id: 'coin', label: 'x', effects: { taboo: { river: 'keep' } } },
        { id: 'slops', label: 'x', effects: { taboo: { river: 'break' } } },
      ],
    },
    { id: 'adult.doe', stage: 'adult', when: { taboo: { id: 'forest', keeps: true } }, text: 'x', choices: [{ id: 'bow', label: 'x', effects: { traits: ['old_forest'] } }] },
    { id: 'adult.river_gift', stage: 'adult', when: { taboo: { id: 'river', keeps: true } }, text: 'x', choices: [{ id: 'take', label: 'x', effects: { traits: ['old_river'] } }] },
    { id: 'adult.old_wood', stage: 'adult', when: { taboo: { id: 'forest', defies: true } }, text: 'x', choices: ok },
    ep('debt', 1, {}, [{ id: 'sign', label: 'x', text: 'x' }, { id: 'walk', label: 'x', effects: { arc: { id: 'debt', close: true } } }]),
    ep('debt', 2),
    ep('debt', 3, {}, [{ id: 'pay', label: 'x', effects: { arc: { id: 'debt', close: true } } }, { id: 'roll_over', label: 'x', text: 'x' }]),
    ep('debt', 4),
    ep('pupil', 1),
    ep('pupil', 2),
    ep('feud', 1),
    ep('feud', 2),
    ep('house', 1),
    ep('house', 2),
    { id: 'adult.quiet', stage: 'adult', once: false, weight: 1000, text: 'x', choices: ok },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const ev = (id: string) => game.events.find((e) => e.id === id)!;
const grown = (): LifeState => ({ ...newLife(7), age: 30, flags: [] });
const pick = (l: LifeState, choice: string, event = 'adult.woods') => resolveChoice(game, { ...l, currentEventId: event }, event, choice).life;
/** เดินเวลาโดยไม่มีเหตุการณ์ */
const later = (l: LifeState, years: number): LifeState => ({ ...l, age: l.age + years });

describe('ข้อห้ามของแผ่นดิน', () => {
  it('the test content is valid', () => {
    expect(lintContent(content)).toEqual([]);
  });

  it('a taboo kept often enough and never broken makes its keeper, and only then does the boon scene open', () => {
    let l = pick(grown(), 'taught');
    expect(l.taboos.forest).toEqual({ kept: 0, broken: 0 });
    expect(eligible(game, l, ev('adult.doe'))).toBe(false);
    for (let i = 0; i < TABOO.holds; i++) l = pick(l, 'spare');
    expect(keepsTaboo(l, 'forest')).toBe(true);
    expect(eligible(game, l, ev('adult.doe'))).toBe(true);
    expect(eligible(game, l, ev('adult.river_gift'))).toBe(false);
  });

  it('breaking a taboo stirs the land, takes the boon of that primordial and leaves its curse', () => {
    let l = grown();
    for (let i = 0; i < TABOO.holds; i++) l = pick(l, 'spare');
    l = pick(l, 'bow', 'adult.doe');
    const hp = l.baseMaxHp;
    expect(l.traits).toContain('old_forest');
    l = pick(l, 'coin');
    l = pick(l, 'fell');
    expect(l.traits).not.toContain('old_forest');
    expect(l.traits).toContain('curse_woodcutter');
    expect(l.baseMaxHp).toBe(hp - 2);
    expect(l.world.land).toBe(TABOO.land);
    expect(keepsTaboo(l, 'forest')).toBe(false);
    // ข้อห้ามของเจ้าเดิมตนอื่นไม่เกี่ยว
    expect(l.taboos.river).toEqual({ kept: 1, broken: 0 });
  });

  it('breaking twice marks a defier; mending clears the breaks and settles the land', () => {
    let l = grown();
    for (let i = 0; i < TABOO.defies; i++) l = pick(l, 'fell');
    expect(defiesTaboo(l, 'forest')).toBe(true);
    expect(eligible(game, l, ev('adult.old_wood'))).toBe(true);
    expect(l.world.land).toBe(TABOO.defies * TABOO.land);
    l = pick(l, 'plant');
    expect(l.taboos.forest!.broken).toBe(0);
    expect(defiesTaboo(l, 'forest')).toBe(false);
    expect(l.world.land).toBe(TABOO.defies * TABOO.land - TABOO.mend);
    // ขอขมาโดยไม่มีอะไรให้ขอ ไม่ทำให้แผ่นดินสงบลงกว่าเดิม
    expect(pick(l, 'plant').world.land).toBe(l.world.land);
  });

  it('a save from before this batch gets a land score of zero and keeps its other scores', () => {
    const old = { ...newLife(5), world: { gods: 2, demon: -1, star: 4 } } as Record<string, unknown>;
    delete old.taboos;
    delete old.arcs;
    const l = migrate(old);
    expect(l.world).toEqual({ gods: 2, demon: -1, star: 4, land: 0 });
    expect(l.taboos).toEqual({});
    expect(l.arcs).toEqual({});
    expect(applyEffects(game, l, { world: { land: 3 } }).world.land).toBe(3);
  });
});

describe('เส้นเรื่องยาว', () => {
  const start = (l: LifeState, arc: string, choice = 'ok') => pick(l, choice, `adult.${arc}_1`);

  it('episodes come in order, and never sooner than the gap', () => {
    let l = grown();
    expect(eligible(game, l, ev('adult.debt_1'))).toBe(true);
    expect(eligible(game, l, ev('adult.debt_2'))).toBe(false);
    l = start(l, 'debt', 'sign');
    expect(l.arcs.debt).toMatchObject({ step: 1 });
    expect(eligible(game, l, ev('adult.debt_2'))).toBe(false);
    l = later(l, ARC.gap - 1 - (worldYear(l) - l.arcs.debt!.at));
    expect(eligible(game, l, ev('adult.debt_2'))).toBe(false);
    l = later(l, 1);
    expect(eligible(game, l, ev('adult.debt_2'))).toBe(true);
    expect(eligible(game, l, ev('adult.debt_3'))).toBe(false);
  });

  it('an episode left waiting past its due year is the next thing that happens', () => {
    let l = start(grown(), 'debt', 'sign');
    // ก่อนถึงกำหนด เรื่องอื่นที่น้ำหนักมากกว่ายังชนะ
    const soon = later(l, ARC.gap);
    expect(pickEvent(game, { ...soon, currentEventId: null }).event?.id).toBe('adult.quiet');
    l = later(l, ARC.due);
    expect(pickEvent(game, { ...l, currentEventId: null }).event?.id).toBe('adult.debt_2');
  });

  it('a choice can close the storyline for good, from the first episode or a later one', () => {
    const walked = start(grown(), 'debt', 'walk');
    expect(walked.arcs.debt).toMatchObject({ step: 1, closed: true });
    expect(eligible(game, later(walked, 20), ev('adult.debt_2'))).toBe(false);
    expect(eligible(game, later(walked, 20), ev('adult.debt_1'))).toBe(false);

    let l = start(grown(), 'debt', 'sign');
    l = pick(later(l, ARC.gap), 'ok', 'adult.debt_2');
    l = pick(later(l, ARC.gap), 'pay', 'adult.debt_3');
    expect(l.arcs.debt).toMatchObject({ step: 3, closed: true });
    expect(eligible(game, later(l, 10), ev('adult.debt_4'))).toBe(false);
  });

  it('no more than the allowed number of storylines stay open at once; a closed or finished one frees its place', () => {
    let l = grown();
    for (const arc of ['debt', 'pupil', 'feud'].slice(0, ARC.maxOpen)) l = start(l, arc, arc === 'debt' ? 'sign' : 'ok');
    expect(openArcs(l, game.arcLast)).toHaveLength(ARC.maxOpen);
    expect(eligible(game, l, ev('adult.house_1'))).toBe(false);
    // เส้นที่เดินถึงตอนสุดท้ายที่เนื้อหามีแล้ว ไม่นับเป็นเส้นที่เปิดค้าง
    const done = pick(later(l, ARC.gap), 'ok', 'adult.pupil_2');
    expect(openArcs(done, game.arcLast)).not.toContain('pupil');
    expect(eligible(game, done, ev('adult.house_1'))).toBe(true);
    // เส้นที่ไม่มีตอนไหนออกได้มานานก็เลิกนับ
    expect(eligible(game, later(l, ARC.stale + 1), ev('adult.house_1'))).toBe(true);
  });

  it('the linter refuses a storyline with a missing episode', () => {
    const broken = ContentSchema.parse({ ...raw, events: raw.events.filter((e) => e.id !== 'adult.debt_2') });
    expect(lintContent(broken).some((p) => p.includes('ไม่มีตอนที่ 2'))).toBe(true);
  });
});

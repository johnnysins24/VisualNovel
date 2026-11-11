// กติกาที่แก้ในชุด refine 0: เหตุการณ์ must, เหตุการณ์ที่ไม่มีตัวเลือกให้กด, เรื่องเกิดซ้ำ, การทอยใหม่,
// HP หลังเปลี่ยนของสวมใส่ และการซ่อมเซฟที่ค้างอยู่ที่เหตุการณ์ซึ่งไม่มีแล้ว
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { checkChance, makeGame, pickEvent, playable, repairLife, resolveChoice, turnsLeft, type Game } from '../src/engine/engine';
import { equip, maxHp } from '../src/engine/items';
import { lintContent } from '../src/engine/lint';
import { exportCode } from '../src/engine/save';
import { ContentSchema } from '../src/engine/schema';
import { newLife, type LifeState } from '../src/engine/state';
import { REPEAT_GAP } from '../src/engine/balance';

type Raw = Record<string, unknown>;
const ev = (id: string, extra: Raw = {}): Raw => ({
  id,
  stage: 'adult',
  text: id,
  choices: [{ id: 'ok', label: 'ok', effects: { flags: [`did_${id.split('.')[1]}`] } }],
  ...extra,
});
const gameOf = (events: Raw[], items: Raw[] = []): Game => makeGame(ContentSchema.parse({ events, items }));
/** ชีวิตทดสอบที่อายุกำหนด พร้อมสถานะสุ่มที่ต่างกันตาม n */
const at = (age: number, n = 1, extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(1), age, rngState: new Rng(n).state, ...extra });
const logOf = (...ids: string[]) => ids.map((eventId, i) => ({ age: i, eventId, choiceId: 'ok' }));

describe('must events', () => {
  it('fire as soon as they are eligible, whatever the weights say', () => {
    const game = gameOf([ev('adult.heavy', { weight: 100000, when: { age: [5, 5] } }), ev('adult.anchor', { must: true, weight: 1, when: { age: [5, 6] } })]);
    for (let n = 1; n <= 200; n++) expect(pickEvent(game, at(5, n)).event?.id).toBe('adult.anchor');
  });

  it('do not consume the random stream', () => {
    const game = gameOf([ev('adult.anchor', { must: true, when: { age: [5, 5] } }), ev('adult.other')]);
    const life = at(5, 7);
    expect(pickEvent(game, life).life.rngState).toBe(life.rngState);
  });

  it('the one whose window closes first goes first, then the other', () => {
    const game = gameOf([
      ev('adult.wide', { must: true, weight: 1000, when: { age: [5, 7] } }),
      ev('adult.narrow', { must: true, weight: 1, when: { age: [5, 5] } }),
      ev('adult.noise', { weight: 500 }),
    ]);
    const first = pickEvent(game, at(5));
    expect(first.event?.id).toBe('adult.narrow');
    const next = resolveChoice(game, first.life, 'adult.narrow', 'ok').life;
    expect(next.age).toBe(6);
    expect(pickEvent(game, next).event?.id).toBe('adult.wide');
  });

  it('a year window counts like an age window', () => {
    const life = at(30);
    const year = life.birthYear + 30;
    const game = gameOf([
      ev('adult.by_age', { must: true, when: { age: [30, 33] } }),
      ev('adult.by_year', { must: true, when: { age: [19, 60], year: [year, year + 1] } }),
    ]);
    expect(turnsLeft(life, game.events[0]!)).toBe(3);
    expect(turnsLeft(life, game.events[1]!)).toBe(1);
    expect(pickEvent(game, life).event?.id).toBe('adult.by_year');
  });

  it('long-lived races count turns in their own years after forty', () => {
    const elf = at(40, 1, { raceApplied: 'elf' });
    const game = gameOf([ev('adult.by_year', { must: true, when: { year: [elf.birthYear + 40, elf.birthYear + 45] } })]);
    // เอลฟ์ข้ามทีละ 10 ปี ช่วงปีที่เหลืออีก 5 ปีจึงไม่มีรอบหน้าแล้ว
    expect(turnsLeft(elf, game.events[0]!)).toBe(0);
    expect(turnsLeft(at(40), game.events[0]!)).toBe(5);
  });

  it('equal deadlines fall back to the higher weight', () => {
    const game = gameOf([ev('adult.light', { must: true, weight: 10, when: { age: [5, 5] } }), ev('adult.heavy', { must: true, weight: 20, when: { age: [5, 5] } })]);
    expect(pickEvent(game, at(5)).event?.id).toBe('adult.heavy');
  });

  it('the linter refuses a repeatable or unconditional must', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [ev('adult.loop', { must: true, once: false, when: { age: [5, 5] } }), ev('adult.always', { must: true })],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('adult.loop: must ใช้กับ once: false ไม่ได้');
    expect(p).toContain('adult.always: must ที่ไม่มีเงื่อนไข');
  });
});

describe('events with no choice left', () => {
  const locked = ev('adult.locked', { weight: 100000, choices: [{ id: 'need', label: 'need', requires: { flag: 'never' }, text: 'x' }] });

  it('are never shown', () => {
    const game = gameOf([locked, ev('adult.open', { weight: 1 })]);
    expect(playable(at(5), game.events[0]!)).toBe(false);
    for (let n = 1; n <= 100; n++) expect(pickEvent(game, at(5, n)).event?.id).toBe('adult.open');
  });

  it('count as no content when nothing else is left', () => {
    expect(pickEvent(gameOf([locked]), at(5)).event).toBeNull();
  });
});

describe('repeatable events', () => {
  const game = gameOf([ev('adult.filler', { once: false, weight: 100000 }), ev('adult.story', { weight: 1 })]);

  it('rest for REPEAT_GAP events after they appear', () => {
    for (let back = 1; back <= REPEAT_GAP; back++) {
      const log = logOf('adult.filler', ...Array.from({ length: back - 1 }, (_, i) => `adult.x${i}`));
      for (let n = 1; n <= 40; n++) expect(pickEvent(game, at(20, n, { log })).event?.id).toBe('adult.story');
    }
  });

  it('come back once the gap has passed', () => {
    const log = logOf('adult.filler', ...Array.from({ length: REPEAT_GAP }, (_, i) => `adult.x${i}`));
    const seen = new Set(Array.from({ length: 40 }, (_, n) => pickEvent(game, at(20, n + 1, { log })).event?.id));
    expect(seen.has('adult.filler')).toBe(true);
  });

  it('still appear when they are the only thing left, so a life never stalls', () => {
    const log = logOf('adult.filler');
    const life = at(20, 1, { log, seen: ['adult.story'] });
    expect(pickEvent(game, life).event?.id).toBe('adult.filler');
  });
});

describe('reroll passive', () => {
  const lucky = { id: 'lucky', name: 'lucky', slot: 'accessory', passive: { description: 'ทอยใหม่', effect: { kind: 'reroll_failed_check' } } };
  const check = (dc: number): Raw =>
    ev('adult.check', {
      choices: [{ id: 'try', label: 'try', check: { stat: 'STR', dc }, success: { effects: { flags: ['won'] } }, failure: { effects: { flags: ['lost'] } } }],
    });
  const wearing = (life: LifeState): LifeState => ({ ...life, inventory: ['lucky'], equipped: { accessory: 'lucky' }, currentEventId: 'adult.check' });

  it('rerolls a natural 1 even when the bonus alone would beat the DC', () => {
    const game = gameOf([check(5)], [lucky]);
    let tested = 0;
    for (let n = 1; n <= 4000 && tested < 20; n++) {
      const r = new Rng(n);
      const first = r.d20();
      const second = r.d20();
      if (first !== 1 || second === 1) continue;
      tested++;
      const life = wearing(at(20, n, { stats: { ...newLife(1).stats, STR: 30 } }));
      const roll = resolveChoice(game, life, 'adult.check', 'try').entry.roll!;
      expect(roll.d20).toBe(second);
      expect(roll.success).toBe(true);
    }
    expect(tested).toBe(20);
  });

  it('keeps a natural 20 without spending a second roll', () => {
    const game = gameOf([check(30)], [lucky]);
    let tested = 0;
    for (let n = 1; n <= 4000 && tested < 10; n++) {
      const r = new Rng(n);
      if (r.d20() !== 20) continue;
      tested++;
      const after = r.state;
      const res = resolveChoice(game, wearing(at(20, n)), 'adult.check', 'try');
      expect(res.entry.roll).toMatchObject({ d20: 20, success: true });
      expect(res.life.rngState).toBe(after);
    }
    expect(tested).toBe(10);
  });

  it('the chance on the button matches what the dice do', () => {
    for (const [dc, str] of [[15, 10], [5, 30], [12, 14], [25, 10]] as const) {
      const game = gameOf([check(dc)], [lucky]);
      const base = wearing(at(20, 1, { stats: { ...newLife(1).stats, STR: str } }));
      const shown = checkChance(game, base, { stat: 'STR', dc });
      let wins = 0;
      const runs = 6000;
      for (let n = 1; n <= runs; n++) {
        if (resolveChoice(game, { ...base, rngState: new Rng(n).state }, 'adult.check', 'try').entry.roll!.success) wins++;
      }
      expect(Math.abs(wins / runs - shown)).toBeLessThan(0.02);
    }
  });
});

describe('equipment and HP', () => {
  const items = [
    { id: 'vigor_ring', name: 'vigor', slot: 'accessory', passive: { description: '+3', effect: { kind: 'max_hp', amount: 3 } } },
    { id: 'plain_ring', name: 'plain', slot: 'accessory' },
  ];
  const game = gameOf([ev('adult.any')], items);

  it('swapping out an item that raised max HP brings HP back under the new maximum', () => {
    let life: LifeState = { ...newLife(1), inventory: ['vigor_ring', 'plain_ring'] };
    life = equip(life, game.items.get('vigor_ring')!, game.items);
    expect(maxHp(life, game.items)).toBe(13);
    expect(life.hp).toBe(10);
    life = { ...life, hp: 13 };
    life = equip(life, game.items.get('plain_ring')!, game.items);
    expect(maxHp(life, game.items)).toBe(10);
    expect(life.hp).toBe(10);
  });

  it('leaves HP alone when the maximum does not drop', () => {
    const hurt: LifeState = { ...newLife(1), hp: 4, inventory: ['vigor_ring'] };
    expect(equip(hurt, game.items.get('vigor_ring')!, game.items).hp).toBe(4);
  });
});

describe('repairing a loaded life', () => {
  const game = gameOf([ev('adult.one', { when: { age: [20, 30] } }), ev('adult.locked', { weight: 100000, choices: [{ id: 'need', label: 'need', requires: { flag: 'never' }, text: 'x' }] })]);

  it('leaves a healthy save untouched', () => {
    const life = at(20, 1, { currentEventId: 'adult.one' });
    expect(repairLife(game, life)).toBe(life);
  });

  it('picks a new event when the saved one no longer exists', () => {
    const fixed = repairLife(game, at(20, 1, { currentEventId: 'adult.removed_in_update' }));
    expect(fixed.alive).toBe(true);
    expect(fixed.currentEventId).toBe('adult.one');
  });

  it('picks a new event when the save has none, or one with no choice left', () => {
    expect(repairLife(game, at(20, 1, { currentEventId: null })).currentEventId).toBe('adult.one');
    expect(repairLife(game, at(20, 1, { currentEventId: 'adult.locked' })).currentEventId).toBe('adult.one');
  });

  it('ends the life as out-of-content, not dead, when nothing can follow', () => {
    const fixed = repairLife(game, at(50, 1, { currentEventId: 'adult.removed_in_update' }));
    expect(fixed).toMatchObject({ alive: false, endReason: 'content_end' });
    expect(fixed.hp).toBeGreaterThan(0);
  });

  it('does not touch a life that already ended', () => {
    const dead = at(30, 1, { alive: false, endReason: 'death', hp: 0, currentEventId: null });
    expect(repairLife(game, dead)).toBe(dead);
  });
});

describe('store: loading a save from before a content update', () => {
  it('an imported save stuck on a missing event becomes playable again', async () => {
    const store = await import('../src/store');
    store.startLife(4242);
    const stuck: LifeState = { ...store.life.value, currentEventId: 'infancy.event_that_was_renamed' };
    store.importLife(exportCode(stuck));
    expect(store.life.value.alive).toBe(true);
    expect(store.currentEvent.value).not.toBeNull();
    expect(store.currentEvent.value!.choices.length).toBeGreaterThan(0);
    expect(store.lastEntry.value).toBeNull();
  });

  it('equipping through the store keeps HP within the maximum', async () => {
    const store = await import('../src/store');
    store.startLife(99);
    const boosters = [...store.game.items.values()].filter((i) => i.passive?.effect.kind === 'max_hp');
    for (const item of boosters) {
      const other = [...store.game.items.values()].find((i) => i.slot === item.slot && i.id !== item.id && i.passive?.effect.kind !== 'max_hp');
      if (!other) continue;
      store.life.value = { ...store.life.value, inventory: [item.id, other.id], equipped: {} };
      store.equip(item.id);
      store.life.value = { ...store.life.value, hp: maxHp(store.life.value, store.game.items) };
      store.equip(other.id);
      expect(store.life.value.hp).toBeLessThanOrEqual(maxHp(store.life.value, store.game.items));
    }
  });
});

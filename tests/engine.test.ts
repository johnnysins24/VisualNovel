import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { loadContent } from '../scripts/content';
import { lintContent } from '../src/engine/lint';
import { applyEffects, applyPeople, checkChance, choiceLock, makeGame, pickEvent, resolveChoice, settle } from '../src/engine/engine';
import { equip, effectiveStats, maxHp } from '../src/engine/items';
import { newLife } from '../src/engine/state';
import { exportCode, importCode } from '../src/engine/save';
import { ContentSchema } from '../src/engine/schema';

const content = loadContent('tests/fixtures/content');
const game = makeGame(content);

describe('rng', () => {
  it('same seed gives same sequence', () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.d20(), a.d20(), a.d20()]).toEqual([b.d20(), b.d20(), b.d20()]);
  });
  it('d20 stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.d20();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe('content', () => {
  it('passes the linter', () => expect(lintContent(content)).toEqual([]));
  it('linter catches unreachable events and missing items', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [
        { id: 'youth.a', stage: 'youth', when: { flags: ['never_set'] }, text: 'x', choices: [{ id: 'c', label: 'c', effects: { items: ['ghost'] } }] },
        { id: 'youth.b', stage: 'youth', text: 'x', choices: [{ id: 'noop', label: 'noop' }] },
      ],
    });
    const p = lintContent(bad).join('\n');
    expect(p).toContain('never_set');
    expect(p).toContain('ghost');
    expect(p).toContain('ไม่มีผล');
  });
});

describe('engine', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      let life = newLife(123);
      const trail: string[] = [];
      for (let i = 0; i < 20 && life.alive; i++) {
        const p = pickEvent(game, life);
        if (!p.event) break;
        const ch = p.event.choices.find((c) => !c.requires)!;
        life = resolveChoice(game, p.life, p.event.id, ch.id).life;
        trail.push(`${p.event.id}:${ch.id}:${life.hp}`);
      }
      return trail;
    };
    expect(run()).toEqual(run());
  });
  it('respects age and flag conditions', () => {
    const life = newLife(1);
    const ids = game.events
      .filter((e) => e.when.age && life.age >= e.when.age[0] && life.age <= e.when.age[1] && !e.when.flags && !e.when.class && !e.when.year && !e.when.world)
      .map((e) => e.id);
    for (let s = 0; s < 30; s++) {
      const p = pickEvent(game, { ...life, rngState: s });
      expect(ids).toContain(p.event!.id);
    }
  });
  it('rejects unavailable choices', () => {
    expect(() => resolveChoice(game, newLife(1), 'childhood.test_fence', 'speak')).toThrow();
  });
  it('is dying at 0 hp once past the protected age', () => {
    const l = applyEffects(game, { ...newLife(1), age: 12 }, { hp: -99 });
    expect(l.dying).toBe('wound');
    expect(l.hp).toBe(0);
  });
  it('natural 20 always succeeds', () => {
    // find a seed whose first d20 is 20, then check against an impossible DC
    let seed = 0;
    while (new Rng(newLife(seed).rngState).d20() !== 20) seed++;
    const g = makeGame(ContentSchema.parse({ items: [], events: [{ id: 'youth.t', stage: 'youth', text: 't', choices: [{ id: 'c', label: 'c', check: { stat: 'STR', dc: 30 }, success: { effects: { gold: 1 } }, failure: { effects: { gold: -1 } } }] }] }));
    const { entry } = resolveChoice(g, newLife(seed), 'youth.t', 'c');
    expect(entry.roll?.success).toBe(true);
  });
});

describe('equipment', () => {
  const dagger = game.items.get('test_dagger')!;
  const cap = game.items.get('test_cap')!;
  it('adds stats and passives only while equipped', () => {
    let life = { ...newLife(1), inventory: ['test_dagger', 'test_cap'] };
    expect(effectiveStats(life, game.items).DEX).toBe(10);
    life = equip(equip(life, dagger, game.items), cap, game.items);
    expect(effectiveStats(life, game.items).DEX).toBe(11);
    expect(maxHp(life, game.items)).toBe(12);
  });
  it('cannot equip an item not owned', () => {
    expect(equip(newLife(1), dagger, game.items).equipped).toEqual({});
  });
});

describe('save code', () => {
  it('round-trips including Thai text', () => {
    const life = { ...newLife(9), name: 'ผู้กล้า', gold: 5 };
    expect(importCode(exportCode(life))).toEqual(life);
  });
  it('rejects garbage', () => expect(() => importCode(btoa('{"a":1}'))).toThrow());
});

describe('choice helpers for the HUD', () => {
  const base = () => {
    const l = newLife(1);
    l.stats = { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    return l;
  };
  it('checkChance matches the d20 rules (nat 20 wins, nat 1 fails)', () => {
    const l = base();
    // DEX 14 = +2, DC 12 needs 10+ on the die: 11 faces of 20
    expect(checkChance(game, l, { stat: 'DEX', dc: 12 })).toBeCloseTo(11 / 20);
    expect(checkChance(game, l, { stat: 'STR', dc: 30 })).toBeCloseTo(1 / 20);
    expect(checkChance(game, l, { stat: 'STR', dc: 1 })).toBeCloseTo(19 / 20);
  });
  it('choiceLock shows stat-only locks and hides the rest', () => {
    const l = base();
    expect(choiceLock(game, l, { id: 'a', label: 'a' })).toBeNull();
    expect(choiceLock(game, l, { id: 'b', label: 'b', requires: { min_stat: { STR: 14 } } })).toEqual([{ stat: 'STR', min: 14 }]);
    expect(choiceLock(game, l, { id: 'c', label: 'c', requires: { trait: 'beast_tongue' } })).toBe('hidden');
    expect(choiceLock(game, l, { id: 'd', label: 'd', requires: { trait: 'beast_tongue', min_stat: { STR: 14 } } })).toBe('hidden');
  });
  it('log entries record what a choice changed', () => {
    let l = newLife(3);
    let found = false;
    for (let i = 0; i < 40 && l.alive && !found; i++) {
      const { event, life: next } = pickEvent(game, l);
      if (!event) break;
      const c = event.choices.find((x) => choiceLock(game, next, x) === null)!;
      const res = resolveChoice(game, next, event.id, c.id);
      if (res.entry.changes) {
        found = true;
        const ch = res.entry.changes;
        for (const [s, d] of Object.entries(ch.stats ?? {})) expect(res.life.stats[s as 'STR'] - next.stats[s as 'STR']).toBe(d);
        if (ch.gold) expect(res.life.gold - next.gold).toBe(ch.gold);
      }
      l = res.life;
    }
    expect(found).toBe(true);
  });
});

describe('people and endings', () => {
  it('applyPeople adds, updates by id, clamps closeness and records deaths', () => {
    let ppl = applyPeople([], [{ id: 'rowen', name: 'โรวีน', bond: 'friend', closeness: 2 }], 15);
    expect(ppl).toEqual([{ id: 'rowen', name: 'โรวีน', bond: 'friend', closeness: 2, alive: true, metAge: 15 }]);
    ppl = applyPeople(ppl, [{ id: 'rowen', closeness: 9 }, { id: 'ghost', closeness: 1 }], 16);
    expect(ppl).toHaveLength(1);
    expect(ppl[0]!.closeness).toBe(5);
    ppl = applyPeople(ppl, [{ id: 'rowen', dies: true }], 20);
    expect(ppl[0]).toMatchObject({ alive: false, diedAge: 20 });
  });
  it('a die effect ends the life as a real death (at once when no death scene exists)', () => {
    const l = { ...newLife(5), age: 40, currentEventId: 'elder.test_end' };
    const dead = resolveChoice(game, l, 'elder.test_end', 'rest').life;
    expect(dead.alive).toBe(false);
    expect(dead.endReason).toBe('death');
    expect(dead.deathCause).toBe('wound');
    expect(dead.age).toBe(40);
  });
  it('lint flags a person who is never named', () => {
    const bad = ContentSchema.parse({
      items: [],
      events: [{ id: 'youth.p', stage: 'youth', text: 'x', choices: [{ id: 'c', label: 'c', effects: { people: [{ id: 'nobody', closeness: 1 }] } }] }],
    });
    expect(lintContent(bad).join('\n')).toContain('nobody');
  });
  it('parents become people once names are drawn', () => {
    const l = settle(game, applyEffects(game, newLife(9), { flags: ['race_human'] }), new Rng(1));
    expect(l.parents).not.toBeNull();
    expect(l.people.find((p) => p.id === 'father')?.name).toBe(l.parents!.father);
    expect(l.people.find((p) => p.id === 'mother')?.kin).toBe('mother');
  });
});

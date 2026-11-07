import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { loadContent } from '../scripts/content';
import { lintContent } from '../src/engine/lint';
import { applyEffects, makeGame, pickEvent, resolveChoice } from '../src/engine/engine';
import { equip, effectiveStats, maxHp } from '../src/engine/items';
import { newLife } from '../src/engine/state';
import { exportCode, importCode } from '../src/engine/save';
import { ContentSchema } from '../src/engine/schema';

const content = loadContent();
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
    const ids = game.events.filter((e) => e.when.age && life.age >= e.when.age[0] && !e.when.flags).map((e) => e.id);
    for (let s = 0; s < 30; s++) {
      const p = pickEvent(game, { ...life, rngState: s });
      expect(ids).toContain(p.event!.id);
    }
  });
  it('rejects unavailable choices', () => {
    expect(() => resolveChoice(game, newLife(1), 'childhood.test_fence', 'speak')).toThrow();
  });
  it('dies at 0 hp', () => {
    const l = applyEffects(game, newLife(1), { hp: -99 });
    expect(l.alive).toBe(false);
  });
  it('natural 20 always succeeds', () => {
    // find a seed whose first d20 is 20, then check against an impossible DC
    let seed = 0;
    while (new Rng(seed).d20() !== 20) seed++;
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
    life = equip(equip(life, dagger), cap);
    expect(effectiveStats(life, game.items).DEX).toBe(11);
    expect(maxHp(life, game.items)).toBe(12);
  });
  it('cannot equip an item not owned', () => {
    expect(equip(newLife(1), dagger).equipped).toEqual({});
  });
});

describe('save code', () => {
  it('round-trips including Thai text', () => {
    const life = { ...newLife(9, 'ผู้กล้า'), gold: 5 };
    expect(importCode(exportCode(life))).toEqual(life);
  });
  it('rejects garbage', () => expect(() => importCode(btoa('{"a":1}'))).toThrow());
});

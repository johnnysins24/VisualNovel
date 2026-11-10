import { describe, expect, it } from 'vitest';
import { renderLook } from '../art/kit/core.mjs';
import { newLife, type LifeState } from '../src/engine/state';
import type { ItemIndex } from '../src/engine/items';
import { kit } from '../src/sprites/kit';
import { namedInText, namedLook, personLook, playerLook } from '../src/sprites/looks';
import { CLASS_IDS, RACE_IDS } from '../src/engine/balance';

const noItems: ItemIndex = new Map();
const life = (over: Partial<LifeState>): LifeState => ({ ...newLife(7), ...over });
const ORIGINS = ['farm', 'refinery', 'dwarf_clan', 'elf_bough', 'marked_hidden', 'marked_kept', 'marked_foundling', 'ashland'];

describe('player sprite from the life state', () => {
  it('uses the child body before 12 and the grown body after', () => {
    expect(playerLook(life({ gender: 'm', age: 5 }), noItems).body).toBe('cm');
    expect(playerLook(life({ gender: 'f', age: 11 }), noItems).body).toBe('cf');
    expect(playerLook(life({ gender: 'f', age: 12 }), noItems).body).toBe('f');
  });

  it('keeps the same face, hair and colours as the character grows', () => {
    const a = playerLook(life({ gender: 'm', age: 3 }), noItems);
    const b = playerLook(life({ gender: 'm', age: 30, classId: 'warrior' }), noItems);
    expect(b.choices).toEqual(a.choices);
    expect(b.pieces!.find((p) => p.startsWith('hair/'))).toBe(a.pieces!.find((p) => p.startsWith('hair/')));
  });

  it('shows race pieces: dwarf beard, tiefling tail and horns with amber eyes', () => {
    const dwarf = playerLook(life({ gender: 'm', age: 25, flags: ['race_dwarf'] }), noItems);
    expect(dwarf.pieces!.some((p) => /^beard\/m\/(long|braided|boxed)$/.test(p))).toBe(true);
    const tief = playerLook(life({ gender: 'f', age: 8, flags: ['race_tiefling'] }), noItems);
    expect(tief.pieces).toContain('tail/tiefling');
    expect(tief.pieces).toContain('horns/stumps');
    expect(tief.choices!.eyes).toBe('amber');
    expect(playerLook(life({ age: 20, flags: ['race_elf'] }), noItems).pieces).toContain('ears/elf');
  });

  it('dresses by class, and a held item replaces the class weapon', () => {
    const w = playerLook(life({ gender: 'm', age: 20, classId: 'warrior' }), noItems);
    expect(w.pieces).toContain('body/leather_armor');
    expect(w.pieces).toContain('weapon/longsword');
    const items: ItemIndex = new Map();
    const held = playerLook(life({ gender: 'm', age: 20, classId: 'warrior', equipped: { weapon: 'navy_saber' } }), items);
    expect(held.pieces).toContain('weapon/saber');
    expect(held.pieces).not.toContain('weapon/longsword');
  });

  it('renders every race x sex x age x origin x class without errors', () => {
    let n = 0;
    for (const race of RACE_IDS)
      for (const gender of ['m', 'f'] as const)
        for (const origin of ORIGINS)
          for (const [age, classId] of [[4, null], [16, null], ...CLASS_IDS.map((c) => [30, c] as const), [60, 'cleric']] as const) {
            const l = life({ gender, age, classId, god: 'talis', flags: [`race_${race}`, `origin_${origin}`], seed: n++ });
            const img = renderLook(kit, playerLook(l, noItems, 'smile'));
            expect(img.rgba.some((v) => v > 0)).toBe(true);
          }
  }, 60_000);

  it('every item in art/items.yaml fits on a grown body', () => {
    for (const id of Object.keys(kit.data.items)) {
      for (const gender of ['m', 'f'] as const) {
        const look = playerLook(life({ gender, age: 25, equipped: { accessory: id } }), noItems);
        expect(() => renderLook(kit, look)).not.toThrow();
      }
    }
  });
});

describe('NPC sprites', () => {
  it('uses the fixed look for named characters and finds them in text', () => {
    expect(namedLook('kedra')!.pieces).toContain('weapon/longsword');
    expect(namedInText('เสียงของเคดราดังมาจากลาน')).toBe('kedra');
    expect(namedInText('ไม่มีใครเลย')).toBeNull();
  });

  it('draws family from recipes: same race as the player, grandparents grey', () => {
    const l = life({ age: 10, flags: ['race_dwarf', 'origin_dwarf_clan'] });
    const gma = personLook({ id: 'gma', kin: 'grandmother_paternal', gender: 'f' }, l);
    expect(gma.body).toBe('f');
    expect(gma.choices!.hair).toBe('silver');
    const dad = personLook({ id: 'dad', kin: 'father', gender: 'm' }, l);
    expect(dad.pieces!.some((p) => p.startsWith('beard/'))).toBe(true);
    expect(personLook({ id: 'dad', kin: 'father', gender: 'm' }, l)).toEqual(dad);
    expect(personLook({ id: 'kid', kin: 'child', gender: 'f' }, l).body).toBe('cf');
    for (const look of [gma, dad]) expect(() => renderLook(kit, look)).not.toThrow();
  });
});

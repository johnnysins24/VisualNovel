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
  it('draws each age stage with its own body: newborn, baby, toddler, child, teen, adult', () => {
    const at = (age: number, gender: 'm' | 'f' = 'm') => playerLook(life({ gender, age }), noItems);
    expect(at(0).body).toBe('bm');
    expect(at(0).pieces).toEqual(expect.arrayContaining(['body/swaddle', 'acc/basket', 'hair/wisp']));
    expect(at(1, 'f').body).toBe('bf');
    expect(at(1, 'f').pieces).toContain('body/baby_romper');
    for (const age of [2, 3, 4]) expect(at(age).body).toBe('tm');
    expect(at(5).body).toBe('cm');
    expect(at(11, 'f').body).toBe('cf');
    expect(at(12, 'f').body).toBe('yf');
    expect(at(15).body).toBe('ym');
    expect(at(16, 'f').body).toBe('f');
  });

  it('babies wear no hairstyle, weapon, hat or shoes; toddlers keep short hair', () => {
    for (const age of [0, 1]) {
      const look = playerLook(life({ gender: 'm', age, classId: 'warrior', equipped: { weapon: 'navy_saber' } }), noItems);
      expect(look.pieces!.filter((p) => /^(hair\/[mf]\/|weapon|offhand|head|feet|cloak)/.test(p))).toEqual([]);
    }
    for (let seed = 0; seed < 40; seed++) {
      const hair = playerLook(life({ gender: 'f', age: 3, seed }), noItems).pieces!.find((p) => p.startsWith('hair/'));
      expect(['hair/f/bob', 'hair/f/pixie', 'hair/f/ponytail', 'hair/f/twin_braids']).toContain(hair);
    }
  });

  it('ages by human-equivalent years: a 60-year-old elf is not old yet, a 60-year-old human is', () => {
    const elf = playerLook(life({ age: 60, flags: ['race_elf'], raceApplied: 'elf' }), noItems);
    expect(elf.pieces).not.toContain('mark/wrinkles');
    const human = playerLook(life({ age: 60, flags: ['race_human'], raceApplied: 'human' }), noItems);
    expect(human.pieces).toContain('mark/wrinkles');
    expect(human.choices!.hair).toBe('silver');
  });

  it('never gives a young non-elf silver hair', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(playerLook(life({ age: 3, seed, flags: ['race_human'] }), noItems).choices!.hair).not.toBe('silver');
    }
  });

  it('no beard or moustache before grown-up, even for dwarves', () => {
    for (let seed = 0; seed < 20; seed++) {
      const teen = playerLook(life({ gender: 'm', age: 14, seed, flags: ['race_dwarf'] }), noItems);
      expect(teen.pieces!.some((p) => p.startsWith('beard/'))).toBe(false);
    }
  });

  it('keeps the same face, hair and colours as the character grows', () => {
    const a = playerLook(life({ gender: 'm', age: 6 }), noItems);
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

  it('dresses by class but never draws held weapons or off-hand things', () => {
    const w = playerLook(life({ gender: 'm', age: 20, classId: 'warrior', equipped: { weapon: 'navy_saber', accessory: 'healer_satchel' } }), noItems);
    expect(w.pieces).toContain('body/leather_armor');
    expect(w.pieces).toContain('acc/satchel');
    expect(w.pieces!.some((p) => /^(weapon|offhand)\//.test(p))).toBe(false);
  });

  it('renders every race x sex x age x origin x class without errors', () => {
    let n = 0;
    for (const race of RACE_IDS)
      for (const gender of ['m', 'f'] as const)
        for (const origin of ORIGINS)
          for (const [age, classId] of [[0, null], [1, 'warrior'], [3, null], [8, null], [13, 'rogue'], [16, null], ...CLASS_IDS.map((c) => [30, c] as const), [60, 'cleric']] as const) {
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
    expect(namedLook('kedra')!.pieces).toContain('body/chainmail');
    expect(namedLook('kedra')!.pieces!.some((p) => p.startsWith('weapon/'))).toBe(false);
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
    for (const look of [gma, dad]) expect(() => renderLook(kit, look)).not.toThrow();
  });

  it('a sibling born during the story starts as a baby and grows up with the player', () => {
    const sib = { id: 'sib', kin: 'sibling_younger' as const, gender: 'f' as const, metAge: 3, alive: true, closeness: 0, name: 'x' };
    const at = (age: number) => personLook(sib, life({ age }));
    expect(at(3).body).toBe('bf');
    expect(at(3).pieces).toContain('body/swaddle');
    expect(at(4).body).toBe('bf');
    expect(at(6).body).toBe('tf');
    expect(at(12).body).toBe('cf');
    expect(at(17).body).toBe('yf');
    expect(at(30).body).toBe('f');
    for (const a of [3, 4, 6, 12, 17, 30]) expect(() => renderLook(kit, at(a))).not.toThrow();
  });

  it('a child born to the player grows up too, and parents grow old', () => {
    const kid = { id: 'kid', kin: 'child' as const, gender: 'm' as const, metAge: 25 };
    expect(personLook(kid, life({ age: 25 })).body).toBe('bm');
    expect(personLook(kid, life({ age: 33 })).body).toBe('cm');
    const dad = { id: 'father', kin: 'father' as const, gender: 'm' as const };
    expect(personLook(dad, life({ age: 0 })).pieces).not.toContain('mark/wrinkles');
    expect(personLook(dad, life({ age: 40 })).pieces).toContain('mark/wrinkles');
  });

  it('a father back from the coal war keeps his iron hook', () => {
    const dad = { id: 'father', kin: 'father' as const, gender: 'm' as const };
    expect(personLook(dad, life({ age: 8, flags: ['father_iron_arm'] })).pieces).toContain('arm/hook');
    expect(personLook(dad, life({ age: 8 })).pieces).not.toContain('arm/hook');
  });

  it('the dead keep the age they died at', () => {
    const dad = { id: 'father', kin: 'father' as const, gender: 'm' as const, alive: false, diedAge: 2 };
    expect(personLook(dad, life({ age: 40 })).pieces).not.toContain('mark/wrinkles');
  });
});

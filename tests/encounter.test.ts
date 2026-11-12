import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { fightResting, makeGame, pickEvent, repairLife } from '../src/engine/engine';
import { knowsFlag, moveOdds, openMoves, resolveMove, techniqueOf } from '../src/engine/encounter';
import { ENCOUNTER } from '../src/engine/balance';
import { newLife, type LifeState, type LogEntry } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับตรวจกติกาการปะทะ: หมา (เอาถึงตาย ระดับ 2 แรงใจ 3) กับโจร (พูดรู้เรื่อง ไม่เอาถึงตาย)
interface RawMove { id: string; label: string; kind: string; [k: string]: unknown }
const move = (id: string, kind: string, extra: object = {}): RawMove => ({ id, label: id, kind, ...extra });
const beat = (n: number, extra: object = {}, more: RawMove[] = []): { text: string; answer?: string; moves: RawMove[] } => ({
  text: `จังหวะ ${n}`,
  moves: [move(`hit${n}`, 'attack', { tags: ['pierce'] }), move(`dodge${n}`, 'quick'), move(`burn${n}`, 'item', { stat: 'INT', tags: ['fire'] }), move(`run${n}`, 'flee'), ...more],
  ...extra,
});
const raw = {
  items: [
    { id: 'coat', name: 'เสื้อหนัง', slot: 'body', passive: { description: 'เกราะ', effect: { kind: 'armor', amount: 1 } } },
    { id: 'plate', name: 'เกราะเหล็ก', slot: 'legs', rarity: 'uncommon', passive: { description: 'เกราะ', effect: { kind: 'armor', amount: 2 } } },
    { id: 'board', name: 'โล่ไม้', slot: 'offhand', passive: { description: 'โล่', effect: { kind: 'shield' } } },
    { id: 'coin', name: 'เหรียญนำโชค', slot: 'accessory', rarity: 'rare', passive: { description: 'ทอยใหม่', effect: { kind: 'reroll_failed_check' } } },
  ],
  traits: [
    { id: 'wound_scar', name: 'แผลเป็น', kind: 'wound', how: 'x', costs: ['x'] },
    { id: 'wound_knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['x'] },
    { id: 'second_wind', name: 'ลมหายใจที่สอง', kind: 'boon', how: 'x', breaks: 'x', effects: [{ kind: 'cheat_death', flag: 'cheated' }] },
  ],
  foes: [
    { id: 'hound', name: 'หมา', side: 'demon', threat: 2, morale: 3, weak: ['pierce'], strong: ['fire'], lore: 'x', strike: ['{foe}กัด', '{foe}ตะกุย', '{foe}ชน', '{foe}ขบ'], hurt: ['{foe}ร้อง', '{foe}ถอย'], wounds: ['wound_scar', 'wound_knee'] },
    { id: 'thug', name: 'โจร', side: 'human', threat: 2, morale: 2, weak: ['talk'], speaks: true, lethal: false, lore: 'x', strike: ['a', 'b'], hurt: ['c', 'd'], wounds: ['wound_scar'] },
  ],
  events: [
    {
      id: 'youth.hound',
      stage: 'youth',
      once: false,
      cast: { friend: { optional: true } },
      text: 'หมาเถ้าขวางทาง',
      encounter: {
        foe: 'hound',
        beats: [beat(1, { answer: 'quick' }, [move('pair', 'attack', { ally: 'friend' }), move('read1', 'read', { stat: 'WIS' })]), beat(2, { answer: 'attack' }), beat(3), beat(4)],
        win: { text: 'ชนะ', effects: { gold: 5 } },
        lose: { text: 'แพ้' },
        stalemate: { text: 'ยัน' },
        flee: { text: 'หนี' },
        death: { text: 'ตาย' },
      },
    },
    {
      id: 'youth.thug',
      stage: 'youth',
      once: false,
      text: 'โจรขวางทาง',
      encounter: {
        foe: 'thug',
        beats: [
          { text: '1', moves: [move('punch1', 'attack'), move('duck1', 'quick'), move('deal', 'talk', { parley: true }), move('sing', 'talk')] },
          { text: '2', moves: [move('punch2', 'attack'), move('duck2', 'quick')] },
        ],
        win: { text: 'ชนะ' },
        lose: { text: 'แพ้', effects: { gold: -3 } },
        stalemate: { text: 'ยัน' },
        parley: { text: 'ตกลงกันได้' },
      },
    },
    { id: 'youth.plain', stage: 'youth', once: false, text: 'x', choices: [{ id: 'ok', label: 'ok', text: 'ok' }] },
    { id: 'adult.kit', stage: 'adult', when: { age: [90, 99] }, text: 'x', choices: [{ id: 'take', label: 'take', effects: { items: ['coat', 'plate', 'board', 'coin'] } }] },
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);

/** สถานะสุ่มที่ทำให้การทอยครั้งถัดไปออกตามลำดับนี้ */
function rolls(...want: number[]): number {
  for (let s = 1; s < 5_000_000; s++) {
    const r = Rng.fromState(s);
    if (want.every((w) => r.d20() === w)) return s;
  }
  throw new Error('หาสถานะสุ่มไม่เจอ');
}

function start(id: string, patch: Partial<LifeState> = {}): LifeState {
  const base: LifeState = { ...newLife(1), age: 16, hp: 10, baseMaxHp: 10, namesApplied: true, ...patch };
  return pickEvent(game, base, id).life;
}
const ev = (id: string) => game.events.find((e) => e.id === id)!;
const play = (life: LifeState, moveId: string, d20: number | number[], armed = false) =>
  resolveMove(game, { ...life, rngState: rolls(...[d20].flat()) }, moveId, armed);
const odds = (life: LifeState, moveId: string, armed = false) => {
  const e = ev(life.currentEventId!);
  return moveOdds(game, life, e, openMoves(game, life, e).find((m) => m.id === moveId)!, armed);
};

describe('encounter content', () => {
  it('the test content passes the linter', () => expect(lintContent(content)).toEqual([]));

  it('the linter catches encounters that cannot work', () => {
    const broken = structuredClone(raw);
    const hound = broken.events[0]!.encounter!;
    hound.beats = hound.beats.slice(0, 2); // แรงใจ 3 ในสองจังหวะ
    hound.beats[0]!.moves = hound.beats[0]!.moves.filter((m) => m.kind !== 'flee'); // เอาถึงตายแต่ไม่มีทางหนี
    (hound.beats[1] as { answer?: string }).answer = 'talk'; // สัญญาณที่ไม่มีวิธีรับ
    const thug = broken.events[1]!.encounter!;
    thug.foe = 'nobody';
    delete (thug as { parley?: unknown }).parley;
    (broken.events[2] as { encounter?: unknown }).encounter = structuredClone(raw.events[1]!.encounter);
    const p = lintContent(ContentSchema.parse(broken)).join('\n');
    expect(p).toContain('ไม่มีทางชนะ');
    expect(p).toContain('ต้องมีทางหนี');
    expect(p).toContain('answer "talk"');
    expect(p).toContain('ไม่มีศัตรู "nobody"');
    expect(p).toContain('ไม่มีผลของการเจรจา');
    expect(p).toContain('มี choices ไม่ได้');
  });
});

describe('encounter flow', () => {
  it('starts with the foe at full morale and offers the open moves', () => {
    const life = start('youth.hound');
    expect(life.encounter).toMatchObject({ beat: 0, morale: 3, hpStart: 10, weakKnown: false });
    // ไม่มีเพื่อนเล่นบท friend วิธีที่ต้องมีคนช่วยจึงไม่ขึ้น
    expect(openMoves(game, life, ev('youth.hound')).map((m) => m.id)).toEqual(['hit1', 'dodge1', 'burn1', 'run1', 'read1']);
  });

  it('a success takes one morale pip and the fight is won when morale runs out', () => {
    let life = start('youth.hound');
    let r = play(life, 'dodge1', 15);
    expect(r.done).toBe(false);
    expect(r.record).toMatchObject({ success: true, pips: 1 });
    expect(r.life.encounter).toMatchObject({ beat: 1, morale: 2 });
    r = play(r.life, 'hit2', 15);
    r = play(r.life, 'hit3', 15);
    expect(r.done).toBe(true);
    life = r.life;
    expect(r.entry).toMatchObject({ eventId: 'youth.hound', choiceId: 'win', text: 'ชนะ' });
    expect(r.entry!.encounter).toMatchObject({ foe: 'hound', end: 'win', morale: 3 });
    expect(r.entry!.encounter!.records).toHaveLength(3);
    expect(r.entry!.changes).toEqual({ gold: 5 });
    expect(life.encounter).toBeUndefined();
    expect(life.currentEventId).toBeNull();
    expect(life.age).toBe(17);
    expect(life.flags).toContain(knowsFlag('hound'));
    expect(life.log.at(-1)).toBe(r.entry);
  });

  it('a natural 20 takes two pips and a natural 1 always fails', () => {
    const life = start('youth.hound', { stats: { ...newLife(1).stats, DEX: 40 } });
    expect(play(life, 'dodge1', 20).record.pips).toBe(ENCOUNTER.critPips);
    expect(play(life, 'dodge1', 1).record).toMatchObject({ success: false, damage: 2 });
  });

  it('a failure costs the threat in hit points and uses the foe\'s own lines', () => {
    const r = play(start('youth.hound'), 'hit1', 2);
    expect(r.record.damage).toBe(2);
    expect(r.life.hp).toBe(8);
    expect(['หมากัด', 'หมาตะกุย']).toContain(r.record.text);
    // ประโยคเดิมไม่ซ้ำในการปะทะเดียวกัน
    const again = play(r.life, 'hit2', 2);
    expect(again.record.text).not.toBe(r.record.text);
  });

  it('armour takes off damage up to its cap and never below the minimum', () => {
    const one = start('youth.hound', { inventory: ['coat'], equipped: { body: 'coat' } });
    expect(play(one, 'hit1', 2).record.damage).toBe(1);
    const both = start('youth.hound', { inventory: ['coat', 'plate'], equipped: { body: 'coat', legs: 'plate' } });
    expect(play(both, 'hit1', 2).record.damage).toBe(ENCOUNTER.minDamage);
  });

  it('a shield blocks the first hit only', () => {
    const life = start('youth.hound', { inventory: ['board'], equipped: { offhand: 'board' } });
    const first = play(life, 'hit1', 2);
    expect(first.record).toMatchObject({ blocked: 'shield' });
    expect(first.life.hp).toBe(10);
    expect(play(first.life, 'hit2', 2).record.damage).toBe(2);
  });

  it('runs out of beats as a stalemate', () => {
    let r = play(start('youth.hound'), 'hit1', 15);
    r = play(r.life, 'hit2', 2);
    r = play(r.life, 'hit3', 2);
    r = play(r.life, 'hit4', 15);
    expect(r.done).toBe(true);
    expect(r.entry).toMatchObject({ choiceId: 'stalemate', text: 'ยัน' });
    expect(r.life.hp).toBe(6);
    // ยังไม่รู้จุดอ่อนและไม่ได้ชนะ: ยังไม่ได้ความรู้เรื่องศัตรูตัวนี้
    expect(r.life.flags).not.toContain(knowsFlag('hound'));
  });

  it('fleeing ends the fight and is easier than fighting', () => {
    const life = start('youth.hound');
    expect(odds(life, 'run1').dc).toBe(ENCOUNTER.dc[1]! - ENCOUNTER.fleeEase);
    const r = play(life, 'run1', 15);
    expect(r.entry).toMatchObject({ choiceId: 'flee', text: 'หนี' });
    expect(r.life.currentEventId).toBeNull();
    // หนีไม่พ้นก็เจ็บเหมือนพลาดวิธีอื่น
    expect(play(life, 'run1', 2).record.damage).toBe(2);
  });

  it('a parley ends the fight at once, with speaking foes only', () => {
    const r = play(start('youth.thug'), 'deal', 18);
    expect(r.entry).toMatchObject({ choiceId: 'parley', text: 'ตกลงกันได้' });
    expect(r.record.pips).toBeUndefined();
  });
});

describe('going down', () => {
  it('a foe that does not kill leaves the character at 1 hp with a wound', () => {
    const r = play(start('youth.thug', { hp: 2, gold: 10 }), 'punch1', 2);
    expect(r.done).toBe(true);
    expect(r.entry).toMatchObject({ choiceId: 'lose' });
    expect(r.record.damage).toBe(1);
    expect(r.life.dying).toBeNull();
    expect(r.life.alive).toBe(true);
    expect(r.life.traits).toContain('wound_scar');
    expect(r.entry!.changes).toMatchObject({ gold: -3, traits: ['wound_scar'] });
  });

  it('a deadly foe kills past the protected age, and the death is told once', () => {
    const r = play(start('youth.hound', { hp: 2 }), 'hit1', 2);
    expect(r.entry).toMatchObject({ choiceId: 'death', text: 'ตาย' });
    expect(r.life.dying).toBe('fight');
    expect(r.life.deathTold).toBe(true);
    expect(r.life.hp).toBe(0);
    expect(r.life.traits).not.toContain('wound_scar');
    // เวลาไม่เดิน ฉากตายเป็นเหตุการณ์ถัดไป
    expect(r.life.age).toBe(16);
    expect(pickEvent(game, r.life).event?.id).toBe('death.any');
  });

  it('a child under the protected age goes down but does not die', () => {
    const r = play(start('youth.hound', { hp: 2, age: 11 }), 'hit1', 2);
    expect(r.entry).toMatchObject({ choiceId: 'lose' });
    expect(r.life.hp).toBe(1);
    expect(r.life.dying).toBeNull();
  });

  it('a death ward is spent instead of the life', () => {
    const r = play(start('youth.hound', { hp: 2, traits: ['second_wind'] }), 'hit1', 2);
    expect(r.entry).toMatchObject({ choiceId: 'lose' });
    expect(r.life.hp).toBe(1);
    expect(r.life.traits).not.toContain('second_wind');
    expect(r.life.flags).toContain('cheated');
    expect(r.entry!.changes?.lostTraits).toEqual(['second_wind']);
  });

  it('losing more than half the starting hit points leaves a wound even without going down', () => {
    let r = play(start('youth.hound', { hp: 7 }), 'hit1', 2);
    r = play(r.life, 'hit2', 2);
    r = play(r.life, 'run3', 15);
    // เสีย 4 จาก 7
    expect(r.entry).toMatchObject({ choiceId: 'flee' });
    expect(r.life.traits).toContain('wound_scar');
    // มีแผลแรกแล้วได้แผลถัดไปของศัตรูชนิดนั้น
    let again = play(start('youth.hound', { hp: 7, traits: ['wound_scar'] }), 'hit1', 2);
    again = play(again.life, 'hit2', 2);
    again = play(again.life, 'run3', 15);
    expect(again.life.traits).toEqual(['wound_scar', 'wound_knee']);
  });
});

describe('odds', () => {
  it('shows the true chance of a move', () => {
    const life = start('youth.hound');
    // ค่าพลัง 10 ไม่มีแต้มพิเศษ ความยาก 12: ทอย 12 ขึ้นไป 9 หน้าจาก 20
    const o = odds(life, 'hit1');
    expect(o).toMatchObject({ stat: 'STR', dc: 12, mod: 0, parts: [] });
    expect(o.chance).toBeCloseTo(9 / 20);
    for (let d = 2; d <= 19; d++) expect(play(life, 'hit1', d).record.success).toBe(d + o.mod >= o.dc);
  });

  it('answering the tell adds its bonus', () => {
    const o = odds(start('youth.hound'), 'dodge1');
    expect(o.parts).toEqual([{ kind: 'tell', amount: ENCOUNTER.tell }]);
    expect(o.mod).toBe(ENCOUNTER.tell);
  });

  it('the weakness counts only once it is known, the strength always counts', () => {
    const fresh = start('youth.hound');
    expect(odds(fresh, 'hit1').parts).toEqual([]);
    expect(odds(fresh, 'burn1').parts).toEqual([{ kind: 'strong', amount: -ENCOUNTER.strong }]);
    const knows = start('youth.hound', { flags: [knowsFlag('hound')] });
    expect(odds(knows, 'hit1').parts).toEqual([{ kind: 'weak', amount: ENCOUNTER.weak }]);
  });

  it('reading the foe reveals the weakness for the rest of the fight and for life', () => {
    let r = play(start('youth.hound'), 'read1', 15);
    expect(r.record).toMatchObject({ success: true, pips: 1 });
    expect(r.life.encounter!.weakKnown).toBe(true);
    expect(odds(r.life, 'hit2').parts).toEqual([{ kind: 'tell', amount: ENCOUNTER.tell }, { kind: 'weak', amount: ENCOUNTER.weak }]);
    r = play(r.life, 'run2', 15);
    expect(r.life.flags).toContain(knowsFlag('hound'));
    expect(start('youth.hound', { flags: r.life.flags }).encounter!.weakKnown).toBe(true);
  });

  it('a friend in the scene opens the shared move and adds a bonus', () => {
    const people = [{ id: 'pim', name: 'พิม', bond: 'friend' as const, closeness: 3, alive: true, metAge: 8 }];
    const life = start('youth.hound', { people });
    expect(life.cast).toEqual({ friend: 'pim' });
    expect(odds(life, 'pair').parts).toEqual([{ kind: 'ally', amount: ENCOUNTER.ally }]);
  });
});

describe('class techniques', () => {
  it('warrior: the first failed roll is rolled again, once per fight', () => {
    const life = start('youth.hound', { classId: 'warrior' });
    expect(odds(life, 'hit1').chance).toBeCloseTo(1 - (11 / 20) ** 2);
    const r = play(life, 'hit1', [2, 15]);
    expect(r.record).toMatchObject({ success: true, rerolled: true, tech: 'reroll', d20: 15 });
    expect(techniqueOf(r.life)).toMatchObject({ ready: false, why: 'used' });
    expect(play(r.life, 'hit2', [2, 15]).record).toMatchObject({ success: false, d20: 2 });
  });

  it('an item that rerolls works once per fight too', () => {
    const life = start('youth.hound', { inventory: ['coin'], equipped: { accessory: 'coin' } });
    const r = play(life, 'hit1', [2, 15]);
    expect(r.record).toMatchObject({ success: true, rerolled: true });
    expect(r.record.tech).toBeUndefined();
    expect(play(r.life, 'hit2', [2, 15]).record.success).toBe(false);
  });

  it('rogue: a success in the first beat takes an extra pip, later beats do not', () => {
    const life = start('youth.hound', { classId: 'rogue' });
    const first = play(life, 'hit1', 15);
    expect(first.record).toMatchObject({ pips: 2, tech: 'ambush' });
    const second = play(first.life, 'hit2', 15);
    expect(second.record.pips).toBe(1);
    // พลาดจังหวะแรกก็หมดโอกาส
    const missed = play(life, 'hit1', 2);
    expect(techniqueOf(missed.life).ready).toBe(false);
    expect(play(missed.life, 'hit2', 15).record.pips).toBe(1);
  });

  it('wizard: an armed spell rolls on INT, counts as the weakness and ignores the strength', () => {
    const life = start('youth.hound', { classId: 'wizard', stats: { ...newLife(1).stats, INT: 16 } });
    const plain = odds(life, 'burn1');
    expect(plain.parts).toEqual([{ kind: 'strong', amount: -ENCOUNTER.strong }]);
    const armed = odds(life, 'hit1', true);
    // INT 16 (+3) โบนัสนักเวท +1 และนับเป็นจุดอ่อน +3
    expect(armed).toMatchObject({ stat: 'INT', mod: 7, tech: true, parts: [{ kind: 'tech', amount: ENCOUNTER.weak }] });
    expect(odds(life, 'burn1', true).parts).toEqual([{ kind: 'tech', amount: ENCOUNTER.weak }]);
    // เวทใช้กับการหนีไม่ได้
    expect(odds(life, 'run1', true).tech).toBe(false);
    const r = play(life, 'hit1', 10, true);
    expect(r.record).toMatchObject({ tech: 'spell', success: true });
    expect(odds(r.life, 'hit2', true).tech).toBe(false);
  });

  it('cleric: an armed ward takes the hit, unless the god is far away', () => {
    const life = start('youth.hound', { classId: 'cleric', god: 'ulwen' });
    const r = play(life, 'hit1', 2, true);
    expect(r.record).toMatchObject({ success: false, blocked: 'ward', tech: 'ward' });
    expect(r.record.damage).toBeUndefined();
    expect(r.life.hp).toBe(10);
    expect(play(r.life, 'hit2', 2, true).record.damage).toBe(2);
    const godless = start('youth.hound', { classId: 'cleric', god: null });
    expect(techniqueOf(godless)).toMatchObject({ ready: false, why: 'drifted' });
    expect(play(godless, 'hit1', 2, true).record.damage).toBe(2);
    const drifted = start('youth.hound', { classId: 'cleric', god: 'verus', alignment: { law: -9, moral: -9 } });
    expect(techniqueOf(drifted)).toMatchObject({ ready: false, why: 'drifted' });
  });

  it('ranger: knows the weakness on sight, and the armed bonus works at home only', () => {
    const home = start('youth.hound', { classId: 'ranger', homeTag: 'village', locationTag: 'village' });
    expect(home.encounter!.weakKnown).toBe(true);
    expect(odds(home, 'hit1', true).parts).toEqual([{ kind: 'weak', amount: ENCOUNTER.weak }, { kind: 'tech', amount: 2 }]);
    const away = start('youth.hound', { classId: 'ranger', homeTag: 'village', locationTag: 'city' });
    expect(away.encounter!.weakKnown).toBe(true);
    expect(techniqueOf(away)).toMatchObject({ ready: false, why: 'away' });
    expect(odds(away, 'hit1', true).tech).toBe(false);
  });

  it('bard: the song helps talking only and is kept until a talking move uses it', () => {
    const life = start('youth.thug', { classId: 'bard' });
    expect(odds(life, 'sing', true).parts).toEqual([{ kind: 'tech', amount: 3 }]);
    expect(odds(life, 'punch1', true).tech).toBe(false);
    const r = play(life, 'punch1', 2, true);
    expect(techniqueOf(r.life).ready).toBe(true);
  });

  it('commoner: one armed bonus per fight on any move', () => {
    const life = start('youth.hound');
    expect(techniqueOf(life)).toMatchObject({ kind: 'at_hand', armable: true, ready: true });
    expect(odds(life, 'run1', true).parts).toEqual([{ kind: 'tech', amount: 2 }]);
    const r = play(life, 'hit1', 11, true);
    expect(r.record).toMatchObject({ success: true, tech: 'at_hand' });
    expect(odds(r.life, 'hit2', true).tech).toBe(false);
  });
});

describe('saved fights', () => {
  it('a fight in progress is kept on load', () => {
    const mid = play(start('youth.hound'), 'hit1', 15).life;
    expect(repairLife(game, mid)).toBe(mid);
  });

  it('a save without fight state restarts the same fight, and stale fight state is dropped', () => {
    const { encounter: _lost, ...bare } = start('youth.hound');
    expect(repairLife(game, bare).encounter).toMatchObject({ beat: 0, morale: 3 });
    const stale = { ...start('youth.plain'), encounter: start('youth.hound').encounter! };
    expect(repairLife(game, stale).encounter).toBeUndefined();
  });

  it('refuses a move that is not open', () => {
    expect(() => resolveMove(game, start('youth.hound'), 'pair')).toThrow();
    expect(() => resolveMove(game, start('youth.plain'), 'hit1')).toThrow();
  });
});

describe('pacing', () => {
  const fought = (id = 'youth.thug'): LogEntry => ({ age: 16, eventId: id, choiceId: 'win', encounter: { foe: 'thug', name: 'โจร', end: 'win', morale: 2, records: [] } });
  const quiet = (n: number): LogEntry[] => Array.from({ length: n }, (_, i) => ({ age: 16, eventId: `quiet.${i}`, choiceId: 'ok' }));
  const base = (log: LogEntry[], patch: Partial<LifeState> = {}): LifeState => ({ ...newLife(1), age: 16, hp: 10, baseMaxHp: 10, namesApplied: true, log, ...patch });

  it('after a fight the next one waits: longer for a quiet life than for an armed one', () => {
    const { calm, armed } = ENCOUNTER.gap;
    expect(fightResting(base([fought(), ...quiet(calm - 1)]), ev('youth.hound'))).toBe(true);
    expect(fightResting(base([fought(), ...quiet(calm)]), ev('youth.hound'))).toBe(false);
    expect(fightResting(base([fought(), ...quiet(armed)], { classId: 'warrior' }), ev('youth.hound'))).toBe(false);
    expect(fightResting(base([fought(), ...quiet(armed - 1)], { classId: 'warrior' }), ev('youth.hound'))).toBe(true);
    expect(fightResting(base([fought()]), ev('youth.plain'))).toBe(false);
  });

  it('no fight is drawn while fights are resting and another event is open', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const picked = pickEvent(game, { ...base([fought(), ...quiet(2)]), rngState: seed }).event!;
      expect(picked.id).toBe('youth.plain');
    }
  });

  it('a repeatable fight stops coming back after its limit', () => {
    const many = [...Array.from({ length: ENCOUNTER.repeatMax }, () => fought('youth.hound')), ...quiet(ENCOUNTER.gap.calm)];
    expect(fightResting(base(many), ev('youth.hound'))).toBe(true);
    expect(fightResting(base(many), ev('youth.thug'))).toBe(false);
    expect(fightResting(base(many.slice(1)), ev('youth.hound'))).toBe(false);
  });
});

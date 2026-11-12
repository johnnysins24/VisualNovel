import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, eligible, makeGame, resolveChoice } from '../src/engine/engine';
import { beginEncounter, openMoves, resolveMove, techniqueOf } from '../src/engine/encounter';
import { huntLevel, membership, realmNow } from '../src/engine/orgs';
import { commitLife, newMeta } from '../src/engine/meta';
import { ORG, REALM_CAP } from '../src/engine/balance';
import { newLife, type LifeState } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับกติกาของชุด อ: ลัทธิที่ต้องปิดตัวตน การโดนเปิดโปง สายงานของอาณาจักร คำสาบานเหล็กเย็น และสภาพของอาณาจักร
const fight = (id: string, foe: string) => ({
  id: `adult.${id}`, stage: 'adult', once: false, text: 'x',
  encounter: {
    foe,
    beats: [1, 2, 3].map((n) => ({ text: `${n}`, moves: [{ id: `hit${n}`, label: 'hit', kind: 'attack' }, { id: `hold${n}`, label: 'hold', kind: 'guard' }, { id: `run${n}`, label: 'run', kind: 'flee' }] })),
    win: { text: 'ชนะ' }, lose: { text: 'แพ้' }, stalemate: { text: 'ยัน' }, flee: { text: 'หนี' }, death: { text: 'ตาย' },
  },
});
const raw = {
  items: [{ id: 'bell', name: 'กระดิ่ง', slot: 'accessory', stats: { WIS: 1 } }],
  traits: [
    { id: 'oath_cold_iron', name: 'คำสาบานเหล็กเย็น', kind: 'boon', how: 'x', gives: ['x'], breaks: 'x' },
    { id: 'boon_lamp', name: 'พรตะเกียง', kind: 'boon', how: 'x', gives: ['x'], breaks: 'x' },
    { id: 'wound_knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['x'] },
  ],
  lines: {},
  foes: [
    { id: 'witch', name: 'แม่มด', side: 'human', magic: true, threat: 2, morale: 3, weak: ['noise'], speaks: true, lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'] },
    { id: 'thug', name: 'นักเลง', side: 'human', threat: 2, morale: 3, weak: ['noise'], speaks: true, lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'] },
  ],
  events: [
    {
      id: 'adult.start', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'dream', label: 'x', effects: { org: { id: 'ash_cult', join: true, secret: true } } },
        { id: 'caught', label: 'x', effects: { org: { id: 'ash_cult', secret: false } } },
        { id: 'farm', label: 'x', effects: { flags: ['job_farmer'] } },
        { id: 'fort', label: 'x', effects: { flags: ['job_wardens'] } },
        { id: 'enlist', label: 'x', effects: { org: { id: 'crown_army', join: true } } },
        { id: 'swear', label: 'x', effects: { org: { id: 'cold_iron', join: true }, traits: ['oath_cold_iron'], items: ['bell'] } },
        { id: 'pray', label: 'x', effects: { traits: ['boon_lamp'] } },
        { id: 'tax', label: 'x', effects: { world: { treasury: 5 } } },
        { id: 'riot', label: 'x', effects: { world: { peace: -3 } } },
      ],
    },
    { id: 'adult.whisper', stage: 'adult', once: false, duty: 'ash_cult', when: { org: { id: 'ash_cult', secret: true } }, text: 'x', choices: [{ id: 'go', label: 'x', text: 'x' }, { id: 'no', label: 'x', refuse: true, text: 'x' }] },
    { id: 'adult.named', stage: 'adult', once: false, when: { org: { id: 'ash_cult', secret: false } }, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    { id: 'adult.pyre', stage: 'adult', once: false, hunt: 'lamp_church', text: 'x', choices: [{ id: 'hide', label: 'x', text: 'x' }] },
    { id: 'adult.lean_year', stage: 'adult', once: false, when: { world: { peace: [-20, -2] } }, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    { id: 'adult.empty_chair', stage: 'adult', once: false, when: { location_tag: ['arvel_village', 'ventras'], world: { throne: [-8, -2] } }, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    {
      id: 'adult.eighth_winter', stage: 'adult', must: true, once: false, when: { org: { id: 'crown_army', min_years: 8 } }, text: 'x',
      choices: [{ id: 'out', label: 'x', effects: { org: { id: 'crown_army', leave: true } } }, { id: 'again', label: 'x', effects: { org: { id: 'crown_army', term: true } } }],
    },
    fight('witch', 'witch'),
    fight('thug', 'thug'),
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const ev = (id: string) => game.events.find((e) => e.id === id)!;
const adult = (extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(7), age: 30, hp: 12, baseMaxHp: 12, ...extra });
const start = (life: LifeState, choice: string) => resolveChoice(game, { ...life, currentEventId: 'adult.start' }, 'adult.start', choice).life;

describe('องค์กรลับและอาณาจักร', () => {
  it('the test content is valid', () => {
    expect(lintContent(content)).toEqual([]);
  });

  it('a cult member is unknown until exposed: no hunt and only the quiet scenes before, the hunt and only the exposed scenes after', () => {
    const hidden = start(adult(), 'dream');
    expect(membership(hidden, 'ash_cult')).toMatchObject({ rank: 1, secret: true });
    expect(huntLevel(hidden, 'lamp_church')).toBe(0);
    expect(eligible(game, hidden, ev('adult.whisper'))).toBe(true);
    expect(eligible(game, hidden, ev('adult.named'))).toBe(false);
    expect(eligible(game, hidden, ev('adult.pyre'))).toBe(false);
    const known = start(hidden, 'caught');
    expect(membership(known, 'ash_cult')?.secret).toBeUndefined();
    expect(huntLevel(known, 'lamp_church')).toBe(ORG.enemyLevel);
    expect(eligible(game, known, ev('adult.whisper'))).toBe(false);
    expect(eligible(game, known, ev('adult.named'))).toBe(true);
    expect(eligible(game, known, ev('adult.pyre'))).toBe(true);
  });

  it('taking a post in the kingdom ends the old job, and the order that came with that job', () => {
    const farmer = start(adult(), 'farm');
    const soldier = start(farmer, 'enlist');
    expect(soldier.flags).not.toContain('job_farmer');
    expect(membership(soldier, 'crown_army')?.rank).toBe(1);
    // สายงานของอาณาจักรไม่มีศัตรูประจำ
    expect(soldier.hunted).toEqual({});
    const warden = start(adult(), 'fort');
    expect(membership(warden, 'wardens')).toBeDefined();
    const moved = start(warden, 'enlist');
    expect(membership(moved, 'wardens')).toBeUndefined();
    expect(membership(moved, 'crown_army')).toBeDefined();
  });

  it('the cold iron oath closes spells and new boons, and its bearers cut down those who use magic', () => {
    const wizard = adult({ classId: 'wizard' });
    expect(techniqueOf(wizard, game).ready).toBe(true);
    const sworn = start(wizard, 'swear');
    expect(sworn.traits).toContain('oath_cold_iron');
    expect(techniqueOf(sworn, game)).toMatchObject({ ready: false, why: 'cold_iron' });
    expect(start(sworn, 'pray').traits).not.toContain('boon_lamp');
    expect(start(wizard, 'pray').traits).toContain('boon_lamp');
    // เตาเลิกตามคนที่สาบานแล้ว ส่วนสถาบันเริ่มรู้จักหน้า
    const marked = start({ ...wizard, hunted: { cold_iron: 2 } }, 'swear');
    expect([huntLevel(marked, 'cold_iron'), huntLevel(marked, 'royal_institute')]).toEqual([0, ORG.enemyLevel]);
    // ของขององค์กรที่วางคืนตอนออก หลุดจากมือและจากช่องที่สวม
    const laid = applyEffects(game, { ...sworn, equipped: { accessory: 'bell' } }, { lose_items: ['bell'] });
    expect([sworn.inventory.includes('bell'), laid.inventory.includes('bell'), laid.equipped.accessory]).toEqual([true, false, undefined]);
    // คนถือกระดิ่งขึ้นไป: สำเร็จครั้งแรกกับผู้ใช้เวท ศัตรูเสียแรงใจเพิ่มหนึ่งขีด กับคนธรรมดาไม่ได้
    const bell = { ...sworn, classId: null, orgs: { cold_iron: { ...sworn.orgs.cold_iron!, rank: 2 } } };
    const firstHit = (id: string) => {
      for (let seed = 1; seed <= 300; seed++) {
        const at = { ...bell, rngState: new Rng(seed).state, hp: 40, baseMaxHp: 40, stats: { ...bell.stats, STR: 20 }, currentEventId: id };
        let l: LifeState = { ...at, encounter: beginEncounter(game, at, ev(id))! };
        while (l.encounter) {
          const r = resolveMove(game, l, openMoves(game, l, ev(id))[0]!.id);
          l = r.life;
          const hit = r.entry?.encounter?.records.find((x) => x.success);
          if (hit) return hit;
        }
      }
      throw new Error('ไม่สำเร็จสักครั้ง');
    };
    expect(firstHit('adult.witch').tech).toBe('cut_spell');
    expect(firstHit('adult.thug').tech).toBeUndefined();
  });

  it('the state of the realm moves within its bounds, reaches the people below, and is left to the next life', () => {
    let l = adult();
    expect(eligible(game, l, ev('adult.lean_year'))).toBe(false);
    l = start(start(l, 'tax'), 'tax');
    expect(l.world.treasury).toBe(REALM_CAP);
    l = start(l, 'riot');
    expect(eligible(game, l, ev('adult.lean_year'))).toBe(true);
    const meta = commitLife(newMeta(), applyEffects(game, l, { world: { gods: 2 } }));
    expect(meta.realm).toEqual({ treasury: REALM_CAP, peace: -3 });
    const heir = newLife(8, meta);
    expect(heir.world).toMatchObject({ treasury: REALM_CAP, peace: -3, throne: 0, gods: 0 });
  });

  it('history moves the realm by itself from its year on, on top of what earlier lives left, and only where the story says it reaches', () => {
    // ปี 318 บัลลังก์ว่าง: คนในแผ่นดินอาร์เวลเจอเรื่องของบัลลังก์ว่างตั้งแต่ปีนั้น คนนอกอาร์เวลไม่เจอ
    const at = (year: number, extra: Partial<LifeState> = {}) => adult({ birthYear: year - 30, locationTag: 'ventras', ...extra });
    const chair = ev('adult.empty_chair');
    expect(eligible(game, at(317), chair)).toBe(false);
    expect(eligible(game, at(318), chair)).toBe(true);
    expect(eligible(game, at(318, { locationTag: 'arvel_village' }), chair)).toBe(true);
    expect(eligible(game, at(318, { locationTag: 'hordun' }), chair)).toBe(false);
    // ชีวิตก่อนที่ทำให้คนเชื่อบัลลังก์ขึ้นหนึ่งขีดทิ้งโลกที่ปี 318 เบาลงไว้ให้ และค่าที่ส่งต่อไม่รวมปีร้ายของประวัติศาสตร์
    const mended = applyEffects(game, at(340), { world: { throne: 1 } });
    expect(realmNow(mended, 'throne')).toBe(-1);
    const meta = commitLife(newMeta(), mended);
    expect(meta.realm).toEqual({ throne: 1 });
    expect(eligible(game, { ...newLife(9, meta), age: 30, birthYear: 290, locationTag: 'ventras' }, chair)).toBe(false);
    // ปี 332 หนี้สงครามถ่านครบกำหนด และค่าที่อ่านไม่เกินเพดาน
    expect(realmNow(at(331), 'treasury')).toBe(0);
    expect(realmNow(at(332), 'treasury')).toBe(-2);
    expect(realmNow(applyEffects(game, at(332), { world: { treasury: -8 } }), 'treasury')).toBe(-REALM_CAP);
  });

  it('a soldier\'s contract comes due after eight winters, and again only eight winters after signing on anew', () => {
    const winter = ev('adult.eighth_winter');
    // ปีที่นับคือปีของโลก: เข้าปีไหน ครบแปดฤดูหนาวในปีที่แปดถัดจากนั้น ไม่ว่าระหว่างนั้นจะเจอเรื่องกี่เรื่อง
    const inYear = (l: LifeState, year: number): LifeState => ({ ...l, age: year - l.birthYear });
    const sign = (l: LifeState, choice: string) => resolveChoice(game, { ...l, currentEventId: winter.id }, winter.id, choice).life;
    const soldier = start(adult(), 'enlist');
    const joined = membership(soldier, 'crown_army')!.joined;
    expect(eligible(game, inYear(soldier, joined + 7), winter)).toBe(false);
    const due = inYear(soldier, joined + 8);
    expect(eligible(game, due, winter)).toBe(true);
    const again = sign(due, 'again');
    expect(membership(again, 'crown_army')).toMatchObject({ rank: 1, joined, term: joined + 8 });
    expect(eligible(game, again, winter)).toBe(false);
    expect(eligible(game, inYear(again, joined + 15), winter)).toBe(false);
    expect(eligible(game, inYear(again, joined + 16), winter)).toBe(true);
    expect(membership(sign(due, 'out'), 'crown_army')).toBeUndefined();
    // วันครบสัญญาที่มีทางหนึ่งไม่ปิดรอบ จะออกซ้ำทุกปี ตัวตรวจจึงไม่รับ
    const broken = structuredClone(raw) as typeof raw;
    (broken.events.find((e) => e.id === 'adult.eighth_winter') as { choices: object[] }).choices.push({ id: 'stay', label: 'x', effects: { org: { id: 'crown_army', merit: 1 } } });
    expect(lintContent(ContentSchema.parse(broken)).join('\n')).toContain('adult.eighth_winter: must ใช้กับ once: false ไม่ได้');
  });

  it('the linter refuses cult scenes that do not say whether the member is known, open entry to a cult, and a hunt that could reach the hunters own people', () => {
    const broken = structuredClone(raw) as typeof raw;
    (broken.events.find((e) => e.id === 'adult.named') as { when: object }).when = { org: 'ash_cult' };
    (broken.events[0] as { choices: object[] }).choices.push({ id: 'bad', label: 'x', effects: { org: { id: 'star_listeners', join: true } } });
    broken.events.push({ id: 'adult.rite', stage: 'adult', once: false, hunt: 'ash_cult', text: 'x', choices: [{ id: 'hide', label: 'x', text: 'x' }] } as never);
    (broken.events[0] as { choices: object[] }).choices.push({ id: 'mark', label: 'x', effects: { hunted: { ash_cult: 1 } } });
    const problems = lintContent(ContentSchema.parse(broken)).join('\n');
    expect(problems).toContain('adult.named: "ash_cult" เป็นองค์กรที่สมาชิกต้องปิดตัวตน');
    expect(problems).toContain('adult.start/bad: "star_listeners" เป็นองค์กรที่สมาชิกต้องปิดตัวตน เข้าได้แบบลับเท่านั้น');
    expect(problems).toContain('adult.rite: ลัทธิเถ้าขึ้นกับฝ่าย "ash_cult"');
  });
});

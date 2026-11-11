import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { ContentSchema } from '../src/engine/schema';
import { lintContent } from '../src/engine/lint';
import { applyEffects, eligible, endOfYear, makeGame, pickEvent, resolveChoice } from '../src/engine/engine';
import { beginEncounter, moveOdds, openMoves, resolveMove } from '../src/engine/encounter';
import { huntLevel, membership, promotionReady } from '../src/engine/orgs';
import { migrate } from '../src/engine/save';
import { ORG } from '../src/engine/balance';
import { newLife, type LifeState } from '../src/engine/state';

// ชุดเนื้อหาเล็กสำหรับตรวจกติกาขององค์กร: งานที่ทำให้เป็นสมาชิก งานที่องค์กรส่งมา ยศ ท่า ค่าหัว และภัยตามล่า
const fight = (id: string, foe: string, extra: object = {}) => ({
  id: `adult.${id}`, stage: 'adult', once: false, text: 'x', ...extra,
  encounter: {
    foe,
    beats: [1, 2, 3].map((n) => ({ text: `${n}`, moves: [{ id: `hit${n}`, label: 'hit', kind: 'attack' }, { id: `hold${n}`, label: 'hold', kind: 'guard' }, { id: `run${n}`, label: 'run', kind: 'flee' }] })),
    win: { text: 'ชนะ' }, lose: { text: 'แพ้' }, stalemate: { text: 'ยัน' }, flee: { text: 'หนี' }, death: { text: 'ตาย' },
  },
});
const raw = {
  items: [],
  traits: [{ id: 'wound_knee', name: 'เข่า', kind: 'wound', how: 'x', costs: ['x'] }],
  lines: { bounty: ['รับซื้อ{foe}'], hunt_cold: ['รอยเย็น'] },
  foes: [
    { id: 'hound', name: 'หมาเถ้า', side: 'demon', threat: 3, morale: 3, weak: ['water'], lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'] },
    { id: 'thug', name: 'นักเลง', side: 'human', threat: 3, morale: 3, weak: ['noise'], speaks: true, lore: 'x', strike: ['a', 'b', 'c'], hurt: ['c', 'd'] },
  ],
  events: [
    {
      id: 'adult.start', stage: 'adult', once: false, text: 'x',
      choices: [
        { id: 'fort', label: 'x', effects: { flags: ['job_wardens'] } },
        { id: 'quit', label: 'x', effects: { clear_flags: ['job_wardens'] } },
        { id: 'fang', label: 'x', effects: { org: { id: 'fang_house', join: true } } },
        { id: 'run', label: 'x', effects: { org: { id: 'fang_house', leave: true }, hunted: { fang_house: 2 } } },
      ],
    },
    {
      id: 'adult.watch', stage: 'adult', once: false, duty: 'wardens', text: 'x',
      choices: [
        { id: 'go', label: 'x', check: { stat: 'CON', dc: 10 }, success: { text: 'ผ่าน', effects: { gold: 1 } }, failure: { text: 'พลาด' } },
        { id: 'sure', label: 'x', text: 'ทำ' },
        { id: 'no', label: 'x', refuse: true, text: 'ไม่ไป', effects: { reputation: { wardens: -1 } } },
      ],
    },
    { id: 'adult.rise', stage: 'adult', must: true, when: { org: { id: 'wardens', max_rank: 1, ready: true } }, text: 'x', choices: [{ id: 'take', label: 'x', effects: { org: { id: 'wardens', promote: true } } }] },
    { id: 'adult.stones', stage: 'adult', when: { org: { id: 'wardens', min_rank: 2 } }, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    { id: 'adult.rival', stage: 'adult', once: false, hunt: 'fang_house', weight: 10, text: 'x', choices: [{ id: 'hide', label: 'x', effects: { hunted: { fang_house: -1 } } }] },
    { id: 'adult.quiet', stage: 'adult', once: false, weight: 10, text: 'x', choices: [{ id: 'ok', label: 'x', text: 'x' }] },
    fight('hound', 'hound'),
    fight('thug', 'thug'),
    { id: 'death.any', stage: 'death', when: { dying: ['fight', 'wound', 'age', 'sacrifice'] }, text: 'x', choices: [{ id: 'go', label: 'go', effects: { mark: 'จบ', epitaph: 'จบ' } }] },
  ],
};
const content = ContentSchema.parse(raw);
const game = makeGame(content);
const ev = (id: string) => game.events.find((e) => e.id === id)!;
const adult = (extra: Partial<LifeState> = {}): LifeState => ({ ...newLife(7), age: 30, hp: 12, baseMaxHp: 12, ...extra });
const start = (life: LifeState, choice: string) => resolveChoice(game, { ...life, currentEventId: 'adult.start' }, 'adult.start', choice).life;
const warden = (rank = 1, merit = 0): LifeState => {
  const l = applyEffects(game, adult(), { flags: ['job_wardens'] });
  return { ...l, orgs: { ...l.orgs, wardens: { ...l.orgs.wardens!, rank, merit } } };
};
/** เล่นการปะทะด้วยวิธีแรกทุกจังหวะ ด้วยลูกเต๋าที่กำหนด (seed ที่ให้ผลตามต้องการหาไว้ในเทสต์) */
function enter(life: LifeState, id: string): LifeState {
  const next = { ...life, currentEventId: id };
  return { ...next, encounter: beginEncounter(game, next, ev(id))! };
}

describe('องค์กร', () => {
  it('the test content is valid', () => {
    expect(lintContent(content)).toEqual([]);
  });

  it('taking a fort job makes a warden, and the cult that hunts wardens knows the face; quitting the job leaves the order', () => {
    const l = start(adult(), 'fort');
    expect(membership(l, 'wardens')).toMatchObject({ rank: 1, merit: 0, joined: l.birthYear + 30 });
    expect(huntLevel(l, 'ash_cult')).toBe(ORG.enemyLevel);
    const out = start(l, 'quit');
    expect(membership(out, 'wardens')).toBeUndefined();
    // คนที่ออกแล้ว ศัตรูขององค์กรยังจำหน้าได้
    expect(huntLevel(out, 'ash_cult')).toBe(ORG.enemyLevel);
  });

  it('an old save of someone already working at a fort loads as a member', () => {
    const { orgs: _o, hunted: _h, ...old } = { ...adult(), flags: ['job_fort_priest'] };
    expect(membership(migrate(old), 'wardens')?.rank).toBe(1);
  });

  it('duty work only reaches members; doing it earns merit, failing earns nothing, refusing costs merit', () => {
    expect(eligible(game, adult(), ev('adult.watch'))).toBe(false);
    const w = { ...warden(1, 2), currentEventId: 'adult.watch' };
    const did = resolveChoice(game, w, 'adult.watch', 'sure').life;
    expect(membership(did, 'wardens')).toMatchObject({ merit: 2 + ORG.done, done: 1, refused: 0 });
    const no = resolveChoice(game, w, 'adult.watch', 'no').life;
    expect(membership(no, 'wardens')).toMatchObject({ merit: 2 + ORG.refused, done: 0, refused: 1 });
    expect(no.reputation.wardens).toBe(-1);
    // ทอยพลาด: พยายามแล้ว ไม่ได้ผลงานและไม่เสีย
    let failed: LifeState | undefined;
    for (let seed = 1; seed < 200 && !failed; seed++) {
      const r = resolveChoice(game, { ...w, rngState: new Rng(seed).state, stats: { ...w.stats, CON: 1 } }, 'adult.watch', 'go');
      if (r.entry.roll && !r.entry.roll.success) failed = r.life;
    }
    expect(membership(failed!, 'wardens')).toMatchObject({ merit: 2, done: 0, refused: 0 });
  });

  it('rank rises by merit, in a promotion scene, never by time', () => {
    const fresh = warden(1, ORG.merit[0] - 1);
    expect(promotionReady(fresh, 'wardens')).toBe(false);
    expect(eligible(game, { ...fresh, age: 60 }, ev('adult.rise'))).toBe(false);
    const ready = warden(1, ORG.merit[0]);
    const picked = pickEvent(game, ready);
    expect(picked.event?.id).toBe('adult.rise');
    const up = resolveChoice(game, picked.life, 'adult.rise', 'take').life;
    expect(membership(up, 'wardens')?.rank).toBe(2);
    // ยศใหม่เปิดเรื่องของยศนั้น และเกณฑ์ของยศถัดไปสูงขึ้น
    expect(eligible(game, up, ev('adult.stones'))).toBe(true);
    expect(eligible(game, ready, ev('adult.stones'))).toBe(false);
    expect(promotionReady(up, 'wardens')).toBe(false);
  });

  it('the order sends work on a rhythm: never two years running, and always after a long quiet', () => {
    const entry = (eventId: string, age: number) => ({ age, eventId, choiceId: 'x' });
    const base = warden();
    const joinedAge = base.age - 10;
    const member = { ...base, orgs: { wardens: { ...base.orgs.wardens!, joined: base.birthYear + joinedAge } } };
    // เพิ่งมีงานมาเมื่อปีก่อน: ปีนี้ไม่มีงาน
    const just = { ...member, log: [entry('adult.watch', 29)] };
    for (let seed = 1; seed <= 40; seed++) expect(pickEvent(game, { ...just, rngState: new Rng(seed).state }).event?.id).not.toBe('adult.watch');
    // ไม่มีงานมาครบ ORG.dutyGap.max เหตุการณ์: เรื่องถัดไปคืองานขององค์กร
    const quiet = { ...member, log: Array.from({ length: ORG.dutyGap.max }, (_, i) => entry('adult.quiet', 30 - ORG.dutyGap.max + i)) };
    for (let seed = 1; seed <= 40; seed++) expect(pickEvent(game, { ...quiet, rngState: new Rng(seed).state }).event?.id).toBe('adult.watch');
  });

  it("the wardens' stance rerolls the first miss against the demon side, from the second rank, once per fight", () => {
    const odds = (l: LifeState, id: string) => moveOdds(game, enter(l, id), ev(id), openMoves(game, enter(l, id), ev(id))[0]!);
    const plain = odds(warden(1), 'adult.hound').chance;
    expect(odds(warden(2), 'adult.hound').chance).toBeCloseTo(1 - (1 - plain) ** 2);
    // ไม่ใช่ฝ่ายจอมมาร ท่าไม่ทำงาน
    expect(odds(warden(2), 'adult.thug').chance).toBeCloseTo(odds(warden(1), 'adult.thug').chance);
    let rerolled = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let l = enter({ ...warden(2), rngState: new Rng(seed).state, hp: 40, baseMaxHp: 40 }, 'adult.hound');
      const records = [];
      while (l.encounter) {
        const r = resolveMove(game, l, openMoves(game, l, ev('adult.hound'))[0]!.id);
        records.push(r.record);
        l = r.life;
      }
      const again = records.filter((r) => r.rerolled);
      expect(again.length).toBeLessThanOrEqual(1);
      if (again.length) {
        rerolled++;
        expect(again[0]!.tech).toBe('hold');
      }
    }
    expect(rerolled).toBeGreaterThan(0);
  });

  it('the fang house buys proof of a kill from its members, but not the heads of people', () => {
    const win = (life: LifeState, id: string) => {
      for (let seed = 1; seed <= 300; seed++) {
        let l = enter({ ...life, rngState: new Rng(seed).state, hp: 40, baseMaxHp: 40, stats: { ...life.stats, STR: 20 } }, id);
        let entry;
        while (l.encounter) {
          const r = resolveMove(game, l, openMoves(game, l, ev(id))[0]!.id);
          l = r.life;
          entry = r.entry;
        }
        if (entry?.encounter?.end === 'win') return { life: l, entry };
      }
      throw new Error('ไม่ชนะสักครั้ง');
    };
    const hunter = start(adult(), 'fang');
    expect(membership(hunter, 'fang_house')?.rank).toBe(1);
    const paid = win(hunter, 'adult.hound');
    expect(paid.entry.encounter!.bounty).toBe(ORG.bounty[2]);
    expect(paid.life.gold).toBe(hunter.gold + ORG.bounty[2]!);
    expect(paid.entry.text).toContain('รับซื้อหมาเถ้า');
    expect(win(hunter, 'adult.thug').entry.encounter!.bounty).toBeUndefined();
    expect(win(adult(), 'adult.hound').entry.encounter!.bounty).toBeUndefined();
    // ป้ายทองเหลืองขึ้นไป: สำเร็จครั้งแรกกับสิ่งที่ไม่ใช่คน ศัตรูเสียแรงใจเพิ่มหนึ่งขีด
    const brass = { ...hunter, orgs: { fang_house: { ...hunter.orgs.fang_house!, rank: 2 } } };
    const first = win(brass, 'adult.hound').entry.encounter!.records.find((r) => r.success)!;
    expect(first.tech).toBe('quarry');
    expect(first.pips).toBeGreaterThanOrEqual(2);
  });

  it('being hunted: the scenes come only to the hunted, more often the hotter the trail, and the trail cools by itself', () => {
    const calm = adult();
    expect(eligible(game, calm, ev('adult.rival'))).toBe(false);
    const share = (level: number) => {
      const l = { ...calm, hunted: { fang_house: level } };
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) if (pickEvent(game, { ...l, rngState: new Rng(seed).state }).event?.id === 'adult.rival') n++;
      return n / 400;
    };
    expect(share(4)).toBeGreaterThan(share(1) + 0.15);
    // ทิ้งโรงรับเขี้ยว: คู่แข่งเก่าตาม แล้วรอยเย็นลงจนหมดเมื่อไม่มีใครมาเติม
    let l = start(start(adult(), 'fang'), 'run');
    expect(membership(l, 'fang_house')).toBeUndefined();
    expect(huntLevel(l, 'fang_house')).toBe(ORG.enemyLevel + 2);
    const rng = new Rng(3);
    let cooled = 0;
    for (let y = 0; y < 200 && huntLevel(l, 'fang_house') > 0; y++) {
      const rec: { cooled?: string[]; lines?: string[] } = {};
      l = endOfYear(game, l, rng, rec);
      if (rec.cooled) {
        cooled++;
        expect(rec.lines).toContain('รอยเย็น');
      }
    }
    expect(huntLevel(l, 'fang_house')).toBe(0);
    expect(cooled).toBe(ORG.enemyLevel + 2);
    // สมาชิกที่ยังอยู่ ศัตรูขององค์กรไม่เลิกตาม
    let w = warden();
    for (let y = 0; y < 100; y++) w = endOfYear(game, w, rng, {});
    expect(huntLevel(w, 'ash_cult')).toBe(ORG.enemyLevel);
  });

  it('the linter refuses duty work that cannot be refused, a hunt with no way out, and joining a job-bound order by effect', () => {
    const broken = structuredClone(raw) as typeof raw;
    const watch = broken.events.find((e) => e.id === 'adult.watch') as { choices: { refuse?: boolean }[] };
    watch.choices = watch.choices.filter((c) => !c.refuse);
    const rival = broken.events.find((e) => e.id === 'adult.rival') as { choices: object[] };
    rival.choices = [{ id: 'die', label: 'x', effects: { die: true } }];
    const first = broken.events[0] as { choices: object[] };
    first.choices.push({ id: 'bad', label: 'x', effects: { org: { id: 'wardens', join: true } } });
    const problems = lintContent(ContentSchema.parse(broken)).join('\n');
    expect(problems).toContain('adult.watch: งานขององค์กรต้องมีทางปฏิเสธ');
    expect(problems).toContain('adult.rival: เรื่องถูกตามล่าต้องมีทางรอด');
    expect(problems).toContain('adult.start/bad: "wardens" เป็นองค์กรที่ผูกกับงาน');
  });
});

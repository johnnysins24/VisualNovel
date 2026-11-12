// เล่นชีวิตสุ่มบนเนื้อหาจริงทุกครั้งที่รันเทสต์ แล้วยืนยันกติกาที่ต้องจริงเสมอ (ดู scripts/audit.ts)
// รายงานเต็มพร้อมตัวเลขสมดุล: npm run audit
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../scripts/content';
import { auditLives, type FightTally } from '../../scripts/audit';
import { makeGame } from '../../src/engine/engine';
import { ARMED_CLASSES, RACES, type ClassId, type RaceId } from '../../src/engine/balance';

const game = makeGame(loadContent('content'));
const res = auditLives(game, 400);

describe('life audit (real content, 400 lives)', () => {
  it('finds no logic problem', () => {
    // ทางตัน เหตุการณ์ที่ถูกหยิบผิดเงื่อนไข must ที่หลุดเอง ข้อความที่พูดถึงคนที่ไม่อยู่ ค่าสเตตหรือเงินที่เพี้ยน
    expect([...res.problems.keys()]).toEqual([]);
  });

  it('every must event has lives that can reach it', () => {
    // youth.own_try_* เป็นกันพลาดของเด็กที่ยังไม่ได้ลองทางของตัวเองเมื่ออายุ 13 ซึ่งมีน้อย 400 ชีวิตจึงอาจไม่เจอครบทุกถิ่น
    // (ของเอลฟ์ไม่เคยถูกใช้เลย เพราะเด็กเอลฟ์ทุกคนได้ความโน้มเอียงนอกทางประจำถิ่นก่อนอายุ 13 เสมอ)
    // must เรื่องอื่นทุกเรื่องต้องมีชีวิตที่ไปถึง
    const reached = new Set(res.must.keys());
    const unreachable = () => game.events.filter((e) => e.must && !reached.has(e.id) && !e.id.startsWith('youth.own_try_')).map((e) => e.id);
    // ฉากขึ้นยศสูงสุดขององค์กรเล็ก (ราชสำนักมีสมาชิกราว 4% ของชีวิต) มีคนไปถึงไม่ถึงหนึ่งในร้อยชีวิต 400 ชีวิตจึงพลาดได้ทั้งที่ทางยังเปิดอยู่
    // เรื่องที่ยังไม่มีใครถึงได้ชีวิตชุดถัดไปอีกทีละ 400 จนครบ 2,000 ชีวิต ถ้ายังไม่มีใครถึงคือทางปิดจริง
    for (let from = 401; unreachable().length && from <= 1601; from += 400) for (const id of auditLives(game, 400, { seedFrom: from }).must.keys()) reached.add(id);
    expect(unreachable()).toEqual([]);
  }, 600_000);

  it('no life loses a must event to a clash', () => {
    // must สองเรื่องที่ถึงโอกาสสุดท้ายในปีเดียวกันออกได้เรื่องเดียว ตั้งแต่ทุกเผ่าใช้ปฏิทินเดียวกัน (ข้อ D3 ของแผนชีวิต 100 ปี) ต้องไม่มีชีวิตไหนเจอ
    expect(res.collisionLives).toEqual([]);
  });

  it('every life that could see a must event saw it, unless it died first', () => {
    for (const [id, m] of res.must) {
      const died = res.finals.filter((l) => l.endReason === 'death' && !l.seen.includes(id)).length;
      expect(m.could - m.seen, id).toBeLessThanOrEqual(died);
    }
    // หมุดโลก: ไม่มีชีวิตไหนหลุด
    for (const id of ['adult.world_king_dies', 'adult.world_dim_night', 'adult.world_star_count']) {
      const m = res.must.get(id)!;
      expect(m.could).toBeGreaterThan(20);
      expect(m.could - m.seen, id).toBe(0);
    }
  });

  it('repeatable events only come back early when nothing else could be shown', () => {
    // ตัว audit นับเป็นปัญหาเมื่อเรื่องเดิมออกซ้ำทั้งที่มีเรื่องอื่น จึงเหลือแต่กรณีที่กองว่างจริง
    expect([...res.problems.keys()].filter((k) => k.includes('ออกซ้ำ'))).toEqual([]);
  });
});

// สมดุลของชีวิตยาว: เลขในนี้คือเป้าของแผนชีวิต 100 ปี ไม่ใช่ logic ช่วงที่ยอมรับจึงกว้างพอให้เนื้อหาชุดใหม่ขยับได้ แต่จับได้เมื่อหลุดเป้า
describe('life audit: the long life stays on target', () => {
  const share = (xs: unknown[], of: unknown[]) => xs.length / Math.max(1, of.length);
  const elders = res.finals.filter((l) => l.raceApplied === 'human' && l.endReason === 'death' && l.age >= 65);

  it('most humans who grow old go between 80 and 90, few before 80, and some see 100 (plan D2)', () => {
    const ages = elders.map((l) => l.age).sort((a, b) => a - b);
    expect(elders.length).toBeGreaterThan(80);
    const mid = ages[Math.floor(ages.length / 2)]!;
    expect(mid).toBeGreaterThanOrEqual(85);
    expect(mid).toBeLessThanOrEqual(93);
    const in80s = share(ages.filter((a) => a >= 80 && a <= 90), ages);
    expect(share(ages.filter((a) => a < 80), ages)).toBeLessThan(0.2);
    expect(in80s).toBeGreaterThan(0.33);
    // ช่วง 80 ถึง 90 ต้องเป็นช่วงที่คนไปมากที่สุด
    expect(in80s).toBeGreaterThan(share(ages.filter((a) => a > 90 && a < 100), ages));
    const hundred = share(ages.filter((a) => a >= 100), ages);
    expect(hundred).toBeGreaterThan(0.05);
    expect(hundred).toBeLessThan(0.28);
  });

  it('old age is what ends most long lives, and nobody outlives every winter', () => {
    expect(share(elders.filter((l) => l.deathCause === 'age'), elders)).toBeGreaterThan(0.7);
    // เผ่าที่ใช้ปฏิทินเดียวกับมนุษย์: ไม่มีใครอยู่เกิน 135 ปี
    for (const l of res.finals) if ((RACES[l.raceApplied as RaceId]?.ageScale ?? 1) === 1) expect(l.age, `seed ${l.seed}`).toBeLessThanOrEqual(135);
  });

  it('no habit ends up on most lives: a trait has to say something about the life that holds it', () => {
    const long = res.finals.filter((l) => l.age >= 40);
    const habits = [...game.traits.values()].filter((t) => t.habit);
    for (const t of habits) expect(share(long.filter((l) => l.traits.includes(t.id)), long), t.id).toBeLessThan(0.5);
    // และนิสัยไม่ได้หายไปจากเกม: ชีวิตยาวส่วนใหญ่มีอย่างน้อยหนึ่งอย่าง
    expect(share(long.filter((l) => l.traits.some((id) => game.traits.get(id)?.habit)), long)).toBeGreaterThan(0.6);
  });

  it('the farewell scenes for a friend and for a rival can both still happen', () => {
    // เพื่อนกับคู่แค้นต้องมีโอกาสอยู่ถึงวันสุดท้ายของตัวละคร (ฉากตาย age_friend กับ age_rival) และมีโอกาสไปก่อน (ฉากลา)
    const lastDay = res.finals.filter((l) => l.endReason === 'death' && l.deathCause === 'age');
    const with_ = (bond: string) => lastDay.filter((l) => l.people.some((p) => p.bond === bond));
    for (const bond of ['friend', 'rival']) {
      const had = with_(bond);
      const still = had.filter((l) => l.people.some((p) => p.bond === bond && p.alive));
      expect(had.length, bond).toBeGreaterThan(10);
      expect(still.length, bond).toBeGreaterThan(0);
      expect(still.length, bond).toBeLessThan(had.length);
    }
  });
});


// สมดุลของการปะทะ: เป้าของชุด 2 ช่วงที่ยอมรับกว้างพอให้ฉากชุดใหม่ขยับได้ แต่จับได้เมื่อการปะทะกลับมาถี่หรือโหดเกิน
describe('life audit: encounters stay rare enough and fair enough', () => {
  const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const fightsOf = (armed: boolean) =>
    res.finals
      .map((l, i) => [l, res.fights.perLife[i] ?? 0] as const)
      .filter(([l]) => l.age >= 40 && (!!l.classId && ARMED_CLASSES.includes(l.classId as ClassId)) === armed)
      .map(([, n]) => n);

  it('a life that carries a weapon meets more fights than one that does not', () => {
    const armed = mid(fightsOf(true));
    const calm = mid(fightsOf(false));
    expect(armed).toBeGreaterThan(calm);
    expect(armed).toBeLessThanOrEqual(16);
    expect(calm).toBeGreaterThanOrEqual(2);
    expect(calm).toBeLessThanOrEqual(9);
  });

  it('a player who reads the foe rarely dies in a fight, and wins more than a player who taps at random', () => {
    const rate = (t: FightTally, k: 'win' | 'death') => (t.ends[k] ?? 0) / Math.max(1, t.n);
    const { reads, random } = res.fights.deadlyByStyle;
    expect(reads.n).toBeGreaterThan(50);
    expect(rate(reads, 'death')).toBeLessThan(0.05);
    expect(rate(random, 'death')).toBeLessThan(0.1);
    expect(rate(res.fights.byStyle.reads, 'win')).toBeGreaterThan(rate(res.fights.byStyle.random, 'win'));
  });

  it('every foe that has a scene is met by some life', () => {
    const used = new Set(game.events.filter((e) => e.encounter).map((e) => e.encounter!.foe));
    expect([...used].filter((id) => !res.fights.byFoe.has(id))).toEqual([]);
  });
});

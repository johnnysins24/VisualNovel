// เล่นชีวิตสุ่มบนเนื้อหาจริงทุกครั้งที่รันเทสต์ แล้วยืนยันกติกาที่ต้องจริงเสมอ (ดู scripts/audit.ts)
// รายงานเต็มพร้อมตัวเลขสมดุล: npm run audit
import { describe, expect, it } from 'vitest';
import { loadContent } from '../scripts/content';
import { auditLives } from '../scripts/audit';
import { makeGame } from '../src/engine/engine';
import { RACES, type RaceId } from '../src/engine/balance';

const game = makeGame(loadContent('content'));
const res = auditLives(game, 400);

describe('life audit (real content, 400 lives)', () => {
  it('finds no logic problem', () => {
    // ทางตัน เหตุการณ์ที่ถูกหยิบผิดเงื่อนไข must ที่หลุดเอง ข้อความที่พูดถึงคนที่ไม่อยู่ ค่าสเตตหรือเงินที่เพี้ยน
    expect([...res.problems.keys()]).toEqual([]);
  });

  it('every must event has lives that can reach it', () => {
    const unreachable = game.events.filter((e) => e.must && !res.must.has(e.id)).map((e) => e.id);
    // youth.own_try_* เป็นกันพลาดของเด็กที่ยังไม่ได้ลองทางของตัวเองเมื่ออายุ 13 ซึ่งมีน้อย 400 ชีวิตจึงอาจไม่เจอครบทุกถิ่น
    // (ของเอลฟ์ไม่เคยถูกใช้เลย เพราะเด็กเอลฟ์ทุกคนได้ความโน้มเอียงนอกทางประจำถิ่นก่อนอายุ 13 เสมอ)
    // must เรื่องอื่นทุกเรื่องต้องมีชีวิตที่ไปถึง
    expect(unreachable.filter((id) => !id.startsWith('youth.own_try_'))).toEqual([]);
  });

  it('humans and tieflings never lose a must event to a clash', () => {
    // must สองเรื่องที่ถึงโอกาสสุดท้ายในปีเดียวกันออกได้เรื่องเดียว เผ่าที่เดินปีละหนึ่งเหตุการณ์ตลอดชีวิตต้องไม่เจอเลย
    // ที่เหลืออยู่คือเอลฟ์กับคนแคระที่อายุครบ 40 ในปีแรกของหมุดโลกพอดี (ฉากปิดอายุสี่สิบได้ออกก่อน แล้วข้ามไปหลายปี)
    // ซึ่งจะหมดไปเมื่อทุกเผ่าใช้ปฏิทินเดียวกัน (ข้อ D3 ของแผนชีวิต 100 ปี)
    const short = res.collisionLives.filter((c) => (RACES[c.race as RaceId]?.ageScale ?? 1) === 1);
    expect(short).toEqual([]);
    for (const c of res.collisionLives) expect(c.to).toBe('adult.life_at_forty');
  });

  it('every life that could see a must event saw it, unless it died first or hit that clash', () => {
    for (const [id, m] of res.must) {
      const clashes = res.collisionLives.filter((c) => c.lost === id).length;
      const died = res.finals.filter((l) => l.endReason === 'death' && !l.seen.includes(id)).length;
      expect(m.could - m.seen, id).toBeLessThanOrEqual(clashes + died);
    }
    // หมุดโลกทั้งสี่: ไม่มีชีวิตไหนหลุดนอกจากกรณีชนกันข้างบน
    for (const id of ['adult.world_king_dies', 'adult.world_dim_night', 'adult.world_star_count']) {
      const m = res.must.get(id)!;
      expect(m.could).toBeGreaterThan(20);
      expect(m.could - m.seen, id).toBe(res.collisionLives.filter((c) => c.lost === id).length);
    }
  });

  it('repeatable events only come back early when nothing else could be shown', () => {
    // ตัว audit นับเป็นปัญหาเมื่อเรื่องเดิมออกซ้ำทั้งที่มีเรื่องอื่น จึงเหลือแต่กรณีที่กองว่างจริง
    expect([...res.problems.keys()].filter((k) => k.includes('ออกซ้ำ'))).toEqual([]);
  });
});

/**
 * ช่วงชีวิตแบบหลักสูตร: ระหว่างเรียน ชีวิตเดินด้วยเหตุการณ์ของหลักสูตรก่อนเรื่องอื่น ปีละเรื่อง ตามปีที่เรียนและสายที่เลือก
 *   เข้าเรียน   effects.course.enter ตั้ง life.course ที่ปีหนึ่ง และติด flag นักเรียน (COURSES[id].student)
 *   ปีเรียน     เหตุการณ์ที่มี course: { id, year, track? } ออกเฉพาะกับคนที่เรียนอยู่ในปีนั้น จบเหตุการณ์แล้วขึ้นปีถัดไปเอง
 *              เหตุการณ์ must ของโลก (หมุดโลก ฉากลาของพ่อแม่) ยังออกได้ระหว่างเรียน และไม่นับเป็นปีเรียน
 *              ปีที่ไม่มีเหตุการณ์ของหลักสูตรเหลือให้ออก เรื่องธรรมดาออกแทน และยังนับเป็นปีเรียน
 *   เลือกสาย   effects.course.track ตั้งสาย และติด flag <trackFlag><สาย> ไปตลอดชีวิต
 *   จบ          พ้นปีสุดท้ายแล้วถือว่าเรียนจบ: ถอด flag นักเรียน ติด flag เรียนจบ (COURSES[id].done)
 *   ออกกลางคัน  effects.course.leave ถอด flag นักเรียน ไม่ได้ flag เรียนจบ เนื้อเรื่องตั้ง flag ของตัวเองว่าออกเพราะอะไร
 * ไฟล์นี้ใช้ซ้ำได้กับหลักสูตรอื่น (ฝึกทหาร บวช) ด้วยการเพิ่มรายการใน COURSES ของ balance.ts
 */
import { COURSES, type CourseId } from './balance';
import type { CourseEffect, CourseSlot, GameEvent } from './schema';
import { worldYear, type LifeState } from './state';

const withFlag = (flags: string[], flag: string) => (flags.includes(flag) ? flags : [...flags, flag]);

/** เหตุการณ์นี้เป็นของหลักสูตร และตรงกับปีกับสายที่ตัวละครเรียนอยู่ไหม (เหตุการณ์ที่ไม่ใช่ของหลักสูตร = true) */
export function courseSlotOpen(life: LifeState, slot: CourseSlot | undefined): boolean {
  if (!slot) return true;
  const c = life.course;
  if (!c || c.id !== slot.id) return false;
  const [from, to] = typeof slot.year === 'number' ? [slot.year, slot.year] : slot.year;
  if (c.year < from || c.year > to) return false;
  return !slot.track || slot.track === c.track;
}

export function enterCourse(life: LifeState, id: CourseId): LifeState {
  if (life.course) return life;
  return { ...life, course: { id, year: 1, since: worldYear(life) }, flags: withFlag(life.flags, COURSES[id].student) };
}

function endCourse(life: LifeState, graduated: boolean): LifeState {
  const c = life.course;
  if (!c) return life;
  const def = COURSES[c.id];
  const { course: _course, ...rest } = life;
  const flags = rest.flags.filter((f) => f !== def.student);
  return { ...rest, flags: graduated ? withFlag(flags, def.done) : flags };
}

/** ผลของ effects.course (hold ไม่ทำอะไรตรงนี้ ดู advanceCourse) */
export function applyCourseEffects(life: LifeState, fx: CourseEffect | undefined): LifeState {
  if (!fx) return life;
  let next = life;
  if (fx.enter) next = enterCourse(next, fx.enter);
  const c = next.course;
  if (fx.track && c && COURSES[c.id].tracks[fx.track]) {
    next = { ...next, course: { ...c, track: fx.track }, flags: withFlag(next.flags, `${COURSES[c.id].trackFlag}${fx.track}`) };
  }
  if (fx.leave) next = endCourse(next, false);
  return next;
}

/**
 * จบเหตุการณ์หนึ่งเรื่องระหว่างเรียน: ขึ้นปีถัดไป พ้นปีสุดท้ายคือเรียนจบ
 * ปีที่ไม่มีเหตุการณ์ของหลักสูตรให้ออก (เรื่องธรรมดาออกแทน) ก็นับเป็นปีเรียน นักเรียนจึงไม่มีทางค้างอยู่ปีเดิมตลอดชีวิต
 * ไม่ขยับเมื่อ: เพิ่งเข้าเรียนในเหตุการณ์นี้เอง ออกกลางคันไปแล้ว ผลที่ใช้สั่ง hold (เรียนซ้ำปี) ตัวละครกำลังจะตาย
 * หรือเหตุการณ์นั้นเป็นเหตุการณ์ must กับฉากตายที่ไม่ใช่ของหลักสูตร (หมุดของโลก ฉากลาของพ่อแม่ ไม่กินปีเรียน)
 */
export function advanceCourse(before: LifeState, life: LifeState, ev: GameEvent, fx: readonly (CourseEffect | undefined)[]): LifeState {
  const c = life.course;
  if (!c || before.course?.id !== c.id || life.dying) return life;
  if (ev.course ? ev.course.id !== c.id : ev.must || ev.stage === 'death') return life;
  if (fx.some((f) => f?.hold)) return life;
  const year = c.year + 1;
  return year > COURSES[c.id].years ? endCourse(life, true) : { ...life, course: { ...c, year } };
}

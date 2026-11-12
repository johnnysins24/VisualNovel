/**
 * เส้นเรื่องยาว (ชุด 4): เรื่องที่เดินเป็นตอนๆ ข้ามหลายสิบปีของชีวิตเดียว
 *   ตอน        เหตุการณ์ที่มี arc: { id, step } คือตอนที่ step ของเส้น id (ตอนเดียวกันเขียนได้หลายฉบับ เช่น แยกตามถิ่น ฉบับที่ออกก่อนคือตอนนั้น)
 *   เปิด        ตอนแรก (step 1) ออกได้เมื่อชีวิตนี้ยังไม่เคยเจอเส้นนี้ และเส้นที่เปิดค้างยังไม่ครบ ARC.maxOpen จบตอนแรกแล้วเส้นเปิด
 *   เดิน        ตอนที่ n ออกได้เมื่อเพิ่งจบตอนที่ n−1 และผ่านไปอย่างน้อย ARC.gap ปี
 *              ผ่านไปครบ ARC.due ปีแล้วยังไม่มา ตอนนั้นคือเรื่องถัดไปของชีวิต (ถ้าเข้าเงื่อนไข) ดู pickEvent
 *   ปิด        effects.arc: { id, close: true } ปิดเส้น (ตัวเลือกที่ไม่รับเรื่องในตอนแรก ทางจบของเรื่อง หรือเหตุการณ์อื่นที่ทำให้เรื่องจบ) ปิดแล้วไม่เปิดอีก
 *   พัก        เส้นที่เดินถึงตอนสุดท้ายที่เนื้อหามี หรือไม่มีตอนไหนออกได้มานาน ARC.stale ปี ไม่นับเป็นเส้นที่เปิดค้าง
 * ตัวเลขอยู่ใน ARC ของ balance.ts
 */
import { ARC, type ArcId } from './balance';
import type { GameEvent } from './schema';
import { worldYear, type LifeState } from './state';

/** สถานะของเส้นเรื่องหนึ่งเส้นในชีวิตหนึ่ง */
export interface ArcState {
  /** ตอนล่าสุดที่จบไปแล้ว (0 = ปิดไปโดยไม่เคยเจอตอนไหน) */
  step: number;
  /** ปีของโลกที่ตอนล่าสุดจบ */
  at: number;
  closed?: boolean;
}

export interface ArcSlot {
  id: ArcId;
  step: number;
}

/** ตอนสุดท้ายของแต่ละเส้นเท่าที่เนื้อหามี */
export type ArcLast = Partial<Record<ArcId, number>>;

export function arcLastSteps(events: readonly GameEvent[]): ArcLast {
  const last: ArcLast = {};
  for (const e of events) if (e.arc) last[e.arc.id] = Math.max(last[e.arc.id] ?? 0, e.arc.step);
  return last;
}

type Holder = Pick<LifeState, 'arcs' | 'age' | 'birthYear'>;

/** เส้นนี้เปิดค้างอยู่ไหม: ยังไม่ปิด ยังมีตอนถัดไปในเนื้อหา และตอนล่าสุดไม่นานเกิน ARC.stale ปี */
export function arcOpen(life: Holder, id: ArcId, last: ArcLast): boolean {
  const a = life.arcs?.[id];
  if (!a || a.closed) return false;
  return a.step < (last[id] ?? 0) && worldYear(life as LifeState) - a.at <= ARC.stale;
}

export const openArcs = (life: Holder, last: ArcLast): ArcId[] => (Object.keys(life.arcs ?? {}) as ArcId[]).filter((id) => arcOpen(life, id, last));

/** เหตุการณ์นี้เป็นตอนของเส้นเรื่อง และถึงคิวของตอนนั้นไหม (เหตุการณ์ที่ไม่ใช่ตอนของเส้นเรื่อง = true) */
export function arcSlotOpen(life: Holder, slot: ArcSlot | undefined, last: ArcLast): boolean {
  if (!slot) return true;
  const a = life.arcs?.[slot.id];
  if (slot.step === 1) return !a && openArcs(life, last).length < ARC.maxOpen;
  return !!a && !a.closed && a.step === slot.step - 1 && worldYear(life as LifeState) - a.at >= ARC.gap;
}

/** ตอนนี้ค้างมานานจนถึงกำหนดแล้วไหม (ใช้กับตอนที่สองขึ้นไป) */
export function arcDue(life: Holder, slot: ArcSlot | undefined): boolean {
  if (!slot || slot.step === 1) return false;
  const a = life.arcs?.[slot.id];
  return !!a && !a.closed && a.step === slot.step - 1 && worldYear(life as LifeState) - a.at >= ARC.due;
}

/** ผลของ effects.arc: ปิดเส้นเรื่อง (เส้นที่ยังไม่เคยเจอก็ปิดได้ ตอนแรกของเส้นนั้นจะไม่ออกในชีวิตนี้) */
export function closeArc(life: LifeState, id: ArcId): LifeState {
  const a = life.arcs?.[id];
  return { ...life, arcs: { ...(life.arcs ?? {}), [id]: { step: a?.step ?? 0, at: a?.at ?? worldYear(life), closed: true } } };
}

/** จบเหตุการณ์ที่เป็นตอนของเส้นเรื่อง: จดว่าเดินถึงตอนไหนในปีไหน (before = ชีวิตก่อนเวลาเดิน ใช้ปีของเหตุการณ์) */
export function advanceArc(before: LifeState, life: LifeState, ev: GameEvent): LifeState {
  if (!ev.arc) return life;
  const a = life.arcs?.[ev.arc.id];
  const next: ArcState = { step: ev.arc.step, at: worldYear(before) };
  if (a?.closed) next.closed = true;
  return { ...life, arcs: { ...(life.arcs ?? {}), [ev.arc.id]: next } };
}

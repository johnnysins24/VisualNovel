import { REPUTATION_CAP, REPUTATION_CARRY } from './balance';
import type { LifeState } from './state';

/** ข้อมูลที่ติดข้ามชีวิต เก็บแยกจากเซฟชีวิต */
export interface Meta {
  version: 1;
  /** จำนวนชีวิตที่จบแล้ว */
  lives: number;
  /** ชื่อเสียงต่อกลุ่ม (บุญคุณเป็นบวก หนี้หรือความแค้นเป็นลบ) */
  reputation: Record<string, number>;
}

export const newMeta = (): Meta => ({ version: 1, lives: 0, reputation: {} });

/** เรียกครั้งเดียวตอนชีวิตจบ ชื่อเสียงของชีวิตนี้เริ่มจากชีวิตก่อนอยู่แล้ว จึงใช้ค่าปลายทางแทนได้เลย */
export function commitLife(meta: Meta, life: LifeState): Meta {
  const reputation: Record<string, number> = {};
  for (const [k, v] of Object.entries(life.reputation)) {
    const carried = Math.trunc(v * REPUTATION_CARRY);
    if (carried !== 0) reputation[k] = Math.max(-REPUTATION_CAP, Math.min(REPUTATION_CAP, carried));
  }
  return { version: 1, lives: meta.lives + 1, reputation };
}

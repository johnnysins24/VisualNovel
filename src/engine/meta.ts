import { REALM_KEYS, REPUTATION_CAP, REPUTATION_CARRY, type CityId, type RealmKey } from './balance';
import type { LifeState, MoodState } from './state';

/** ข้อมูลที่ติดข้ามชีวิต เก็บแยกจากเซฟชีวิต */
export interface Meta {
  version: 1;
  /** จำนวนชีวิตที่จบแล้ว */
  lives: number;
  /** ชื่อเสียงต่อกลุ่ม (บุญคุณเป็นบวก หนี้หรือความแค้นเป็นลบ) */
  reputation: Record<string, number>;
  /** สภาพของเมืองที่ชีวิตล่าสุดทิ้งไว้ (เฉพาะเมืองที่ไม่สงบ) ชีวิตถัดไปโตมาในเมืองแบบนั้น เซฟเก่าไม่มี = ทุกเมืองสงบ */
  moods?: Partial<Record<CityId, MoodState>>;
  /** สภาพของอาณาจักรที่ชีวิตล่าสุดทิ้งไว้ (คลัง ความสงบ ความชอบธรรมของราชวงศ์) เฉพาะค่าที่ไม่ใช่ศูนย์ เซฟเก่าไม่มี = ศูนย์ทุกค่า */
  realm?: Partial<Record<RealmKey, number>>;
}

export const newMeta = (): Meta => ({ version: 1, lives: 0, reputation: {} });

/** เรียกครั้งเดียวตอนชีวิตจบ ชื่อเสียง สภาพเมือง และสภาพของอาณาจักรของชีวิตนี้เริ่มจากชีวิตก่อนอยู่แล้ว จึงใช้ค่าปลายทางแทนได้เลย */
export function commitLife(meta: Meta, life: LifeState): Meta {
  const reputation: Record<string, number> = {};
  for (const [k, v] of Object.entries(life.reputation)) {
    const carried = Math.trunc(v * REPUTATION_CARRY);
    if (carried !== 0) reputation[k] = Math.max(-REPUTATION_CAP, Math.min(REPUTATION_CAP, carried));
  }
  const realm: Partial<Record<RealmKey, number>> = {};
  for (const k of REALM_KEYS) if (life.world[k]) realm[k] = life.world[k];
  return { version: 1, lives: meta.lives + 1, reputation, moods: { ...(life.moods ?? {}) }, realm };
}

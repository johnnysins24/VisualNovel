/**
 * ข้อห้ามของแผ่นดิน (ชุด 4): เจ้าเดิมเจ็ดตนหลับอยู่ใต้เสาฟ้า คนที่อยู่บนแผ่นดินรักษาข้อห้ามของแต่ละตนไว้ตามสัญญาหลับ
 *   รู้       effects.taboo: { <เจ้าเดิม>: learn }  คนแก่สอนข้อห้ามข้อนั้นแล้ว ยังไม่นับว่าถือหรือฝืน
 *   ถือ       effects.taboo: { <เจ้าเดิม>: keep }   ถือหนึ่งครั้ง
 *   ฝืน       effects.taboo: { <เจ้าเดิม>: break }  ฝืนหนึ่งครั้ง คะแนนแผ่นดินขึ้น TABOO.land พรของเจ้าเดิมตนนั้นหลุด
 *            (และกลายเป็นคำสาปถ้าทะเบียนสิ่งติดตัวเขียน becomes ไว้) ส่วนนี้ทำใน applyEffects
 *   ขอขมา    effects.taboo: { <เจ้าเดิม>: mend }   ทำพิธี ครั้งที่เคยฝืนถูกล้าง คะแนนแผ่นดินลง TABOO.mend
 * เงื่อนไข taboo: { id, taught, keeps, defies, unbroken } ใช้ได้ทั้งใน when ของเหตุการณ์และ requires ของตัวเลือก
 * ตัวเลขอยู่ใน TABOO ของ balance.ts
 */
import { TABOO, TABOO_IDS, type TabooAct, type TabooId } from './balance';
import type { LifeState } from './state';

/** รอยของข้อห้ามหนึ่งข้อในชีวิตหนึ่ง: ถือมากี่ครั้ง ฝืนค้างอยู่กี่ครั้ง */
export interface TabooMark {
  kept: number;
  broken: number;
}

export interface TabooCond {
  id: TabooId;
  /** รู้ข้อห้ามข้อนี้แล้ว (มีคนสอน หรือเคยถือหรือฝืน) */
  taught?: boolean | undefined;
  /** ถือครบ TABOO.holds ครั้ง และไม่มีครั้งที่ฝืนค้างอยู่ */
  keeps?: boolean | undefined;
  /** ฝืนครบ TABOO.defies ครั้ง */
  defies?: boolean | undefined;
  /** ไม่มีครั้งที่ฝืนค้างอยู่ (ไม่เคยฝืน หรือขอขมาแล้ว) */
  unbroken?: boolean | undefined;
}

type Holder = Pick<LifeState, 'taboos'>;

export const tabooMark = (life: Holder, id: TabooId): TabooMark | undefined => life.taboos?.[id];
export const keepsTaboo = (life: Holder, id: TabooId) => {
  const m = tabooMark(life, id);
  return !!m && m.kept >= TABOO.holds && m.broken === 0;
};
export const defiesTaboo = (life: Holder, id: TabooId) => (tabooMark(life, id)?.broken ?? 0) >= TABOO.defies;

export function tabooCondMet(life: Holder, c: TabooCond): boolean {
  const m = tabooMark(life, c.id);
  if (c.taught !== undefined && c.taught !== !!m) return false;
  if (c.keeps !== undefined && c.keeps !== keepsTaboo(life, c.id)) return false;
  if (c.defies !== undefined && c.defies !== defiesTaboo(life, c.id)) return false;
  if (c.unbroken !== undefined && c.unbroken !== ((m?.broken ?? 0) === 0)) return false;
  return true;
}

/** ใช้ผลของ effects.taboo คืนรอยใหม่ กับรายการข้อห้ามที่เพิ่งฝืนและเพิ่งขอขมาในผลนี้ (ผู้เรียกปรับคะแนนแผ่นดินและพร) */
export function applyTaboos(life: Holder, fx: Partial<Record<TabooId, TabooAct>> | undefined): { taboos: LifeState['taboos']; broke: TabooId[]; mended: TabooId[] } {
  const taboos = { ...(life.taboos ?? {}) };
  const broke: TabooId[] = [];
  const mended: TabooId[] = [];
  for (const id of TABOO_IDS) {
    const act = fx?.[id];
    if (!act) continue;
    const m = { kept: taboos[id]?.kept ?? 0, broken: taboos[id]?.broken ?? 0 };
    if (act === 'keep') m.kept += 1;
    if (act === 'break') {
      m.broken += 1;
      broke.push(id);
    }
    if (act === 'mend' && m.broken > 0) {
      m.broken = 0;
      mended.push(id);
    }
    taboos[id] = m;
  }
  return { taboos, broke, mended };
}

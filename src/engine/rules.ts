import {
  ALIGN_THRESHOLD,
  CLASS_CHECK_BONUS,
  CLERIC_MAX_DRIFT,
  CLERIC_WIS_BONUS,
  DEMON_MARK_BONUS,
  DEMON_MARK_TRAIT,
  GODS,
  RANGER_AWAY_PENALTY,
  RANGER_HOME_BONUS,
  WARRIOR_MAX_HP_BONUS,
  type ClassId,
  type FoeSide,
  type GodId,
} from './balance';
import type { Stat } from './schema';
import type { LifeState } from './state';

/** คะแนนแนวทางเป็นช่อง −1, 0, +1 */
export const bucket = (score: number): -1 | 0 | 1 => (score >= ALIGN_THRESHOLD ? 1 : score <= -ALIGN_THRESHOLD ? -1 : 0);

export function alignmentCell(life: LifeState) {
  return { law: bucket(life.alignment.law), moral: bucket(life.alignment.moral) };
}

/** ระยะห่างบนตาราง 3×3 (เดินทแยงนับหนึ่งก้าว) */
export function godDistance(life: LifeState, god: GodId): number {
  const cell = alignmentCell(life);
  const g = GODS[god];
  return Math.max(Math.abs(cell.law - g.law), Math.abs(cell.moral - g.moral));
}

/** นักบวชที่เลื่อนห่างจากเทพเกินหนึ่งช่องจะเสียพลัง */
export function clericDrifted(life: LifeState): boolean {
  if (life.classId !== 'cleric' || !life.god || !(life.god in GODS)) return false;
  return godDistance(life, life.god as GodId) > CLERIC_MAX_DRIFT;
}

export const hasDemonMark = (life: LifeState) => life.traits.includes(DEMON_MARK_TRAIT);

/** โบนัสทอยที่มาจากอาชีพ ถิ่น และรอยจอมมาร (ไม่รวมสเตตและของสวมใส่) */
export function situationalBonus(life: LifeState, stat: Stat, foe?: FoeSide): number {
  let bonus = 0;
  const cls = life.classId as ClassId | null;
  const cb = cls ? CLASS_CHECK_BONUS[cls] : undefined;
  if (cb && cb.stat === stat) bonus += cb.amount;
  if (cls === 'cleric' && stat === 'WIS' && !clericDrifted(life)) bonus += CLERIC_WIS_BONUS;
  if (cls === 'ranger' && (stat === 'DEX' || stat === 'WIS')) {
    bonus += life.homeTag && life.locationTag === life.homeTag ? RANGER_HOME_BONUS : -RANGER_AWAY_PENALTY;
  }
  if (hasDemonMark(life) && foe && foe in DEMON_MARK_BONUS) bonus += DEMON_MARK_BONUS[foe as keyof typeof DEMON_MARK_BONUS];
  return bonus;
}

export const classMaxHpBonus = (life: LifeState) => (life.classId === 'warrior' ? WARRIOR_MAX_HP_BONUS : 0);

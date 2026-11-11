/**
 * องค์กร: ตัวละครเป็นสมาชิกขององค์กรได้ มียศสี่ขั้นที่เลื่อนด้วยผลงาน องค์กรส่งงานมาเป็นระยะ และศัตรูขององค์กรตามมาด้วย
 *   สมาชิก     life.orgs[id] = ยศ ปีที่เข้า ผลงาน งานที่ทำและที่ปฏิเสธ เปิดเผยหรือลับ
 *   งาน        เหตุการณ์ที่มี duty: <องค์กร> ออกเฉพาะกับสมาชิก เว้นจังหวะตาม ORG.dutyGap ทำสำเร็จได้ผลงาน ปฏิเสธเสียผลงาน
 *   ยศ         ผลงานถึงเกณฑ์ ORG.merit แล้วฉากเลื่อนยศ (when.org.ready) จึงออกได้ ยศเลื่อนในฉากนั้นด้วย effects.org.promote
 *   ท่า        ตั้งแต่ยศ ORG.techRank ท่าขององค์กร (TECHNIQUES[id]) ทำงานเองในการปะทะกับศัตรูฝ่ายที่องค์กรนั้นรับมือ ครั้งเดียวต่อการปะทะ
 *   ภัยตามล่า   life.hunted[ฝ่าย] = ระดับ 1 ถึง ORG.huntMax เหตุการณ์ที่มี hunt: <ฝ่าย> ออกถี่ขึ้นตามระดับ และระดับลดลงเองช้าๆ เมื่อรอยเย็นลง
 * ตัวเลขทั้งหมดอยู่ใน balance.ts (ORG, ORGS) ไฟล์นี้มีแต่วิธีคิด
 */
import { ORG, ORGS, ORG_IDS, ORG_RANKS, TECHNIQUES, type FoeSide, type OrgId, type TechniqueKind } from './balance';
import type { Effects, GameEvent, OrgCond } from './schema';
import { worldYear, type LifeState, type Membership } from './state';
import type { Rng } from './rng';

export const membership = (life: LifeState, id: OrgId): Membership | undefined => life.orgs?.[id];
export const isMember = (life: LifeState, id: OrgId) => !!life.orgs?.[id];
export const memberOrgs = (life: LifeState) => ORG_IDS.filter((id) => isMember(life, id));
/** ชื่อยศ เช่น ผู้นับหิน */
export const rankName = (id: OrgId, rank: number) => ORGS[id].ranks[Math.max(1, Math.min(ORG_RANKS, rank)) - 1]!;

/** ผลงานที่ต้องมีก่อนขึ้นยศถัดไป (ยศสูงสุดแล้ว = ไม่มี) */
export const meritForNext = (rank: number): number | undefined => ORG.merit[rank - 1];
/** ผลงานถึงเกณฑ์ของยศถัดไปแล้ว รอฉากเลื่อนยศ */
export function promotionReady(life: LifeState, id: OrgId): boolean {
  const m = membership(life, id);
  const need = m ? meritForNext(m.rank) : undefined;
  return !!m && need !== undefined && m.merit >= need;
}

/** เงื่อนไข org ของ when และ requires */
export function orgCondMet(life: LifeState, cond: OrgCond): boolean {
  const c = typeof cond === 'string' ? { id: cond } : cond;
  const m = membership(life, c.id);
  if (!m) return false;
  if (c.min_rank !== undefined && m.rank < c.min_rank) return false;
  if (c.max_rank !== undefined && m.rank > c.max_rank) return false;
  if (c.ready !== undefined && promotionReady(life, c.id) !== c.ready) return false;
  if (c.secret !== undefined && !!m.secret !== c.secret) return false;
  if (c.min_refused !== undefined && m.refused < c.min_refused) return false;
  return true;
}

const withOrg = (life: LifeState, id: OrgId, m: Membership | undefined): LifeState => {
  const orgs = { ...(life.orgs ?? {}) };
  if (m) orgs[id] = m;
  else delete orgs[id];
  return { ...life, orgs };
};

/** ระดับภัยตามล่าจากฝ่ายหนึ่ง */
export const huntLevel = (life: LifeState, by: string) => life.hunted?.[by] ?? 0;

function setHunt(life: LifeState, by: string, level: number): LifeState {
  const hunted = { ...(life.hunted ?? {}) };
  const next = Math.max(0, Math.min(ORG.huntMax, level));
  if (next > 0) hunted[by] = next;
  else delete hunted[by];
  return { ...life, hunted };
}

/** เข้าเป็นสมาชิกที่ยศแรก ศัตรูขององค์กรรู้จักหน้าตั้งแต่วันนั้น (เป็นสมาชิกอยู่แล้วไม่มีผล) */
export function joinOrg(life: LifeState, id: OrgId, secret = false): LifeState {
  if (isMember(life, id)) return life;
  const next = withOrg(life, id, { rank: 1, joined: worldYear(life), merit: 0, done: 0, refused: 0, ...(secret ? { secret: true } : {}) });
  const enemy = ORGS[id].enemy;
  return secret ? next : setHunt(next, enemy, Math.max(huntLevel(next, enemy), ORG.enemyLevel));
}

/** ออกจากองค์กร ยศและผลงานหายไป ส่วนศัตรูขององค์กรยังจำหน้าได้ (ภัยตามล่าค่อยๆ เย็นลงเอง) */
export const leaveOrg = (life: LifeState, id: OrgId): LifeState => (isMember(life, id) ? withOrg(life, id, undefined) : life);

function changeMember(life: LifeState, id: OrgId, change: (m: Membership) => Membership): LifeState {
  const m = membership(life, id);
  return m ? withOrg(life, id, change(m)) : life;
}

/** ผลของ effects.org และ effects.hunted */
export function applyOrgEffects(life: LifeState, fx: Pick<Effects, 'org' | 'hunted'>): LifeState {
  let next = life;
  const o = fx.org;
  if (o) {
    const linked = !!ORGS[o.id].jobs;
    if (o.join && !linked) next = joinOrg(next, o.id, o.secret === true);
    if (o.merit) next = changeMember(next, o.id, (m) => ({ ...m, merit: Math.max(0, m.merit + o.merit!) }));
    if (o.promote) next = changeMember(next, o.id, (m) => ({ ...m, rank: Math.min(ORG_RANKS, m.rank + 1) }));
    if (o.secret === false && membership(next, o.id)?.secret) {
      // ตัวตนถูกเปิดเผย: เป็นสมาชิกอย่างเปิดหน้า และศัตรูขององค์กรเริ่มตาม
      next = changeMember(next, o.id, ({ secret: _s, ...m }) => m);
      const enemy = ORGS[o.id].enemy;
      next = setHunt(next, enemy, Math.max(huntLevel(next, enemy), ORG.enemyLevel));
    }
    if (o.leave && !linked) next = leaveOrg(next, o.id);
  }
  for (const [by, d] of Object.entries(fx.hunted ?? {})) if (d) next = setHunt(next, by, huntLevel(next, by) + d);
  return next;
}

/** องค์กรที่ผูกกับงาน: ได้งานเมื่อไรเป็นสมาชิกเมื่อนั้น เลิกงานคือออก เรียกทุกครั้งที่ flag เปลี่ยน และตอนโหลดเซฟเก่า */
export function syncJobOrgs(life: LifeState): LifeState {
  let next = life;
  for (const id of ORG_IDS) {
    const jobs = ORGS[id].jobs;
    if (!jobs) continue;
    const working = jobs.some((j) => next.flags.includes(j));
    if (working && !isMember(next, id)) next = joinOrg(next, id);
    else if (!working && isMember(next, id)) next = leaveOrg(next, id);
  }
  return next;
}

// ---------- งานที่องค์กรส่งมา ----------

export type DutyResult = 'done' | 'tried' | 'refused';

/** จดผลของงานหนึ่งงาน: สำเร็จได้ผลงาน ปฏิเสธเสียผลงานและนับครั้ง พยายามแล้วพลาดไม่ได้ไม่เสีย */
export function recordDuty(life: LifeState, id: OrgId, result: DutyResult): LifeState {
  return changeMember(life, id, (m) => {
    if (result === 'done') return { ...m, merit: m.merit + ORG.done, done: m.done + 1 };
    if (result === 'refused') return { ...m, merit: Math.max(0, m.merit + ORG.refused), refused: m.refused + 1 };
    return m;
  });
}

type Duties = ReadonlyMap<string, OrgId>;

/** งานขององค์กรใดก็ตามเพิ่งมาในช่วง ORG.dutyGap.min เหตุการณ์ล่าสุด งานใหม่จึงยังไม่มา */
export function dutyResting(life: LifeState, ev: GameEvent, duties: Duties): boolean {
  if (!ev.duty) return false;
  return life.log.slice(-ORG.dutyGap.min).some((e) => duties.has(e.eventId));
}

/**
 * องค์กรที่ถึงเวลาส่งงานมาแล้ว: เป็นสมาชิกมาอย่างน้อย ORG.dutyGap.max เหตุการณ์ และในช่วงนั้นไม่มีงานขององค์กรนี้เลย
 * (งานที่เกิดซ้ำได้นับด้วย) pickEvent ใช้เลือกงานขององค์กรนั้นก่อนเรื่องอื่น ถ้ายังมีงานที่ออกได้
 */
export function dutiesDue(life: LifeState, duties: Duties): OrgId[] {
  const recent = life.log.slice(-ORG.dutyGap.max);
  if (recent.length < ORG.dutyGap.max) return [];
  return memberOrgs(life).filter((id) => {
    const joinedAge = membership(life, id)!.joined - life.birthYear;
    return recent[0]!.age >= joinedAge && !recent.some((e) => duties.get(e.eventId) === id);
  });
}

// ---------- การปะทะ ----------

/** สมาชิกขององค์กรที่ออกรบ ปะทะถี่เท่าสายถืออาวุธ */
export const fightsForOrg = (life: LifeState) => memberOrgs(life).length > 0;

/** ท่าขององค์กรที่ยังใช้ได้กับศัตรูฝ่ายนี้ในการปะทะที่เดินอยู่ (ยศถึง ORG.techRank ศัตรูเป็นฝ่ายที่องค์กรรับมือ และยังไม่ได้ใช้) */
export function orgTechnique(life: LifeState, side: FoeSide, kind: TechniqueKind): OrgId | null {
  const used = life.encounter?.orgTechUsed ?? [];
  for (const id of memberOrgs(life)) {
    if (TECHNIQUES[id].kind !== kind || used.includes(id)) continue;
    if (membership(life, id)!.rank >= ORG.techRank && ORGS[id].foes.includes(side)) return id;
  }
  return null;
}

/** เหรียญที่องค์กรจ่ายเมื่อสมาชิกชนะศัตรูฝ่ายนี้ที่ระดับภัยนี้ (โรงรับเขี้ยวรับซื้อหลักฐานการล่าของสิ่งที่ไม่ใช่คน) */
export function bountyFor(life: LifeState, side: FoeSide, threat: number): number {
  return memberOrgs(life).some((id) => ORGS[id].bounty && ORGS[id].foes.includes(side)) ? (ORG.bounty[threat - 1] ?? 0) : 0;
}

// ---------- ภัยตามล่า ----------

/** น้ำหนักของเหตุการณ์ตอนสุ่ม: เรื่องถูกตามล่าออกถี่ขึ้นตามระดับภัย */
export const eventWeight = (life: LifeState, ev: GameEvent) => (ev.hunt ? ev.weight * Math.max(1, huntLevel(life, ev.hunt)) : ev.weight);

/**
 * สิ้นปี: ภัยตามล่าจากแต่ละฝ่ายมีโอกาส ORG.huntFade ที่จะลดลงหนึ่งขั้น (ไม่มีใครมาถามหาอีก)
 * ภัยที่ติดมากับองค์กรที่ยังเป็นสมาชิกอย่างเปิดหน้าไม่ลดต่ำกว่า ORG.enemyLevel คืนรายชื่อฝ่ายที่รอยเย็นลงในปีนี้
 */
export function fadeHunts(life: LifeState, rng: Rng): { life: LifeState; cooled: string[] } {
  let next = life;
  const cooled: string[] = [];
  const floors = new Map<string, number>();
  for (const id of memberOrgs(life)) if (!membership(life, id)!.secret) floors.set(ORGS[id].enemy, ORG.enemyLevel);
  for (const [by, level] of Object.entries(life.hunted ?? {})) {
    if (level <= (floors.get(by) ?? 0)) continue;
    if (rng.next() >= ORG.huntFade) continue;
    next = setHunt(next, by, level - 1);
    cooled.push(by);
  }
  return { life: next, cooled };
}

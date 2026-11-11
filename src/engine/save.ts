import type { LifeState } from './state';
import { newLife } from './state';
import { TRAIT_RENAMES } from './balance';
import { estimateBorn } from './people';
import { syncJobOrgs } from './orgs';
import { syncCity } from './cities';
import type { Meta } from './meta';
import { newMeta } from './meta';

const DB = 'visualnovel';
const STORE = 'saves';
export const SLOTS_COUNT = 3;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveSlot = (slot: number, life: LifeState) => tx('readwrite', (s) => s.put(life, slot)).then(() => {});
export const loadSlot = (slot: number) =>
  tx<unknown>('readonly', (s) => s.get(slot)).then((raw) => (raw ? migrate(raw) : undefined));
export const saveMeta = (meta: Meta) => tx('readwrite', (s) => s.put(meta, 'meta')).then(() => {});
export const loadMeta = () => tx<Meta | undefined>('readonly', (s) => s.get('meta')).then((m) => m ?? newMeta());
export const clearSlot = (slot: number) => tx('readwrite', (s) => s.delete(slot)).then(() => {});

/** Export a life as a copyable text code (base64 of JSON, UTF-8 safe). */
export function exportCode(life: LifeState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(life));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importCode(code: string): LifeState {
  const bin = atob(code.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return migrate(JSON.parse(new TextDecoder().decode(bytes)));
}

/**
 * เซฟเก่าเติมค่าที่ยังไม่มีจาก seed เดิม: v1 ไม่มีเพศ ปีเกิด และค่าโลก v2 ไม่มีปีเกิดของคนรอบตัว ขั้นของสิ่งติดตัว และตัวแสดง
 * รหัสสิ่งติดตัวรุ่นเก่า (demon_mark, born_empty_day) เปลี่ยนเป็นรหัสในทะเบียน
 * เซฟก่อนมีระบบองค์กร: คนที่ทำงานในป้อมผู้เฝ้าผนึกอยู่แล้วเป็นสมาชิกภาคีที่ยศแรก
 * เซฟก่อนมีระบบเมือง: ไม่มีเมือง ที่อยู่ ชั้นของคนเมือง และสภาพเมือง ค่าตั้งต้นมาจาก newLife แล้วให้เมืองตรงกับถิ่นที่อยู่
 * เซฟก่อนชุด 4: ไม่มีคะแนนแผ่นดิน รอยของข้อห้าม และเส้นเรื่องยาว เริ่มนับจากศูนย์
 * เซฟก่อนชุด อ: ไม่มีสภาพของอาณาจักร (คลัง ความสงบ ความชอบธรรมของราชวงศ์) เริ่มนับจากศูนย์
 */
export function migrate(raw: unknown): LifeState {
  const old = raw as Partial<Omit<LifeState, 'version'>> & { version?: number };
  if (!old || typeof old.seed !== 'number' || (old.version !== 1 && old.version !== 2 && old.version !== 3)) throw new Error('รหัสเซฟไม่ถูกต้อง');
  const fresh = newLife(old.seed);
  const life = { ...fresh, ...old, version: 3 } as LifeState;
  // เซฟก่อนชุด 4 กับชุด อ: คะแนนโลกยังไม่มีค่าแผ่นดินและสภาพของอาณาจักร (ข้อห้ามกับเส้นเรื่องยาวได้ค่าว่างจาก newLife)
  life.world = { ...fresh.world, ...(old.world ?? {}) };
  life.traits = [...new Set((life.traits ?? []).map((t) => TRAIT_RENAMES[t] ?? t))];
  life.people = (life.people ?? []).map((p) => (p.born === undefined ? { ...p, born: estimateBorn(p, life) } : p));
  // เซฟก่อนมีระบบเมือง: คนที่อยู่ถิ่นที่มีเมืองหลัก (เวนทราส ทุนดาร์) ถือว่าอยู่เมืองนั้น ชั้นของคนเมืองเริ่มนับจากวันที่โหลด
  return syncCity(syncJobOrgs(life));
}

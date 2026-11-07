import type { LifeState } from './state';
import { newLife } from './state';
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

/** เซฟเก่า (v1) ไม่มีเพศ ปีเกิด และค่าโลก เติมค่าเริ่มต้นจาก seed เดิม */
export function migrate(raw: unknown): LifeState {
  const old = raw as Partial<Omit<LifeState, 'version'>> & { version?: number };
  if (!old || typeof old.seed !== 'number' || (old.version !== 1 && old.version !== 2)) throw new Error('รหัสเซฟไม่ถูกต้อง');
  return { ...newLife(old.seed), ...old, version: 2 } as LifeState;
}

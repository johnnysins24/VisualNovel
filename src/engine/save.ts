import type { LifeState } from './state';

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
export const loadSlot = (slot: number) => tx<LifeState | undefined>('readonly', (s) => s.get(slot));
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
  const life = JSON.parse(new TextDecoder().decode(bytes)) as LifeState;
  if (life.version !== 1 || typeof life.seed !== 'number') throw new Error('รหัสเซฟไม่ถูกต้อง');
  return life;
}

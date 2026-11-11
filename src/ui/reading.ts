import { computed, effect, signal } from '@preact/signals';
import { paragraphs, render } from '../engine/text';
import type { LifeState, LogEntry } from '../engine/state';
import { currentEvent, lastEntry, life, revealed } from '../store';

/** ค่าที่จำไว้ในเครื่อง (อ่าน/เขียนพังได้ เช่นโหมดส่วนตัว จึงห่อ try ไว้) */
function stored<T extends string | number>(key: string, fallback: T, ok: (v: string) => boolean): T {
  try {
    const v = localStorage.getItem(key);
    if (v !== null && ok(v)) return (typeof fallback === 'number' ? Number(v) : v) as T;
  } catch {
    /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */
  }
  return fallback;
}
function keep(key: string, v: string | number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ไม่เป็นไร */
  }
}

export type RevealMode = 'step' | 'all';
/** ค่าเริ่มเป็นทีละย่อหน้า (U3) */
export const revealMode = signal<RevealMode>(stored<RevealMode>('vn-reveal', 'step', (v) => v === 'step' || v === 'all'));
export const SPEEDS = [1, 2, 3, 4, 5] as const;
export const autoSpeed = signal<number>(stored('vn-speed', 1, (v) => SPEEDS.includes(Number(v) as 1)));
/** เล่นอัตโนมัติไม่จำข้ามการเปิดเกม เปิดเองทุกครั้งกันอ่านไม่ทัน */
export const autoplay = signal(false);

export function setRevealMode(m: RevealMode) {
  revealMode.value = m;
  keep('vn-reveal', m);
}
export function setSpeed(n: number) {
  autoSpeed.value = n;
  keep('vn-speed', n);
}
export function cycleSpeed() {
  setSpeed(SPEEDS[(SPEEDS.indexOf(autoSpeed.value as 1) + 1) % SPEEDS.length]!);
}

/**
 * ย่อหน้าหลังตัวเลือกของเหตุการณ์หนึ่ง: ผลของตัวเลือก (เติมชื่อด้วยตัวแสดงของเหตุการณ์นั้น)
 * แล้วต่อด้วยประโยคสิ้นปีที่ระบบเติม (ร่างกายโรย ฤดูหนาว ข่าวคนรอบตัว)
 */
export const aftermath = (e: LogEntry, l: LifeState): string[] => [...(e.text ? paragraphs(render(e.text, l, e.cast ?? {}, e.span ?? 1)) : []), ...(e.year?.lines ?? [])];

/** ย่อหน้าใหม่ตามลำดับที่ผู้อ่านจะเห็น: ผลของตัวเลือกล่าสุด แล้วต่อด้วยเหตุการณ์ปัจจุบัน */
export const fresh = computed(() => {
  const l = life.value;
  const last = lastEntry.value;
  const after = last && l.log[l.log.length - 1] === last ? aftermath(last, l) : [];
  const ev = currentEvent.value;
  const now = ev ? paragraphs(render(ev.text, l)) : [];
  return { after, now, total: after.length + now.length };
});

/** จำนวนย่อหน้าใหม่ที่แสดงได้ตอนนี้ */
export const shownCount = computed(() => {
  const n = revealed.value;
  if (revealMode.value === 'all' || n === null) return Infinity;
  return n;
});

/** ยังมีย่อหน้าที่ซ่อนอยู่ไหม */
export const revealing = computed(() => shownCount.value < fresh.value.total);

export function revealNext() {
  if (revealing.value) revealed.value = shownCount.value + 1;
}
export function revealAll() {
  revealed.value = null;
}

/** ผู้เล่นเลื่อนขึ้นไปอ่านของเก่า: ย่อฉากลงให้มีที่อ่าน (U1) */
export const scrolledBack = signal(false);

/** เวลาอ่านหนึ่งย่อหน้าที่ความเร็ว 1x (ประมาณคนไทยอ่าน 15 ตัวอักษรต่อวินาที) */
export const readMs = (text: string, speed: number) => Math.round((900 + text.length * 65) / speed);

let timer: ReturnType<typeof setTimeout> | undefined;
/** เล่นอัตโนมัติ: เปิดย่อหน้าถัดไปเอง หยุดที่ตัวเลือก ไม่เลือกแทนผู้เล่น */
effect(() => {
  clearTimeout(timer);
  if (!autoplay.value || !revealing.value) return;
  const { after, now } = fresh.value;
  const i = shownCount.value;
  // ย่อหน้าที่เพิ่งเปิดล่าสุดคือย่อหน้าที่ผู้อ่านกำลังอ่าน
  const reading = [...after, ...now][Math.max(0, i - 1)] ?? '';
  timer = setTimeout(revealNext, readMs(reading, autoSpeed.value));
});

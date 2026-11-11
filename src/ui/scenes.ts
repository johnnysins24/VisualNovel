import { computed, signal } from '@preact/signals';
import { currentEvent, game, life } from '../store';

/** ภาพฉากหลังจาก thread ศิลป์ (public/scenes) รายชื่อโหลดจาก index.json ครั้งเดียว */
export type TimeOfDay = 'day' | 'dusk' | 'night';
const known = signal<Set<string> | null>(null);

fetch('scenes/index.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((j: { scenes?: string[] } | null) => {
    if (j?.scenes) known.value = new Set(j.scenes);
  })
  .catch(() => {
    /* ไม่มีภาพก็ใช้เนินเขาแบบเดิม */
  });

/**
 * ลำดับหาภาพ: `<scene>_<location>` → `<scene>` → `<location>` (ตามที่ตกลงกับ thread ศิลป์)
 * ไม่เจอเลยคืน null
 */
export function sceneId(scene: string | undefined, location: string, have: Set<string>): string | null {
  const tries = scene ? [`${scene}_${location}`, scene, location] : [location];
  return tries.find((t) => have.has(t)) ?? null;
}

/**
 * ช่วงเวลาของภาพ: เนื้อเรื่องยังไม่บอกเวลา จึงสุ่มแบบคงที่จาก id เหตุการณ์
 * (เหตุการณ์เดิมได้เวลาเดิมทุกครั้ง) กลางวันบ่อยที่สุด
 */
export function timeOf(eventId: string): TimeOfDay {
  let h = 0;
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
  const r = h % 10;
  return r < 6 ? 'day' : r < 8 ? 'dusk' : 'night';
}

/** ภาพของฉากตอนนี้ ใช้เหตุการณ์ปัจจุบัน หรือเหตุการณ์ล่าสุดถ้าชีวิตหยุดแล้ว */
export const sceneImage = computed(() => {
  const have = known.value;
  if (!have) return null;
  const l = life.value;
  const ev = currentEvent.value ?? game.events.find((e) => e.id === l.log[l.log.length - 1]?.eventId) ?? null;
  const id = sceneId(ev?.scene, l.locationTag, have);
  if (!id) return null;
  const time = timeOf(ev?.id ?? l.locationTag);
  return { id, time, url: `scenes/${id}_${time}.png` };
});

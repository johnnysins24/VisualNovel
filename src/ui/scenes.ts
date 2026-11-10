import { computed, signal } from '@preact/signals';
import { eventTime } from '../engine/timeOfDay';
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
 * ช่วงเวลาของภาพ: `time:` ของเหตุการณ์ → คำบอกเวลาในเนื้อเรื่อง (คืนนั้น ตอนบ่าย ตกค่ำ ...)
 * → สุ่มแบบคงที่จาก id (เหตุการณ์เดิมได้เวลาเดิมทุกครั้ง กลางวันบ่อยที่สุด)
 */
export function timeOf(eventId: string): TimeOfDay {
  return eventTime(game.events.find((e) => e.id === eventId), eventId);
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

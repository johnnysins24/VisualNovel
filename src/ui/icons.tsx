import type { Stat } from '../engine/schema';

/**
 * ไอคอนเส้นชั่วคราว (viewBox 24) ใช้แทนคำบน HUD
 * ของจริงจะให้ thread ศิลป์วาดเป็น pixel 16/24 px แล้วแทนที่ path ตรงนี้ชุดเดียว
 */
const PATHS = {
  STR: 'M14.5 4.5 19.5 4.5 19.5 9.5 10 19 5 14zM4 20l3-3M7.5 12.5l4 4',
  DEX: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  CON: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  INT: 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13',
  WIS: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM14.6 12a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0z',
  CHA: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  coin: 'M19.5 12a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0zM12 8.5v7M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3',
  age: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  year: 'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4M15 3v4',
  place: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM14.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z',
  role: 'M12 3l2.6 5.6 6 .6-4.5 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.4 9.2l6-.6z',
  lock: 'M7 10.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 10.5V8a4 4 0 0 1 8 0v2.5',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  story: 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13',
  character: 'M15.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM5.5 21v-3a6.5 6.5 0 0 1 13 0v3',
  people: 'M12 7.2V12M5.5 16.3V12h13v4.3M14.2 5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM7.7 18.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM20.7 18.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z',
  world: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17',
  more: 'M5 11v2M12 11v2M19 11v2',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  chevron: 'M6 9l6 6 6-6',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  d20: 'M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4zM12 2.5l-4.5 13h9zM3.5 7.4l4 8.1M20.5 7.4l-4 8.1M7.5 15.5L12 21.5l4.5-6',
  reborn: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
} as const;

export type IconName = keyof typeof PATHS;

export const STAT_ICON: Record<Stat, IconName> = { STR: 'STR', DEX: 'DEX', CON: 'CON', INT: 'INT', WIS: 'WIS', CHA: 'CHA' };

/** label ว่าง = ไอคอนตกแต่ง (ซ่อนจาก screen reader) */
export function Icon({ name, label, class: cls }: { name: IconName; label?: string; class?: string }) {
  return (
    <svg
      class={`icon ${cls ?? ''}`}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label && <title>{label}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

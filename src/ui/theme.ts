import { effect, signal } from '@preact/signals';

/** auto = ตามเครื่อง (U5) ผู้เล่นสลับเองแล้วจำค่าไว้ */
export type ThemeChoice = 'auto' | 'light' | 'dark';
const KEY = 'vn-theme';

function load(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export const theme = signal<ThemeChoice>(load());

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
export const resolvedTheme = () => (theme.value === 'auto' ? (systemDark() ? 'dark' : 'light') : theme.value);

export function setTheme(t: ThemeChoice) {
  theme.value = t;
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: theme lasts for this visit only */
  }
}

/** ปุ่มบนแถบบน: สลับไปฝั่งตรงข้ามของที่เห็นอยู่ตอนนี้ */
export const toggleTheme = () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');

if (typeof document !== 'undefined') {
  effect(() => {
    const t = theme.value;
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  });
}

import { DEFAULT_NAME, type LifeState } from './state';

/**
 * เติมค่าในข้อความเรื่อง
 *   {name} {surname} {father} {mother}   ชื่อตัวละคร นามสกุล และพ่อแม่ (ยังไม่รู้เผ่า ใช้ "พ่อ" "แม่")
 *   {a|b}                       a เมื่อเป็นเพศชาย b เมื่อเป็นเพศหญิง เช่น {เขา|เธอ}
 *   {partner}                   ชื่อคนรัก (ยังไม่มีใช้ "คนรัก")
 *   {p:a|b}                     a เมื่อคนรักเป็นชาย b เมื่อเป็นหญิง เช่น {p:เขา|เธอ}
 */
export function render(text: string, life: LifeState): string {
  return text.replace(/\{([^{}]*)\}/g, (whole, inner: string) => {
    if (inner.startsWith('p:') && inner.includes('|')) {
      const [m = '', f = ''] = inner.slice(2).split('|');
      return (life.partner?.gender ?? 'f') === 'm' ? m : f;
    }
    if (inner.includes('|')) {
      const [m = '', f = ''] = inner.split('|');
      return life.gender === 'm' ? m : f;
    }
    switch (inner) {
      case 'name':
        return life.name || DEFAULT_NAME;
      case 'surname':
        return life.surname;
      case 'father':
        return life.parents?.father ?? 'พ่อ';
      case 'mother':
        return life.parents?.mother ?? 'แม่';
      case 'partner':
        return life.partner?.name || 'คนรัก';
      default:
        return whole;
    }
  });
}

/** ใช้ตอน lint: คืนชื่อ placeholder ที่ไม่รู้จัก */
export function unknownPlaceholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const inner = m[1] ?? '';
    const body = inner.startsWith('p:') ? inner.slice(2) : inner;
    if (body.includes('|')) {
      if (body.split('|').length !== 2) out.push(`{${inner}}`);
    } else if (inner.startsWith('p:') || !['name', 'surname', 'father', 'mother', 'partner'].includes(inner)) out.push(`{${inner}}`);
  }
  return out;
}

/** แบ่งย่อหน้าตามบรรทัดว่าง */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

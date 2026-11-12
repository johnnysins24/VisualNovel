import { DEFAULT_NAME, type LifeState, type Person } from './state';
import { GODS, type GodId } from './balance';
import { livingChildren } from './people';

/** ชื่อตายตัวที่ใช้ใน {…} ได้ทุกเหตุการณ์ */
const FIXED = ['name', 'surname', 'father', 'mother', 'partner', 'god', 'child', 'newborn', 'years'];
/** คำบอกจำนวนของ {years} */
const COUNT_WORDS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ', 'สิบเอ็ด', 'สิบสอง', 'สิบสาม', 'สิบสี่', 'สิบห้า', 'สิบหก', 'สิบเจ็ด', 'สิบแปด', 'สิบเก้า', 'ยี่สิบ'];
/** คำนำหน้าของ {x:a|b} ที่ไม่ใช่ชื่อบท: p = คนรัก c = ลูกคนโต */
const FIXED_PREFIX = ['p', 'c'];
/** {grand:ชื่อบท}: คำที่หลานในบทนั้นใช้เรียกตัวละคร */
const GRAND = /^grand:([a-z][a-z0-9_]*)$/;
const PREFIXED = /^([a-z][a-z0-9_]*):(.*)$/s;

/**
 * เติมค่าในข้อความเรื่อง
 *   {name} {surname} {father} {mother}   ชื่อตัวละคร นามสกุล และพ่อแม่ (ยังไม่รู้เผ่า ใช้ "พ่อ" "แม่")
 *   {a|b}                       a เมื่อเป็นเพศชาย b เมื่อเป็นเพศหญิง เช่น {เขา|เธอ}
 *   {partner}                   ชื่อคนรัก (ยังไม่มีใช้ "คนรัก")
 *   {p:a|b}                     a เมื่อคนรักเป็นชาย b เมื่อเป็นหญิง เช่น {p:เขา|เธอ}
 *   {child}                     ชื่อลูกคนโตที่ยังอยู่ (ไม่มีใช้ "ลูก")
 *   {c:a|b}                     a เมื่อลูกคนโตเป็นชาย b เมื่อเป็นหญิง
 *   {newborn}                   ชื่อลูกหรือหลานคนล่าสุดที่เข้ามาในครอบครัว (ไม่มีใช้ "ลูก") ใช้กับป้ายเส้นชีวิตของเหตุการณ์ที่ลูกหรือหลานเกิด
 *   {god}                       ชื่อไทยของเทพที่นับถือ (ยังไม่มีใช้ "เทพ")
 *   {years}                     จำนวนปีจริงที่เหตุการณ์นี้กินเวลา เป็นคำ เช่น "สาม" (เฉพาะเหตุการณ์ที่มี years) เขียนว่า {years}ปี
 *   {ชื่อบท}                     ชื่อของคนที่เล่นบทนั้นในเหตุการณ์ (cast) เช่น {who}
 *   {ชื่อบท:a|b}                 a เมื่อคนในบทนั้นเป็นชาย b เมื่อเป็นหญิง เช่น {who:เขา|เธอ}
 *   {grand:ชื่อบท}               คำที่หลานในบทนั้นเรียกตัวละคร: ปู่ ย่า (หลานจากลูกชาย) ตา ยาย (หลานจากลูกสาว) ไม่รู้ว่าเป็นลูกของใครใช้ปู่กับย่า
 * cast = ตัวแสดงของเหตุการณ์ที่ข้อความนี้มาจาก (ชื่อบท → id ของคน) ไม่ส่งใช้ตัวแสดงของเหตุการณ์ปัจจุบัน
 * span = จำนวนปีของเหตุการณ์ที่ข้อความนี้มาจาก ไม่ส่งใช้ของเหตุการณ์ปัจจุบัน
 */
export function render(text: string, life: LifeState, cast: Record<string, string> = life.cast ?? {}, span: number = life.span ?? 1): string {
  const person = (role: string): Person | undefined => {
    const id = cast[role];
    return id ? (life.people ?? []).find((p) => p.id === id) : undefined;
  };
  const eldest = () => livingChildren(life)[0];
  return text.replace(/\{([^{}]*)\}/g, (whole, inner: string) => {
    const grand = GRAND.exec(inner);
    if (grand) {
      const cub = person(grand[1]!);
      if (!cub) return whole;
      const viaDaughter = (life.people ?? []).find((p) => p.id === cub.parent)?.gender === 'f';
      return life.gender === 'm' ? (viaDaughter ? 'ตา' : 'ปู่') : viaDaughter ? 'ยาย' : 'ย่า';
    }
    const pre = PREFIXED.exec(inner);
    if (pre && pre[2]!.includes('|')) {
      const [m = '', f = ''] = pre[2]!.split('|');
      if (pre[1] === 'p') return (life.partner?.gender ?? 'f') === 'm' ? m : f;
      if (pre[1] === 'c') return (eldest()?.gender ?? 'f') === 'm' ? m : f;
      const who = person(pre[1]!);
      return who ? ((who.gender ?? 'm') === 'm' ? m : f) : whole;
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
      case 'child':
        return eldest()?.name ?? 'ลูก';
      case 'newborn':
        return (life.people ?? []).filter((p) => p.kin === 'child' || p.kin === 'grandchild').at(-1)?.name ?? 'ลูก';
      case 'god':
        return GODS[life.god as GodId]?.th ?? 'เทพ';
      case 'years':
        return COUNT_WORDS[span] ?? String(span);
      default:
        return person(inner)?.name ?? whole;
    }
  });
}

/** ชื่อใน {…} ที่ข้อความนี้ใช้ แยกเป็นชื่อเดี่ยว ({who}) กับคำนำหน้า ({who:a|b}) */
export function placeholders(text: string): { names: string[]; prefixes: string[]; bad: string[] } {
  const names: string[] = [];
  const prefixes: string[] = [];
  const bad: string[] = [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const inner = m[1] ?? '';
    // {grand:ชื่อบท} นับเป็นการเอ่ยถึงคนในบทนั้น
    const grand = GRAND.exec(inner);
    if (grand) {
      names.push(grand[1]!);
      continue;
    }
    const pre = PREFIXED.exec(inner);
    const body = pre ? pre[2]! : inner;
    if (body.includes('|')) {
      if (body.split('|').length !== 2) bad.push(`{${inner}}`);
      else if (pre) prefixes.push(pre[1]!);
    } else if (pre) bad.push(`{${inner}}`);
    else names.push(inner);
  }
  return { names, prefixes, bad };
}

/** ใช้ตอน lint: คืน placeholder ที่ไม่รู้จัก roles = ชื่อบทใน cast ของเหตุการณ์ที่ข้อความนี้อยู่ */
export function unknownPlaceholders(text: string, roles: string[] = []): string[] {
  const { names, prefixes, bad } = placeholders(text);
  return [
    ...bad,
    ...names.filter((n) => !FIXED.includes(n) && !roles.includes(n)).map((n) => `{${n}}`),
    ...prefixes.filter((p) => !FIXED_PREFIX.includes(p) && !roles.includes(p)).map((p) => `{${p}:…}`),
  ];
}

/** คนที่ข้อความเอ่ยถึงด้วยชื่อตายตัว ใช้กันไม่ให้เหตุการณ์พูดถึงคนที่ไม่อยู่แล้ว */
export type Mention = 'partner' | 'father' | 'mother' | 'child';
export function mentionsOf(...texts: (string | undefined)[]): Mention[] {
  const out = new Set<Mention>();
  for (const t of texts) {
    if (!t) continue;
    const { names, prefixes } = placeholders(t);
    for (const n of names) if (n === 'partner' || n === 'father' || n === 'mother' || n === 'child') out.add(n);
    if (prefixes.includes('p')) out.add('partner');
    if (prefixes.includes('c')) out.add('child');
  }
  return [...out];
}

/** แบ่งย่อหน้าตามบรรทัดว่าง */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

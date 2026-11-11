import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ContentSchema, type Content } from '../src/engine/schema';

function loadDir(dir: string): unknown[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .flatMap((f) => (parse(readFileSync(join(dir, f), 'utf8')) as unknown[]) ?? []);
}

function loadNames(root: string): unknown[] {
  try {
    return (parse(readFileSync(join(root, 'names.yaml'), 'utf8')) as unknown[]) ?? [];
  } catch {
    return [];
  }
}

/** ไฟล์เดี่ยวที่ไม่บังคับมี (ทะเบียนสิ่งติดตัว ประโยคของระบบ) ไม่มีไฟล์ = ค่าว่าง */
function loadFile<T>(path: string, empty: T): T {
  try {
    return (parse(readFileSync(path, 'utf8')) as T) ?? empty;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty;
    throw e;
  }
}

/** โฟลเดอร์เนื้อหา ตั้ง CONTENT_DIR เพื่อใช้ชุดทดสอบ (เช่น ตอนถ่ายจอ) */
export function loadContent(root = process.env.CONTENT_DIR ?? 'content'): Content {
  return ContentSchema.parse({
    events: loadDir(join(root, 'events')),
    items: loadDir(join(root, 'items')),
    names: loadNames(root),
    traits: loadFile<unknown[]>(join(root, 'traits.yaml'), []),
    lines: loadFile<Record<string, string[]>>(join(root, 'lines.yaml'), {}),
  });
}

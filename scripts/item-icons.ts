/**
 * ไอคอนของของแต่ละชิ้น public/items/<id>.png (สร้างพร้อม src/generated/content.json ไม่ได้เก็บใน git)
 *   ของที่มีแบบกับวัสดุ: ตัดช่องของวัสดุนั้นจาก public/icons/gear_<แบบ>.png (หกช่อง ลำดับตาม public/icons/index.json)
 *   ของอื่น: ภาพที่ปรับจากชุดภาพฟรี art/adopted/<icon หรือ id>.png (รายการใน art/adopted.yaml)
 * คืนรายการของที่ยังไม่มีภาพ ตัวตรวจเนื้อหาใช้รายการนี้ (ของทุกชิ้นต้องมีไอคอน)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Content } from '../src/engine/schema';
import { decodePNG, encodePNG } from '../art/kit/png.mjs';
import { crop } from '../art/kit/pixels.mjs';

interface StripInfo { w: number; h: number; frames: string[] }

export function itemIcons(content: Content): { files: Map<string, Uint8Array>; problems: string[] } {
  const index: Record<string, StripInfo> = existsSync('public/icons/index.json') ? JSON.parse(readFileSync('public/icons/index.json', 'utf8')) : {};
  const strips = new Map<string, ReturnType<typeof decodePNG>>();
  const files = new Map<string, Uint8Array>(), problems: string[] = [];
  for (const it of content.items) {
    const where = `items/${it.id}`;
    if (it.pattern && !it.icon) {
      const key = `gear_${it.pattern}`, info = index[key], frame = info?.frames.indexOf(it.material ?? '') ?? -1;
      if (!info) { problems.push(`${where}: ไม่มีแบบ "${it.pattern}" ใน art/gear.yaml (ไอคอน public/icons/${key}.png)`); continue; }
      if (frame < 0) { problems.push(`${where}: แบบ "${it.pattern}" ไม่มีช่องของวัสดุ "${it.material ?? ''}"`); continue; }
      if (!strips.has(key)) strips.set(key, decodePNG(readFileSync(`public/icons/${key}.png`)));
      files.set(it.id, encodePNG(crop(strips.get(key)!, { x: frame * info.w, y: 0, w: info.w, h: info.h })));
      continue;
    }
    const src = join('art/adopted', `${it.icon ?? it.id}.png`);
    if (existsSync(src)) files.set(it.id, readFileSync(src));
    else problems.push(`${where}: ไม่มีไอคอน (ใส่ pattern กับ material หรือเพิ่มภาพใน art/adopted.yaml แล้วรัน node art/kit/adopt.mjs)`);
  }
  return { files, problems };
}

/** เขียน public/items/ ให้ตรงกับเนื้อหาชุดนี้ (ลบภาพของของที่ไม่มีแล้ว) */
export function writeItemIcons(content: Content, dir = 'public/items'): string[] {
  const { files, problems } = itemIcons(content);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png') && !files.has(f.slice(0, -4))) rmSync(join(dir, f));
  for (const [id, data] of files) {
    const p = join(dir, `${id}.png`);
    if (!existsSync(p) || !Buffer.from(data).equals(readFileSync(p))) writeFileSync(p, data);
  }
  return problems;
}

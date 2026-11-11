import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './content';
import { lintContent } from '../src/engine/lint';
import { itemIcons } from './item-icons';

const content = loadContent();
const problems = lintContent(content);

// ภาพศัตรู: ศัตรูทุกชนิดต้องมีภาพสองเฟรม (ยืน เข้าตี) และไม่มีภาพที่ไม่มีศัตรูใช้ ไม่อย่างนั้นแผงการปะทะจะขึ้นเวทีเปล่า
const foeDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'foes');
if (content.foes.length) {
  const index: Record<string, { frames?: string[] }> = existsSync(join(foeDir, 'index.json')) ? JSON.parse(readFileSync(join(foeDir, 'index.json'), 'utf8')) : {};
  const ids = new Set(content.foes.map((f) => f.id));
  for (const id of ids) {
    if (!existsSync(join(foeDir, `${id}.png`))) problems.push(`foes/${id}: ไม่มีภาพ public/foes/${id}.png`);
    const frames = index[id]?.frames ?? [];
    if (!frames.includes('idle') || !frames.includes('strike')) problems.push(`foes/${id}: public/foes/index.json ต้องมีเฟรม idle และ strike`);
  }
  const pictures = existsSync(foeDir) ? readdirSync(foeDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : [];
  for (const id of new Set([...pictures, ...Object.keys(index)])) if (!ids.has(id)) problems.push(`public/foes/${id}: มีภาพแต่ไม่มีศัตรูนี้ใน foes.yaml`);
}

// ของทุกชิ้นต้องมีไอคอน: จากแบบกับวัสดุ หรือจากภาพที่ปรับมาจากชุดภาพฟรี
problems.push(...itemIcons(content).problems);

if (problems.length) {
  console.error(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
console.log(`เนื้อหาผ่านการตรวจ: ${content.events.length} เหตุการณ์, ${content.items.length} ของ, ${content.foes.length} ศัตรู`);

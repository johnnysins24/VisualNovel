import { mkdirSync, writeFileSync } from 'node:fs';
import { loadContent } from './content';
import { lintContent } from '../src/engine/lint';
import { writeItemIcons } from './item-icons';

const content = loadContent();
const problems = lintContent(content);
if (problems.length) {
  console.error(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
mkdirSync('src/generated', { recursive: true });
writeFileSync('src/generated/content.json', JSON.stringify(content));
// ไอคอนของของแต่ละชิ้น ชุดทดสอบ (CONTENT_DIR) มีของที่ไม่มีภาพได้ หน้าจอใช้สัญลักษณ์ของช่องแทน
const missing = writeItemIcons(content);
if (missing.length && !process.env.CONTENT_DIR) {
  console.error(missing.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
console.log(`สร้าง src/generated/content.json (${content.events.length} เหตุการณ์) และไอคอนของ ${content.items.length - missing.length} ชิ้นใน public/items/`);

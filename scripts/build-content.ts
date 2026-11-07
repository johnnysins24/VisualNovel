import { mkdirSync, writeFileSync } from 'node:fs';
import { loadContent } from './content';
import { lintContent } from '../src/engine/lint';

const content = loadContent();
const problems = lintContent(content);
if (problems.length) {
  console.error(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
mkdirSync('src/generated', { recursive: true });
writeFileSync('src/generated/content.json', JSON.stringify(content));
console.log(`สร้าง src/generated/content.json (${content.events.length} เหตุการณ์)`);

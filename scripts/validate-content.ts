import { loadContent } from './content';
import { lintContent } from '../src/engine/lint';

const content = loadContent();
const problems = lintContent(content);
if (problems.length) {
  console.error(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
console.log(`เนื้อหาผ่านการตรวจ: ${content.events.length} เหตุการณ์, ${content.items.length} ของ`);

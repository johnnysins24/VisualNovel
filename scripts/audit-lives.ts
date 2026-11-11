/**
 * ตรวจ logic ของเกมด้วยการเล่นชีวิตสุ่มจำนวนมากบนเนื้อหาจริง แล้วพิมพ์รายงาน
 *   npm run audit            เล่น 2000 ชีวิต
 *   npm run audit -- 500     เล่น 500 ชีวิต
 * รายงานสิ่งที่ผู้เล่นจะเจอจริง: ทางตัน เหตุการณ์ must ที่หลุด คนตายที่ยังถูกพูดถึง เงินและค่าสเตตที่เพี้ยน
 * เหตุการณ์ที่ไม่มีใครได้เห็น และสองชีวิตเจอเรื่องซ้ำกันแค่ไหน จบด้วยรหัส 1 ถ้าพบปัญหา
 */
import { loadContent } from './content';
import { makeGame } from '../src/engine/engine';
import { auditLives, formatReport } from './audit';

const lives = Number(process.argv[2] ?? 2000);
const game = makeGame(loadContent());
const res = auditLives(game, lives);
console.log(formatReport(game, res));
process.exitCode = res.problems.size ? 1 : 0;

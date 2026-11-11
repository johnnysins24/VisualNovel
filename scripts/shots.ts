// เทสต์ในเบราว์เซอร์ (Playwright): สร้างเว็บด้วยเนื้อหาทดสอบ รันเทสต์ แล้วคืนเนื้อหาจริงให้เองเมื่อจบ
// ส่งตัวเลือกต่อให้ Playwright ได้ เช่น npm run shots -- --project portrait หรือ npm run shots -- -g biography
import { spawnSync } from 'node:child_process';

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env) => spawnSync(cmd, args, { stdio: 'inherit', env }).status ?? 1;

// สร้างเว็บด้วยเนื้อหาทดสอบที่นี่เสมอ ไม่ฝากไว้กับ webServer ของ Playwright: ถ้ามี server ค้างอยู่ Playwright จะใช้ต่อโดยไม่สร้างใหม่ แล้วเทสต์จะรันบนของเก่า
const built = run('npm', ['run', 'build'], { ...process.env, CONTENT_DIR: 'tests/fixtures/content' });
const status = built || run('npx', ['playwright', 'test', ...process.argv.slice(2)]);
// การสร้างข้างบนเขียนเนื้อหาทดสอบทับ src/generated/content.json จึงสร้างของจริงกลับคืน ไม่ว่าเทสต์จะผ่านหรือไม่
const { CONTENT_DIR: _fixture, ...env } = process.env;
const restored = run('npx', ['tsx', 'scripts/build-content.ts'], env);
process.exit(status || restored);

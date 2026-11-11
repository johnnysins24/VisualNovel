// คำสั่งของห้องวาด: npm run draw -- <คำสั่ง> (ทางที่สคริปต์ใช้วาด ทางเมาส์คือ npm run studio)
//
//   new <ชนิด> <ชื่อ> <กว้าง> <สูง>       ภาพเปล่า ชนิด: foe icon prop piece เช่น new foe ash_hound 48 32
//   run <ภาพ> [ไฟล์คำสั่ง]                รันคำสั่งวาดทีละบรรทัด (ไม่บอกไฟล์ = อ่านจาก stdin) แล้วบันทึก
//   import <ไฟล์ในชุดฟรี> <ภาพ>           นำเข้าภาพจาก art/thirdparty/ (--big ขยายสองเท่า, --keep-shadow, --mats N)
//   show <ภาพ>                            ทำภาพขยายพร้อมพิกัดไว้ตรวจงาน
//   build [--check]                       สร้างไฟล์ที่เกมใช้จากทุกภาพ (--check แค่ตรวจว่าเป็นปัจจุบัน)
//   list                                  รายชื่อภาพ
//   help                                  คำสั่งวาดทั้งหมด
//
// <ภาพ> เขียนแบบ foes/ash_hound (โฟลเดอร์ foes icons props wear ใต้ art/)
// ตัวเลือกของ run กับ show: --ref <ไฟล์ในชุดฟรี> ภาพอ้างอิง, --scene <ฉาก> --time <day|dusk|night> ฉากของภาพขนาดจริง,
//   --zoom N, --frame <ชื่อ>, --marks ชี้พิกเซลที่หลุดเดี่ยว, --out <ไฟล์ png>, --dry (run แต่ไม่บันทึก)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HELP, bounds, newDrawing, newStudio, runScript, strays, type Drawing, type Kind } from '../src/studio/core.ts';
import {
  DIRS, ROOT, importTile, kindOfRef, listDrawings, palette, pathOf, previewImage, readDrawing, readSource, savePNG, staleFiles, writeBuilt, writeDrawing,
} from './studio-lib.ts';

const argv = process.argv.slice(2);
const flags: Record<string, string> = {};
const args: string[] = [];
const BARE = new Set(['big', 'keep-shadow', 'check', 'dry', 'marks']);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (!a.startsWith('--')) args.push(a);
  else if (BARE.has(a.slice(2))) flags[a.slice(2)] = '1';
  else flags[a.slice(2)] = argv[++i] ?? '';
}
const need = (v: string | undefined, what: string): string => { if (!v) throw new Error(`ต้องบอก${what} (ดูวิธีใช้ที่หัวไฟล์ scripts/studio.ts)`); return v; };

/** สรุปภาพหนึ่งบรรทัด */
function summary(ref: string, doc: Drawing): string {
  const b = bounds(doc);
  return `${ref} ${doc.w}x${doc.h} ${doc.frames.map((f) => `${f.name}[${f.layers.map((l) => l.name).join(' ')}]`).join(' ')} วัสดุ: ${doc.mats.slice(1).map((m) => `${m}=${doc.ramps[m]}`).join(' ') || '-'}${b ? ` ภาพอยู่ที่ ${b.x0},${b.y0} ถึง ${b.x1},${b.y1}` : ' (ว่าง)'}`;
}

function preview(ref: string, doc: Drawing): string {
  const out = flags.out ?? join(ROOT, '.studio', `${ref.replace('/', '-')}.png`);
  const frame = flags.frame === undefined ? undefined : doc.frames.findIndex((f) => f.name === flags.frame);
  if (frame !== undefined && frame < 0) throw new Error(`ไม่มีเฟรม "${flags.frame}"`);
  savePNG(out, previewImage(doc, {
    ref: flags.ref ? readSource(flags.ref) : null, zoom: flags.zoom ? Number(flags.zoom) : undefined,
    scene: flags.scene, time: flags.time, frame, marks: !!flags.marks,
  }));
  return out;
}

function main(): void {
  const [cmd, a, b, c, d] = args;
  switch (cmd) {
    case 'new': {
      const kind = need(a, 'ชนิดภาพ') as Kind, ref = `${DIRS[kind] ?? ''}/${need(b, 'ชื่อภาพ')}`;
      if (existsSync(pathOf(ref))) throw new Error(`มี art/${ref}.yaml อยู่แล้ว`);
      const doc = newDrawing(kind, Number(need(c, 'ความกว้าง')), Number(need(d, 'ความสูง')));
      writeDrawing(ref, doc);
      console.log(`สร้าง ${summary(ref, doc)}`);
      return;
    }
    case 'run': {
      const ref = need(a, 'ชื่อภาพ'), st = newStudio(readDrawing(ref));
      const notes = runScript(st, readFileSync(b ?? 0, 'utf8'), palette());
      notes.forEach((n) => console.log(n));
      if (!flags.dry) writeDrawing(ref, st.doc);
      const lone = strays(st.doc, st.frame).length;
      console.log(`${flags.dry ? 'ลองวาด (ไม่บันทึก)' : 'บันทึก'} ${summary(ref, st.doc)}${lone ? ` พิกเซลหลุดเดี่ยว ${lone} จุด (--marks เพื่อดู)` : ''}`);
      console.log(`ภาพตรวจงาน: ${preview(ref, st.doc)}`);
      return;
    }
    case 'import': {
      const from = need(a, 'ไฟล์ในชุดฟรี'), ref = need(b, 'ชื่อภาพ');
      if (existsSync(pathOf(ref))) throw new Error(`มี art/${ref}.yaml อยู่แล้ว`);
      const doc = importTile(from, { kind: kindOfRef(ref), big: !!flags.big, shadow: !flags['keep-shadow'], maxMats: flags.mats ? Number(flags.mats) : undefined });
      writeDrawing(ref, doc);
      console.log(`นำเข้า ${summary(ref, doc)}`);
      console.log(`ภาพตรวจงาน: ${preview(ref, doc)}`);
      return;
    }
    case 'show': {
      const ref = need(a, 'ชื่อภาพ'), doc = readDrawing(ref);
      console.log(summary(ref, doc));
      console.log(`ภาพตรวจงาน: ${preview(ref, doc)}`);
      return;
    }
    case 'build': {
      if (flags.check) {
        const stale = staleFiles();
        if (stale.length) { console.error(`ไฟล์ที่ยังไม่เป็นปัจจุบัน (รัน npm run draw -- build):\n  ${stale.join('\n  ')}`); process.exitCode = 1; } else console.log('ไฟล์ที่สร้างจากห้องวาดเป็นปัจจุบันทุกไฟล์');
        return;
      }
      const done = writeBuilt();
      console.log(done.length ? `เขียน ${done.length} ไฟล์:\n  ${done.join('\n  ')}` : 'ไม่มีอะไรเปลี่ยน');
      return;
    }
    case 'list':
      for (const ref of listDrawings()) console.log(summary(ref, readDrawing(ref)));
      return;
    case 'help':
      for (const [syntax, what] of HELP) console.log(`${syntax.padEnd(46)} ${what}`);
      console.log(`\nramp ที่ใช้ได้: ${Object.keys(palette().ramps).join(' ')}`);
      return;
    default:
      throw new Error('ใช้แบบ: npm run draw -- new|run|import|show|build|list|help (ดูหัวไฟล์ scripts/studio.ts)');
  }
}

try { main(); } catch (e) { console.error((e as Error).message); process.exitCode = 1; }

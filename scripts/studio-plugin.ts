// ปลั๊กอินของ Vite ที่ให้หน้าห้องวาด (studio.html) อ่านเขียนไฟล์ภาพใน art/ ได้
// ทำงานเฉพาะตอน npm run studio (vite dev) ไม่มีอะไรจากไฟล์นี้ไปอยู่ในเกมที่ build แล้ว
// ทุก path ผ่านตัวตรวจของ scripts/studio-lib.ts: เขียนได้เฉพาะ art/{foes,icons,props,wear}/<ชื่อ>.yaml และต้องเป็นภาพที่อ่านได้จริง
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { fromYaml } from '../src/studio/core.ts';
import { checkDrawing, listDrawings, listSources, pathOf, sourcePath, writeBuilt, writeDrawing } from './studio-lib.ts';

const MAX_BODY = 2_000_000;

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { reject(new Error('ไฟล์ใหญ่เกินไป')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res: ServerResponse, status: number, data: string | Uint8Array, type = 'text/plain; charset=utf-8') => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(data);
};
const json = (res: ServerResponse, data: unknown) => send(res, 200, JSON.stringify(data), 'application/json');

/** คำขอที่มาจากหน้าเว็บอื่น (Origin ไม่ตรงกับ Host) ไม่รับ */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function studioPlugin(): Plugin {
  return {
    name: 'studio-files',
    // เฉพาะ vite dev: ไม่ทำงานตอน build ตอน vite preview หรือตอนรันเทสต์
    apply: (_config, env) => env.command === 'serve' && !env.isPreview && !process.env.VITEST,
    configureServer(server) {
      server.middlewares.use('/__studio', (req, res) => {
        void (async () => {
          try {
            if (!sameOrigin(req)) return send(res, 403, 'ต้องเรียกจากหน้าห้องวาดเท่านั้น');
            const url = new URL(req.url ?? '/', 'http://x'), q = (k: string) => url.searchParams.get(k) ?? '';
            const route = `${req.method} ${url.pathname}`;
            if (route === 'GET /list') return json(res, { drawings: listDrawings() });
            if (route === 'GET /file') {
              const p = pathOf(q('path'));
              return existsSync(p) ? send(res, 200, readFileSync(p, 'utf8'), 'text/yaml; charset=utf-8') : send(res, 404, `ไม่มีไฟล์ art/${q('path')}.yaml`);
            }
            if (route === 'PUT /file') {
              const ref = q('path'), doc = checkDrawing(ref, fromYaml(await body(req)));
              writeDrawing(ref, doc);
              return json(res, { saved: ref });
            }
            if (route === 'GET /sources') return json(res, listSources(q('dir')));
            if (route === 'GET /source') return send(res, 200, readFileSync(sourcePath(q('path'))), 'image/png');
            if (route === 'POST /build') return json(res, { written: writeBuilt() });
            return send(res, 404, 'ไม่มีทางนี้');
          } catch (e) {
            send(res, 400, (e as Error).message);
          }
        })();
      });
    },
  };
}

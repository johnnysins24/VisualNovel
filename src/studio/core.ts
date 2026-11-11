// ห้องวาด: แกนของเครื่องมือวาดพิกเซลของเกม (ทำงานแบบ Aseprite ย่อส่วน)
//
// ภาพหนึ่งภาพ (Drawing) เก็บเป็นดัชนี ไม่ใช่สี: แต่ละพิกเซลคือ "วัสดุ + ระดับแสง 0 ถึง 4" แบบเดียวกับชิ้นของ
// ชุดเครื่องมือศิลป์ (art/kit) สีจริงมาจาก ramp ตอนแสดงผล ภาพที่วาดในห้องนี้จึงเปลี่ยนสีทั้งตัวได้โดยไม่ต้องวาดใหม่
//
// เครื่องมือทุกอย่างเป็นคำสั่งข้อความหนึ่งบรรทัด เช่น `line 3,4 20,9` คนใช้ผ่านเมาส์ในหน้าเว็บ (src/studio/main.tsx)
// ส่วนสคริปต์ส่งคำสั่งชุดเดียวกันผ่าน scripts/studio.ts ทั้งสองทางจึงได้ภาพเดียวกันทุกพิกเซล และย้อนกลับได้เหมือนกัน
// ไฟล์นี้ไม่ใช้ Node API จึงรันได้ทั้งในเบราว์เซอร์และในเทสต์
import YAML from 'yaml';
import { oklab } from '../../art/kit/colour.mjs';

export type Kind = 'foe' | 'icon' | 'prop' | 'piece';
export const KINDS: Kind[] = ['foe', 'icon', 'prop', 'piece'];
/** โฟลเดอร์ใน art/ ของภาพแต่ละชนิด (ไฟล์คือ art/<โฟลเดอร์>/<ชื่อ>.yaml) */
export const DIRS: Record<Kind, string> = { foe: 'foes', icon: 'icons', prop: 'props', piece: 'wear' };
export interface Img { w: number; h: number; rgba: Uint8ClampedArray }
export interface Layer { name: string; hidden: boolean; locked?: boolean; px: Int16Array }
export interface Frame { name: string; layers: Layer[] }
export interface Drawing {
  kind: Kind;
  w: number;
  h: number;
  /** ชื่อวัสดุ ลำดับคือรหัส ตัวแรกเป็น ink (สีเส้นขอบ) เสมอ */
  mats: string[];
  /** วัสดุ -> ชื่อ ramp ใน palette (ink ไม่มี) */
  ramps: Record<string, string>;
  /** ตอนแสดงผลใส่เส้นขอบ 1 px รอบเงาทั้งตัวให้เองไหม (แบบเดียวกับตัวละคร) */
  outline: boolean;
  meta: Record<string, string | number>;
  frames: Frame[];
}
/** ramp ทั้งหมดที่ใช้วาดได้: ของ sprite ใช้ชื่อเดิม ของฉากขึ้นต้นด้วย scene. */
export interface Palette { outline: string; ramps: Record<string, string[]> }
export interface Box { x0: number; y0: number; x1: number; y1: number }
interface Snap { doc: Drawing; frame: number; layer: number; sel: Box | null }
export interface Studio {
  doc: Drawing;
  frame: number;
  layer: number;
  /** พู่กันตอนนี้ */
  mat: string;
  level: number;
  sel: Box | null;
  /** แกนตั้งของการวาดสมมาตร (คอลัมน์ เช่น 15 หรือ 15.5) ทุกพิกเซลที่วาดจะถูกวาดอีกฝั่งด้วย null = ปิด */
  sym: number | null;
  /** ตัวอักษรของคำสั่ง stamp -> รหัสพิกเซล */
  keys: Record<string, number>;
  /** คำสั่งที่เปลี่ยนภาพ เรียงตามลำดับ (เล่นซ้ำได้) */
  log: string[];
  undo: Snap[];
  redo: Snap[];
}

export const INK = 'ink';
export const EMPTY = -1;
export const LEVELS = 5;
const HISTORY = 300;
/** ตัวอักษรของ legend ในไฟล์ (ไม่มี x เพราะไฟล์ชิ้นของ art/kit ใช้ x เป็นลบ) */
const LETTERS = 'abcdefghijklmnopqrstuvwyzABCDEFGHIJKLMNOPQRSTUVWYZ0123456789+*=~^%&$!?<>';

// ---------- พิกเซล ----------

export const code = (mat: number, level: number) => mat * 8 + level;
export const matOf = (c: number) => c >> 3;
export const levelOf = (c: number) => c & 7;
const clampLevel = (n: number) => Math.max(0, Math.min(LEVELS - 1, n));

const fail = (msg: string): never => { throw new Error(msg); };

/** ramp ของ sprite กับของฉากรวมเป็นตารางเดียว (ไฟล์ YAML ที่ parse แล้ว) */
export function makePalette(sprite: { outline: unknown; ramps: Record<string, unknown[]> }, scene: { materials: Record<string, { ramp?: unknown[] }> }): Palette {
  const hex = (v: unknown) => (typeof v === 'number' ? String(v).padStart(6, '0') : String(v)).toLowerCase();
  const ramps: Record<string, string[]> = {};
  for (const [k, r] of Object.entries(sprite.ramps)) ramps[k] = r.map(hex);
  for (const [k, m] of Object.entries(scene.materials)) if (m.ramp && k !== 'ink') ramps[`scene.${k}`] = m.ramp.map(hex);
  return { outline: hex(sprite.outline), ramps };
}

// ---------- ภาพและสถานะ ----------

const newLayer = (name: string, w: number, h: number): Layer => ({ name, hidden: false, px: new Int16Array(w * h).fill(EMPTY) });

export function newDrawing(kind: Kind, w: number, h: number): Drawing {
  if (!KINDS.includes(kind)) fail(`ไม่รู้จักชนิดภาพ "${kind}" (ใช้ ${KINDS.join(' ')})`);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 256 || h > 256) fail('ขนาดภาพต้องเป็นจำนวนเต็ม 1 ถึง 256');
  return { kind, w, h, mats: [INK], ramps: {}, outline: kind !== 'piece', meta: {}, frames: [{ name: kind === 'foe' ? 'idle' : 'main', layers: [newLayer('main', w, h)] }] };
}

const cloneDoc = (d: Drawing): Drawing => ({
  ...d, mats: [...d.mats], ramps: { ...d.ramps }, meta: { ...d.meta },
  frames: d.frames.map((f) => ({ name: f.name, layers: f.layers.map((l) => ({ ...l, px: l.px.slice() })) })),
});

export function newStudio(doc: Drawing): Studio {
  return { doc, frame: 0, layer: doc.frames[0]!.layers.length - 1, mat: doc.mats[1] ?? INK, level: 2, sel: null, sym: null, keys: {}, log: [], undo: [], redo: [] };
}

/** สำเนาของสถานะทั้งหมด (หน้าเว็บใช้ลองวาดระหว่างลากเมาส์ แล้วทิ้งสำเนาเมื่อเปลี่ยนใจ) */
export function cloneStudio(st: Studio): Studio {
  return { ...st, doc: cloneDoc(st.doc), sel: st.sel ? { ...st.sel } : null, keys: { ...st.keys }, log: [...st.log], undo: [...st.undo], redo: [...st.redo] };
}

export const frameOf = (st: Studio): Frame => st.doc.frames[st.frame] ?? fail('ไม่มีเฟรมนี้');
export const layerOf = (st: Studio): Layer => frameOf(st).layers[st.layer] ?? fail('ไม่มีชั้นนี้');
/** ชั้นปัจจุบันสำหรับคำสั่งที่จะแก้มัน (ชั้นที่ล็อกไว้แก้ไม่ได้) */
const target = (st: Studio): Layer => { const L = layerOf(st); return L.locked ? fail(`ชั้น "${L.name}" ล็อกอยู่ (layer unlock)`) : L; };

const snap = (st: Studio): Snap => ({ doc: cloneDoc(st.doc), frame: st.frame, layer: st.layer, sel: st.sel ? { ...st.sel } : null });
function restore(st: Studio, s: Snap) { st.doc = s.doc; st.frame = s.frame; st.layer = s.layer; st.sel = s.sel; }

// ---------- อ่านคำสั่ง ----------

function point(tok: string | undefined): [number, number] {
  const m = /^(-?\d+),(-?\d+)$/.exec(tok ?? '');
  if (!m) return fail(`ต้องการพิกัดแบบ x,y แต่ได้ "${tok ?? ''}"`);
  return [Number(m[1]), Number(m[2])];
}
const points = (toks: string[]) => (toks.length ? toks.map(point) : fail('ต้องมีพิกัดอย่างน้อยหนึ่งจุด'));
function int(tok: string | undefined, what: string): number {
  if (tok === undefined || !/^[+-]?\d+$/.test(tok)) return fail(`${what} ต้องเป็นจำนวนเต็ม แต่ได้ "${tok ?? ''}"`);
  return Number(tok);
}
function box(a: [number, number], b: [number, number]): Box {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

/** "hide" | "hide@3" | "ink" -> รหัสพิกเซล (ไม่บอกระดับ = ระดับของพู่กัน) */
export function parseMat(doc: Drawing, s: string, level: number): number {
  const [name, l] = s.split('@');
  const m = doc.mats.indexOf(name ?? '');
  if (m < 0) return fail(`ไม่มีวัสดุ "${name ?? ''}" (มี ${doc.mats.join(' ')})`);
  if (m === 0) return code(0, 0);
  const lv = l === undefined ? level : Number(l);
  if (!Number.isInteger(lv) || lv < 0 || lv >= LEVELS) return fail(`ระดับแสงต้องเป็น 0 ถึง ${LEVELS - 1} แต่ได้ "${l ?? ''}"`);
  return code(m, lv);
}
export const matLabel = (doc: Drawing, c: number) => (c < 0 ? '.' : matOf(c) === 0 ? INK : `${doc.mats[matOf(c)]}@${levelOf(c)}`);

// ---------- วาด ----------

/** จุดบนเส้นตรงจาก a ถึง b (Bresenham) */
export function linePoints(a: [number, number], b: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x), dy = -Math.abs(b[1] - y), sx = x < b[0] ? 1 : -1, sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}
const pathPoints = (pts: [number, number][], closed = false) => {
  const out: [number, number][] = [];
  const all = closed && pts.length > 1 ? [...pts, pts[0]!] : pts;
  all.forEach((p, i) => { if (i === 0) out.push(p); else out.push(...linePoints(all[i - 1]!, p).slice(1)); });
  return out;
};

/** พิกเซลในวงรีที่พอดีกรอบ b */
function ellipsePoints(b: Box, filled: boolean): [number, number][] {
  // รัศมีเผื่อไว้ 0.25: วงเล็กๆ ออกมาเป็นทรงที่คนวาดพิกเซลคุ้นตา (3 x 3 เป็นกากบาท 5 x 5 มุมมน)
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2 + 0.25, ry = (b.y1 - b.y0) / 2 + 0.25;
  const inside = (x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const out: [number, number][] = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    if (!inside(x, y)) continue;
    if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) out.push([x, y]);
  }
  return out;
}

/** พิกเซลในรูปหลายเหลี่ยม (นับที่กลางพิกเซล) รวมเส้นขอบ */
function polyPoints(pts: [number, number][], filled: boolean): [number, number][] {
  const out = pathPoints(pts, true);
  if (!filled) return out;
  const ys = pts.map((p) => p[1]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const hits: number[] = [];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= y) !== (b[1] <= y)) hits.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    });
    hits.sort((p, q) => p - q);
    for (let n = 0; n + 1 < hits.length; n += 2) for (let x = Math.ceil(hits[n]!); x <= Math.floor(hits[n + 1]!); x++) out.push([x, y]);
  }
  return out;
}

/** ขอบเขตที่คำสั่งแตะได้: ในภาพ และในกรอบเลือกถ้ามี */
function writer(st: Studio) {
  const { w, h } = st.doc, L = target(st), s = st.sel, axis = st.sym;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (!s || (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1));
  return {
    L, ok,
    /** คอลัมน์คู่ของ x อีกฝั่งของแกนสมมาตร (ไม่มีแกน = x เดิม) */
    twin: (x: number) => (axis === null ? x : Math.round(2 * axis - x)),
    get: (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? L.px[y * w + x]! : EMPTY),
    set: (x: number, y: number, c: number) => {
      if (ok(x, y)) L.px[y * w + x] = c;
      if (axis !== null) { const X = Math.round(2 * axis - x); if (X !== x && ok(X, y)) L.px[y * w + X] = c; }
    },
  };
}

function floodFill(st: Studio, x: number, y: number, c: number, twin = true) {
  const { w } = st.doc, W = writer(st);
  // วาดสมมาตร: เทอีกฝั่งด้วย (ถ้าสองฝั่งเป็นก้อนเดียวกัน รอบแรกเทไปแล้ว รอบสองจะไม่ทำอะไร)
  if (twin && W.twin(x) !== x) floodFill(st, W.twin(x), y, c, false);
  if (!W.ok(x, y)) return;
  const from = W.get(x, y);
  if (from === c) return;
  const q: [number, number][] = [[x, y]];
  while (q.length) {
    const [px, py] = q.pop()!;
    if (!W.ok(px, py) || W.L.px[py * w + px] !== from) continue;
    W.L.px[py * w + px] = c;
    q.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

/** ลงแสงเงาให้วัสดุหนึ่งบนชั้นนี้: ก้อนกลมที่แสงมาจากซ้ายบน (จุดตั้งต้นก่อนแต่งด้วยมือ) */
function autoshade(st: Studio, mat: number, base: number, depth: number) {
  const { w, h } = st.doc, W = writer(st), px = W.L.px;
  const mine = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x]! >= 0 && matOf(px[y * w + x]!) === mat;
  // ระยะถึงขอบของก้อน (1 = ติดขอบ) ไม่เกิน 4
  const dist = new Uint8Array(w * h), q: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mine(x, y) && (!mine(x - 1, y) || !mine(x + 1, y) || !mine(x, y - 1) || !mine(x, y + 1))) { dist[y * w + x] = 1; q.push(y * w + x); }
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!, x = p % w, y = (p / w) | 0;
    if (dist[p]! >= 4) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const X = x + dx, Y = y + dy;
      if (mine(X, Y) && !dist[Y * w + X]) { dist[Y * w + X] = dist[p]! + 1; q.push(Y * w + X); }
    }
  }
  // เนื้อในที่ลึกกว่า 4 ถือว่าแบน
  const d = (x: number, y: number) => (mine(x, y) ? dist[y * w + x]! || 4 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mine(x, y) || !W.ok(x, y)) continue;
    // ผิวที่หันหาแสงคือด้านที่ความหนาเพิ่มไปทางขวาล่าง
    const lit = ((d(x + 1, y) - d(x - 1, y)) * 0.5 + (d(x, y + 1) - d(x, y - 1)) * 0.75) / 2;
    px[y * w + x] = code(mat, clampLevel(Math.round(base + depth * Math.max(-1, Math.min(1, lit)))));
  }
}

function moveBox(st: Studio, dx: number, dy: number) {
  const { w, h } = st.doc, L = target(st), b = st.sel ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const picked: [number, number, number][] = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const c = L.px[y * w + x]!;
    if (c >= 0) { picked.push([x, y, c]); L.px[y * w + x] = EMPTY; }
  }
  for (const [x, y, c] of picked) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h) L.px[Y * w + X] = c;
  }
  if (st.sel) st.sel = { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
}

function flipBox(st: Studio, dir: 'h' | 'v') {
  const { w, h } = st.doc, L = target(st);
  const b = st.sel ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(w - 1, b.x1), y1 = Math.min(h - 1, b.y1);
  const src = L.px.slice();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    L.px[y * w + x] = dir === 'h' ? src[y * w + (x0 + x1 - x)]! : src[(y0 + y1 - y) * w + x]!;
  }
}

/** เอนทั้งก้อนไปข้างๆ: แถวล่างสุดอยู่กับที่ แถวบนสุดเลื่อน dx แถวระหว่างนั้นเลื่อนตามสัดส่วน (ใช้ทำท่าโน้มตัวเข้าตี) */
function leanBox(st: Studio, dx: number) {
  const { w, h } = st.doc, L = target(st);
  let b = st.sel;
  if (!b) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L.px[y * w + x]! >= 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return;
    b = { x0, y0, x1, y1 };
  }
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(w - 1, b.x1), y1 = Math.min(h - 1, b.y1);
  const src = L.px.slice();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) L.px[y * w + x] = EMPTY;
  for (let y = y0; y <= y1; y++) {
    const shift = y1 === y0 ? 0 : Math.round((dx * (y1 - y)) / (y1 - y0));
    for (let x = x0; x <= x1; x++) {
      const c = src[y * w + x]!, X = x + shift;
      if (c >= 0 && X >= 0 && X < w) L.px[y * w + X] = c;
    }
  }
}

/** ลอกครึ่งหนึ่งไปทับอีกครึ่งรอบแกนตั้ง: axis เป็นคอลัมน์ (เช่น 15) หรือกึ่งกลางระหว่างสองคอลัมน์ (15.5) */
function mirror(st: Studio, axis: number, from: 'left' | 'right') {
  const { w, h } = st.doc, W = writer(st);
  const src = W.L.px.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const onSource = from === 'left' ? x < axis : x > axis;
    if (!onSource) continue;
    const X = Math.round(2 * axis - x);
    if (X !== x) W.set(X, y, src[y * w + x]!);
  }
}

function resize(st: Studio, w: number, h: number, dx: number, dy: number) {
  const d = st.doc;
  if (w < 1 || h < 1 || w > 256 || h > 256) fail('ขนาดภาพต้องอยู่ระหว่าง 1 ถึง 256');
  for (const f of d.frames) for (const L of f.layers) {
    const px = new Int16Array(w * h).fill(EMPTY);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) px[Y * w + X] = L.px[y * d.w + x]!;
    }
    L.px = px;
  }
  d.w = w; d.h = h; st.sel = null;
}

/** กรอบของพิกเซลที่มีอยู่ทุกเฟรมทุกชั้น (null = ภาพว่าง) */
export function bounds(doc: Drawing): Box | null {
  let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
  for (const f of doc.frames) for (const L of f.layers) for (let p = 0; p < L.px.length; p++) {
    if (L.px[p]! < 0) continue;
    const x = p % doc.w, y = (p / doc.w) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const findLayer = (st: Studio, name: string | undefined) => {
  const i = /^\d+$/.test(name ?? '') ? Number(name) : frameOf(st).layers.findIndex((l) => l.name === name);
  return i >= 0 && i < frameOf(st).layers.length ? i : fail(`ไม่มีชั้น "${name ?? ''}"`);
};
const findFrame = (st: Studio, name: string | undefined) => {
  const i = /^\d+$/.test(name ?? '') ? Number(name) : st.doc.frames.findIndex((f) => f.name === name);
  return i >= 0 && i < st.doc.frames.length ? i : fail(`ไม่มีเฟรม "${name ?? ''}"`);
};
const NAME = /^[a-z][a-z0-9_]*$/;
const name = (s: string | undefined, what: string) => (s && NAME.test(s) ? s : fail(`${what}ต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือ _ และขึ้นต้นด้วยตัวอักษร แต่ได้ "${s ?? ''}"`));

/** คำสั่งที่ไม่เปลี่ยนภาพ จึงไม่ลงประวัติ */
const QUIET = new Set(['use', 'level', 'pick', 'select', 'sym', 'key', 'undo', 'redo']);

/**
 * รันคำสั่งหนึ่งบรรทัด คืนข้อความสั้นๆ (ส่วนใหญ่ว่าง) คำสั่งที่ผิดจะ throw และไม่เปลี่ยนอะไรเลย
 * `pal` ใช้ตรวจชื่อ ramp ของคำสั่ง mat (ไม่ส่งมา = ไม่ตรวจ)
 */
export function run(st: Studio, line: string, pal?: Palette): string {
  // หมายเหตุ: ทั้งบรรทัดที่ขึ้นต้นด้วย # หรือท้ายบรรทัดหลัง " # " (ตัว # ติดกับตัวอักษรอื่นคือ ink ของ stamp)
  const text = line.trim().startsWith('#') ? '' : line.replace(/\s#\s.*$/, '').trim();
  if (!text) return '';
  const [cmd, ...a] = text.split(/\s+/) as [string, ...string[]];
  if (cmd === 'undo') { const s = st.undo.pop(); if (!s) return 'ไม่มีอะไรให้ย้อน'; st.redo.push(snap(st)); restore(st, s); st.log.push(text); return ''; }
  if (cmd === 'redo') { const s = st.redo.pop(); if (!s) return 'ไม่มีอะไรให้ทำซ้ำ'; st.undo.push(snap(st)); restore(st, s); st.log.push(text); return ''; }
  const before = snap(st);
  try {
    const msg = exec(st, cmd, a, pal);
    if (!QUIET.has(cmd)) {
      st.undo.push(before);
      if (st.undo.length > HISTORY) st.undo.shift();
      st.redo = [];
    }
    st.log.push(text);
    return msg;
  } catch (e) {
    restore(st, before);
    throw e;
  }
}

/** รันหลายบรรทัด (สคริปต์) หยุดที่บรรทัดแรกที่ผิด พร้อมบอกเลขบรรทัด */
export function runScript(st: Studio, script: string, pal?: Palette): string[] {
  const out: string[] = [];
  script.split('\n').forEach((line, i) => {
    try { const m = run(st, line, pal); if (m) out.push(m); } catch (e) { throw new Error(`บรรทัด ${i + 1} (${line.trim()}): ${(e as Error).message}`); }
  });
  return out;
}

function exec(st: Studio, cmd: string, a: string[], pal?: Palette): string {
  const d = st.doc, W = () => writer(st);
  const brush = () => parseMat(d, st.mat, st.level);
  /** ตัวแรกเป็นวัสดุได้ เช่น `line hide@1 3,4 9,9` ไม่ใส่ = พู่กันตอนนี้ */
  const paint = (): number => (a[0] !== undefined && !/^-?\d+,-?\d+$/.test(a[0]) && a[0] !== 'fill' ? parseMat(d, a.shift()!, st.level) : brush());
  const filled = () => (a.at(-1) === 'fill' ? (a.pop(), true) : false);
  const put = (pts: [number, number][], c: number) => { const w = W(); for (const [x, y] of pts) w.set(x, y, c); };

  switch (cmd) {
    case 'mat': {
      const m = name(a[0], 'ชื่อวัสดุ'), ramp = a[1] ?? fail('ใช้แบบ: mat <ชื่อวัสดุ> <ramp>');
      if (m === INK) fail('ink เป็นสีเส้นขอบ เปลี่ยน ramp ไม่ได้');
      if (pal && !pal.ramps[ramp]) fail(`ไม่มี ramp "${ramp}"`);
      if (!d.mats.includes(m)) { if (d.mats.length >= 13) fail('ภาพหนึ่งภาพมีวัสดุได้ไม่เกิน 12 อย่าง'); d.mats.push(m); }
      d.ramps[m] = ramp;
      st.mat = m;
      return '';
    }
    case 'use': {
      const c = parseMat(d, a[0] ?? '', a[1] === undefined ? st.level : int(a[1], 'ระดับแสง'));
      st.mat = d.mats[matOf(c)]!;
      if (matOf(c) !== 0) st.level = levelOf(c);
      return '';
    }
    case 'pick': {
      const [x, y] = point(a[0]);
      const c = x >= 0 && y >= 0 && x < d.w && y < d.h ? flatten(d, st.frame)[y * d.w + x]! : EMPTY;
      if (c < 0) return 'ตรงนั้นว่าง';
      st.mat = d.mats[matOf(c)]!;
      if (matOf(c) !== 0) st.level = levelOf(c);
      return matLabel(d, c);
    }
    case 'level': { const n = int(a[0], 'ระดับแสง'); if (n < 0 || n >= LEVELS) fail(`ระดับแสงต้องเป็น 0 ถึง ${LEVELS - 1}`); st.level = n; return ''; }
    case 'outline': { if (a[0] !== 'on' && a[0] !== 'off') fail('ใช้แบบ: outline on|off'); d.outline = a[0] === 'on'; return ''; }
    case 'meta': {
      const k = name(a[0], 'ชื่อค่า'), v = a.slice(1).join(' ');
      if (!v) delete d.meta[k]; else d.meta[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      return '';
    }
    case 'key': {
      const ch = a[0] ?? '';
      if (ch.length !== 1 || ch === '.' || ch === 'x' || ch === '/') fail('ตัวอักษรของ key ต้องยาวหนึ่งตัว และไม่ใช่ . x /');
      st.keys[ch] = parseMat(d, a[1] ?? '', st.level);
      return '';
    }

    case 'pencil': { const c = paint(); put(points(a), c); return ''; }
    case 'stroke': { const c = paint(); put(pathPoints(points(a)), c); return ''; }
    case 'line': { const c = paint(); if (a.length !== 2) fail('ใช้แบบ: line x0,y0 x1,y1'); put(linePoints(point(a[0]), point(a[1])), c); return ''; }
    case 'rect': {
      const c = paint(), f = filled(), b = box(point(a[0]), point(a[1])), pts: [number, number][] = [];
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (f || x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1) pts.push([x, y]);
      put(pts, c);
      return '';
    }
    case 'ellipse': { const c = paint(), f = filled(); put(ellipsePoints(box(point(a[0]), point(a[1])), f), c); return ''; }
    case 'poly': { const c = paint(), f = filled(), pts = points(a); if (pts.length < 3) fail('poly ต้องมีอย่างน้อยสามจุด'); put(polyPoints(pts, f), c); return ''; }
    case 'fill': { const c = paint(), [x, y] = point(a[0]); floodFill(st, x, y, c); return ''; }
    case 'erase': { put(pathPoints(points(a)), EMPTY); return ''; }
    case 'erase-rect': {
      const b = box(point(a[0]), point(a[1])), pts: [number, number][] = [];
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) pts.push([x, y]);
      put(pts, EMPTY);
      return '';
    }
    case 'stamp': {
      const [x0, y0] = point(a[0]), w = W();
      (a[1] ?? fail('ใช้แบบ: stamp x,y แถว/แถว/แถว')).split('/').forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return;
        const c = ch === 'x' ? EMPTY : ch === '#' ? code(0, 0) : st.keys[ch] ?? fail(`stamp: ยังไม่ได้ตั้ง key ของ "${ch}"`);
        w.set(x0 + i, y0 + j, c);
      }));
      return '';
    }

    case 'shade': case 'shade-at': {
      const n = int(a[0], 'จำนวนขั้น'), w = W();
      const bump = (x: number, y: number) => { const c = w.get(x, y); if (c >= 8) w.set(x, y, code(matOf(c), clampLevel(levelOf(c) + n))); };
      if (cmd === 'shade-at') {
        // เส้นที่ลากทับตัวเองนับพิกเซลนั้นครั้งเดียว
        const seen = new Set<string>();
        for (const [x, y] of pathPoints(points(a.slice(1)))) if (!seen.has(`${x},${y}`)) { seen.add(`${x},${y}`); bump(x, y); }
        return '';
      }
      const only = a[1] !== undefined && !a[1].includes(',') ? matOf(parseMat(d, a[1], 0)) : -1;
      const rest = only >= 0 ? a.slice(2) : a.slice(1);
      const b = rest.length ? box(point(rest[0]), point(rest[1])) : { x0: 0, y0: 0, x1: d.w - 1, y1: d.h - 1 };
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (only < 0 || matOf(w.get(x, y)) === only) bump(x, y);
      return '';
    }
    case 'replace': {
      const from = a[0] ?? '', to = a[1] ?? '', w = W(), all = !from.includes('@') && from !== INK;
      const f = parseMat(d, from, 0), t = parseMat(d, to, st.level), keep = all && !to.includes('@') && to !== INK;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const c = w.get(x, y);
        if (c < 0 || (all ? matOf(c) !== matOf(f) : c !== f)) continue;
        w.set(x, y, keep ? code(matOf(t), levelOf(c)) : t);
      }
      return '';
    }
    case 'autoshade': {
      const m = matOf(parseMat(d, a[0] ?? st.mat, 0));
      if (m === 0) fail('ink ไม่มีระดับแสง');
      const base = a[1] === undefined ? 2.4 : Number(a[1]), depth = a[2] === undefined ? 1.6 : Number(a[2]);
      if (!Number.isFinite(base) || !Number.isFinite(depth)) fail('ใช้แบบ: autoshade [วัสดุ] [ระดับกลาง] [ความลึก]');
      autoshade(st, m, base, depth);
      return '';
    }

    case 'select': {
      if (a[0] === 'none') st.sel = null;
      else if (a[0] === 'all') st.sel = { x0: 0, y0: 0, x1: d.w - 1, y1: d.h - 1 };
      else st.sel = box(point(a[0]), point(a[1]));
      return '';
    }
    case 'sym': {
      if (a[0] === 'off') { st.sym = null; return ''; }
      const axis = Number(a[0]);
      if (a[0] === undefined || !Number.isFinite(axis) || (axis * 2) % 1 !== 0) fail('ใช้แบบ: sym <แกน> เช่น sym 15 หรือ sym 15.5 และ sym off');
      st.sym = axis;
      return '';
    }
    case 'move': { const [dx, dy] = point(a[0]); moveBox(st, dx, dy); return ''; }
    case 'lean': { leanBox(st, int(a[0], 'ระยะเอน')); return ''; }
    case 'flip': { if (a[0] !== 'h' && a[0] !== 'v') fail('ใช้แบบ: flip h|v'); flipBox(st, a[0] as 'h' | 'v'); return ''; }
    case 'mirror': {
      const axis = Number(a[0]);
      if (!Number.isFinite(axis) || (axis * 2) % 1 !== 0) fail('แกนของ mirror เป็นเลขคอลัมน์ เช่น 15 หรือ 15.5');
      if (a[1] !== undefined && a[1] !== 'left' && a[1] !== 'right') fail('ใช้แบบ: mirror <แกน> [left|right]');
      mirror(st, axis, (a[1] as 'left' | 'right' | undefined) ?? 'left');
      return '';
    }
    case 'resize': { resize(st, int(a[0], 'ความกว้าง'), int(a[1], 'ความสูง'), a[2] === undefined ? 0 : int(a[2], 'dx'), a[3] === undefined ? 0 : int(a[3], 'dy')); return ''; }
    case 'trim': {
      const m = a[0] === undefined ? 1 : int(a[0], 'ขอบ'), b = bounds(d);
      if (!b) return 'ภาพว่าง';
      resize(st, b.x1 - b.x0 + 1 + 2 * m, b.y1 - b.y0 + 1 + 2 * m, m - b.x0, m - b.y0);
      return '';
    }

    case 'layer': {
      const f = frameOf(st), sub = a[0];
      if (sub === 'add') {
        const n = name(a[1], 'ชื่อชั้น');
        if (f.layers.some((l) => l.name === n)) fail(`มีชั้น "${n}" อยู่แล้ว`);
        f.layers.splice(st.layer + 1, 0, newLayer(n, d.w, d.h));
        st.layer += 1;
      } else if (sub === 'select') st.layer = findLayer(st, a[1]);
      else if (sub === 'hide' || sub === 'show') f.layers[a[1] === undefined ? st.layer : findLayer(st, a[1])]!.hidden = sub === 'hide';
      else if (sub === 'lock' || sub === 'unlock') f.layers[a[1] === undefined ? st.layer : findLayer(st, a[1])]!.locked = sub === 'lock';
      else if (sub === 'rename') { const n = name(a[1], 'ชื่อชั้น'); if (f.layers.some((l) => l.name === n)) fail(`มีชั้น "${n}" อยู่แล้ว`); layerOf(st).name = n; }
      else if (sub === 'clear') target(st).px.fill(EMPTY);
      else if (sub === 'delete') {
        if (f.layers.length === 1) fail('ต้องเหลืออย่างน้อยหนึ่งชั้น');
        f.layers.splice(a[1] === undefined ? st.layer : findLayer(st, a[1]), 1);
        st.layer = Math.min(st.layer, f.layers.length - 1);
      } else if (sub === 'up' || sub === 'down') {
        const j = st.layer + (sub === 'up' ? 1 : -1);
        if (j < 0 || j >= f.layers.length) fail('เลื่อนชั้นไปทางนั้นไม่ได้แล้ว');
        [f.layers[st.layer], f.layers[j]] = [f.layers[j]!, f.layers[st.layer]!];
        st.layer = j;
      } else if (sub === 'merge') {
        if (st.layer === 0) fail('ไม่มีชั้นข้างล่างให้รวม');
        const top = layerOf(st), under = f.layers[st.layer - 1]!;
        if (under.locked) fail(`ชั้น "${under.name}" ล็อกอยู่ (layer unlock)`);
        top.px.forEach((c, p) => { if (c >= 0) under.px[p] = c; });
        f.layers.splice(st.layer, 1);
        st.layer -= 1;
      } else fail('ใช้แบบ: layer add|select|hide|show|lock|unlock|rename|clear|delete|up|down|merge');
      return '';
    }
    case 'frame': {
      const sub = a[0];
      if (sub === 'add') {
        const n = name(a[1], 'ชื่อเฟรม');
        if (d.frames.some((f) => f.name === n)) fail(`มีเฟรม "${n}" อยู่แล้ว`);
        const src = a[2] === 'from' ? d.frames[findFrame(st, a[3])]! : null;
        d.frames.push({ name: n, layers: src ? src.layers.map((l) => ({ ...l, px: l.px.slice() })) : [newLayer('main', d.w, d.h)] });
        st.frame = d.frames.length - 1;
        st.layer = Math.min(st.layer, frameOf(st).layers.length - 1);
      } else if (sub === 'select') { st.frame = findFrame(st, a[1]); st.layer = Math.min(st.layer, frameOf(st).layers.length - 1); }
      else if (sub === 'delete') {
        if (d.frames.length === 1) fail('ต้องเหลืออย่างน้อยหนึ่งเฟรม');
        d.frames.splice(a[1] === undefined ? st.frame : findFrame(st, a[1]), 1);
        st.frame = Math.min(st.frame, d.frames.length - 1);
        st.layer = Math.min(st.layer, frameOf(st).layers.length - 1);
      } else fail('ใช้แบบ: frame add <ชื่อ> [from <เฟรม>] | select <ชื่อ> | delete [ชื่อ]');
      return '';
    }
    default:
      return fail(`ไม่รู้จักคำสั่ง "${cmd}"`);
  }
}

// ---------- แสดงผล ----------

/** รวมชั้นที่มองเห็นของเฟรมหนึ่งเป็นภาพดัชนีแผ่นเดียว */
export function flatten(doc: Drawing, frame = 0): Int16Array {
  const out = new Int16Array(doc.w * doc.h).fill(EMPTY);
  for (const L of (doc.frames[frame] ?? fail('ไม่มีเฟรมนี้')).layers) {
    if (L.hidden) continue;
    for (let p = 0; p < out.length; p++) if (L.px[p]! >= 0) out[p] = L.px[p]!;
  }
  return out;
}

/**
 * พิกเซลที่หลุดเดี่ยว: ไม่มีเพื่อนบ้านทั้งแปดทิศที่เป็นวัสดุและระดับแสงเดียวกันเลย (มักเป็นเศษจากการปรับสีหรือมือพลาด
 * แต่จุดเดี่ยวที่ตั้งใจ เช่นประกายตา ก็นับด้วย จึงเป็นแค่ตัวชี้ ไม่ใช่ข้อผิดพลาด)
 */
export function strays(doc: Drawing, frame = 0): [number, number][] {
  const flat = flatten(doc, frame), out: [number, number][] = [];
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) {
    const c = flat[y * doc.w + x]!;
    if (c < 0) continue;
    let alone = true;
    for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if ((dx || dy) && X >= 0 && Y >= 0 && X < doc.w && Y < doc.h && flat[Y * doc.w + X] === c) { alone = false; break; }
    }
    if (alone) out.push([x, y]);
  }
  return out;
}

const rgbOf = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** สีของรหัสพิกเซลหนึ่งรหัส */
export function colourOf(doc: Drawing, pal: Palette, c: number): number[] {
  if (matOf(c) === 0) return rgbOf(pal.outline);
  const m = doc.mats[matOf(c)] ?? fail('รหัสวัสดุเกินรายการ');
  const ramp = pal.ramps[doc.ramps[m] ?? ''] ?? fail(`วัสดุ "${m}" ชี้ไป ramp "${doc.ramps[m] ?? ''}" ที่ไม่มีอยู่`);
  return rgbOf(ramp[Math.min(ramp.length - 1, levelOf(c))]!);
}

/**
 * ภาพสีของเฟรมหนึ่ง ถ้าภาพเปิดเส้นขอบไว้ พิกเซลว่างที่ติดกับเนื้อภาพจะได้สีเส้นขอบ
 * `pad` เพิ่มขอบว่างรอบภาพก่อน (ใช้ตอนส่งออก เส้นขอบจะได้ไม่โดนขอบภาพตัด)
 */
export function render(doc: Drawing, pal: Palette, opts: { frame?: number; pad?: number; outline?: boolean } = {}): Img {
  const pad = opts.pad ?? 0, w = doc.w + 2 * pad, h = doc.h + 2 * pad, flat = flatten(doc, opts.frame ?? 0);
  const idx = new Int16Array(w * h).fill(EMPTY);
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) idx[(y + pad) * w + x + pad] = flat[y * doc.w + x]!;
  const rgba = new Uint8ClampedArray(w * h * 4), cache = new Map<number, number[]>(), O = rgbOf(pal.outline);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? EMPTY : idx[y * w + x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = idx[y * w + x]!, o = (y * w + x) * 4;
    if (c >= 0) {
      let rgb = cache.get(c);
      if (!rgb) { rgb = colourOf(doc, pal, c); cache.set(c, rgb); }
      rgba[o] = rgb[0]!; rgba[o + 1] = rgb[1]!; rgba[o + 2] = rgb[2]!; rgba[o + 3] = 255;
    } else if ((opts.outline ?? doc.outline) && (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0)) {
      rgba[o] = O[0]!; rgba[o + 1] = O[1]!; rgba[o + 2] = O[2]!; rgba[o + 3] = 255;
    }
  }
  return { w, h, rgba };
}

/** ภาพพร้อมใช้ในเกม: เส้นขอบครบ ตัดขอบว่างทิ้ง */
export function exportImage(doc: Drawing, pal: Palette, frame = 0): Img {
  const img = render(doc, pal, { frame, pad: doc.outline ? 1 : 0 });
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!img.rgba[(y * img.w + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return { w: 1, h: 1, rgba: new Uint8ClampedArray(4) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(img.rgba.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + w) * 4), y * w * 4);
  return { w, h, rgba };
}

/** ทุกเฟรมตัดด้วยกรอบเดียวกัน (กรอบรวมของทุกเฟรม) ท่าที่สองจึงขยับจากท่าแรกเท่าที่วาดไว้จริง นี่คือภาพที่เกมใช้ */
export function exportFrames(doc: Drawing, pal: Palette): { w: number; h: number; frames: Img[] } {
  const full = doc.frames.map((_, i) => render(doc, pal, { frame: i, pad: doc.outline ? 1 : 0 }));
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const im of full) for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    if (!im.rgba[(y * im.w + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return { w: 1, h: 1, frames: full.map(() => ({ w: 1, h: 1, rgba: new Uint8ClampedArray(4) })) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return {
    w, h,
    frames: full.map((im) => {
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) rgba.set(im.rgba.subarray(((y + y0) * im.w + x0) * 4, ((y + y0) * im.w + x0 + w) * 4), y * w * 4);
      return { w, h, rgba };
    }),
  };
}

// ---------- ไฟล์ ----------

/** รหัสพิกเซลที่ใช้จริง -> ตัวอักษร (เรียงตามวัสดุแล้วตามระดับ ไฟล์เดิมจึงออกมาเหมือนเดิมทุกครั้ง) */
function legendOf(doc: Drawing): Map<number, string> {
  const used = new Set<number>();
  for (const f of doc.frames) for (const L of f.layers) for (const c of L.px) if (c >= 8) used.add(c);
  const codes = [...used].sort((p, q) => p - q);
  if (codes.length > LETTERS.length) fail(`ภาพใช้วัสดุกับระดับแสงรวมกันเกิน ${LETTERS.length} แบบ`);
  return new Map(codes.map((c, i) => [c, LETTERS[i]!]));
}

/** ภาพ -> ข้อความ YAML (ตารางตัวอักษรแบบเดียวกับชิ้นของ art/kit: . ว่าง, # เส้นขอบ) */
export function toYaml(doc: Drawing): string {
  const legend = legendOf(doc);
  const frames: Record<string, unknown[]> = {};
  for (const f of doc.frames) {
    frames[f.name] = f.layers.map((L) => {
      let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
      L.px.forEach((c, p) => {
        if (c < 0) return;
        const x = p % doc.w, y = (p / doc.w) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      });
      const rows: string[] = [];
      for (let y = y0; y <= y1; y++) {
        let row = '';
        for (let x = x0; x <= x1; x++) { const c = L.px[y * doc.w + x]!; row += c < 0 ? '.' : c < 8 ? '#' : legend.get(c)!; }
        rows.push(row);
      }
      return { layer: L.name, ...(L.hidden ? { hidden: true } : {}), ...(L.locked ? { locked: true } : {}), ...(rows.length ? { at: [x0, y0], ascii: `${rows.join('\n')}\n` } : {}) };
    });
  }
  const data = {
    kind: doc.kind,
    size: [doc.w, doc.h],
    outline: doc.outline,
    ramps: Object.fromEntries(doc.mats.slice(1).map((m) => [m, doc.ramps[m] ?? fail(`วัสดุ "${m}" ยังไม่มี ramp`)])),
    legend: Object.fromEntries([...legend].map(([c, ch]) => [ch, `${doc.mats[matOf(c)]}@${levelOf(c)}`])),
    ...(Object.keys(doc.meta).length ? { meta: doc.meta } : {}),
    frames,
  };
  const y = new YAML.Document(data);
  YAML.visit(y, {
    Pair(_, pair) {
      const k = String((pair.key as { value?: unknown }).value);
      const v = pair.value as { flow?: boolean; type?: string } | null;
      if (v && (k === 'size' || k === 'ramps' || k === 'legend' || k === 'meta' || k === 'at')) v.flow = true;
      if (v && k === 'ascii') v.type = 'BLOCK_LITERAL';
    },
  });
  return `# ภาพจากห้องวาด (แก้ด้วย npm run studio หรือ npm run draw) . ว่าง, # เส้นขอบ, ตัวอักษรอื่นดูที่ legend\n${y.toString({ lineWidth: 0 })}`;
}

/** ข้อความ YAML -> ภาพ ตรวจทุกอย่างที่อ่าน ไฟล์ที่เพี้ยนจะ throw พร้อมบอกจุด */
export function fromYaml(text: string): Drawing {
  const y = YAML.parse(text) as Record<string, unknown> | null;
  if (!y || typeof y !== 'object') fail('ไฟล์ว่างหรือไม่ใช่ YAML');
  const data = y as Record<string, unknown>;
  const size = data.size as unknown[];
  if (!Array.isArray(size) || size.length !== 2) fail('size ต้องเป็น [กว้าง, สูง]');
  const doc = newDrawing(data.kind as Kind, Number(size[0]), Number(size[1]));
  doc.outline = data.outline !== false;
  for (const [m, ramp] of Object.entries((data.ramps ?? {}) as Record<string, unknown>)) {
    doc.mats.push(name(m, 'ชื่อวัสดุ'));
    doc.ramps[m] = String(ramp);
  }
  const legend = new Map<string, number>([['#', code(0, 0)]]);
  for (const [ch, ref] of Object.entries((data.legend ?? {}) as Record<string, unknown>)) {
    if (!String(ref).includes('@')) fail(`legend ของ "${ch}" ต้องเขียนแบบ วัสดุ@ระดับ`);
    legend.set(String(ch), parseMat(doc, String(ref), 0));
  }
  for (const [k, v] of Object.entries((data.meta ?? {}) as Record<string, unknown>)) doc.meta[k] = typeof v === 'number' ? v : String(v);
  const frames = Object.entries((data.frames ?? {}) as Record<string, unknown>);
  if (!frames.length) fail('ไฟล์ไม่มีเฟรม');
  doc.frames = frames.map(([fname, layers]) => {
    if (!Array.isArray(layers) || !layers.length) fail(`เฟรม "${fname}" ไม่มีชั้น`);
    return {
      name: name(fname, 'ชื่อเฟรม'),
      layers: (layers as Record<string, unknown>[]).map((l) => {
        const L = newLayer(name(String(l.layer), 'ชื่อชั้น'), doc.w, doc.h);
        L.hidden = l.hidden === true;
        if (l.locked === true) L.locked = true;
        if (l.ascii === undefined) return L;
        const at = l.at as unknown[];
        if (!Array.isArray(at) || at.length !== 2) fail(`ชั้น "${L.name}" ต้องมี at: [x, y]`);
        String(l.ascii).replace(/\n$/, '').split('\n').forEach((row, j) => [...row].forEach((ch, i) => {
          if (ch === '.') return;
          const x = Number(at[0]) + i, yy = Number(at[1]) + j;
          if (!(x >= 0 && yy >= 0 && x < doc.w && yy < doc.h)) fail(`ชั้น "${L.name}" ของเฟรม "${fname}" ล้นขอบภาพที่ ${x},${yy}`);
          L.px[yy * doc.w + x] = legend.get(ch) ?? fail(`ชั้น "${L.name}": ไม่มี "${ch}" ใน legend`);
        }));
        return L;
      }),
    };
  });
  return doc;
}

/**
 * ภาพชนิด piece (64 x 96) -> สเปกชิ้นของ art/kit: รูปทรง ascii หนึ่งรูปต่อชั้น ระดับแสงคงที่ทุกพิกเซล
 * วัสดุต้องเป็นวัสดุของชุดเครื่องมือ (cloth leather metal ...) `cx` คือคอลัมน์กลางของร่าง (31)
 */
export function toPieceSpec(doc: Drawing, opts: { z?: number; cx?: number; frame?: number; anchor?: { col?: [string, number]; row?: [string, number] } } = {}) {
  if (doc.kind !== 'piece') fail('ส่งออกเป็นชิ้นได้เฉพาะภาพชนิด piece');
  const legend = legendOf(doc), cx = opts.cx ?? 31;
  // anchor: วางชิ้นเทียบกับจุดของร่าง (เช่น มือ) แทนพิกัดตายตัว ชิ้นจะตามไปถูกที่บนร่างทุกแบบ
  // [ชื่อจุด, ค่าของจุดนั้นบนร่างที่ใช้วาด] เช่น col: ['hand', -10], row: ['hand', 76]
  const rel = (v: number, a: [string, number] | undefined) => (a ? `${a[0]}${v - a[1] < 0 ? '-' : '+'}${Math.abs(v - a[1])}` : v);
  const shapes = (doc.frames[opts.frame ?? 0] ?? fail('ไม่มีเฟรมนี้')).layers.filter((L) => !L.hidden).flatMap((L) => {
    let x0 = doc.w, y0 = doc.h, x1 = -1, y1 = -1;
    L.px.forEach((c, p) => {
      if (c < 0) return;
      if (c < 8) fail('ชิ้นของตัวละครใช้ ink ไม่ได้ เส้นขอบมาจากตอนรวมภาพ');
      const x = p % doc.w, y = (p / doc.w) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    });
    if (x1 < 0) return [];
    const rows: string[] = [];
    for (let y = y0; y <= y1; y++) {
      let row = '';
      for (let x = x0; x <= x1; x++) { const c = L.px[y * doc.w + x]!; row += c < 0 ? '.' : legend.get(c)!; }
      rows.push(row);
    }
    return [{ at: [rel(x0 - cx, opts.anchor?.col), rel(y0, opts.anchor?.row)], ascii: `${rows.join('\n')}\n` }];
  });
  return {
    z: opts.z ?? (typeof doc.meta.z === 'number' ? doc.meta.z : 50),
    colors: { ...doc.ramps },
    legend: Object.fromEntries([...legend].map(([c, ch]) => [ch, `${doc.mats[matOf(c)]}@${levelOf(c)}`])),
    shapes,
  };
}

/** สเปกชิ้นของภาพชนิด piece ที่วางเทียบจุดของร่างตาม meta.col และ meta.row (เช่น hand) `body` คือร่างที่ใช้วาด */
export function pieceSpec(doc: Drawing, body: { marks: Record<string, number>; cols?: Record<string, number> }) {
  const at = (k: 'col' | 'row', table: Record<string, number> | undefined): [string, number] | undefined => {
    const n = doc.meta[k];
    if (n === undefined) return undefined;
    return [String(n), table?.[String(n)] ?? fail(`ร่างที่ใช้วาดไม่มีจุด "${n}" (meta ${k})`)];
  };
  return toPieceSpec(doc, { anchor: { col: at('col', body.cols), row: at('row', body.marks) } });
}

/**
 * ภาพสีที่ปรับเข้า palette แล้ว (art/kit/pixels.mjs adoptPixels) -> ภาพดัชนี: ทุกสีถูกจับคู่กับ ramp และระดับ
 * เลือก ramp ไม่เกิน `maxMats` ตัวจากตัวที่ภาพใช้มากที่สุด สีที่เหลือย้ายไปหาสีที่ใกล้ที่สุดใน ramp ที่เลือกแล้ว
 * วัสดุจึงมีน้อยพอจะเปลี่ยนสีทั้งตัวได้จริง สีที่ไม่อยู่ใน palette เลยทำให้ throw
 */
export function fromImage(img: Img, pal: Palette, opts: { kind?: Kind; maxMats?: number } = {}): Drawing {
  const maxMats = opts.maxMats ?? 6;
  const where = new Map<string, [string, number][]>();
  for (const [rname, ramp] of Object.entries(pal.ramps)) ramp.forEach((hex, lv) => {
    const list = where.get(hex) ?? [];
    list.push([rname, lv]);
    where.set(hex, list);
  });
  const hexAt = (p: number) => [0, 1, 2].map((k) => img.rgba[p * 4 + k]!.toString(16).padStart(2, '0')).join('');
  const count = new Map<string, number>();
  for (let p = 0; p < img.w * img.h; p++) if (img.rgba[p * 4 + 3]) { const hx = hexAt(p); count.set(hx, (count.get(hx) ?? 0) + 1); }
  const owner = new Map<string, [string, number]>(), left = new Set([...count.keys()].filter((hx) => hx !== pal.outline));
  for (const hx of left) if (!where.has(hx)) fail(`สี #${hx} ไม่อยู่ใน palette ของเกม (ต้องปรับสีก่อนนำเข้า)`);
  // เลือก ramp ทีละตัวจากตัวที่ครอบพิกเซลที่ยังไม่มีเจ้าของได้มากที่สุด
  const chosen: string[] = [];
  while (left.size && chosen.length < maxMats) {
    const score = new Map<string, number>();
    for (const hx of left) for (const [r] of where.get(hx)!) score.set(r, (score.get(r) ?? 0) + count.get(hx)!);
    const best = [...score].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0]![0];
    chosen.push(best);
    for (const hx of [...left]) { const hit = where.get(hx)!.find(([r]) => r === best); if (hit) { owner.set(hx, hit); left.delete(hx); } }
  }
  // สีที่ยังไม่มีเจ้าของ: ไปหาสีที่ใกล้ที่สุดใน ramp ที่เลือกแล้ว (ความสว่างนับสองเท่า แบบเดียวกับตอนปรับสี)
  for (const hx of left) {
    const L = oklab(hx);
    let best: [string, number] | null = null, bd = Infinity;
    for (const r of chosen) pal.ramps[r]!.forEach((h2, lv) => {
      const M = oklab(h2), dd = 2 * (M[0]! - L[0]!) ** 2 + (M[1]! - L[1]!) ** 2 + (M[2]! - L[2]!) ** 2;
      if (dd < bd) { bd = dd; best = [r, lv]; }
    });
    owner.set(hx, best ?? fail('ภาพไม่มีสีให้จับคู่'));
  }
  const doc = newDrawing(opts.kind ?? 'foe', img.w, img.h);
  doc.outline = false; // ภาพที่นำเข้ามีเส้นขอบของตัวเองอยู่แล้ว
  const matName = new Map<string, string>();
  for (const r of chosen) {
    let n = r.replace(/^scene\./, '').replace(/[^a-z0-9_]/g, '_');
    while (doc.mats.includes(n)) n += '_';
    matName.set(r, n); doc.mats.push(n); doc.ramps[n] = r;
  }
  const L = doc.frames[0]!.layers[0]!;
  for (let p = 0; p < img.w * img.h; p++) {
    if (!img.rgba[p * 4 + 3]) continue;
    const hx = hexAt(p);
    if (hx === pal.outline) { L.px[p] = code(0, 0); continue; }
    const [r, lv] = owner.get(hx)!;
    L.px[p] = code(doc.mats.indexOf(matName.get(r)!), lv);
  }
  return doc;
}

// ---------- คู่มือคำสั่ง ----------

/** คำสั่งทั้งหมด [รูปแบบ, ทำอะไร] แสดงทั้งในหน้าเว็บและ `npm run draw -- help` */
export const HELP: [string, string][] = [
  ['mat <ชื่อ> <ramp>', 'เพิ่มวัสดุ หรือเปลี่ยน ramp ของวัสดุเดิม (ทั้งภาพเปลี่ยนสีตาม) แล้วหยิบมาใช้'],
  ['use <วัสดุ>[@ระดับ]', 'หยิบพู่กัน เช่น use hide@1 หรือ use ink'],
  ['level <0-4>', 'ระดับแสงของพู่กัน 0 มืดสุด 4 สว่างสุด'],
  ['pick x,y', 'ดูดสีจากภาพมาเป็นพู่กัน'],
  ['pencil [วัสดุ] x,y ...', 'แต้มทีละจุด'],
  ['stroke [วัสดุ] x,y x,y ...', 'ลากเส้นต่อกันผ่านทุกจุด'],
  ['line [วัสดุ] x,y x,y', 'เส้นตรง'],
  ['rect [วัสดุ] x,y x,y [fill]', 'สี่เหลี่ยม'],
  ['ellipse [วัสดุ] x,y x,y [fill]', 'วงรีที่พอดีกรอบ'],
  ['poly [วัสดุ] x,y x,y x,y ... [fill]', 'รูปหลายเหลี่ยม'],
  ['fill [วัสดุ] x,y', 'เทสีในบริเวณที่ติดกัน'],
  ['stamp x,y แถว/แถว/...', 'ประทับตารางตัวอักษร: . ข้าม, x ลบ, # เส้นขอบ, ตัวอื่นตั้งด้วย key'],
  ['key <ตัวอักษร> <วัสดุ>[@ระดับ]', 'ตั้งตัวอักษรของ stamp'],
  ['erase x,y x,y ...', 'ลบตามเส้น'],
  ['erase-rect x,y x,y', 'ลบทั้งกรอบ'],
  ['shade <+n|-n> [วัสดุ] [x,y x,y]', 'ทำให้สว่างขึ้นหรือมืดลง n ขั้น ทั้งชั้น ทั้งวัสดุ หรือในกรอบ'],
  ['shade-at <+n|-n> x,y x,y ...', 'ทำให้สว่างขึ้นหรือมืดลงตามเส้น'],
  ['autoshade [วัสดุ] [ระดับกลาง] [ความลึก]', 'ลงแสงเงาให้ทั้งก้อน แสงมาจากซ้ายบน (จุดตั้งต้นก่อนแต่งมือ)'],
  ['replace <จาก> <เป็น>', 'เปลี่ยนวัสดุ หรือเฉพาะระดับ เช่น replace hide@0 ink'],
  ['select x,y x,y | all | none', 'กรอบเลือก คำสั่งวาดจะแตะได้เฉพาะในกรอบ'],
  ['move dx,dy', 'ย้ายสิ่งที่อยู่ในกรอบเลือก (หรือทั้งชั้น)'],
  ['flip h|v', 'กลับซ้ายขวาหรือบนล่าง'],
  ['lean <dx>', 'เอนสิ่งที่อยู่ในกรอบเลือก (หรือทั้งชั้น): แถวล่างอยู่กับที่ แถวบนเลื่อน dx (ลบคือไปทางซ้าย)'],
  ['sym <แกน> | off', 'วาดสมมาตร: ทุกอย่างที่วาดจะถูกวาดอีกฝั่งของคอลัมน์นั้นด้วย (เช่น 15 หรือ 15.5)'],
  ['mirror <แกน> [left|right]', 'ลอกครึ่งหนึ่งไปทับอีกครึ่ง'],
  ['resize <กว้าง> <สูง> [dx dy]', 'เปลี่ยนขนาดผืน'],
  ['trim [ขอบ]', 'ตัดผืนให้พอดีภาพ เหลือขอบว่างเท่าที่บอก'],
  ['outline on|off', 'ให้ใส่เส้นขอบรอบเงาทั้งตัวตอนส่งออกไหม'],
  ['meta <ชื่อ> [ค่า]', 'จดค่าประกอบ เช่น meta lift 12 (ศัตรูลอยจากพื้น 12 พิกเซล)'],
  ['layer add|select|hide|show|lock|unlock|rename|clear|delete|up|down|merge [ชื่อ]', 'จัดการชั้น'],
  ['frame add <ชื่อ> [from <เฟรม>] | select <ชื่อ> | delete [ชื่อ]', 'จัดการเฟรม (ท่าที่สองของศัตรูชื่อ strike)'],
  ['undo / redo', 'ย้อนกลับ ทำซ้ำ'],
];

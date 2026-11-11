// ห้องวาด: หน้าเว็บของเครื่องมือวาดพิกเซล (เปิดด้วย npm run studio) เป็นเครื่องมือของคนทำเกม ไม่ได้อยู่ในตัวเกม
// ทุกปุ่มและทุกการลากเมาส์กลายเป็นคำสั่งข้อความของ src/studio/core.ts ชุดเดียวกับที่สคริปต์ใช้ (npm run draw)
import { render as mount } from 'preact';
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import YAML from 'yaml';
import paletteText from '../../art/palette.yaml?raw';
import scenePaletteText from '../../art/scenes/palette.yaml?raw';
import { renderLook, type Look } from '../../art/kit/core.mjs';
import { npcLook, UNDER } from '../../art/kit/npc.mjs';
import { adoptTile, paletteOf } from '../../art/kit/pixels.mjs';
import { kit } from '../sprites/kit';
import * as S from './core';
import './studio.css';

const spriteYaml = YAML.parse(paletteText), sceneYaml = YAML.parse(scenePaletteText);
const pal = S.makePalette(spriteYaml, sceneYaml);
const RAMPS = Object.keys(pal.ramps);
const NAME = /^[a-z][a-z0-9_]*$/;

type Tool = 'pencil' | 'erase' | 'line' | 'rect' | 'ellipse' | 'fill' | 'pick' | 'lighter' | 'darker' | 'select' | 'move';
const TOOLS: [Tool, string, string][] = [
  ['pencil', 'ดินสอ', 'B'], ['erase', 'ยางลบ', 'E'], ['line', 'เส้นตรง', 'L'], ['rect', 'สี่เหลี่ยม', 'R'], ['ellipse', 'วงรี', 'O'], ['fill', 'ถังสี', 'G'],
  ['pick', 'ดูดสี', 'I'], ['lighter', 'สว่างขึ้น', 'H'], ['darker', 'มืดลง', 'D'], ['select', 'เลือก', 'M'], ['move', 'ย้าย', 'V'],
];
const KIND_LABEL: Record<S.Kind, string> = { foe: 'ศัตรู', icon: 'ไอคอน', prop: 'ของประกอบฉาก', piece: 'ชิ้นสวมบนตัวละคร' };
/** คำสั่งที่เปลี่ยนแค่พู่กัน กรอบเลือก หรือชั้นกับเฟรมที่กำลังดู ไม่ทำให้ไฟล์ต้องบันทึกใหม่ */
const STATE_ONLY = /^(use|level|pick|select|sym|key|(frame|layer) select)\b/;

// ---------- สถานะ ----------

let st = S.newStudio(S.newDrawing('foe', 48, 32));
/** เพิ่มทุกครั้งที่ภาพหรือพู่กันเปลี่ยน (Studio แก้ในที่เดิม จึงต้องบอกหน้าเว็บเอง) */
const tick = signal(0);
const docId = signal('');
const saved = signal(true);
const tool = signal<Tool>('pencil');
const filled = signal(false);
const zoom = signal(12);
const grid = signal(true), onion = signal(true), marks = signal(false);
const note = signal('พร้อมวาด ลากไฟล์ภาพมาวางบนผืนเพื่อใช้เป็นภาพอ้างอิงได้');
const hover = signal<[number, number] | null>(null);
const drawings = signal<string[]>([]);
interface Ref { name: string; canvas: HTMLCanvasElement; x: number; y: number; scale: number; alpha: number }
const refImg = signal<Ref | null>(null);
const srcDir = signal(''), srcList = signal<{ dirs: string[]; files: string[] }>({ dirs: [], files: [] });
const pvScene = signal('ashland'), pvTime = signal('dusk'), pvBody = signal('m'), pvSeed = signal(3), pvPlay = signal(false), pvFrame = signal(0);
const scenes = signal<{ scenes: string[]; times: string[]; stand: Record<string, number> } | null>(null);

const refOf = () => `${S.DIRS[st.doc.kind]}/${docId.value}`;

function cmd(line: string): boolean {
  try {
    const msg = S.run(st, line, pal);
    note.value = msg;
    if (!STATE_ONLY.test(line.trim())) saved.value = false;
    return true;
  } catch (e) {
    note.value = (e as Error).message;
    return false;
  } finally { tick.value++; }
}

function open(doc: S.Drawing, id: string, isSaved: boolean) {
  st = S.newStudio(doc);
  docId.value = id; saved.value = isSaved; pvFrame.value = 0;
  zoom.value = Math.max(4, Math.min(20, Math.floor(760 / Math.max(doc.w, doc.h))));
  tick.value++;
}

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(`/__studio${path}`, init);
  if (!r.ok) throw new Error(await r.text());
  return r;
};
const say = (e: unknown) => { note.value = e instanceof Error ? e.message : String(e); };

async function refreshList() { try { drawings.value = (await (await api('/list')).json()).drawings; } catch (e) { say(e); } }
async function load(ref: string) {
  try {
    const doc = S.fromYaml(await (await api(`/file?path=${encodeURIComponent(ref)}`)).text());
    open(doc, ref.split('/')[1] ?? '', true);
    note.value = `เปิด art/${ref}.yaml`;
  } catch (e) { say(e); }
}
async function save() {
  if (!NAME.test(docId.value)) { note.value = 'ตั้งชื่อภาพก่อนบันทึก (ตัวพิมพ์เล็ก ตัวเลข หรือ _ ขึ้นต้นด้วยตัวอักษร)'; return; }
  try {
    await api(`/file?path=${encodeURIComponent(refOf())}`, { method: 'PUT', body: S.toYaml(st.doc) });
    saved.value = true;
    note.value = `บันทึก art/${refOf()}.yaml แล้ว`;
    void refreshList();
  } catch (e) { say(e); }
}
async function build() {
  try {
    const { written } = await (await api('/build', { method: 'POST' })).json() as { written: string[] };
    note.value = written.length ? `สร้างไฟล์ของเกม ${written.length} ไฟล์: ${written.join(' ')}` : 'ไฟล์ของเกมเป็นปัจจุบันอยู่แล้ว';
  } catch (e) { say(e); }
}

// ---------- ภาพ ----------

function toCanvas(im: S.Img): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = im.w; c.height = im.h;
  c.getContext('2d')!.putImageData(new ImageData(im.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, im.w, im.h), 0, 0);
  return c;
}
const pixelsOf = (c: HTMLCanvasElement): S.Img => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, rgba: d.data }; };

async function canvasFrom(src: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c;
}
async function useSource(path: string) {
  try {
    const canvas = await canvasFrom(await (await api(`/source?path=${encodeURIComponent(path)}`)).blob());
    refImg.value = { name: path, canvas, x: 0, y: 0, scale: 1, alpha: 0.45 };
    note.value = `ภาพอ้างอิง: ${path} (${canvas.width} x ${canvas.height})`;
  } catch (e) { say(e); }
}
async function browse(dir: string) {
  try { srcList.value = await (await api(`/sources?dir=${encodeURIComponent(dir)}`)).json(); srcDir.value = dir; } catch (e) { say(e); }
}

/** ภาพอ้างอิง -> ภาพใหม่ในห้อง ผ่านขั้นตอนเดียวกับ npm run draw -- import (ลบเงาพื้น จับสีเข้า palette ใส่เส้นขอบ) */
function importRef(kind: S.Kind, big: boolean) {
  const r = refImg.value;
  if (!r) { note.value = 'เลือกภาพอ้างอิงก่อน'; return; }
  if (r.name.startsWith('style-lock/')) { note.value = 'ภาพแบบที่ล็อกไว้ใช้เป็นภาพอ้างอิงเท่านั้น'; return; }
  try {
    const tile = adoptTile(pixelsOf(r.canvas), paletteOf(spriteYaml, sceneYaml), { big, shadow: true });
    const doc = S.fromImage(tile, pal, { kind });
    if (!r.name.startsWith('(')) doc.meta.from = r.name;
    if (big) doc.meta.big = 1;
    open(doc, '', false);
    note.value = 'นำเข้าแล้ว ตั้งชื่อแล้วกดบันทึก';
  } catch (e) { say(e); }
}

// ---------- ผืนวาด ----------

const P = (p: [number, number]) => `${p[0]},${p[1]}`;
let drag: { base: S.Studio; tool: Tool; start: [number, number]; pts: [number, number][]; moved: boolean } | null = null;

function gesture(t: Tool, start: [number, number], pts: [number, number][], cur: [number, number]): string | null {
  const f = filled.value ? ' fill' : '', path = pts.map(P).join(' ');
  switch (t) {
    case 'pencil': return `stroke ${path}`;
    case 'erase': return `erase ${path}`;
    case 'lighter': return `shade-at +1 ${path}`;
    case 'darker': return `shade-at -1 ${path}`;
    case 'line': return `line ${P(start)} ${P(cur)}`;
    case 'rect': return `rect ${P(start)} ${P(cur)}${f}`;
    case 'ellipse': return `ellipse ${P(start)} ${P(cur)}${f}`;
    case 'select': return `select ${P(start)} ${P(cur)}`;
    case 'move': return cur[0] === start[0] && cur[1] === start[1] ? null : `move ${cur[0] - start[0]},${cur[1] - start[1]}`;
    case 'fill': return `fill ${P(start)}`;
    case 'pick': return `pick ${P(start)}`;
  }
}

function Board() {
  const ref = useRef<HTMLCanvasElement>(null);
  const z = zoom.value, { w, h } = st.doc;
  const deps = [tick.value, z, grid.value, onion.value, marks.value, refImg.value, hover.value, pvBody.value];
  useEffect(() => { if (ref.current) paint(ref.current); }, deps);

  const cell = (e: PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / z), Math.floor((e.clientY - r.top) / z)];
  };
  const apply = (cur: [number, number]) => {
    if (!drag) return;
    st = S.cloneStudio(drag.base);
    const line = gesture(drag.tool, drag.start, drag.pts, cur);
    if (line) cmd(line); else tick.value++;
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    // ออกจากช่องพิมพ์ก่อน ปุ่มลัดของเครื่องมือจะได้ใช้ได้ต่อทันที
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    ref.current!.setPointerCapture(e.pointerId);
    const at = cell(e), t = e.button === 2 ? 'erase' : tool.value;
    drag = { base: S.cloneStudio(st), tool: t, start: at, pts: [at], moved: false };
    apply(at);
  };
  const move = (e: PointerEvent) => {
    const at = cell(e);
    const inside = at[0] >= 0 && at[1] >= 0 && at[0] < w && at[1] < h;
    const was = hover.value;
    if (!inside) { if (was) hover.value = null; } else if (!was || was[0] !== at[0] || was[1] !== at[1]) hover.value = at;
    if (!drag) return;
    const last = drag.pts[drag.pts.length - 1]!;
    if (last[0] === at[0] && last[1] === at[1]) return;
    drag.moved = true;
    drag.pts.push(at);
    if (drag.tool !== 'fill' && drag.tool !== 'pick') apply(at);
  };
  const up = () => {
    if (drag && drag.tool === 'select' && !drag.moved) { st = S.cloneStudio(drag.base); cmd('select none'); }
    drag = null;
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    canvasFrom(f).then((canvas) => { refImg.value = { name: `(${f.name})`, canvas, x: 0, y: 0, scale: 1, alpha: 0.45 }; note.value = `ภาพอ้างอิง: ${f.name}`; }, say);
  };
  return (
    <div class="board" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <canvas
        ref={ref} width={w * z + 1} height={h * z + 1} class={`tool-${tool.value}`} aria-label="ผืนวาด"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onPointerLeave={() => { if (!drag) hover.value = null; }} onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

/** ตัวละครเปล่าๆ ที่รองใต้ผืนตอนวาดชิ้นสวม จะได้เห็นว่ามือกับลำตัวอยู่ตรงไหน */
const guides = new Map<string, HTMLCanvasElement>();
function bodyGuide(): HTMLCanvasElement {
  const body = pvBody.value;
  let c = guides.get(body);
  if (!c) { c = toCanvas(renderLook(kit, { body, pieces: ['face/basic', ...(UNDER[body] ?? [])] })); guides.set(body, c); }
  return c;
}

let checker: HTMLCanvasElement | undefined;
function paint(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!, z = zoom.value, { w, h } = st.doc, W = w * z, H = h * z;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  if (!checker) {
    checker = document.createElement('canvas'); checker.width = checker.height = 2;
    const k = checker.getContext('2d')!;
    k.fillStyle = '#f2f2f9'; k.fillRect(0, 0, 2, 2); k.fillStyle = '#e4e4ee'; k.fillRect(0, 0, 1, 1); k.fillRect(1, 1, 1, 1);
  }
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) g.drawImage(checker, 0, 0, Math.min(2, w - x), Math.min(2, h - y), x * z, y * z, Math.min(2, w - x) * z, Math.min(2, h - y) * z);
  if (st.doc.kind === 'piece' && w === 64 && h === 96) { g.globalAlpha = 0.45; g.drawImage(bodyGuide(), 0, 0, W, H); g.globalAlpha = 1; }
  const r = refImg.value;
  if (r) { g.globalAlpha = r.alpha; g.drawImage(r.canvas, r.x * z, r.y * z, r.canvas.width * r.scale * z, r.canvas.height * r.scale * z); g.globalAlpha = 1; }
  if (onion.value && st.frame > 0) { g.globalAlpha = 0.28; g.drawImage(toCanvas(S.render(st.doc, pal, { frame: st.frame - 1 })), 0, 0, W, H); g.globalAlpha = 1; }
  g.drawImage(toCanvas(S.render(st.doc, pal, { frame: st.frame })), 0, 0, W, H);
  if (grid.value && z >= 6) {
    for (let x = 0; x <= w; x++) { g.fillStyle = x % 8 === 0 ? 'rgba(43,40,64,.34)' : 'rgba(43,40,64,.1)'; g.fillRect(x * z, 0, 1, H + 1); }
    for (let y = 0; y <= h; y++) { g.fillStyle = y % 8 === 0 ? 'rgba(43,40,64,.34)' : 'rgba(43,40,64,.1)'; g.fillRect(0, y * z, W + 1, 1); }
  }
  if (st.sym !== null) { g.fillStyle = 'rgba(74,91,168,.75)'; g.fillRect(Math.round((st.sym + 0.5) * z), 0, 1, H); }
  if (marks.value) { g.strokeStyle = '#e63c78'; g.lineWidth = 2; for (const [x, y] of S.strays(st.doc, st.frame)) g.strokeRect(x * z + 1, y * z + 1, z - 1, z - 1); }
  if (st.sel) {
    const s = st.sel;
    g.lineWidth = 1; g.setLineDash([4, 3]);
    g.strokeStyle = '#fff'; g.strokeRect(s.x0 * z + 0.5, s.y0 * z + 0.5, (s.x1 - s.x0 + 1) * z, (s.y1 - s.y0 + 1) * z);
    g.lineDashOffset = 4; g.strokeStyle = '#2b2840'; g.strokeRect(s.x0 * z + 0.5, s.y0 * z + 0.5, (s.x1 - s.x0 + 1) * z, (s.y1 - s.y0 + 1) * z);
    g.setLineDash([]); g.lineDashOffset = 0;
  }
  const hv = hover.value;
  if (hv) { g.lineWidth = 1; g.strokeStyle = 'rgba(43,40,64,.8)'; g.strokeRect(hv[0] * z + 0.5, hv[1] * z + 0.5, z, z); }
}

// ---------- แผงด้านขวา ----------

function Swatches() {
  tick.value;
  const d = st.doc;
  const pick = (m: string, lv: number) => cmd(m === S.INK ? 'use ink' : `use ${m}@${lv}`);
  const add = (e: Event) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement, n = (f.elements.namedItem('mat') as HTMLInputElement).value.trim(), ramp = (f.elements.namedItem('ramp') as HTMLSelectElement).value;
    if (cmd(`mat ${n} ${ramp}`)) f.reset();
  };
  return (
    <section>
      <h2>สี <small>วัสดุกับระดับแสง 0 มืด ถึง 4 สว่าง</small></h2>
      <div class="mat">
        <button class={`sw ink ${st.mat === S.INK ? 'on' : ''}`} style={{ background: `#${pal.outline}` }} title="เส้นขอบ (ink)" onClick={() => pick(S.INK, 0)} />
        <span class="mat-name">ink <small>เส้นขอบ</small></span>
      </div>
      {d.mats.slice(1).map((m) => (
        <div class="mat" key={m}>
          <div class="ramp">
            {(pal.ramps[d.ramps[m] ?? ''] ?? []).map((hex, lv) => (
              <button key={lv} class={`sw ${st.mat === m && st.level === lv ? 'on' : ''}`} style={{ background: `#${hex}` }} title={`${m}@${lv}`} aria-label={`${m}@${lv}`} onClick={() => pick(m, lv)} />
            ))}
          </div>
          <span class="mat-name">{m}</span>
          <select value={d.ramps[m]} aria-label={`ramp ของ ${m}`} onChange={(e) => cmd(`mat ${m} ${(e.currentTarget as HTMLSelectElement).value}`)}>
            {RAMPS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      ))}
      <form class="row" onSubmit={add}>
        <input name="mat" placeholder="ชื่อวัสดุใหม่" aria-label="ชื่อวัสดุใหม่" required pattern="[a-z][a-z0-9_]*" />
        <select name="ramp" aria-label="ramp ของวัสดุใหม่">{RAMPS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
        <button type="submit">เพิ่ม</button>
      </form>
    </section>
  );
}

function Layers() {
  tick.value;
  const f = S.frameOf(st);
  const add = (e: Event) => {
    e.preventDefault();
    const i = (e.currentTarget as HTMLFormElement).elements.namedItem('layer') as HTMLInputElement;
    if (cmd(`layer add ${i.value.trim()}`)) i.value = '';
  };
  return (
    <section>
      <h2>ชั้น</h2>
      <ul class="list">
        {f.layers.map((L, i) => (
          <li key={L.name} class={i === st.layer ? 'on' : ''}>
            <button class="grow" onClick={() => cmd(`layer select ${L.name}`)}>{L.name}</button>
            <button class={`chip ${L.hidden ? 'off' : ''}`} title={L.hidden ? 'แสดงชั้นนี้' : 'ซ่อนชั้นนี้'} onClick={() => cmd(`layer ${L.hidden ? 'show' : 'hide'} ${L.name}`)}>{L.hidden ? 'ซ่อน' : 'เห็น'}</button>
            <button class={`chip ${L.locked ? 'warn' : ''}`} title={L.locked ? 'ปลดล็อก' : 'ล็อกไม่ให้แก้'} onClick={() => cmd(`layer ${L.locked ? 'unlock' : 'lock'} ${L.name}`)}>{L.locked ? 'ล็อก' : 'แก้ได้'}</button>
          </li>
        )).reverse()}
      </ul>
      <div class="row">
        <button onClick={() => cmd('layer up')}>ขึ้น</button>
        <button onClick={() => cmd('layer down')}>ลง</button>
        <button onClick={() => cmd('layer merge')}>รวมลงล่าง</button>
        <button onClick={() => cmd('layer delete')}>ลบ</button>
      </div>
      <form class="row" onSubmit={add}>
        <input name="layer" placeholder="ชื่อชั้นใหม่" aria-label="ชื่อชั้นใหม่" required pattern="[a-z][a-z0-9_]*" />
        <button type="submit">เพิ่มชั้น</button>
      </form>
    </section>
  );
}

function Frames() {
  tick.value;
  const add = (e: Event) => {
    e.preventDefault();
    const i = (e.currentTarget as HTMLFormElement).elements.namedItem('frame') as HTMLInputElement;
    if (cmd(`frame add ${i.value.trim()} from ${S.frameOf(st).name}`)) i.value = '';
  };
  return (
    <section>
      <h2>เฟรม <small>ศัตรูมีท่ายืน idle กับท่าเข้าตี strike</small></h2>
      <div class="row wrap">
        {st.doc.frames.map((f, i) => <button key={f.name} class={i === st.frame ? 'on' : ''} onClick={() => cmd(`frame select ${f.name}`)}>{f.name}</button>)}
        <button onClick={() => cmd('frame delete')}>ลบเฟรมนี้</button>
      </div>
      <form class="row" onSubmit={add}>
        <input name="frame" placeholder="ชื่อเฟรมใหม่ (ลอกจากเฟรมนี้)" aria-label="ชื่อเฟรมใหม่" required pattern="[a-z][a-z0-9_]*" />
        <button type="submit">เพิ่มเฟรม</button>
      </form>
      <label class="check"><input type="checkbox" checked={onion.value} onChange={(e) => { onion.value = (e.currentTarget as HTMLInputElement).checked; }} /> เห็นเฟรมก่อนหน้าจางๆ</label>
    </section>
  );
}

function Reference() {
  const r = refImg.value, list = srcList.value, dir = srcDir.value;
  const set = (patch: Partial<Ref>) => { if (r) refImg.value = { ...r, ...patch }; };
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value) || 0;
  const big = useRef<HTMLInputElement>(null), kind = useRef<HTMLSelectElement>(null);
  return (
    <section>
      <h2>ภาพอ้างอิง <small>อยู่ใต้ผืนวาด ไม่ถูกบันทึกลงงาน</small></h2>
      {r && (
        <div class="ref">
          <div class="muted">{r.name}</div>
          <label>ความชัด <input type="range" min="0" max="1" step="0.05" value={r.alpha} onInput={(e) => set({ alpha: num(e) })} /></label>
          <div class="row">
            <label>x <input type="number" value={r.x} onInput={(e) => set({ x: num(e) })} /></label>
            <label>y <input type="number" value={r.y} onInput={(e) => set({ y: num(e) })} /></label>
            <label>ขยาย <select value={r.scale} onChange={(e) => set({ scale: Number((e.currentTarget as HTMLSelectElement).value) })}><option value="1">1 เท่า</option><option value="2">2 เท่า</option></select></label>
            <button onClick={() => { refImg.value = null; }}>เอาออก</button>
          </div>
          <div class="row">
            <select ref={kind} aria-label="ชนิดของภาพที่นำเข้า">{(['foe', 'icon', 'prop'] as S.Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
            <label class="check"><input type="checkbox" ref={big} /> ขยาย 2 เท่า</label>
            <button onClick={() => importRef((kind.current?.value ?? 'foe') as S.Kind, !!big.current?.checked)}>นำเข้าเป็นภาพใหม่</button>
          </div>
        </div>
      )}
      <div class="crumbs">
        <button onClick={() => void browse('')}>ชุดฟรี</button>
        {dir.split('/').filter(Boolean).map((seg, i, all) => <button key={i} onClick={() => void browse(all.slice(0, i + 1).join('/'))}>/ {seg}</button>)}
      </div>
      <div class="row wrap">{list.dirs.map((d) => <button key={d} onClick={() => void browse(dir ? `${dir}/${d}` : d)}>{d}</button>)}</div>
      <div class="thumbs">
        {list.files.map((f) => {
          const path = dir ? `${dir}/${f}` : f;
          return <button key={f} title={f} onClick={() => void useSource(path)}><img loading="lazy" alt={f} src={`/__studio/source?path=${encodeURIComponent(path)}`} /></button>;
        })}
      </div>
    </section>
  );
}

const images = new Map<string, HTMLImageElement>();
function picture(src: string, then: () => void): HTMLImageElement | null {
  let im = images.get(src);
  if (!im) { im = new Image(); im.onload = then; im.src = src; images.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}
let heroCanvas: HTMLCanvasElement | undefined;

/** ดูผลจริง: ศัตรูบนฉากข้างตัวละคร ชิ้นสวมบนตัวละคร ของอื่นบนพื้นสว่างและมืด ทุกอย่างขนาดพิกเซลเท่าในเกม */
function Real() {
  const ref = useRef<HTMLCanvasElement>(null);
  const d = st.doc, sc = scenes.value;
  const frame = pvPlay.value ? pvFrame.value % d.frames.length : st.frame;
  const size = d.kind === 'foe' ? [168, 112] : d.kind === 'piece' ? [64, 96] : [Math.max(96, (d.w + 12) * 2), d.h + 12];
  const deps = [tick.value, frame, pvScene.value, pvTime.value, pvBody.value, pvSeed.value, sc];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    try {
      if (d.kind === 'foe') {
        const stand = sc?.stand[pvScene.value] ?? 100, bg = picture(`/scenes/${pvScene.value}_${pvTime.value}.png`, () => tick.value++);
        if (bg) g.drawImage(bg, -44, 0);
        heroCanvas ??= toCanvas(renderLook(kit, npcLook(kit, 'worker', 3) as Look));
        g.drawImage(heroCanvas, 88 - 32 - 44, stand - 93);
        const foe = S.exportFrames(d, pal).frames[frame]!;
        g.drawImage(toCanvas(foe), Math.round(160 - 44 - foe.w / 2), stand + 2 - foe.h - Number(d.meta.lift ?? 0));
      } else if (d.kind === 'piece') {
        const body = kit.bodies[pvBody.value]!;
        kit.pieces.__studio = S.pieceSpec(d, { marks: body.marks, cols: body.cols as Record<string, number> | undefined });
        const look = npcLook(kit, 'worker', pvSeed.value, { body: pvBody.value }) as Look;
        // ของเดิมในช่องเดียวกัน (meta.piece เช่น weapon/long_sword) ถอดออกก่อน
        const slot = String(d.meta.piece ?? '').split('/')[0];
        g.drawImage(toCanvas(renderLook(kit, { ...look, pieces: [...(look.pieces ?? []).filter((id) => !slot || !id.startsWith(`${slot}/`)), '__studio'] })), 0, 0);
      } else {
        const im = toCanvas(S.exportImage(d, pal, frame)), half = c.width / 2;
        g.fillStyle = '#f2f2f9'; g.fillRect(0, 0, half, c.height); g.fillStyle = '#28263a'; g.fillRect(half, 0, half, c.height);
        for (const x0 of [0, half]) g.drawImage(im, Math.round(x0 + (half - im.width) / 2), Math.round((c.height - im.height) / 2));
      }
    } catch (e) { say(e); }
  }, deps);
  useEffect(() => {
    if (!pvPlay.value) return;
    const t = setInterval(() => { pvFrame.value++; }, 520);
    return () => clearInterval(t);
  }, [pvPlay.value]);
  const pickOf = (s: typeof pvScene, list: string[]) => <select value={s.value} onChange={(e) => { s.value = (e.currentTarget as HTMLSelectElement).value; }}>{list.map((v) => <option key={v} value={v}>{v}</option>)}</select>;
  return (
    <section>
      <h2>ดูผลจริง <small>พิกเซลขนาดเท่าในเกม</small></h2>
      <canvas ref={ref} class="real" width={size[0]} height={size[1]} style={{ width: `${size[0]! * 2}px` }} aria-label="ภาพขนาดจริง" />
      {d.kind === 'foe' && sc && (
        <div class="row wrap">
          {pickOf(pvScene, sc.scenes)}{pickOf(pvTime, sc.times)}
          <label class="check"><input type="checkbox" checked={pvPlay.value} onChange={(e) => { pvPlay.value = (e.currentTarget as HTMLInputElement).checked; }} /> สลับท่า</label>
        </div>
      )}
      {d.kind === 'piece' && (
        <div class="row wrap">
          {pickOf(pvBody, Object.keys(kit.bodies))}
          <button onClick={() => { pvSeed.value++; }}>เปลี่ยนคน</button>
        </div>
      )}
    </section>
  );
}

// ---------- แถบบน แถบเครื่องมือ แถบล่าง ----------

function Top() {
  tick.value;
  const d = st.doc;
  const newDoc = (e: Event) => {
    e.preventDefault();
    const f = (e.currentTarget as HTMLFormElement).elements;
    const v = (n: string) => (f.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
    try { open(S.newDrawing(v('kind') as S.Kind, Number(v('w')), Number(v('h'))), '', false); note.value = 'ภาพใหม่ ตั้งชื่อแล้วกดบันทึก'; } catch (err) { say(err); }
  };
  const pick = (e: Event) => {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (!v) return;
    if (!saved.value && pending !== v) { pending = v; note.value = 'ภาพนี้ยังไม่ได้บันทึก เลือกอีกครั้งถ้าจะทิ้งงานแล้วเปิดภาพอื่น'; tick.value++; return; }
    pending = '';
    void load(v);
  };
  return (
    <header class="top">
      <strong class="brand">ห้องวาด</strong>
      <select value={saved.value && docId.value ? refOf() : ''} onChange={pick} aria-label="เปิดภาพ">
        <option value="">เปิดภาพ…</option>
        {drawings.value.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <span class="kind">{KIND_LABEL[d.kind]} {d.w} x {d.h}</span>
      <input class="name" value={docId.value} placeholder="ชื่อภาพ เช่น ash_hound" aria-label="ชื่อภาพ" onInput={(e) => { docId.value = (e.currentTarget as HTMLInputElement).value.trim(); saved.value = false; }} />
      <button class="primary" onClick={() => void save()}>บันทึก{saved.value ? '' : ' *'}</button>
      <button onClick={() => void build()} title="สร้างไฟล์ PNG ที่เกมใช้จากทุกภาพ">สร้างไฟล์เกม</button>
      <span class="gap" />
      <button onClick={() => cmd('undo')} title="Ctrl+Z">ย้อน</button>
      <button onClick={() => cmd('redo')} title="Ctrl+Y">ทำซ้ำ</button>
      <label>ขยาย <input type="range" min="2" max="24" value={zoom.value} onInput={(e) => { zoom.value = Number((e.currentTarget as HTMLInputElement).value); }} /></label>
      <label class="check"><input type="checkbox" checked={grid.value} onChange={(e) => { grid.value = (e.currentTarget as HTMLInputElement).checked; }} /> ตาราง</label>
      <label class="check" title="พิกเซลที่ไม่มีเพื่อนบ้านสีเดียวกันเลย"><input type="checkbox" checked={marks.value} onChange={(e) => { marks.value = (e.currentTarget as HTMLInputElement).checked; }} /> จุดหลุดเดี่ยว</label>
      <details class="new">
        <summary>ภาพใหม่</summary>
        <form onSubmit={newDoc}>
          <select name="kind" aria-label="ชนิดภาพ">{S.KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          <label>กว้าง <input name="w" type="number" min="1" max="256" value="48" /></label>
          <label>สูง <input name="h" type="number" min="1" max="256" value="32" /></label>
          <button type="submit">สร้าง</button>
          <p class="muted">ชิ้นสวมบนตัวละครใช้ผืน 64 x 96 เท่าตัวละคร</p>
        </form>
      </details>
    </header>
  );
}
let pending = '';

function Tools() {
  tick.value;
  return (
    <nav class="tools" aria-label="เครื่องมือ">
      {TOOLS.map(([t, label, key]) => (
        <button key={t} class={tool.value === t ? 'on' : ''} onClick={() => { tool.value = t; }} title={`${label} (${key})`}>{label}<kbd>{key}</kbd></button>
      ))}
      <label class="check"><input type="checkbox" checked={filled.value} onChange={(e) => { filled.value = (e.currentTarget as HTMLInputElement).checked; }} /> ทึบ</label>
      <hr />
      <button onClick={() => cmd('flip h')}>กลับซ้ายขวา</button>
      <button onClick={() => cmd('flip v')}>กลับบนล่าง</button>
      <button onClick={() => cmd(`autoshade ${st.mat}`)} title="ลงแสงเงาให้วัสดุที่ถืออยู่ทั้งก้อน">ลงเงาให้</button>
      <button onClick={() => cmd(`outline ${st.doc.outline ? 'off' : 'on'}`)} class={st.doc.outline ? 'on' : ''} title="ใส่เส้นขอบรอบเงาทั้งตัวตอนส่งออก">เส้นขอบ</button>
      <button onClick={() => cmd('trim 1')} title="ตัดผืนให้พอดีภาพ">ตัดขอบ</button>
      <hr />
      <label>สมมาตร
        <input type="number" step="0.5" placeholder="ปิด" value={st.sym ?? ''} aria-label="แกนสมมาตร" onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; cmd(v === '' ? 'sym off' : `sym ${v}`); }} />
      </label>
    </nav>
  );
}

function Bottom() {
  tick.value;
  const hv = hover.value, d = st.doc;
  const under = hv ? S.matLabel(d, S.flatten(d, st.frame)[hv[1] * d.w + hv[0]] ?? S.EMPTY) : '';
  const submit = (e: Event) => {
    e.preventDefault();
    const i = (e.currentTarget as HTMLFormElement).elements.namedItem('line') as HTMLInputElement;
    if (i.value.trim() && cmd(i.value)) i.value = '';
  };
  return (
    <footer class="bottom">
      <form onSubmit={submit}>
        <input name="line" placeholder="พิมพ์คำสั่ง เช่น line hide@1 3,4 20,9 แล้วกด Enter" aria-label="คำสั่ง" autocomplete="off" list="cmds" />
        <datalist id="cmds">{S.HELP.map(([s]) => <option key={s} value={s} />)}</datalist>
      </form>
      <span class="note" role="status">{note.value}</span>
      <span class="pos">{hv ? `${hv[0]},${hv[1]} ${under}` : ''} · พู่กัน {st.mat === S.INK ? 'ink' : `${st.mat}@${st.level}`}</span>
      <details class="log">
        <summary>ประวัติคำสั่ง {st.log.length}</summary>
        <textarea readOnly rows={10} value={st.log.join('\n')} aria-label="ประวัติคำสั่ง" />
        <table><tbody>{S.HELP.map(([s, what]) => <tr key={s}><td><code>{s}</code></td><td>{what}</td></tr>)}</tbody></table>
      </details>
    </footer>
  );
}

function keys(e: KeyboardEvent) {
  const el = e.target as HTMLElement;
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); void save(); return; }
  if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); cmd('redo'); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); cmd('undo'); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = TOOLS.find(([, , key]) => key.toLowerCase() === k);
  if (t) { tool.value = t[0]; return; }
  if (/^[0-4]$/.test(k)) { cmd(`level ${k}`); return; }
  if (k === '[' || k === ']') { cmd(`level ${Math.max(0, Math.min(S.LEVELS - 1, st.level + (k === ']' ? 1 : -1)))}`); return; }
  const step: Record<string, string> = { arrowleft: '-1,0', arrowright: '1,0', arrowup: '0,-1', arrowdown: '0,1' };
  if (step[k]) { e.preventDefault(); cmd(`move ${step[k]}`); return; }
  if (k === 'escape') { cmd('select none'); return; }
  if ((k === 'delete' || k === 'backspace') && st.sel) { e.preventDefault(); cmd(`erase-rect ${st.sel.x0},${st.sel.y0} ${st.sel.x1},${st.sel.y1}`); }
}

function App() {
  useEffect(() => {
    addEventListener('keydown', keys);
    void refreshList();
    void browse('dungeon-crawl/monster');
    fetch('/scenes/index.json').then((r) => r.json()).then((j) => { scenes.value = j; }, () => {});
    const warn = (e: BeforeUnloadEvent) => { if (!saved.value) e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => { removeEventListener('keydown', keys); removeEventListener('beforeunload', warn); };
  }, []);
  return (
    <div class="studio">
      <Top />
      <Tools />
      <Board />
      <aside class="side"><Real /><Swatches /><Layers /><Frames /><Reference /></aside>
      <Bottom />
    </div>
  );
}

mount(<App />, document.getElementById('studio')!);

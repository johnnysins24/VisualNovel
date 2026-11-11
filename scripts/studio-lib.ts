// ห้องวาด ฝั่ง Node: อ่านเขียนไฟล์ภาพใน art/ นำเข้าภาพจากชุดฟรี สร้างภาพที่เกมใช้ และทำภาพขยายไว้ตรวจงาน
// ใช้ร่วมกันโดยคำสั่ง npm run draw (scripts/studio.ts) กับหน้าเว็บตอน npm run studio (scripts/studio-plugin.ts)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { loadKit, renderLook, type Look } from '../art/kit/kit.mjs';
import { npcLook, UNDER } from '../art/kit/npc.mjs';
import { adoptTile, blit, crop, pad, paletteOf } from '../art/kit/pixels.mjs';
import { decodePNG, encodePNG } from '../art/kit/png.mjs';
import { sheet } from '../art/kit/sheet.mjs';
import { rasterSvgs } from '../art/kit/adopt.mjs';
import {
  DIRS, code, exportFrames, exportImage, fromImage, fromYaml, makePalette, newDrawing, pieceSpec, render, strays, toYaml, type Drawing, type Img, type Kind, type Palette,
} from '../src/studio/core.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'art');
const THIRD = join(ART, 'thirdparty');

export { DIRS };
const KIND_OF = Object.fromEntries(Object.entries(DIRS).map(([k, d]) => [d, k])) as Record<string, Kind>;
/** ชื่ออ้างอิงของภาพ เช่น "foes/ash_hound" (ไฟล์คือ art/foes/ash_hound.yaml) */
export const REF = /^(foes|icons|props|wear)\/[a-z][a-z0-9_]*$/;
/** ไฟล์ภาพในชุดฟรีหรือภาพแบบที่ล็อกไว้ ที่ยอมให้เปิดเป็นภาพอ้างอิง */
const SOURCE = /^[A-Za-z0-9_][A-Za-z0-9_./ -]*\.png$/;

const fail = (msg: string): never => { throw new Error(msg); };
const yamlAt = (rel: string) => YAML.parse(readFileSync(join(ART, rel), 'utf8'));

let pal: Palette | undefined;
/** ramp ทั้งหมดที่วาดได้ (art/palette.yaml กับ art/scenes/palette.yaml) */
export const palette = (): Palette => (pal ??= makePalette(yamlAt('palette.yaml'), yamlAt('scenes/palette.yaml')));

// ---------- ไฟล์ภาพ ----------

export const pathOf = (ref: string) => (REF.test(ref) ? join(ART, `${ref}.yaml`) : fail(`ชื่อภาพต้องเป็นแบบ foes/ash_hound (โฟลเดอร์ ${Object.values(DIRS).join(' ')}) แต่ได้ "${ref}"`));
export const kindOfRef = (ref: string): Kind => KIND_OF[ref.split('/')[0] ?? ''] ?? fail(`ไม่รู้จักโฟลเดอร์ของ "${ref}"`);

export function listDrawings(): string[] {
  return Object.values(DIRS).flatMap((d) => (existsSync(join(ART, d)) ? readdirSync(join(ART, d)).filter((f) => f.endsWith('.yaml')).sort().map((f) => `${d}/${f.slice(0, -5)}`) : []));
}

/** ตรวจว่าภาพใช้ได้จริง: ชนิดตรงกับโฟลเดอร์ และ ramp ทุกตัวมีใน palette */
export function checkDrawing(ref: string, doc: Drawing): Drawing {
  if (doc.kind !== kindOfRef(ref)) fail(`${ref}: ภาพชนิด ${doc.kind} ต้องอยู่ในโฟลเดอร์ ${DIRS[doc.kind]}`);
  for (const m of doc.mats.slice(1)) if (!palette().ramps[doc.ramps[m] ?? '']) fail(`${ref}: วัสดุ "${m}" ใช้ ramp "${doc.ramps[m] ?? ''}" ที่ไม่มีใน palette`);
  return doc;
}

export const readDrawing = (ref: string): Drawing => {
  const p = pathOf(ref);
  if (!existsSync(p)) fail(`ไม่มีไฟล์ art/${ref}.yaml`);
  try { return checkDrawing(ref, fromYaml(readFileSync(p, 'utf8'))); } catch (e) { return fail(`art/${ref}.yaml: ${(e as Error).message}`); }
};

export function writeDrawing(ref: string, doc: Drawing) {
  const p = pathOf(ref);
  checkDrawing(ref, doc);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, toYaml(doc));
}

// ---------- ภาพอ้างอิงและการนำเข้า ----------

/** path ของภาพอ้างอิง: ใต้ art/thirdparty/ หรือ "style-lock/<ไฟล์>" (docs/ref/style-lock) ห้ามออกนอกสองที่นี้ */
export function sourcePath(rel: string): string {
  if (!SOURCE.test(rel) || rel.split('/').some((s) => s === '..' || s === '.' || s === '')) fail(`path ของภาพอ้างอิงใช้ไม่ได้: "${rel}"`);
  const p = rel.startsWith('style-lock/') ? join(ROOT, 'docs/ref', rel) : join(THIRD, rel);
  return existsSync(p) && statSync(p).isFile() ? p : fail(`ไม่มีภาพอ้างอิง "${rel}"`);
}
export const readSource = (rel: string): Img => decodePNG(readFileSync(sourcePath(rel)));

/** โฟลเดอร์ย่อยและไฟล์ PNG ในโฟลเดอร์หนึ่งของ art/thirdparty ("" = ชั้นบนสุด ซึ่งมี style-lock ภาพแบบที่ล็อกไว้ด้วย) */
export function listSources(dir: string): { dirs: string[]; files: string[] } {
  if (dir && (!/^[A-Za-z0-9_][A-Za-z0-9_./ -]*$/.test(dir) || dir.split('/').some((s) => s === '..' || s === '.' || s === ''))) fail(`โฟลเดอร์ใช้ไม่ได้: "${dir}"`);
  const p = dir === 'style-lock' ? join(ROOT, 'docs/ref/style-lock') : join(THIRD, dir);
  if (!existsSync(p) || !statSync(p).isDirectory()) fail(`ไม่มีโฟลเดอร์ "${dir}"`);
  const names = readdirSync(p).sort();
  return { dirs: [...(dir ? [] : ['style-lock']), ...names.filter((n) => statSync(join(p, n)).isDirectory())], files: names.filter((n) => n.endsWith('.png')) };
}

/**
 * ภาพจากชุดฟรี -> ภาพของห้องวาด: ลบเงาพื้น ขยายสองเท่าถ้า `big` จับสีเข้า palette ใส่เส้นขอบสีของเรา แล้วแปลงเป็นวัสดุ
 * กับระดับแสง ที่มาถูกจดไว้ใน meta.from (เครดิตของชุดอยู่ใน CREDITS.md)
 */
export function importTile(from: string, opts: { kind?: Kind; big?: boolean; shadow?: boolean; maxMats?: number; cell?: number[] } = {}): Drawing {
  if (from.startsWith('style-lock/')) fail('ภาพแบบที่ล็อกไว้ใช้เป็นภาพอ้างอิงเท่านั้น นำเข้าไม่ได้');
  let src = readSource(from);
  const c = opts.cell;
  if (c) {
    // ช่องหนึ่งช่องของแผ่นรวมไอคอน: x,y,กว้าง,สูง
    if (c.length !== 4 || c.some((n) => !Number.isInteger(n) || n < 0) || c[2]! < 1 || c[3]! < 1 || c[0]! + c[2]! > src.w || c[1]! + c[3]! > src.h) fail(`ช่องของแผ่นรวมต้องเป็น x,y,กว้าง,สูง ที่อยู่ในภาพ ${src.w}x${src.h} แต่ได้ "${c.join(',')}"`);
    src = crop(src, { x: c[0]!, y: c[1]!, w: c[2]!, h: c[3]! });
  }
  const tile = adoptTile(src, paletteOf(yamlAt('palette.yaml'), yamlAt('scenes/palette.yaml')), { big: opts.big ?? false, shadow: opts.shadow ?? true });
  const doc = fromImage(tile, palette(), { kind: opts.kind ?? 'foe', maxMats: opts.maxMats ?? 6 });
  doc.meta.from = from;
  if (c) doc.meta.cell = c.join(',');
  if (opts.big) doc.meta.big = 1;
  return doc;
}

/** path ของไอคอนเวกเตอร์ใต้ art/thirdparty/ (game-icons.net) */
function svgPath(rel: string): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.svg$/.test(rel) || rel.split('/').some((s) => s === '..' || s === '.' || s === '')) fail(`path ของไอคอนเวกเตอร์ใช้ไม่ได้: "${rel}"`);
  const p = join(THIRD, rel);
  return existsSync(p) && statSync(p).isFile() ? p : fail(`ไม่มีไอคอนเวกเตอร์ "${rel}"`);
}

/**
 * เงาทึบของไอคอนสีเดียว -> ภาพของห้องวาดที่มีวัสดุเดียว: ขอบซ้ายบนสว่างสุด ขอบขวาล่างมืดสุด เนื้อในไล่จากซ้ายบนลงขวาล่าง
 * (กติกาเดียวกับ art/kit/adopt.mjs) เส้นขอบใส่ให้เองตอนส่งออก วัสดุเดียวทั้งภาพจึงเปลี่ยนสีได้ทั้งชิ้น
 */
export function fromSilhouette(img: Img, opts: { kind?: Kind; mat?: string; ramp?: string } = {}): Drawing {
  const { w, h } = img, mat = opts.mat ?? 'main', ramp = opts.ramp ?? 'metal_iron';
  if (!/^[a-z][a-z0-9_]*$/.test(mat) || mat === 'ink') fail(`ชื่อวัสดุใช้ไม่ได้: "${mat}"`);
  if (!palette().ramps[ramp]) fail(`ไม่มี ramp "${ramp}"`);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.rgba[(y * w + x) * 4 + 3]! >= 128;
  const doc = newDrawing(opts.kind ?? 'icon', w, h);
  doc.mats.push(mat);
  doc.ramps[mat] = ramp;
  const L = doc.frames[0]!.layers[0]!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    const lit = !solid(x - 1, y) || !solid(x, y - 1), dark = !solid(x + 1, y) || !solid(x, y + 1);
    const lv = lit && !dark ? 4 : dark && !lit ? 0 : Math.round(1 + (1 - (x + y) / (w + h)) * 2);
    L.px[y * w + x] = code(1, lv);
  }
  return doc;
}

/** ไอคอนเวกเตอร์สีเดียวจาก game-icons.net -> ภาพของห้องวาด วาดที่ `size` px ด้วย Chromium ของ Playwright (ตัวเดียวกับ adopt.mjs) */
export async function importSvg(from: string, opts: { kind?: Kind; size?: number; mat?: string; ramp?: string } = {}): Promise<Drawing> {
  const size = opts.size ?? 28;
  if (!Number.isInteger(size) || size < 8 || size > 64) fail('ขนาดของไอคอนเวกเตอร์ต้องเป็น 8 ถึง 64');
  const path = svgPath(from), drawn = (await rasterSvgs([{ path, size }]))[path] ?? fail(`วาด "${from}" ไม่ได้`);
  const doc = fromSilhouette(drawn, opts);
  doc.meta.from = from;
  doc.meta.size = size;
  return doc;
}

// ---------- ภาพที่เกมใช้ ----------

/** เฟรมเรียงซ้ายไปขวาในภาพเดียว */
function strip(frames: Img[], w: number, h: number): Img {
  const out = { w: w * frames.length, h, rgba: new Uint8ClampedArray(w * frames.length * h * 4) };
  frames.forEach((f, i) => blit(out, f, i * w, 0));
  return out;
}

// ---------- ศัตรูทรงคน ----------

interface PersonSpec { name?: string; npc?: { group: string; seed: number; body?: string; race?: string }; look?: Look; face?: string; strike_face?: string }
export interface PersonFoe { id: string; name: string; w: number; h: number; frames: Img[] }

/** เอนภาพทั้งก้อน (แถวล่างสุดอยู่กับที่ แถวบนสุดเลื่อน `lean`) แล้วเลื่อนทั้งภาพอีก `move` */
function leaned(img: Img, lean: number, move: number): Img {
  const out = { w: img.w, h: img.h, rgba: new Uint8ClampedArray(img.rgba.length) };
  let y0 = img.h, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.rgba[(y * img.w + x) * 4 + 3]) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = y0; y <= y1; y++) blit(out, crop(img, { x: 0, y, w: img.w, h: 1 }), move + (y1 === y0 ? 0 : Math.round((lean * (y1 - y)) / (y1 - y0))), y);
  return out;
}

/** ตัดทุกเฟรมด้วยกรอบเดียวกัน (กรอบที่ครอบพิกเซลของทุกเฟรม) ตำแหน่งระหว่างเฟรมจึงไม่ขยับ */
function sameBox(frames: Img[]): { w: number; h: number; frames: Img[] } {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const f of frames) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.rgba[(y * f.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) fail('ภาพว่าง');
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  return { w: box.w, h: box.h, frames: frames.map((f) => crop(f, box)) };
}

const PEOPLE = 'foe_people.yaml';
/**
 * ศัตรูทรงคนจาก art/foe_people.yaml: ประกอบจากร่างฐานและชิ้นส่วนของเกม ไม่ได้วาดใหม่
 * ท่ายืนคือหน้าเฉย ท่าเข้าตีคือหน้าโกรธ โน้มตัวไปทางผู้เล่น
 */
export function peopleFoes(): PersonFoe[] {
  if (!existsSync(join(ART, PEOPLE))) return [];
  const kit = theKit(), specs = yamlAt(PEOPLE) as Record<string, PersonSpec>;
  return Object.entries(specs).map(([id, s]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) fail(`${PEOPLE}: ชื่อ "${id}" ต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือ _`);
    if (existsSync(join(ART, `foes/${id}.yaml`))) fail(`${PEOPLE}: "${id}" ซ้ำกับภาพ art/foes/${id}.yaml`);
    const look: Look = s.npc ? npcLook(kit, s.npc.group, s.npc.seed, { body: s.npc.body, race: s.npc.race }) : (s.look ?? fail(`${PEOPLE}: "${id}" ต้องมี npc หรือ look`));
    const idle = pad(renderLook(kit, { ...look, face: s.face ?? 'neutral' }), 8);
    const strike = leaned(pad(renderLook(kit, { ...look, face: s.strike_face ?? 'angry' }), 8), -3, -3);
    return { id, name: s.name ?? id, ...sameBox([idle, strike]) };
  });
}

// ---------- ของสวมใส่: แบบกับวัสดุ ----------

export interface GearTable { materials: Record<string, { name: string; ramp: string }>; patterns: Record<string, { name: string; slot: string }> }
const GEAR = 'gear.yaml';
/** วัสดุของไอคอนของที่เปลี่ยนตามวัสดุของชิ้นนั้น */
export const GEAR_MAT = 'main';
const GEAR_SLOTS = ['head', 'body', 'hands', 'legs', 'feet', 'weapon', 'offhand', 'cloak', 'accessory'];

/** art/gear.yaml: วัสดุ (ชื่อ, ramp) และแบบ (ชื่อ, ช่องสวม) ของของสวมใส่ ตรวจแล้วว่า ramp มีจริงและช่องสวมเป็นของเกม */
export function gearTable(): GearTable {
  const t = (existsSync(join(ART, GEAR)) ? yamlAt(GEAR) : null) as GearTable | null;
  if (!t?.materials || !t.patterns) return fail(`art/${GEAR} ต้องมี materials และ patterns`);
  for (const [id, m] of Object.entries(t.materials)) {
    if (!/^[a-z][a-z0-9_]*$/.test(id) || typeof m?.name !== 'string' || !palette().ramps[m.ramp]) fail(`art/${GEAR}: วัสดุ "${id}" ต้องมี name และ ramp ที่มีอยู่จริง`);
  }
  for (const [id, pt] of Object.entries(t.patterns)) {
    if (!/^[a-z][a-z0-9_]*$/.test(id) || typeof pt?.name !== 'string' || !GEAR_SLOTS.includes(pt.slot)) fail(`art/${GEAR}: แบบ "${id}" ต้องมี name และ slot เป็นหนึ่งใน ${GEAR_SLOTS.join(' ')}`);
  }
  return t;
}

/** ไอคอนของแบบหนึ่งในทุกวัสดุ เรียงตาม materials ทุกช่องตัดด้วยกรอบเดียวกัน */
export function gearIcons(doc: Drawing, gear: GearTable): { w: number; h: number; frames: Img[] } {
  if (doc.frames.length !== 1) fail('ไอคอนของต้องมีเฟรมเดียว');
  if (!doc.mats.includes(GEAR_MAT)) fail(`ไอคอนของต้องมีวัสดุชื่อ ${GEAR_MAT} (ส่วนที่เปลี่ยนตามวัสดุของชิ้นนั้น)`);
  const frames = Object.values(gear.materials).map((m) => exportFrames({ ...doc, ramps: { ...doc.ramps, [GEAR_MAT]: m.ramp } }, palette()));
  return { w: frames[0]!.w, h: frames[0]!.h, frames: frames.map((f) => f.frames[0]!) };
}

// ---------- สิ่งติดตัว ----------

export const TRAIT_KINDS = ['boon', 'curse', 'trait', 'wound'] as const;
export type TraitTable = Record<string, { name: string; kind: (typeof TRAIT_KINDS)[number] }>;
const TRAITS = 'traits.yaml';

/** art/traits.yaml: รหัส ชื่อ และชนิดของสิ่งติดตัว (ลำดับในไฟล์คือลำดับในภาพรวม) */
export function traitTable(): TraitTable {
  const t = (existsSync(join(ART, TRAITS)) ? yamlAt(TRAITS) : null) as TraitTable | null;
  if (!t || typeof t !== 'object') return fail(`ไม่มี art/${TRAITS}`);
  for (const [id, v] of Object.entries(t)) {
    if (!/^[a-z][a-z0-9_]*$/.test(id) || typeof v?.name !== 'string' || !TRAIT_KINDS.includes(v.kind)) fail(`art/${TRAITS}: "${id}" ต้องมี name และ kind เป็นหนึ่งใน ${TRAIT_KINDS.join(' ')}`);
  }
  return t;
}

export interface Built { path: string; data: Uint8Array | string }

/**
 * ไฟล์ทั้งหมดที่สร้างจากภาพในห้องวาด:
 *   foes  -> public/foes/<id>.png (เฟรมเรียงซ้ายไปขวา) + public/foes/index.json
 *   icons -> public/icons/<id>.png + public/icons/index.json ไอคอนของ (gear_<แบบ> ตาม art/gear.yaml) มีหกช่อง ช่องละวัสดุ
 *   props -> public/props/<id>.png + public/props/index.json
 *   wear  -> art/pieces/<meta.piece หรือ drawn/<id>>.yaml (ชิ้นของตัวละคร ใช้กับชุดเครื่องมือศิลป์เดิม)
 *   art/foe_people.yaml -> public/foes/<id>.png ของศัตรูทรงคน (ประกอบจากชิ้นส่วนของตัวละคร)
 * และภาพรวมไว้ดู art/preview/foes.png (ศัตรูทุกตัว ทุกท่า ขยายสองเท่า แถวละสี่ตัว) art/preview/gear.png (ของทุกแบบ ทุกวัสดุ
 * แถวละสองแบบ) และ art/preview/traits.png (ไอคอนสิ่งติดตัว แถวละสิบ)
 */
export function buildAll(): Built[] {
  const out: Built[] = [], p = palette();
  const index: Record<string, Record<string, unknown>> = { foes: {}, icons: {}, props: {} };
  const kit = listDrawings().some((r) => r.startsWith('wear/')) ? theKit() : null;
  const foes: Img[][] = [], gearCells = new Map<string, Img[]>(), traitCells = new Map<string, Img[]>();
  const refs = listDrawings();
  const gear = refs.some((r) => r.startsWith('icons/gear_')) ? gearTable() : null, traits = refs.some((r) => r.startsWith('icons/trait_')) ? traitTable() : null;
  for (const pt of Object.keys(gear?.patterns ?? {})) if (!refs.includes(`icons/gear_${pt}`)) fail(`art/${GEAR}: แบบ "${pt}" ยังไม่มีไอคอน art/icons/gear_${pt}.yaml`);
  for (const t of Object.keys(traits ?? {})) if (!refs.includes(`icons/trait_${t}`)) fail(`art/${TRAITS}: "${t}" ยังไม่มีไอคอน art/icons/trait_${t}.yaml`);
  for (const ref of refs) {
    const doc = readDrawing(ref), [dir, id] = ref.split('/') as [string, string];
    if (gear && dir === 'icons' && id.startsWith('gear_')) {
      if (!gear.patterns[id.slice(5)]) fail(`${ref}: ไม่มีแบบ "${id.slice(5)}" ใน art/${GEAR}`);
      let ex;
      try { ex = gearIcons(doc, gear); } catch (e) { return fail(`${ref}: ${(e as Error).message}`); }
      gearCells.set(id.slice(5), ex.frames);
      out.push({ path: `public/icons/${id}.png`, data: encodePNG(strip(ex.frames, ex.w, ex.h)) });
      index.icons![id] = { w: ex.w, h: ex.h, frames: Object.keys(gear.materials), ...(doc.meta.from ? { from: String(doc.meta.from) } : {}) };
      continue;
    }
    if (doc.kind === 'piece') {
      const body = String(doc.meta.body ?? 'm'), b = kit!.bodies[body] ?? fail(`${ref}: ไม่มีร่าง "${body}"`);
      const spec = pieceSpec(doc, { marks: b.marks, cols: b.cols as Record<string, number> | undefined });
      const text = YAML.stringify(spec, { lineWidth: 0 }).replace(/ascii: \|-?\n/g, 'ascii: |\n');
      out.push({ path: `art/pieces/${String(doc.meta.piece ?? `drawn/${id}`)}.yaml`, data: `# สร้างจาก art/${ref}.yaml ด้วย npm run draw -- build (แก้ที่ไฟล์นั้น อย่าแก้ไฟล์นี้)\n${text}` });
      continue;
    }
    const ex = exportFrames(doc, p);
    if (doc.kind === 'foe') foes.push(ex.frames);
    if (traits && dir === 'icons' && id.startsWith('trait_')) {
      if (!traits[id.slice(6)]) fail(`${ref}: ไม่มี "${id.slice(6)}" ใน art/${TRAITS}`);
      traitCells.set(id.slice(6), ex.frames);
    }
    out.push({ path: `public/${dir}/${id}.png`, data: encodePNG(strip(ex.frames, ex.w, ex.h)) });
    index[dir]![id] = {
      w: ex.w, h: ex.h, frames: doc.frames.map((f) => f.name),
      ...(doc.kind === 'foe' ? { lift: Number(doc.meta.lift ?? 0) } : {}),
      ...(doc.meta.from ? { from: String(doc.meta.from) } : {}),
    };
  }
  for (const person of peopleFoes()) {
    foes.push(person.frames);
    out.push({ path: `public/foes/${person.id}.png`, data: encodePNG(strip(person.frames, person.w, person.h)) });
    index.foes![person.id] = { w: person.w, h: person.h, frames: ['idle', 'strike'], lift: 0, kit: true };
  }
  if (foes.length) {
    const rows: Img[][] = [];
    for (let i = 0; i < foes.length; i += 4) rows.push(foes.slice(i, i + 4).flat());
    out.push({ path: 'art/preview/foes.png', data: encodePNG(sheet(rows, { scale: 2 })) });
  }
  if (gear && gearCells.size) {
    // เรียงตาม art/gear.yaml แถวละสองแบบ แบบละหกวัสดุ
    const cells = Object.keys(gear.patterns).map((pt) => gearCells.get(pt)!), rows: Img[][] = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2).flat());
    out.push({ path: 'art/preview/gear.png', data: encodePNG(sheet(rows, { scale: 2 })) });
  }
  if (traits && traitCells.size) {
    // เรียงตาม art/traits.yaml แถวละสิบ
    const cells = Object.keys(traits).flatMap((t) => traitCells.get(t)!), rows: Img[][] = [];
    for (let i = 0; i < cells.length; i += 10) rows.push(cells.slice(i, i + 10));
    out.push({ path: 'art/preview/traits.png', data: encodePNG(sheet(rows, { scale: 2 })) });
  }
  for (const [dir, items] of Object.entries(index)) if (Object.keys(items).length) out.push({ path: `public/${dir}/index.json`, data: `${JSON.stringify(items, null, 1)}\n` });
  return out;
}

/** ข้อความเทียบตรงตัว ภาพ PNG เทียบทีละพิกเซล (ไบต์ของไฟล์ขึ้นกับรุ่นของตัวบีบอัด จึงไม่ใช้ตัดสิน) */
function same(a: Uint8Array | string, b: Buffer): boolean {
  if (typeof a === 'string') return a === b.toString('utf8');
  if (Buffer.from(a).equals(b)) return true;
  try {
    const x = decodePNG(a), y = decodePNG(b);
    return x.w === y.w && x.h === y.h && Buffer.from(x.rgba.buffer, x.rgba.byteOffset, x.rgba.byteLength).equals(Buffer.from(y.rgba.buffer, y.rgba.byteOffset, y.rgba.byteLength));
  } catch { return false; }
}

/** ไฟล์ที่สร้างแล้วไม่ตรงกับที่อยู่บนดิสก์ (ว่าง = ทุกอย่างเป็นปัจจุบัน) */
export const staleFiles = (): string[] => buildAll().filter((b) => !existsSync(join(ROOT, b.path)) || !same(b.data, readFileSync(join(ROOT, b.path)))).map((b) => b.path);

export function writeBuilt(): string[] {
  const done: string[] = [];
  for (const b of buildAll()) {
    const p = join(ROOT, b.path);
    if (existsSync(p) && same(b.data, readFileSync(p))) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, b.data);
    done.push(b.path);
  }
  return done;
}

// ---------- ภาพขยายไว้ตรวจงาน ----------

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const PAPER = [242, 242, 249], PAPER2 = [228, 228, 238], LINE = [205, 205, 220], LINE8 = [150, 150, 175], TEXT = [70, 66, 100], MARK = [230, 60, 120];

function canvas(w: number, h: number, c = PAPER): Img {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba.set([c[0]!, c[1]!, c[2]!, 255], p * 4);
  return { w, h, rgba };
}
const dot = (im: Img, x: number, y: number, c: number[]) => { if (x >= 0 && y >= 0 && x < im.w && y < im.h) im.rgba.set([c[0]!, c[1]!, c[2]!, 255], (y * im.w + x) * 4); };
function number(im: Img, n: number, x: number, y: number, c = TEXT) {
  [...String(n)].forEach((d, i) => { const g = DIGITS[Number(d)]!; for (let p = 0; p < 15; p++) if (g[p] === '1') dot(im, x + i * 4 + (p % 3), y + ((p / 3) | 0), c); });
}

/** ภาพขยาย `zoom` เท่าพร้อมตารางพิกัด: เส้นทุกพิกเซล เส้นเข้มทุก 8 เลขกำกับที่ขอบ `under` = ภาพอ้างอิงจางๆ ใต้ที่ว่าง */
export function gridPanel(img: Img, zoom: number, opts: { under?: Img | null; marks?: [number, number][] } = {}): Img {
  const M = 14, out = canvas(M + img.w * zoom + 1, M + img.h * zoom + 1);
  const u = opts.under;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const p = (y * img.w + x) * 4;
    let c = (x + y) % 2 ? PAPER : PAPER2;
    if (img.rgba[p + 3]) c = [img.rgba[p]!, img.rgba[p + 1]!, img.rgba[p + 2]!];
    else if (u && x < u.w && y < u.h && u.rgba[(y * u.w + x) * 4 + 3]) { const q = (y * u.w + x) * 4; c = [0, 1, 2].map((k) => Math.round(u.rgba[q + k]! * 0.4 + PAPER[k]! * 0.6)); }
    for (let j = 0; j < zoom; j++) for (let i = 0; i < zoom; i++) dot(out, M + x * zoom + i, M + y * zoom + j, c);
  }
  const step = zoom >= 10 ? 4 : 8;
  for (let x = 0; x <= img.w; x++) {
    if (zoom >= 6 || x % 8 === 0) for (let j = 0; j <= img.h * zoom; j++) if (x % 8 === 0 || j % 2 === 0) dot(out, M + x * zoom, M + j, x % 8 === 0 ? LINE8 : LINE);
    if (x % step === 0 && x < img.w) number(out, x, M + x * zoom + 2, 3);
  }
  for (let y = 0; y <= img.h; y++) {
    if (zoom >= 6 || y % 8 === 0) for (let i = 0; i <= img.w * zoom; i++) if (y % 8 === 0 || i % 2 === 0) dot(out, M + i, M + y * zoom, y % 8 === 0 ? LINE8 : LINE);
    if (y % step === 0 && y < img.h) number(out, y, y >= 100 ? 0 : y >= 10 ? 3 : 7, M + y * zoom + 2);
  }
  for (const [x, y] of opts.marks ?? []) for (let i = 0; i < zoom; i++) { dot(out, M + x * zoom + i, M + y * zoom, MARK); dot(out, M + x * zoom + i, M + (y + 1) * zoom, MARK); dot(out, M + x * zoom, M + y * zoom + i, MARK); dot(out, M + (x + 1) * zoom, M + y * zoom + i, MARK); }
  return out;
}

function scaled(img: Img, s: number): Img {
  const out = { w: img.w * s, h: img.h * s, rgba: new Uint8ClampedArray(img.w * s * img.h * s * 4) };
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.rgba.set(img.rgba.subarray((((y / s) | 0) * img.w + ((x / s) | 0)) * 4, (((y / s) | 0) * img.w + ((x / s) | 0)) * 4 + 4), (y * out.w + x) * 4);
  return out;
}

let kitCache: ReturnType<typeof loadKit> | undefined;
const theKit = () => (kitCache ??= loadKit());

/** ร่างเปล่าใส่แค่ชุดชั้นใน: แบบรองใต้ผืนตอนวาดชิ้นสวม */
export const bareBody = (body = 'm'): Img => renderLook(theKit(), { body, pieces: ['face/basic', ...(UNDER[body] ?? fail(`ไม่มีร่าง "${body}"`))] });

/**
 * ตัวละครตัวอย่างบนร่าง `body` ใส่ชิ้นที่วาด (ไม่ส่ง doc = ตัวละครอย่างเดียว) ถ้าภาพบอกช่องของมันไว้ใน meta.piece
 * (เช่น weapon/long_sword) ของเดิมในช่องเดียวกันของตัวละครจะถูกถอดออกก่อน
 */
export function wearing(doc: Drawing | null, body = 'm', seed = 3): Img {
  const kit = theKit(), b = kit.bodies[body] ?? fail(`ไม่มีร่าง "${body}"`);
  const look = npcLook(kit, 'worker', seed, { body });
  if (!doc) return renderLook(kit, look);
  const slot = String(doc.meta.piece ?? '').split('/')[0];
  kit.pieces.__studio = pieceSpec(doc, { marks: b.marks, cols: b.cols as Record<string, number> | undefined });
  try { return renderLook(kit, { ...look, pieces: [...(look.pieces ?? []).filter((id) => !slot || !id.startsWith(`${slot}/`)), '__studio'] }); } finally { delete kit.pieces.__studio; }
}

let hero: Img | undefined;
/** ศัตรูยืนบนฉากจริงข้างตัวละคร ขนาดจริง (ตัวละครอยู่ซ้าย ศัตรูอยู่ขวาหันหน้าเข้าหา) */
export function onStage(foe: Img, opts: { scene?: string; time?: string; lift?: number } = {}): Img {
  const index = JSON.parse(readFileSync(join(ROOT, 'public/scenes/index.json'), 'utf8')) as { stand: Record<string, number> };
  const scene = opts.scene ?? 'ashland', stand = index.stand[scene] ?? fail(`ไม่มีฉาก "${scene}" (มี ${Object.keys(index.stand).join(' ')})`);
  const bg = decodePNG(readFileSync(join(ROOT, `public/scenes/${scene}_${opts.time ?? 'dusk'}.png`)));
  const out = { w: bg.w, h: bg.h, rgba: new Uint8ClampedArray(bg.rgba) };
  hero ??= wearing(null);
  blit(out, hero, 88 - 32, stand - 93);
  // แถวล่างสุดของภาพศัตรูคือเส้นขอบใต้เท้า อยู่ต่ำกว่าแถวยืนหนึ่งพิกเซลเหมือนตัวละคร
  blit(out, foe, Math.round(168 - foe.w / 2), stand + 2 - foe.h - (opts.lift ?? 0));
  return out;
}

/**
 * ภาพตรวจงานของภาพหนึ่งภาพ: ทุกเฟรมขยายพร้อมตารางพิกัด (มีภาพอ้างอิงจางๆ ข้างใต้และตัวเต็มอยู่ขวาสุดถ้าส่งมา)
 * แถวล่างเป็นขนาดจริงคูณสาม ศัตรูยืนบนฉากข้างตัวละคร ของอื่นวางบนพื้นสว่างกับพื้นมืด
 */
export function previewImage(doc: Drawing, opts: { ref?: Img | null; zoom?: number; scene?: string; time?: string; frame?: number; marks?: boolean } = {}): Img {
  const p = palette(), zoom = opts.zoom ?? Math.max(4, Math.min(16, Math.floor(900 / Math.max(1, doc.w * (doc.frames.length + (opts.ref ? 1 : 0))))));
  const which = opts.frame === undefined ? doc.frames.map((_, i) => i) : [opts.frame];
  // ชิ้นสวมบนตัวละคร: ถ้าไม่ได้ส่งภาพอ้างอิงมา ใช้ตัวละครเปล่าเป็นแบบรองใต้ผืน จะได้เห็นว่ามือกับลำตัวอยู่ตรงไหน
  const body = String(doc.meta.body ?? 'm'), fits = doc.kind === 'piece' && doc.w === 64 && doc.h === 96;
  const under = opts.ref ?? (fits ? bareBody(body) : null);
  const panels = which.map((i) => gridPanel(render(doc, p, { frame: i }), zoom, { under, marks: opts.marks ? strays(doc, i) : [] }));
  if (opts.ref) panels.push(gridPanel(opts.ref, zoom));
  const reals: Img[] = [];
  // ศัตรู: ทุกเฟรมตัดด้วยกรอบเดียวกันแบบที่เกมใช้ ท่าที่สองจึงยืนตรงที่เดียวกับท่าแรก
  if (doc.kind === 'foe') { const ex = exportFrames(doc, p); for (const i of which) reals.push(scaled(onStage(ex.frames[i]!, { scene: opts.scene, time: opts.time, lift: Number(doc.meta.lift ?? 0) }), 3)); }
  else if (fits) for (const b of body === 'm' ? ['m', 'f'] : [body]) reals.push(scaled(wearing(doc, b), 3));
  else for (const i of which) {
    const im = exportImage(doc, p, i);
    for (const bg of [PAPER, [40, 38, 58]]) { const c = canvas(im.w + 8, im.h + 8, bg); blit(c, im, 4, 4); reals.push(scaled(c, 3)); }
  }
  const G = 12, rowW = (r: Img[]) => r.reduce((s, im) => s + im.w + G, G), rowH = (r: Img[]) => Math.max(0, ...r.map((im) => im.h));
  const out = canvas(Math.max(rowW(panels), rowW(reals)), G + rowH(panels) + G + rowH(reals) + G);
  let x = G;
  for (const im of panels) { blit(out, im, x, G); x += im.w + G; }
  x = G;
  for (const im of reals) { blit(out, im, x, G + rowH(panels) + G); x += im.w + G; }
  return out;
}

export const savePNG = (path: string, img: Img) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, encodePNG(img)); };

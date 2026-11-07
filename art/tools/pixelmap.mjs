// อ่านไฟล์ตารางพิกเซล เปลี่ยนสีด้วย palette แล้วซ้อนชั้นเป็นภาพเดียว
// ไม่มี dependency ใช้แค่ Node รุ่น 18 ขึ้นไป
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const W = 64;
export const H = 96;

// ลำดับชั้นจากหลังไปหน้า ตามแผน (docs/PLAN.md หัวข้อระบบ sprite ซ้อนชั้น)
// ชั้นที่ 14 แสงตามระดับของ สร้างด้วยโค้ด ไม่มีไฟล์วาด
export const LAYERS = [
  'cloak_back',  // 1  ผ้าคลุม ชิ้นหลัง
  'race_back',   // 2  หาง ปีก
  'hair_back',   // 3  ผมด้านหลัง
  'body',        // 4  ร่างฐานและสีผิว
  'face',        // 5  หน้า: ตา ปาก คิ้ว
  'feet',        // 6  รองเท้า
  'torso',       // 7  ชุดลำตัวหรือเกราะ
  'offhand',     // 8  มือรอง: โล่ ตะเกียง
  'race_front',  // 9  หู เขา เครา
  'hair_front',  // 10 ผมด้านหน้า
  'head',        // 11 หมวก
  'cloak_front', // 12 ผ้าคลุม ชิ้นหน้า
  'mainhand',    // 13 อาวุธหลัก
];

// สีกุญแจ: หนึ่งตัวอักษรต่อหนึ่งพิกเซล
// [กลุ่มสี, ระดับ] ระดับ 0 คือมืดสุด
export const KEYS = {
  o: ['fixed', 'ink'],
  w: ['fixed', 'white'],
  q: ['skin', 0], r: ['skin', 1], s: ['skin', 2], t: ['skin', 3], p: ['skin', 4],
  g: ['hair', 0], h: ['hair', 1], i: ['hair', 2], j: ['hair', 3],
  e: ['eyes', 0], f: ['eyes', 1],
  a: ['m1', 0], b: ['m1', 1], c: ['m1', 2], d: ['m1', 3],
  k: ['m2', 0], l: ['m2', 1], m: ['m2', 2], n: ['m2', 3],
  u: ['m3', 0], v: ['m3', 1], x: ['m3', 2], y: ['m3', 3],
};

export function loadPalette(path) {
  const pal = JSON.parse(readFileSync(path, 'utf8'));
  const names = Object.keys(pal.colors);
  for (const group of ['skin', 'hair', 'eyes', 'materials']) {
    for (const [ramp, list] of Object.entries(pal[group])) {
      for (const name of list) {
        if (!(name in pal.colors)) throw new Error(`palette: ${group}.${ramp} ใช้สี "${name}" ที่ไม่มีใน colors`);
      }
    }
  }
  if (names.length > 64) throw new Error(`palette: มี ${names.length} สี เกินงบ`);
  return pal;
}

// ไฟล์ชั้น: ส่วนหัวเป็นบรรทัด key: value และคอมเมนต์ # จากนั้นบรรทัด --- แล้วตาราง 96 แถว แถวละ 64 ตัว
export function parseLayer(text, file = '?') {
  const lines = text.replace(/\r/g, '').split('\n');
  const sep = lines.indexOf('---');
  if (sep < 0) throw new Error(`${file}: ไม่มีบรรทัด ---`);
  const meta = { hides: [], defaults: {} };
  for (const raw of lines.slice(0, sep)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) throw new Error(`${file}: อ่านส่วนหัวไม่ออก "${line}"`);
    const [, key, value] = m;
    if (key === 'layer') meta.layer = value;
    else if (key === 'hides') meta.hides = value.split(/[,\s]+/).filter(Boolean);
    else if (key === 'm1' || key === 'm2' || key === 'm3') meta.defaults[key] = value;
    else throw new Error(`${file}: ไม่รู้จัก key "${key}"`);
  }
  if (!LAYERS.includes(meta.layer)) throw new Error(`${file}: layer "${meta.layer}" ไม่อยู่ในลำดับชั้น`);
  for (const h of meta.hides) {
    if (!LAYERS.includes(h)) throw new Error(`${file}: hides "${h}" ไม่อยู่ในลำดับชั้น`);
  }
  const rows = lines.slice(sep + 1);
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  if (rows.length !== H) throw new Error(`${file}: มี ${rows.length} แถว ต้องมี ${H}`);
  rows.forEach((row, y) => {
    if (row.length !== W) throw new Error(`${file}: แถว ${y} ยาว ${row.length} ต้องยาว ${W}`);
    for (const ch of row) {
      if (ch !== '.' && !(ch in KEYS)) throw new Error(`${file}: แถว ${y} มีตัวอักษร "${ch}" ที่ไม่ใช่สีกุญแจ`);
    }
  });
  return { ...meta, rows, file };
}

// ชิ้นของ 1 ชิ้นอาจมีหลายไฟล์ เช่น hair/short.back.txt กับ hair/short.front.txt
export function loadItem(srcDir, item) {
  const [slot, shape] = item.split('/');
  const dir = join(srcDir, slot);
  if (!existsSync(dir)) throw new Error(`ไม่มีโฟลเดอร์ ${dir}`);
  const files = readdirSync(dir).filter(f => f === `${shape}.txt` || (f.startsWith(`${shape}.`) && f.endsWith('.txt')));
  if (!files.length) throw new Error(`ไม่พบไฟล์ของ ${item}`);
  return files.map(f => parseLayer(readFileSync(join(dir, f), 'utf8'), join(slot, f)));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ภาพตัวละคร: look = { skin, hair, eyes } และแต่ละชิ้นมี m1 m2 m3 ของตัวเอง
// only: ถ้าใส่ชื่อชั้น จะวาดเฉพาะชั้นนั้น (ใช้ทำภาพแยกชั้น)
export function compose(palette, look, parts, only = null) {
  const layers = [];
  for (const part of parts) {
    for (const layer of part.layers) layers.push({ layer, mats: { ...layer.defaults, ...part.mats } });
  }
  const hidden = new Set(layers.flatMap(l => l.layer.hides));
  layers.sort((a, b) => LAYERS.indexOf(a.layer.layer) - LAYERS.indexOf(b.layer.layer));
  const out = new Uint8Array(W * H * 4);
  for (const { layer, mats } of layers) {
    if (hidden.has(layer.layer)) continue;
    if (only && layer.layer !== only) continue;
    const ramp = group => {
      if (group === 'skin' || group === 'hair' || group === 'eyes') {
        const r = palette[group][look[group]];
        if (!r) throw new Error(`${layer.file}: ไม่มี ${group} "${look[group]}" ใน palette`);
        return r;
      }
      const name = mats[group];
      const r = palette.materials[name];
      if (!r) throw new Error(`${layer.file}: ช่อง ${group} ยังไม่ได้เลือกวัสดุ หรือไม่มีวัสดุ "${name}"`);
      return r;
    };
    for (let y = 0; y < H; y++) {
      const row = layer.rows[y];
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const [group, idx] = KEYS[ch];
        const name = group === 'fixed' ? palette.fixed[idx] : ramp(group)[idx];
        if (!name) throw new Error(`${layer.file}: สีกุญแจ "${ch}" ไม่มีระดับ ${idx} ใน ${group}`);
        const [r, g, b] = hexToRgb(palette.colors[name]);
        const i = (y * W + x) * 4;
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
      }
    }
  }
  return out;
}

// ---- PNG ----
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- ภาพรวม ----
export class Sheet {
  constructor(w, h, bg) {
    this.w = w; this.h = h; this.px = new Uint8Array(w * h * 4);
    if (bg) this.rect(0, 0, w, h, bg);
  }
  rect(x0, y0, w, h, hex) {
    const [r, g, b] = hexToRgb(hex);
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + w); x++) {
        const i = (y * this.w + x) * 4;
        this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = 255;
      }
    }
  }
  // วางภาพขนาด W×H ขยาย k เท่าแบบพิกเซลคม
  blit(rgba, w, h, x0, y0, k = 1) {
    for (let y = 0; y < h * k; y++) {
      for (let x = 0; x < w * k; x++) {
        const s = ((Math.floor(y / k)) * w + Math.floor(x / k)) * 4;
        if (rgba[s + 3] === 0) continue;
        const dx = x0 + x, dy = y0 + y;
        if (dx < 0 || dy < 0 || dx >= this.w || dy >= this.h) continue;
        const d = (dy * this.w + dx) * 4;
        this.px[d] = rgba[s]; this.px[d + 1] = rgba[s + 1]; this.px[d + 2] = rgba[s + 2]; this.px[d + 3] = 255;
      }
    }
  }
  png() { return encodePNG(this.w, this.h, this.px); }
}

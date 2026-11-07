#!/usr/bin/env node
// ประกอบตัวละครตาม art/anchors.json แล้วเขียน PNG ลง art/preview/
// ใช้: node art/tools/preview.mjs
//
// ไฟล์ที่ได้
//   <id>.png       ภาพตั้งต้นขนาดจริง 64×96 พื้นโปร่งใส
//   anchors.png    ภาพตั้งต้นทั้งหมดเรียงกัน ขยาย 4 เท่า
//   layers.png     ภาพตั้งต้นตัวที่เลือก แยกทีละชั้นจากหลังไปหน้า แล้วตามด้วยภาพรวม
//   swaps.png      ชุดเดิม เปลี่ยนแค่ palette ผม และสีวัสดุ
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, H, LAYERS, loadPalette, loadItem, parseLayer, compose, encodePNG, Sheet } from './pixelmap.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ART, 'src');
const OUT = join(ART, 'preview');
const palette = loadPalette(join(ART, 'palette.json'));
const recipes = JSON.parse(readFileSync(join(ART, 'anchors.json'), 'utf8'));
const BG = recipes.background ?? '#f3ead8';
const GAP = 8;
mkdirSync(OUT, { recursive: true });

// ตรวจทุกไฟล์ใน art/src ก่อน แม้ชิ้นที่ภาพตั้งต้นไม่ได้ใช้
let checked = 0;
for (const slot of readdirSync(SRC)) {
  for (const f of readdirSync(join(SRC, slot)).filter(f => f.endsWith('.txt'))) {
    parseLayer(readFileSync(join(SRC, slot, f), 'utf8'), `${slot}/${f}`);
    checked++;
  }
}

const toParts = parts => parts.map(p => ({
  layers: loadItem(SRC, p.item),
  mats: Object.fromEntries(['m1', 'm2', 'm3'].filter(k => p[k]).map(k => [k, p[k]])),
}));

function grid(rows, scale) {
  const cols = Math.max(...rows.map(r => r.length));
  const sheet = new Sheet(GAP + cols * (W * scale + GAP), GAP + rows.length * (H * scale + GAP), BG);
  rows.forEach((row, j) => row.forEach((img, i) => {
    if (img) sheet.blit(img, W, H, GAP + i * (W * scale + GAP), GAP + j * (H * scale + GAP), scale);
  }));
  return sheet.png();
}

// ภาพตั้งต้น
const anchors = recipes.anchors.map(r => ({ r, parts: toParts(r.parts) }));
for (const a of anchors) {
  a.img = compose(palette, a.r.look, a.parts);
  writeFileSync(join(OUT, `${a.r.id}.png`), encodePNG(W, H, a.img));
}
writeFileSync(join(OUT, 'anchors.png'), grid([anchors.map(a => a.img)], 4));

// แยกชั้น: แต่ละช่องคือ 1 ชั้นตามลำดับ ชั้นที่ถูกซ่อนด้วย hides จะไม่แสดง
const pick = anchors.find(a => a.r.id === recipes.layers) ?? anchors[0];
const tiles = LAYERS
  .map(id => compose(palette, pick.r.look, pick.parts, id))
  .filter(img => img.some((v, i) => i % 4 === 3 && v > 0));
writeFileSync(join(OUT, 'layers.png'), grid([[...tiles, pick.img]], 2));

// สลับสี: from = ภาพตั้งต้น, look = สีผิว ผม ตา, swap = เปลี่ยนชิ้น, set = เปลี่ยนวัสดุของชิ้น
const swaps = (recipes.swaps ?? []).map(row => row.map(s => {
  const base = recipes.anchors.find(a => a.id === s.from);
  const parts = base.parts.map(p => {
    const item = s.swap?.[p.item] ?? p.item;
    return { ...p, item, ...(s.set?.[p.item] ?? {}) };
  });
  return compose(palette, { ...base.look, ...s.look }, toParts(parts));
}));
if (swaps.length) writeFileSync(join(OUT, 'swaps.png'), grid(swaps, 3));

console.log(`ตรวจ ${checked} ไฟล์ผ่าน`);
console.log(`เขียน ${anchors.length} ภาพตั้งต้น, layers.png ${tiles.length} ชั้น, swaps.png ${swaps.length} แถว ลง ${OUT}`);

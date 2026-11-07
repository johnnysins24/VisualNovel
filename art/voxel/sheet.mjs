// Lays sprites out on one image for review: rows of cells on the creator's pearl white, every sprite scaled up
// by the same whole number (nearest, so pixels stay square).
import { scale, usedRect, crop } from './render.mjs';

export const PEARL = [242, 242, 249, 255];   // Color(0.95, 0.95, 0.975), Voxel Realm's preview sheet

/** rows: arrays of { w, h, rgba } sprites (null leaves a cell empty). trim cuts every sprite to the box round
 *  what any of them drew (plus a pixel), keeping them aligned. Returns one image. */
export function sheet(rows, { k = 4, gap = 16, margin = 16, bg = PEARL, trim = false } = {}) {
  if (trim) {
    const all = rows.flat().filter(Boolean);
    const us = all.map(usedRect).filter(u => u.w);
    const x0 = Math.max(0, Math.min(...us.map(u => u.x)) - 1), y0 = Math.max(0, Math.min(...us.map(u => u.y)) - 1);
    const x1 = Math.max(...us.map(u => u.x + u.w)) + 1, y1 = Math.max(...us.map(u => u.y + u.h)) + 1;
    rows = rows.map(r => r.map(img => img && crop(img, Math.min(x1, img.w) - x0, Math.min(y1, img.h) - y0, x0, y0)));
  }
  const blank = { w: 1, h: 1, rgba: new Uint8ClampedArray(4) };
  const big = rows.map(r => r.map(img => scale(img ?? blank, k)));
  const cellW = Math.max(...big.flat().map(i => i.w));
  const rowH = big.map(r => Math.max(...r.map(i => i.h)));
  const cols = Math.max(...big.map(r => r.length));
  const W = margin * 2 + cols * cellW + (cols - 1) * gap;
  const H = margin * 2 + rowH.reduce((a, b) => a + b, 0) + (rows.length - 1) * gap;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set(bg, i * 4);
  let y0 = margin;
  big.forEach((r, ri) => {
    r.forEach((img, ci) => {
      const x0 = margin + ci * (cellW + gap) + ((cellW - img.w) >> 1);
      const yy = y0 + rowH[ri] - img.h;                    // bottoms line up
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
        const s = (y * img.w + x) * 4, a = img.rgba[s + 3] / 255;
        if (!a) continue;
        const d = ((yy + y) * W + x0 + x) * 4;
        for (let c = 0; c < 3; c++) out[d + c] = Math.round(img.rgba[s + c] * a + out[d + c] * (1 - a));
        out[d + 3] = 255;
      }
    });
    y0 += rowH[ri] + gap;
  });
  return { w: W, h: H, rgba: out };
}

// Contact sheets: scale sprites up and lay them out on a pearl background.
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.mjs';

export const PEARL = [242, 242, 249];

export { crop } from './pixels.mjs';

/**
 * rows: array of rows, each an array of images (null = empty cell). Each row may scale differently:
 * opts.scale (number or per-row array), opts.gap, opts.margin.
 */
export function sheet(rows, { scale = 4, gap = 16, margin = 16 } = {}) {
  const sc = r => (Array.isArray(scale) ? scale[r] : scale);
  const dims = rows.map((row, r) => ({
    w: row.reduce((s, im, i) => s + (im ? im.w : 0) * sc(r) + (i ? gap : 0), 0),
    h: Math.max(...row.map(im => (im ? im.h * sc(r) : 0))),
  }));
  const W = Math.max(...dims.map(d => d.w)) + margin * 2;
  const H = dims.reduce((s, d, i) => s + d.h + (i ? gap : 0), 0) + margin * 2;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) out.set([...PEARL, 255], p * 4);
  let y0 = margin;
  rows.forEach((row, r) => {
    let x0 = margin;
    const s = sc(r);
    for (const im of row) {
      if (im) {
        for (let j = 0; j < im.h * s; j++) for (let i = 0; i < im.w * s; i++) {
          const src = (((j / s) | 0) * im.w + ((i / s) | 0)) * 4;
          if (im.rgba[src + 3]) out.set(im.rgba.subarray(src, src + 4), ((y0 + j) * W + x0 + i) * 4);
        }
        x0 += im.w * s + gap;
      }
    }
    y0 += dims[r].h + gap;
  });
  return { w: W, h: H, rgba: out };
}

export const savePNG = (path, img) => writeFileSync(path, encodePNG(img));

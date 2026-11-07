import type { LayerDef, Palette } from './types';
import { CANVAS } from './types';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pure: stack layers by z and recolor by palette into an RGBA buffer. Testable without a canvas. */
export function rasterize(layers: LayerDef[], palette: Palette, w = CANVAS.w, h = CANVAS.h): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (const layer of [...layers].sort((a, b) => a.z - b.z)) {
    for (const rect of layer.rects) {
      const hex = palette[rect.role];
      if (!hex) throw new Error(`palette ไม่มี role "${rect.role}" (layer ${layer.id})`);
      const [R, G, B] = hexToRgb(hex);
      for (let y = Math.max(0, rect.y); y < Math.min(h, rect.y + rect.h); y++) {
        for (let x = Math.max(0, rect.x); x < Math.min(w, rect.x + rect.w); x++) {
          const i = (y * w + x) * 4;
          buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
        }
      }
    }
  }
  return buf;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Composited sprite as an offscreen canvas, cached by layer set + palette. */
export function composeCanvas(layers: LayerDef[], paletteName: string, palette: Palette): HTMLCanvasElement {
  const key = `${paletteName}|${layers.map((l) => l.id).sort().join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = CANVAS.w;
  c.height = CANVAS.h;
  const img = new ImageData(rasterize(layers, palette) as unknown as Uint8ClampedArray<ArrayBuffer>, CANVAS.w, CANVAS.h);
  c.getContext('2d')!.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

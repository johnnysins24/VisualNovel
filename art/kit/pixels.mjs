// Pixel work shared by the adopt tool (Node) and the drawing room (browser): snap a picture to our
// ramps, outline it, clear the flat ground shadow of free tiles, double it with clean diagonals.
// Pure code, no Node APIs. An image is { w, h, rgba } everywhere.
import { oklab } from './colour.mjs';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const hexRGB = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
export const toHex = (r, g, b) => [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

/**
 * The colours pictures may use: { outline, colours: [{ h, rgb, lab }] } from the sprite palette
 * (art/palette.yaml) and the scene palette (art/scenes/palette.yaml), both already parsed. Skin,
 * lips, blush, eyes and tears stay out: they belong to faces.
 */
export function paletteOf(sprite, scene) {
  const skip = /^(skin|lip|blush|eye|tear|lash|white)/;
  const hexes = new Set();
  for (const [k, ramp] of Object.entries(sprite.ramps)) if (!skip.test(k)) ramp.forEach(h => hexes.add(String(h)));
  for (const m of Object.values(scene.materials)) (m.ramp ?? []).forEach(h => hexes.add(String(h)));
  const outline = String(sprite.outline);
  hexes.delete(outline);
  return { outline, colours: [...hexes].map(h => ({ h, rgb: hexRGB(h), lab: oklab(h) })) };
}

function nearest(pal, rgb) {
  const L = oklab(toHex(...rgb));
  let best = pal.colours[0], bd = Infinity;
  for (const c of pal.colours) {
    // lightness counts double so shading steps survive the snap
    const d = 2 * (c.lab[0] - L[0]) ** 2 + (c.lab[1] - L[1]) ** 2 + (c.lab[2] - L[2]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.rgb;
}

const alphaAt = (img, x, y) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.rgba[(y * img.w + x) * 4 + 3]);

/** Snap colours, then outline: dark pixels on the silhouette edge and near-black inner lines. */
export function adoptPixels(img, pal) {
  const { w, h } = img, out = new Uint8ClampedArray(w * h * 4);
  const O = hexRGB(pal.outline), cache = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (img.rgba[i + 3] < 128) continue;
    const rgb = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
    const L = oklab(toHex(...rgb))[0];
    const edge = N4.some(([dx, dy]) => alphaAt(img, x + dx, y + dy) < 128);
    let c;
    if (L < 0.3 || (edge && L < 0.45)) c = O;
    else { const k = rgb.join(); c = cache.get(k) ?? nearest(pal, rgb); cache.set(k, c); }
    out.set([...c, 255], i);
  }
  // close the outline where the source had none (light pixels touching the outside)
  const res = { w, h, rgba: out };
  addOutline(res, O);
  return res;
}

/** Any filled pixel touching transparency that is not outline yet gets a 1 px outline outside it. */
export function addOutline(img, O) {
  const { w, h, rgba } = img, src = new Uint8ClampedArray(rgba);
  const isO = i => src[i] === O[0] && src[i + 1] === O[1] && src[i + 2] === O[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3]) continue;
    const touches = N4.some(([dx, dy]) => {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) return false;
      const j = (Y * w + X) * 4;
      return src[j + 3] && !isO(j);
    });
    if (touches) rgba.set([...O, 255], i);
  }
}

/**
 * Free tiles (Dungeon Crawl) carry a flat black ground shadow. Clear the black pixels that reach the
 * outside through other black pixels, but keep the 1 px black rim that touches colour: that rim is
 * the tile's own outline. Returns a new image.
 */
export function dropShadow(img) {
  const { w, h } = img, rgba = new Uint8ClampedArray(img.rgba), N = w * h;
  const isClear = i => rgba[i * 4 + 3] < 128;
  const isBlack = i => !isClear(i) && rgba[i * 4] < 12 && rgba[i * 4 + 1] < 12 && rgba[i * 4 + 2] < 12;
  const around = (i, f) => {
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) f(Y * w + X);
    }
  };
  const colourNear = i => { let hit = false; around(i, j => { if (!isClear(j) && !isBlack(j)) hit = true; }); return hit; };
  const seen = new Uint8Array(N), kill = new Uint8Array(N), q = [];
  const start = i => { if (!seen[i]) { seen[i] = 1; q.push(i); } };
  for (let i = 0; i < N; i++) if (isClear(i)) start(i);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (isBlack(y * w + x)) start(y * w + x);
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (isBlack(y * w + x)) start(y * w + x);
  while (q.length) {
    const i = q.pop();
    if (isBlack(i)) { if (colourNear(i)) continue; kill[i] = 1; }
    around(i, j => { if (isBlack(j)) start(j); });
  }
  for (let i = 0; i < N; i++) if (kill[i]) rgba[i * 4 + 3] = 0;
  return { w, h, rgba };
}

/** EPX (Scale2x): doubles a picture and keeps its diagonal edges clean. */
export function scale2x(img) {
  const { w, h, rgba } = img, out = new Uint8ClampedArray(w * 2 * h * 2 * 4);
  const px = (x, y) => {
    const i = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
    return ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
  };
  const put = (X, Y, v) => {
    const i = (Y * w * 2 + X) * 4;
    out[i] = v >>> 24; out[i + 1] = (v >>> 16) & 255; out[i + 2] = (v >>> 8) & 255; out[i + 3] = v & 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = px(x, y), A = px(x, y - 1), B = px(x + 1, y), C = px(x - 1, y), D = px(x, y + 1);
    put(x * 2, y * 2, C === A && C !== D && A !== B ? A : P);
    put(x * 2 + 1, y * 2, A === B && A !== C && B !== D ? B : P);
    put(x * 2, y * 2 + 1, D === C && D !== B && C !== A ? C : P);
    put(x * 2 + 1, y * 2 + 1, B === D && B !== A && D !== C ? D : P);
  }
  return { w: w * 2, h: h * 2, rgba: out };
}

/** Crop img to { x, y, w, h }; parts outside the picture come out empty. */
export function crop(img, { x, y, w, h }) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = y + j;
    if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
    rgba.set(img.rgba.subarray((Y * img.w + X) * 4, (Y * img.w + X) * 4 + 4), (j * w + i) * 4);
  }
  return { w, h, rgba };
}

/** The tight box of the opaque pixels (a 1 x 1 empty picture when there are none). */
export function trim(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!img.rgba[(y * img.w + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? { w: 1, h: 1, rgba: new Uint8ClampedArray(4) } : crop(img, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}

/** n empty pixels on every side. */
export const pad = (img, n = 1) => crop(img, { x: -n, y: -n, w: img.w + 2 * n, h: img.h + 2 * n });

/** Mirror left to right. */
export function flip(img) {
  const rgba = new Uint8ClampedArray(img.rgba.length);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    rgba.set(img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4), (y * img.w + img.w - 1 - x) * 4);
  }
  return { w: img.w, h: img.h, rgba };
}

/** Draw `im` onto `onto` with its top left corner at (x0, y0); only opaque pixels. */
export function blit(onto, im, x0, y0) {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const q = (y * im.w + x) * 4, X = x0 + x, Y = y0 + y;
    if (!im.rgba[q + 3] || X < 0 || Y < 0 || X >= onto.w || Y >= onto.h) continue;
    onto.rgba.set(im.rgba.subarray(q, q + 4), (Y * onto.w + X) * 4);
  }
  return onto;
}

/**
 * A free tile made ready for the game: ground shadow cleared, doubled when `big`, colours snapped to
 * our ramps, outlined in our outline colour, trimmed to its pixels.
 */
export function adoptTile(img, pal, { big = false, shadow = true } = {}) {
  const src = shadow ? dropShadow(img) : img;
  return trim(adoptPixels(pad(big ? scale2x(src) : src), pal));
}

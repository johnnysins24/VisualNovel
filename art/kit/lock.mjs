// Reads figures out of the locked reference sheets in docs/ref/style-lock/ (4x scale, pearl
// background, 16 px margin and gap) so builds can be checked against the locked look.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG } from './png.mjs';
import { ART } from './kit.mjs';
import { PEARL } from './sheet.mjs';

const DIR = join(ART, '../docs/ref/style-lock');
const cache = {};

function cell(file, x0, y0, w, h) {
  const img = (cache[file] ??= decodePNG(readFileSync(join(DIR, file))));
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = ((y0 + j * 4 + 1) * img.w + x0 + i * 4 + 1) * 4;
    if (img.rgba[s] === PEARL[0] && img.rgba[s + 1] === PEARL[1] && img.rgba[s + 2] === PEARL[2]) continue;
    rgba.set([img.rgba[s], img.rgba[s + 1], img.rgba[s + 2], 255], (j * w + i) * 4);
  }
  return { w, h, rgba };
}

/** Bare figure from bare.png: body "m" or "f" (64x96). */
export const lockBare = body => cell('bare.png', 16 + (body === 'm' ? 0 : 1) * (256 + 16), 16, 64, 96);

export const EXPRESSIONS = ['neutral', 'smile', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'shy', 'smug', 'hurt', 'sleepy', 'sleep', 'wink', 'ko', 'eat', 'focus'];
/** Head (top 32x22 of the 32x32 portrait) from expressions_<body>.png. */
export function lockFace(body, expr) {
  const i = EXPRESSIONS.indexOf(expr);
  if (i < 0) throw new Error(`no expression "${expr}"`);
  return cell(`expressions_${body}.png`, 16 + (i % 6) * (128 + 16), 16 + Math.floor(i / 6) * (128 + 16), 32, 22);
}
/** Where the 32x32 portrait sits on the 64x96 canvas. */
export const faceBox = body => ({ x: 16, y: body === 'm' ? 39 : 41, w: 32, h: 22 }); // head only: the portraits wear clothes below

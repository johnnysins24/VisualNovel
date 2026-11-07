#!/usr/bin/env node
// Renders one character sprite with the Voxel Realm studio.
//   node art/tools/voxel-render.mjs full '{"race":"human","body":1,"hs":4,"cls":"warrior"}' --expr smile --scale 4 --out out.png
// kind: full (the whole figure, 64 x 96), portrait (32 x 32 head and shoulders) or face (20 x 20 icon).
// The look uses Voxel Realm's appearance keys (race, body, skin, hs, hc, eye, om, ot, cls, outfit, acc, ...);
// outfit {"bare": true} leaves only the underwear, outfit {"body": "coat"} swaps one slot's piece.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fullBody, portrait, faceIcon } from '../voxel/sprite.mjs';
import { scale } from '../voxel/render.mjs';
import { encodePNG } from '../voxel/png.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const [kind = 'full', lookArg = '{}'] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const look = JSON.parse(existsSync(lookArg) ? readFileSync(lookArg, 'utf8') : lookArg);
const expr = opt('expr', kind === 'face' ? '' : 'smile');
const k = Number(opt('scale', 4));
const out = opt('out', `${kind}.png`);
const img = kind === 'portrait' ? portrait(look, { expr }) : kind === 'face' ? faceIcon(look, expr) : fullBody(look, { expr });
writeFileSync(out, encodePNG(k > 1 ? scale(img, k) : img));
console.log(`${out}: ${img.w} x ${img.h} art pixels at ${k}x`);

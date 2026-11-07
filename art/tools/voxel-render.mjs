#!/usr/bin/env node
// Renders one character sprite with the Voxel Realm studio.
//   node art/tools/voxel-render.mjs full '{"race":"human","body":1,"hs":4,"cls":"warrior"}' --expr smile --scale 4 --out out.png
// kind: full (the whole figure, 64 x 96), portrait (32 x 32 head and shoulders) or face (20 x 20 icon).
// The look uses Voxel Realm's appearance keys (race, body, skin, hs, hc, eye, om, ot, cls, outfit, acc, ...);
// outfit {"bare": true} leaves only the underwear, outfit {"body": "coat"} swaps one slot's piece.
// Sprites use the game's body (3.25 heads tall); --vn 3 draws it 3 heads tall instead, --voxel-realm draws Voxel
// Realm's own body.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fullBody, portrait, faceIcon } from '../voxel/sprite.mjs';
import { scale } from '../voxel/render.mjs';
import { encodePNG } from '../voxel/png.mjs';
import { VOXEL_REALM } from '../voxel/body.mjs';
import { vnStyle, GAME_BODY } from '../voxel/vn.mjs';

const args = process.argv.slice(2);
const VALUED = ['--expr', '--scale', '--out', '--vn'];          // options followed by a value
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const [kind = 'full', lookArg = '{}'] = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const look = JSON.parse(existsSync(lookArg) ? readFileSync(lookArg, 'utf8') : lookArg);
const expr = opt('expr', kind === 'face' ? '' : 'smile');
const k = Number(opt('scale', 4));
const out = opt('out', `${kind}.png`);
const style = args.includes('--voxel-realm') ? VOXEL_REALM : opt('vn') ? vnStyle(Number(opt('vn'))) : GAME_BODY;
const img = kind === 'portrait' ? portrait(look, { expr, style }) : kind === 'face' ? faceIcon(look, expr, { style }) : fullBody(look, { expr, style });
writeFileSync(out, encodePNG(k > 1 ? scale(img, k) : img));
console.log(`${out}: ${img.w} x ${img.h} art pixels at ${k}x`);

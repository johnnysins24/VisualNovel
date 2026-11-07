#!/usr/bin/env node
// Writes the review images in art/preview/voxel/, all on the game's body (vn.mjs GAME_BODY) but body_compare.png
// and match.png.
//   node art/tools/voxel-preview.mjs [/path/to/voxel/client/assets/ui/creator]
// With Voxel Realm's creator folder it also writes match.png: its baked sprites on top, this port's below.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fullBody, portrait, faceIcon } from '../voxel/sprite.mjs';
import { VOXEL_REALM } from '../voxel/body.mjs';
import { sheet } from '../voxel/sheet.mjs';
import { encodePNG, decodePNG } from '../voxel/png.mjs';
import { fromDict } from '../voxel/appearance.mjs';
import { EXPRESSIONS } from '../voxel/head.mjs';
import { piecesFor, slotOf, SLOTS } from '../voxel/outfits.mjs';

const OUT = fileURLToPath(new URL('../preview/voxel/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const save = (name, img) => { writeFileSync(OUT + name, encodePNG(img)); console.log('art/preview/voxel/' + name, `${img.w} x ${img.h}`); };

// the race portraits' looks, with nothing on but the underwear
export const BARE = {
  m: { race: 'human', body: 0, skin: 1, hs: 0, hc: 3, eye: 0, om: 0, ot: 4, cls: 'villager', outfit: { bare: true } },
  f: { race: 'human', body: 1, skin: 1, hs: 4, hc: 3, eye: 0, om: 0, ot: 4, cls: 'villager_f', outfit: { bare: true } },
};
save('bare.png', sheet([[fullBody(BARE.m), fullBody(BARE.f)]]));

// the 17 expressions (CharModels.EXPRESSIONS) on the race portraits, in Voxel Realm's order
const dressed = b => ({ ...BARE[b], outfit: {} });
const grid = (list, cols) => Array.from({ length: Math.ceil(list.length / cols) }, (_, i) => list.slice(i * cols, i * cols + cols));
for (const b of ['m', 'f']) save(`expressions_${b}.png`, sheet(grid(Object.keys(EXPRESSIONS).map(e => portrait(dressed(b), { expr: e })), 6)));

// a class's starter outfit put on one piece at a time: each piece is its own voxel layer on the same body
const steps = (d, cls) => {
  const a = fromDict({ ...d, cls, outfit: {} });
  const pieces = piecesFor(a);
  const out = [fullBody({ ...d, cls, outfit: { bare: true } })];
  for (let i = 1; i <= pieces.length; i++) {
    const on = new Set(pieces.slice(0, i).map(slotOf));
    out.push(fullBody({ ...d, cls, outfit: Object.fromEntries(SLOTS.filter(s => !on.has(s)).map(s => [s, ''])) }));
  }
  return out;
};
save('steps_warrior.png', sheet([steps(BARE.f, 'warrior'), steps(BARE.m, 'warrior')], { trim: true }));
save('steps_sorcerer.png', sheet([steps(BARE.f, 'sorcerer'), steps(BARE.m, 'sorcerer')], { trim: true }));

// every class's starter outfit on both bodies
const CLS = ['warrior', 'sorcerer', 'ranger', 'cleric', 'rogue', 'bard'];
save('classes.png', sheet(['m', 'f'].map(b => CLS.map(c => fullBody({ ...BARE[b], cls: c, outfit: {} }))), { trim: true }));

// Voxel Realm's own body on the left, the game's on the right, at the same zoom on the same floor: bare on top,
// dressed below. The head is the same size; the body is shorter and reworked.
const wear = (b, cls) => ({ ...BARE[b], cls, outfit: {} });
const both = looks => [...looks.map(d => fullBody(d, { style: VOXEL_REALM })), null, ...looks.map(d => fullBody(d))];
save('body_compare.png', sheet([both([BARE.m, BARE.f]), both([wear('m', 'warrior'), wear('f', 'cleric')])], { trim: true }));

const dir = process.argv[2];
if (dir && existsSync(dir)) {
  const down = file => {                       // the baked sprites are saved at 4x
    const big = decodePNG(readFileSync(`${dir}/${file}.png`)), n = big.w / 4;
    const rgba = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) rgba.set(big.rgba.subarray((y * 4 * big.w + x * 4) * 4, (y * 4 * big.w + x * 4) * 4 + 4), (y * n + x) * 4);
    return { w: n, h: n, rgba };
  };
  const look = f => ({ race: 'human', body: f, skin: 1, hs: f ? 4 : 0, hc: 3, eye: 0, om: 0, ot: 4, cls: f ? 'villager_f' : 'villager' });
  const face = { race: 'human', body: 1, skin: 1, hs: 5, hc: 3, eye: 0, cls: 'villager_f' };
  const exprs = ['smile', 'angry', 'surprised', 'cry'];
  save('match.png', sheet([
    [down('race_human_m'), down('race_human_f'), ...exprs.map(e => down('face_' + e))],
    [portrait(look(0), { style: VOXEL_REALM }), portrait(look(1), { style: VOXEL_REALM }), ...exprs.map(e => faceIcon(face, e, { style: VOXEL_REALM }))],
  ]));
}

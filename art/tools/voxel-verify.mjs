#!/usr/bin/env node
// Checks the port against the sprites Voxel Realm itself baked (client/assets/ui/creator in the Voxel Realm repo):
// the human race portraits, the 17 face icons and the origin portraits that use only the built-in outfit pieces,
// all drawn on Voxel Realm's own body (VOXEL_REALM), not the game's.
//   node art/tools/voxel-verify.mjs /path/to/voxel/client/assets/ui/creator
// A pixel counts as exact when every channel matches; GPUs round the last bit of the lighting differently, so a
// difference of 1 or 2 levels is normal. Shape differences (a pixel there in one and not the other) or larger
// colour differences mean the port is wrong.
import { readFileSync, existsSync } from 'node:fs';
import { portrait, faceIcon } from '../voxel/sprite.mjs';
import { VOXEL_REALM as style } from '../voxel/body.mjs';
import { EXPRESSIONS } from '../voxel/head.mjs';
import { decodePNG } from '../voxel/png.mjs';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('usage: voxel-verify.mjs <Voxel Realm client/assets/ui/creator>'); process.exit(2); }

// creator_icon_bake.gd: RACE_LOOKS["human"], the face look, and the origin looks without gear pieces or pixel touches
const RACE = [{ skin: 1, hs: 0, hc: 3, eye: 0, om: 0, ot: 4 }, { skin: 1, hs: 4, hc: 3, eye: 0, om: 0, ot: 4 }];
const FACE = { race: 'human', body: 1, skin: 1, hs: 5, hc: 3, eye: 0, cls: 'villager_f' };
const ORIGINS = {
  noble: { cls: 'sorcerer', om: 3, ot: 6, skin: 0, eye: 0, expr: 'smug', m: { hs: 13, hc: 1 }, f: { hs: 16, hc: 1 } },
  bastard_heir: { cls: 'rogue', om: 5, ot: 1, skin: 2, eye: 2, expr: 'smug', out: { body: 'coat', neck: 'collar_high' }, m: { hs: 12, hc: 4 }, f: { hs: 15, hc: 4, fm: 5 } },
  commoner: { cls: 'villager', om: 0, ot: 4, skin: 2, eye: 2, expr: 'happy', acc: ['cap'], m: { hs: 0, hc: 3 }, f: { hs: 4, hc: 2 } },
  peasant: { cls: 'villager', om: 8, ot: 4, skin: 2, eye: 1, fm: 1, expr: 'smile', acc: ['hat_straw'], m: { hs: 7, hc: 2 }, f: { hs: 6, hc: 1 } },
  servant: { cls: 'villager', om: 5, ot: 4, skin: 1, eye: 6, expr: '', out: { neck: 'collar_high' }, m: { hs: 13, hc: 5 } },
  guildborn: { cls: 'villager', om: 6, ot: 8, skin: 1, eye: 1, fm: 1, expr: 'focus', acc: ['glasses_thick'], out: { body: 'tunic', over: 'vest_leather', arms: 'wraps' }, m: { hs: 9, hc: 2 }, f: { hs: 18, hc: 2 } },
  clergy: { cls: 'cleric', om: 4, ot: 6, skin: 3, eye: 2, expr: 'smile', m: { hs: 0, hc: 4 }, f: { hs: 17, hc: 4, acc: ['veil'] } },
  orphan: { cls: 'villager', om: 7, ot: 1, skin: 1, eye: 0, fm: 1, expr: 'shy', head: 1.06, out: { over: '', waist: '', neck: 'scarf' }, m: { hs: 7, hc: 3 }, f: { hs: 3, hc: 3 } },
  disgraced: { cls: 'warrior', om: 1, ot: 6, skin: 0, eye: 0, fm: 2, expr: 'sad', m: { hs: 13, hc: 11 }, f: { hs: 2, hc: 11 } },
  hostage: { cls: 'sorcerer', om: 7, ot: 6, skin: 4, eye: 6, expr: '', out: { shoulders: '' }, m: { hs: 13, hc: 5 }, f: { hs: 16, hc: 5 } },
};

const jobs = [];
RACE.forEach((l, f) => jobs.push({ file: `race_human_${f ? 'f' : 'm'}`, img: () => portrait({ ...l, race: 'human', body: f, cls: f ? 'villager_f' : 'villager' }, { expr: 'smile', style }) }));
for (const e of Object.keys(EXPRESSIONS)) jobs.push({ file: `face_${e || 'neutral'}`, img: () => faceIcon(FACE, e, { style }) });
for (const [id, L] of Object.entries(ORIGINS)) for (const f of [0, 1]) {
  const fr = L[f ? 'f' : 'm'];
  if (!fr) continue;
  const d = { race: 'human', body: f, skin: L.skin, eye: L.eye, om: L.om, ot: L.ot, fm: L.fm ?? 0, cls: L.cls, head: L.head ?? 1, acc: [...(L.acc ?? [])], outfit: { ...(L.out ?? {}) } };
  for (const k in fr) { if (k === 'acc') d.acc.push(...fr.acc); else d[k] = fr[k]; }
  jobs.push({ file: `origin_${id}_${f ? 'f' : 'm'}`, badge: true, img: () => portrait(d, { expr: L.expr, style }) });
}

const T = { pixels: 0, exact: 0, close: 0, off: 0, shape: 0 };
let failed = 0;
for (const j of jobs) {
  const path = `${dir}/${j.file}.png`;
  if (!existsSync(path)) { console.log(`${j.file}: no reference, skipped`); continue; }
  const mine = j.img(), ref = decodePNG(readFileSync(path));
  const k = ref.w / mine.w, n = mine.w;
  const c = { exact: 0, close: 0, off: 0, shape: 0 };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (j.badge && x < 12 && y < 12) continue;              // the origin's corner badge is stamped on afterwards
    const a = (y * n + x) * 4, b = (y * k * ref.w + x * k) * 4;
    const A = mine.rgba, B = ref.rgba;
    T.pixels++;
    const sa = A[a + 3] > 127, sb = B[b + 3] > 127;
    if (sa !== sb) { c.shape++; continue; }
    if (!sa) { c.exact++; continue; }
    const d = Math.max(Math.abs(A[a] - B[b]), Math.abs(A[a + 1] - B[b + 1]), Math.abs(A[a + 2] - B[b + 2]));
    if (!d) c.exact++; else if (d <= 2) c.close++; else c.off++;
  }
  for (const key in c) T[key] += c[key];
  if (c.shape || c.off) { failed++; console.log(`${j.file}: ${c.shape} shape and ${c.off} colour differences`); }
}
console.log(`${jobs.length} sprites, ${T.pixels} pixels: ${(100 * T.exact / T.pixels).toFixed(2)}% exact, ` +
  `${T.close} within 2 levels, ${T.off} off, ${T.shape} shape differences`);
process.exit(failed ? 1 : 0);

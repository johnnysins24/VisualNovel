// Outfit pieces painted onto a body, ported from Voxel Realm (char_outfits.gd). A piece never carries a body
// shape of its own: it wraps cloth round whatever body is underneath (Body.shell) or places armour and cloth
// from the body's landmarks (Body.S), so every piece fits every frame, build and race. Each piece fills one
// slot; a later item can replace the starter piece in that slot.
import { round, lerp, v3, vsub, vscale, vmulv } from './gd.mjs';
import { getRace } from './appearance.mjs';
import {
  HIPS, TORSO, ARM_L, ARM_R, SHIN_L, SHIN_R, LEGS, M_HIPS, M_TORSO, M_ARMS, M_FORE, M_THIGH, M_SHIN, M_ALL,
  OX, OZ, GX, GZ, idx, cap, ell, loft,
} from './body.mjs';
import { MAIN, MAIN_DK, TRIM, LEATHER, METAL, METAL_DK, BOOT, BELT, GOLD, CLOTH_W, DARK } from './pal.mjs';

export const SLOTS = ['legs', 'feet', 'body', 'over', 'waist', 'shoulders', 'arms', 'hands', 'back', 'neck'];

export const PIECES = {
  pants_dark: 'legs', pants_main: 'legs', pants_linen: 'legs', leggings: 'legs',
  boots_plate: 'feet', boots_tall: 'feet', boots_cuffed: 'feet', boots_soft: 'feet', shoes: 'feet',
  gambeson: 'body', coat: 'body', tunic: 'body', robe: 'body', bodysuit: 'body', shirt_linen: 'body',
  cuirass: 'over', vest_leather: 'over', vest_village: 'over', bodice: 'over',
  tabard: 'waist', coat_tails: 'waist', robe_skirt: 'waist', skirt_long: 'waist', apron: 'waist', belts_cross: 'waist',
  pauldrons: 'shoulders', capelet: 'shoulders', shoulder_guard: 'shoulders',
  vambraces: 'arms', bracers: 'arms', wraps: 'arms',
  gauntlets: 'hands', gloves_dark: 'hands',
  cloak: 'back', quiver: 'back',
  stole: 'neck', scarf: 'neck', collar_high: 'neck', hood_down: 'neck',
};

export const STARTER = {
  warrior: ['pants_dark', 'boots_plate', 'gambeson', 'cuirass', 'tabard', 'pauldrons', 'vambraces', 'gauntlets'],
  sorcerer: ['pants_main', 'boots_tall', 'coat', 'coat_tails', 'capelet', 'collar_high'],
  ranger: ['pants_main', 'boots_cuffed', 'tunic', 'vest_leather', 'bracers', 'cloak', 'hood_down', 'quiver'],
  cleric: ['pants_linen', 'shoes', 'robe', 'robe_skirt', 'stole'],
  rogue: ['bodysuit', 'boots_soft', 'belts_cross', 'wraps', 'gloves_dark', 'shoulder_guard', 'scarf'],
  bard: ['pants_main', 'boots_cuffed', 'shirt_linen', 'vest_leather', 'coat_tails', 'capelet', 'scarf'],
  villager: ['pants_main', 'shoes', 'shirt_linen', 'vest_village', 'apron'],
  villager_f: ['leggings', 'shoes', 'shirt_linen', 'bodice', 'skirt_long', 'apron'],
};

export const slotOf = id => PIECES[id] ?? '';

/** The class starter set with any equipped pieces swapped in by slot, inner slots first. */
export function piecesFor(a) {
  if (a.outfit.bare) return [];
  let key = a.cls;
  if (key === 'villager' && a.body === 1) key = 'villager_f';
  let list = [...(STARTER[key] ?? STARTER.warrior)];
  for (const slot in a.outfit) {
    if (!SLOTS.includes(slot)) continue;
    const id = a.outfit[slot];
    list = list.filter(x => slotOf(x) !== slot);
    if (id !== '' && slotOf(id) !== '') list.push(id);
  }
  if (getRace(a.race).barefoot) list = list.filter(x => slotOf(x) !== 'feet');
  // GDScript's sort_custom is not stable; slots never repeat in a list, so the order is the same
  list.sort((x, y) => SLOTS.indexOf(slotOf(x)) - SLOTS.indexOf(slotOf(y)));
  return list;
}

export function dress(B, a) {
  for (const id of piecesFor(a)) paintPiece(B, id);
}

// ------------------------------------------------------------------ helpers

const handY = B => B.S.sh - B.S.upper - B.S.fore;
const wristY = B => handY(B) + 2.4;

/** A cloth panel hanging at the front (or back) between x0 and x1: hugs the body down to hugTo, then falls straight. */
function panel(B, back, x0, x1, y0, y1, id, hugTo, tatter = false, out = 1) {
  const hip = B.S.hip;
  const fallZ = {};
  for (let x = x0; x <= x1; x++) {
    let zf = back ? -99 : 99;
    for (let y = Math.trunc(hugTo); y <= y1; y++) {
      const z = back ? B.back(x, y) : B.front(x, y);
      if (back && z !== -99) zf = Math.max(zf, z);
      else if (!back && z !== 99) zf = Math.min(zf, z);
    }
    fallZ[x] = zf;
  }
  for (let x = x0; x <= x1; x++) {
    let bottom = y0;
    if (tatter) bottom = y0 + Math.trunc(Math.abs(Math.sin(x * 2.1)) * 2.2);
    for (let y = bottom; y <= y1; y++) {
      let z;
      if (y >= hugTo) {
        z = back ? B.back(x, y) : B.front(x, y);
        if (Math.abs(z) === 99) continue;
      } else z = fallZ[x];
      const zz = back ? z + out : z - out;
      B.box(x, y, zz, x, y, zz, id, y + 0.5 >= hip ? TORSO : HIPS);
    }
  }
}

/** Hollow ellipsoid shell t voxels thick (pauldrons, cuffs). */
const shellEll = (B, c, r, t, id, owner, f = null) => B.paint(ell(owner, c, r), id, owner, false, f, t);

/** A belt: a band round the waist with a buckle at the front. */
function belt(B, y, id, buckle = GOLD, t = 0.7) {
  B.shell(M_HIPS | M_TORSO, y, y + 1.0, t, id);
  const z = B.front(0, y);
  if (z !== 99) B.box(-1, y, z - 1, 1, y, z - 1, buckle, y < Math.trunc(B.S.hip) ? HIPS : TORSO);
}

/** Skirt or robe: hollow A-line cone from the waist down to hem, owned by the legs. */
function skirt(B, top, hem, flare, id, trim = -1) {
  const S = B.S;
  const hipw = S.pelvis[1][1], hipd = S.pelvis[1][2];
  const keys = [[hem, hipw + flare, hipd + flare * 0.8, 0.3],
    [lerp(hem, top, 0.55), hipw + flare * 0.45 + 0.6, hipd + flare * 0.35 + 0.6, 0.35],
    [top, hipw + 0.8, hipd + 0.8, 0.3]];
  const pr = loft(HIPS, keys, 2.2);
  B.paint(pr, id, LEGS, false, null, 1.3);
  if (trim >= 0) B.paint(pr, trim, LEGS, false, (x, y) => y <= Math.trunc(hem), 1.3);
}

/** Cloth near the shoulders that lies over an arm goes to that arm. */
function ownByArm(B, y0, y1, xin) {
  for (let y = Math.trunc(y0); y <= Math.trunc(y1); y++)
    for (let z = -OZ; z < GZ - OZ; z++)
      for (let x = -OX; x < GX - OX; x++) {
        if (Math.abs(x) < xin || B.g(x, y, z) === 0) continue;
        if (B.owner(x, y, z) === TORSO) B.own[idx(x, y, z)] = x < 0 ? ARM_L : ARM_R;
      }
}

// ------------------------------------------------------------------ pieces

export function paintPiece(B, id) {
  const S = B.S;
  const { fem, hip, sock, waist, chest, sh, shx, knee, neck } = S;
  const wrist = wristY(B);
  const hy = handY(B);
  const ti = Math.trunc;
  switch (id) {
    // ---------------------------------------------------------- legs
    case 'pants_dark': case 'pants_main': case 'pants_linen': case 'leggings': {
      const c = { pants_dark: DARK, pants_main: MAIN_DK, pants_linen: CLOTH_W, leggings: MAIN_DK }[id];
      B.shell(M_HIPS | M_THIGH | M_SHIN | M_TORSO, 2.0, hip + 1.0, 0.0, c);
      break;
    }
    // ---------------------------------------------------------- feet
    case 'boots_plate':
      B.shell(M_SHIN, 0.0, knee - 1.0, 1.0, METAL_DK);
      B.shell(M_SHIN, 0.0, 1.0, 1.0, BOOT);
      for (const sx of [-1, 1]) {
        const x = round(sx * S.hipx);
        shellEll(B, v3(x, knee + 0.3, -1.4), v3(2.4, 2.0, 1.6), 1.0, METAL, sx < 0 ? SHIN_L : SHIN_R);
        B.tint(x - 3, ti(knee) - 4, -9, x + 3, ti(knee) - 4, 9, METAL, METAL_DK);
      }
      break;
    case 'boots_tall':
      B.shell(M_SHIN, 0.0, knee - 0.5, 1.0, BOOT);
      B.shell(M_SHIN, knee - 1.5, knee - 0.5, 1.0, TRIM);
      break;
    case 'boots_cuffed':
      B.shell(M_SHIN, 0.0, knee - 3.5, 1.0, BOOT);
      B.shell(M_SHIN, knee - 4.5, knee - 3.0, 1.0, LEATHER);
      B.shell(M_SHIN, 0.0, 0.9, 1.0, BELT);
      break;
    case 'boots_soft':
      B.shell(M_SHIN, 0.0, knee - 2.0, 0.0, BOOT);
      for (const y of [ti(knee) - 4, ti(knee) - 7]) B.shell(M_SHIN, y, y + 0.9, 1.0, BELT);
      break;
    case 'shoes':
      B.shell(M_SHIN, 0.0, 2.5, 0.0, BOOT);
      B.shell(M_SHIN, 0.0, 0.9, 1.0, BOOT);
      break;
    // ---------------------------------------------------------- body
    case 'gambeson':
      B.shell(M_ARMS | M_FORE, wrist, sh + 2.0, 0.0, MAIN_DK);
      B.shell(M_TORSO | M_HIPS, hip - 2.5, sh + 2.0, 1.0, MAIN_DK);
      B.shell(M_FORE, wrist, wrist + 1.0, 1.0, MAIN);
      break;
    case 'coat':
      B.shell(M_ARMS | M_FORE, wrist, sh + 2.0, 0.0, MAIN);
      B.shell(M_TORSO | M_HIPS, hip - 3.0, sh + 2.0, 1.0, MAIN);
      B.shell(M_FORE, wrist - 1.5, wrist + 3.0, 1.0, MAIN);
      B.shell(M_FORE, wrist - 1.5, wrist + 1.0, 1.0, MAIN);
      B.shell(M_FORE, wrist - 1.5, wrist - 0.5, 0.0, TRIM);
      for (let y = ti(hip) - 2; y < ti(sh) - 1; y++) {
        const z = B.front(0, y);
        if (z !== 99) B.s(0, y, z, TRIM);
      }
      for (const y of [ti(waist) - 1, ti(waist) + 2, ti(chest) + 1]) {
        const z = B.front(0, y);
        if (z !== 99) B.s(0, y, z - 1, GOLD, y >= ti(hip) ? TORSO : HIPS);
      }
      belt(B, ti(waist) - 2, MAIN_DK, GOLD);
      break;
    case 'tunic':
      B.shell(M_TORSO | M_ARMS | M_FORE | M_HIPS | M_THIGH, sock - 3.0, sh + 2.0, 0.0, MAIN, (x, y) => y + 0.5 >= wrist + 2.0 || y + 0.5 < sh - 8.0);
      B.shell(M_HIPS | M_THIGH, sock - 3.0, hip - 1.0, 1.0, MAIN);
      B.shell(M_HIPS | M_THIGH, sock - 3.0, sock - 2.0, 0.0, MAIN_DK);
      belt(B, ti(hip) - 1, BELT, GOLD);
      break;
    case 'robe':
      B.shell(M_TORSO | M_ARMS | M_FORE | M_HIPS, hip - 3.0, sh + 2.0, 0.0, CLOTH_W, (x, y) => y + 0.5 >= wrist - 1.0 || y + 0.5 > hip - 4.0);
      B.shell(M_FORE, wrist - 2.0, wrist + 2.0, 1.0, CLOTH_W);
      B.shell(M_FORE, wrist - 2.0, wrist - 1.0, 0.0, MAIN);
      belt(B, ti(waist) - 1, TRIM, GOLD, 0.9);
      break;
    case 'bodysuit':
      B.shell(M_ALL, 2.0, sh + 2.0, 0.0, DARK, (x, y) => y + 0.5 >= wrist || y + 0.5 > hip - 4.0 || y + 0.5 < sh - 6.0);
      break;
    case 'shirt_linen':
      B.shell(M_TORSO | M_ARMS | M_FORE | M_HIPS, hip - 2.0, sh + 2.0, 0.0, CLOTH_W, (x, y) => y + 0.5 > wrist + 4.0 || y + 0.5 > hip - 3.0);
      B.shell(M_FORE, wrist + 3.5, wrist + 5.0, 1.0, CLOTH_W);
      break;
    // ---------------------------------------------------------- over
    case 'cuirass':
      B.shell(M_TORSO, waist - 1.5, sh - 0.5, 1.0, METAL);
      B.shell(M_TORSO, waist - 1.5, waist - 0.5, 0.0, METAL_DK);
      B.shell(M_TORSO, sh - 1.5, sh + 1.5, 1.0, METAL_DK, x => Math.abs(x) <= ti(S.neck_r) + 3);
      for (let y = ti(waist); y < ti(chest) + 3; y++) {
        const z = B.front(0, y);
        if (z !== 99) B.s(0, y, z, METAL_DK);
      }
      belt(B, ti(waist) - 2, BELT, GOLD, 1.0);
      break;
    case 'vest_leather':
      B.shell(M_TORSO, hip - 1.0, sh - 1.0, 1.0, LEATHER, (x, y, z) => !(z < 0 && Math.abs(x) <= 1 && y + 0.5 > waist));
      for (let y = ti(waist) + 1; y < ti(chest) + 2; y += 2) {
        for (const x of [-2, 2]) {
          const z = B.front(x, y);
          if (z !== 99) B.s(x, y, z, BELT);
        }
      }
      for (let i = 0; i < 22; i++) {
        const y = ti(sh) - i;
        const x = round(lerp(shx - 3.0, -shx * 0.7, i / 21.0));
        if (y < ti(hip) - 1) break;
        for (let dx = 0; dx < 2; dx++) {
          const z = B.front(x + dx, y);
          if (z !== 99) B.s(x + dx, y, z - 1, BELT, B.owner(x + dx, y, z));
        }
      }
      break;
    case 'vest_village':
      B.shell(M_TORSO, hip - 1.0, sh - 0.5, 1.0, MAIN, (x, y, z) => z >= 0 || Math.abs(x) >= 3);
      for (const y of [ti(waist), ti(chest)]) {
        const z = B.front(-3, y);
        if (z !== 99) B.s(-3, y, z - 1, GOLD, TORSO);
      }
      break;
    case 'bodice':
      B.shell(M_TORSO | M_HIPS, hip - 1.0, chest + 1.0, 1.0, MAIN);
      for (let y = ti(hip); y < ti(chest); y++) {
        const z = B.front(0, y);
        if (z !== 99) B.s(0, y, z, y % 2 ? CLOTH_W : TRIM);
      }
      break;
    // ---------------------------------------------------------- waist
    case 'tabard': {
      const w = 2;
      for (const back of [false, true]) {
        panel(B, back, -w, w, ti(knee) + 2, ti(chest) + 2, MAIN, hip - 1.0, false, 2);
        panel(B, back, -w, w, ti(knee) + 2, ti(knee) + 2, TRIM, hip - 1.0, false, 2);
      }
      const pr = loft(HIPS, [[sock - 2.0, S.pelvis[1][1] + 2.4, S.pelvis[1][2] + 2.0, 0.3],
        [hip, S.pelvis[2][1] + 1.6, S.pelvis[2][2] + 1.5, 0.2]], 2.2);
      B.paint(pr, METAL, HIPS, false, x => Math.abs(x) > w, 1.1);
      B.paint(pr, METAL_DK, HIPS, false, (x, y) => y === ti(sock - 2.0) && Math.abs(x) > w, 1.1);
      const tz = B.front(0, ti(chest));
      if (tz !== 99) B.s(0, ti(chest), tz, GOLD);
      break;
    }
    case 'coat_tails': {
      const hem = knee - 2.0;
      const pw = S.pelvis[1][1], pd = S.pelvis[1][2];
      const pr = loft(HIPS, [[hem, pw + 2.0, pd + 1.8, 0.6], [hip - 1.0, pw + 1.0, pd + 1.0, 0.3]], 2.2);
      const open = (x, y, z) => z < -1 && Math.abs(x) <= 1 + ti((hip - y) * 0.25);
      B.paint(pr, MAIN, LEGS, false, (x, y, z) => !open(x, y, z), 1.2);
      B.paint(pr, TRIM, LEGS, false, (x, y, z) => y === ti(hem) && !open(x, y, z), 1.2);
      break;
    }
    case 'robe_skirt':
      skirt(B, hip - 1.0, 2.0, 3.6, CLOTH_W, TRIM);
      for (const sx of [-2, 2]) {
        for (let y = 3; y < ti(hip); y++) {
          const z = B.front(sx, y);
          if (z !== 99) B.s(sx, y, z, MAIN);
        }
      }
      break;
    case 'skirt_long':
      skirt(B, hip, 2.5, 2.6, MAIN, MAIN_DK);
      break;
    case 'apron':
      for (let y = ti(knee) + 1; y <= ti(hip); y++) {
        for (let x = -3; x < 4; x++) {
          const z = B.front(x, y);
          if (z !== 99) B.s(x, y, z - 1, y > ti(knee) + 1 ? CLOTH_W : TRIM, y + 0.5 < sock - 1.0 ? LEGS : HIPS);
        }
      }
      belt(B, ti(hip), CLOTH_W, CLOTH_W, 0.8);
      break;
    case 'belts_cross':
      belt(B, ti(hip) - 1, BELT, METAL);
      belt(B, ti(hip) + 2, BELT, METAL);
      for (let x = -4; x < 4; x++) {
        const z = B.back(x, ti(hip));
        if (z !== -99) B.s(x, ti(hip) - 1, z + 1, LEATHER, HIPS);
      }
      break;
    // ---------------------------------------------------------- shoulders
    case 'pauldrons':
      for (const sx of [-1.0, 1.0]) {
        const part = sx < 0 ? ARM_L : ARM_R;
        const c = v3(sx * (shx + 0.6), sh + 0.3, 0.0);
        const r = vscale(v3(3.6, 2.8, 3.5), !fem ? 1.0 : 0.85);
        shellEll(B, c, r, 1.3, METAL, part, (x, y) => y + 0.5 >= sh - 2.5);
        shellEll(B, vsub(c, v3(0, 2.6, 0)), vmulv(r, v3(1.0, 0.75, 1.0)), 1.1, METAL_DK, part, (x, y) => y + 0.5 >= sh - 4.6 && y + 0.5 < sh - 2.5);
        const tz = B.front(ti(c[0]), ti(sh));
        if (tz !== 99) B.s(ti(c[0]), ti(sh), tz, GOLD);
      }
      break;
    case 'capelet': {
      const pr = loft(TORSO, [[sh - 5.5, shx + 2.2, S.torso[4][2] + 2.2, 0.3], [sh + 1.2, S.neck_r + 2.0, 2.4, 0.3]], 2.0);
      B.paint(pr, MAIN_DK, 0, false, null, 1.2);
      B.paint(pr, TRIM, 0, false, (x, y) => y === ti(sh - 5.5), 1.2);
      ownByArm(B, sh - 5.5, sh + 1.5, shx - 2.0);
      break;
    }
    case 'shoulder_guard': {
      const c = v3(-(shx + 0.4), sh + 0.2, 0.0);
      shellEll(B, c, v3(3.0, 2.4, 3.0), 1.0, LEATHER, ARM_L, (x, y) => y + 0.5 >= sh - 2.0);
      shellEll(B, c, v3(3.0, 2.4, 3.0), 1.0, BELT, ARM_L, (x, y) => y + 0.5 >= sh - 2.0 && y + 0.5 < sh - 1.0);
      break;
    }
    // ---------------------------------------------------------- arms / hands
    case 'vambraces':
      B.shell(M_FORE, wrist, wrist + 5.5, 1.0, METAL);
      B.shell(M_FORE, wrist + 4.5, wrist + 5.5, 0.0, METAL_DK);
      break;
    case 'bracers':
      B.shell(M_FORE, wrist, wrist + 5.0, 1.0, LEATHER);
      B.shell(M_FORE, wrist + 2.0, wrist + 3.0, 0.0, BELT);
      break;
    case 'wraps':
      for (let y = ti(wrist); y < ti(wrist) + 7; y += 2) B.shell(M_FORE, y, y + 1.0, 0.0, MAIN);
      for (let y = ti(knee) - 9; y < ti(knee) - 2; y += 2) B.shell(M_SHIN, y, y + 1.0, 0.0, MAIN);
      break;
    case 'gauntlets':
      B.shell(M_FORE, hy - 3.0, wrist + 0.5, 0.0, LEATHER);
      B.shell(M_FORE, wrist - 0.5, wrist + 1.0, 1.0, METAL_DK);
      break;
    case 'gloves_dark':
      B.shell(M_FORE, hy - 3.0, wrist + 0.5, 0.0, DARK);
      break;
    // ---------------------------------------------------------- back
    case 'cloak': {
      const top = ti(sh) + 1;
      const half = ti(shx) - 1;
      panel(B, true, -half, half, ti(knee) - 2, top, MAIN_DK, waist, true, 2);
      for (let x = -half; x <= half; x++) {
        const bottom = ti(knee) - 2 + ti(Math.abs(Math.sin(x * 2.1)) * 2.2);
        const z = B.back(x, bottom);
        if (z !== -99) B.s(x, bottom, z, MAIN);
      }
      break;
    }
    case 'hood_down': {
      const pr = ell(TORSO, v3(0, sh + 0.5, 2.6), v3(S.neck_r + 3.0, 2.6, 2.8));
      B.paint(pr, MAIN_DK, TORSO, false, (x, y, z) => !(z < 1 && Math.abs(x) <= ti(S.neck_r) + 1 && y + 0.5 > sh), 1.3);
      B.paint(pr, MAIN, TORSO, false, (x, y) => y === ti(sh + 2.5), 1.3);
      break;
    }
    case 'quiver': {
      const qx = 2;
      const bz = B.back(qx, ti(chest)) + 2;
      const pr = cap(TORSO, v3(-qx - 1, hip, bz), v3(qx + 2, sh + 1.0, bz), 1.6, 1.8);
      B.paint(pr, LEATHER, TORSO);
      const tip = v3(qx + 2, sh + 2.0, bz);
      for (let k = 0; k < 3; k++) {
        B.box(ti(tip[0]) - 1 + k, ti(tip[1]), ti(tip[2]), ti(tip[0]) - 1 + k, ti(tip[1]) + 1 + k % 2, ti(tip[2]), CLOTH_W, TORSO);
      }
      B.paint(cap(TORSO, v3(-qx - 1, hip + 2.0, bz), v3(-qx - 1, hip + 2.0, bz), 1.9, 1.9), BELT, TORSO);
      break;
    }
    // ---------------------------------------------------------- neck
    case 'collar_high': {
      const nr = S.neck_r;
      const pr = cap(TORSO, v3(0, sh + 0.5, 0.3), v3(0, neck + 0.5, 0.3), nr + 1.6, nr + 1.3);
      B.paint(pr, TRIM, TORSO, false, (x, y, z) => !(z < -1 && Math.abs(x) <= 0 && y + 0.5 > sh + 2.0), 1.1);
      break;
    }
    case 'stole': {
      for (const sx of [-3, 3]) {
        for (let y = ti(hip) - 1; y < ti(sh) + 2; y++) {
          const z = B.front(sx, y);
          if (z !== 99) B.s(sx, y, z, MAIN);
        }
        const bz = B.back(sx, ti(sh));
        if (bz !== -99) B.s(sx, ti(sh), bz, MAIN);
      }
      const ey = ti(chest) + 1;
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1]]) {
        const z = B.front(dx, ey + dy);
        if (z !== 99) B.s(dx, ey + dy, z, GOLD);
      }
      break;
    }
    case 'scarf': {
      const nr = S.neck_r;
      const pr = cap(TORSO, v3(0, sh - 0.5, 0.4), v3(0, neck + 0.2, 0.2), nr + 2.6, nr + 1.8);
      B.paint(pr, MAIN, TORSO, false, null, 1.6);
      B.paint(pr, MAIN_DK, TORSO, false, (x, y) => y === ti(neck), 1.6);
      const bz = B.back(2, ti(sh)) + 1;
      for (let y = ti(waist) - 4; y < ti(sh); y++) {
        const x = 2 + round((sh - y) * 0.12);
        const zz = bz + ti((sh - y) * 0.1);
        B.box(x, y, zz, x + 1, y, zz, y > ti(waist) - 4 ? MAIN : MAIN_DK, TORSO);
      }
      break;
    }
  }
}

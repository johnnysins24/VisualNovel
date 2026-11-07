// The VisualNovel body: Voxel Realm's character, method and look (vn bodies are sculpted, dressed and rendered by the
// same code), with a bigger head and the anatomy reworked for a flat front view. Not part of Voxel Realm.
//
// - Proportions: the body is shorter for the same head, so a figure is `ratio` heads tall. The neck keeps its
//   length so it still shows; the torso and legs shrink, the legs a little less so the build stays adult. Widths
//   shrink by the square root of the height scale (broad shoulders), limbs a bit more.
// - Pixels: the body stays at 1/32 m like the head (no 1/16 m halving), the chin on a whole voxel row and the body's
//   centre line under the head's, so every voxel is one pixel and both sides match.
// - Anatomy: a neck, a trapezius slope that runs into round shoulders, upper arms that meet the torso, slim
//   wrists, hands wider than the wrist, knees, calves, slim ankles and feet that show from the front.
import { lerp, clamp, v3, vscale, vmulv } from './gd.mjs';
import { spec, cap, ell, loft, loftFront, HIPS, TORSO, ARM_L, ARM_R, FORE_L, FORE_R, THIGH_L, THIGH_R, SHIN_L, SHIN_R } from './body.mjs';

/** A head with its hair, chin to crown, in voxels (pixels). */
export const HEAD_PX = 15.5;
/** Voxel Realm's chin height for a human man with the long neck, in voxels. */
const MAN_NECK = 45.5;

/** The game's figure height in heads (Phupha's choice, 7 Nov 2026). */
export const GAME_RATIO = 3.25;

/** The VN body for a figure `ratio` heads tall. legs > 1 lengthens the legs against the torso. */
export function vnStyle(ratio = GAME_RATIO, { legs = 1.08 } = {}) {
  return {
    name: 'vn', ratio, short_neck: false, simple: false, coarse: false, headScale: 1.0, blend: 1.3,
    spec: a => vnSpec(a, ratio, legs),
    prims: B => vnPrims(B.S),
  };
}

/** The body every game sprite uses (sprite.mjs draws with it unless told otherwise). */
export const GAME_BODY = Object.freeze(vnStyle());

/** Voxel Realm's landmarks (long neck) mapped onto the shorter body. */
export function vnSpec(a, ratio, legs = 1.08) {
  const s = spec(a, { short_neck: false });
  // the chin height for a human man is HEAD_PX * (ratio - 1); women, short-legged and big-headed races scale from
  // it as they do in Voxel Realm (every head here is the same size in pixels)
  const chin = Math.round(HEAD_PX * (ratio - 1.0) * (s.neck / MAN_NECK) / s.race.head);
  const sh0 = s.sh, sock0 = s.sock;
  const sh = chin - (s.neck - s.sh);
  const ky = sh / sh0;
  const sock = sock0 * ky * legs;
  const kL = sock / sock0, kT = (sh - sock) / (sh0 - sock0);
  // heights: legs below the leg socket, torso up to the shoulders, the neck as it was
  const Y = y => (y <= sock0 ? y * kL : y <= sh0 ? sock + (y - sock0) * kT : sh + (y - sh0));
  const kw = Math.sqrt(ky);              // torso widths
  const kl = Math.pow(ky, 0.8);          // limb thickness
  const elbow0 = sh0 - s.upper, hand0 = elbow0 - s.fore, arm0 = s.upper + s.fore;
  for (const k of ['knee', 'sock', 'hip', 'waist', 'chest', 'arm_y']) s[k] = Y(s[k]);
  s.sh = sh;
  s.neck = chin;
  s.upper = sh - Y(elbow0);
  s.fore = Y(elbow0) - Y(hand0);
  // the shoulder and hip joints on voxel centres, so arms and legs are whole pixels wide on both sides
  s.shx = Math.round(s.shx * kw);
  s.hipx = Math.round(s.hipx * kw);
  s.neck_r *= Math.sqrt(kl);
  const key = k => [Y(k[0]), k[1] * kw, k[2] * kw, k[3] * kw];
  s.pelvis = s.pelvis.map(key);
  s.torso = s.torso.map(key);
  s.arm_r = s.arm_r.map(r => r * kl);
  s.thigh_r = s.thigh_r.map(r => r * kl);
  s.shin_r = s.shin_r.map(r => r * kl);
  s.delt = vmulv(s.delt, v3(kl, kT, kl));
  s.calf = vmulv(s.calf, v3(kl, kL, kl));
  s.hand = vmulv(s.hand, v3(Math.sqrt(kl), kL, Math.sqrt(kl)));
  for (const k of ['pec', 'glute', 'bust']) s[k] = vmulv(s[k], v3(kw, kT, kw));
  s.foot = [s.foot[0] * Math.sqrt(kl), s.foot[1] * kw];
  // scales for offsets in the outfit code: kT torso heights, kL leg heights, kA along the arm, kx widths, kl limbs
  s.ky = ky; s.kT = kT; s.kL = kL; s.kA = (s.upper + s.fore) / arm0; s.kx = kw; s.kl = kl;
  return s;
}

/** The body's shapes (Body.bodyPrims reworked). */
export function vnPrims(s) {
  const fem = s.fem, kT = s.kT, kL = s.kL, kx = s.kx, kl = s.kl;
  const L = [];
  const { sh, shx, neck, neck_r: nr, chest, waist, sock, knee } = s;
  // torso: Voxel Realm's lofts up to the armpits, then a trapezius sloping from the neck down to the shoulder points
  const top = s.torso.filter(k => k[0] < sh - 1.2 * kT);
  const wide = top[top.length - 1];
  const nb = neck - 1.4;                                    // the neck's base
  const sd = wide[2] * 0.8, sz = wide[3] * 0.5 + 0.1;
  top.push([sh - 0.6 * kT, shx + 0.2, sd, sz]);
  top.push([sh + 0.4, shx - 0.6, sd * 0.95, sz]);
  top.push([sh + 1.3, lerp(shx, nr, 0.33), sd * 0.85, 0.2]);
  top.push([lerp(sh + 1.3, nb, 0.6), nr + 1.3, sd * 0.75, 0.2]);
  top.push([nb, nr + 0.35, nr + 0.3, 0.25]);
  L.push(loft(HIPS, s.pelvis, 2.3));
  L.push(loft(TORSO, top, 2.4));
  for (const sdx of [-1.0, 1.0]) L.push(ell(HIPS, v3(sdx * 2.5 * kx, sock + 0.4 * kT, (1.9 + (fem ? 0.3 : 0.0)) * kx), s.glute));
  // neck, up into the head
  L.push(cap(TORSO, v3(0, sh, 0.3 * kx), v3(0, neck + 1.0, 0.0), nr + 0.15, nr));
  const chestFront = loftFront(s.torso, chest);
  for (const sx of [-1.0, 1.0]) {
    if (s.pec[0] > 0) L.push(ell(TORSO, v3(sx * 3.0 * kx, chest + 0.6 * kT, chestFront + s.pec[2] * 0.55), s.pec));
    if (s.bust[0] > 0) L.push(ell(TORSO, v3(sx * 2.45 * kx, chest - 0.2 * kT, chestFront + s.bust[2] * 0.45), s.bust));
  }
  if (s.he > 0.45) {
    const bl = (s.he - 0.45) * 2.0;
    L.push(ell(TORSO, v3(0, waist - 0.5 * kT, -2.2 * kx), vmulv(vscale(v3(4.2, 3.2, 2.0), 0.7 + 0.5 * bl), v3(kx, kT, kx))));
  }
  // Limb widths are whole pixels: a limb centred on a voxel is 1, 3 or 5 px wide for a radius under 1, under 2 or
  // under 3, one centred between voxels 2 or 4 px. Joints sit on voxel centres (shx, hipx are whole), so radii
  // get floors that keep arms 3 px, wrists 2 px, hands 3 px and legs at least 3 px however small the body.
  const up = s.upper, fo = s.fore, ar = s.arm_r, delt = s.delt, hand = s.hand;
  const hx0 = s.hipx, tr = s.thigh_r, shr = s.shin_r, calf = s.calf, foot = s.foot;
  const handR = Math.max(hand[0] * 1.3, 1.25);
  // the arms hang in a slight A: the hand swings out 1 or 2 px, enough to clear the thigh with a 1 px gap
  const thighOut = hx0 + 0.4 + Math.max(tr[0], 2.0) * 0.95;
  const swing = clamp(Math.ceil(thighOut + 1.0 + handR - shx), 1, 2);
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1.0 : 1.0;
    const x = sx * shx;
    const pa = side === 0 ? ARM_L : ARM_R;
    const pf = side === 0 ? FORE_L : FORE_R;
    const elbow = sh - up;
    const hy = elbow - fo;                   // centre of the hand
    const wy = hy + hand[1] * 0.85;          // wrist
    const hx = x + sx * swing;
    const wx = hx - sx * 0.5;                // between voxels: a 2 px wrist
    // the deltoid rounds the shoulder from just under the trapezius line
    L.push(ell(pa, v3(x + sx * 0.2, sh - 1.9 * kT, 0.0), v3(delt[0] * 0.9, delt[1] * 0.75, delt[2] * 0.95)));
    L.push(cap(pa, v3(x, sh - 1.5 * kT, 0), v3(x, elbow + 0.3 * kT, 0.2 * kx), Math.max(ar[0] * 0.95, 1.3), Math.max(ar[1], 1.1)));
    L.push(cap(pf, v3(x, elbow, 0.2 * kx), v3(wx, wy, 0.0), Math.max(ar[2] * 0.95, 1.05), clamp(ar[3] * 0.62, 0.6, 1.2)));
    // hand: wider than the wrist, palm to the thigh, thumb forward
    L.push(ell(pf, v3(hx, hy + 0.2 * kL, -0.1 * kx), v3(handR, Math.max(hand[1], 1.4), hand[2])));
    L.push(cap(pf, v3(hx - sx * 0.2, wy - 0.5 * kL, -0.9 * kx), v3(hx - sx * 0.4, hy - 0.2 * kL, -1.4 * kx), 0.7 * kx, 0.55 * kx));
  }
  // legs: thigh, knee, calf, a slim ankle, and a foot wider than the ankle with the toes turned out a little
  const ankle = 2.0 * kL + 0.5;
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1.0 : 1.0;
    const x = sx * hx0;
    const pt = side === 0 ? THIGH_L : THIGH_R;
    const ps = side === 0 ? SHIN_L : SHIN_R;
    const t0 = Math.max(tr[0], 2.0), t1 = Math.max(tr[1] * 0.9, 1.1);
    L.push(cap(pt, v3(x + sx * 0.3, sock + 0.5 * kT, 0.0), v3(x, knee + 0.8 * kL, -0.1 * kx), t0, t1));
    L.push(ell(pt, v3(x + sx * 0.4, sock - 3.0 * kL, -0.5 * kx), v3(t0 * 0.95, 5.0 * kL, t0 * 0.9)));
    // the shin ends between voxels, a 2 px ankle, over a 4 px foot
    const ax = x - sx * 0.5;
    L.push(cap(ps, v3(x, knee, 0.0), v3(ax, ankle, 0.4 * kx), Math.max(shr[0] * 0.92, 1.1), clamp(shr[1] * 0.75, 0.75, 1.2)));
    L.push(ell(ps, v3(x + sx * 0.25, knee - 3.4 * kL, 0.8 * kx), vmulv(calf, v3(0.85, 0.85, 1.0))));
    const fw = Math.max(foot[0], 1.35), fl = foot[1];
    L.push(cap(ps, v3(ax, 1.1, 0.9 * kx), v3(ax + sx * 1.0, 0.95, 0.9 * kx - fl), fw, Math.max(fw * 1.05, 1.7)));
  }
  return L;
}

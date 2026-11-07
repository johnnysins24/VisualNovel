// Sculpted base bodies at 1/32 m, ported from Voxel Realm (char_body.gd). A body is a signed distance field built
// from round cones, ellipsoids and lofted cross-sections, sampled into one voxel grid. Every voxel belongs to a
// rig part, and each part becomes its own mesh. Outfits paint onto this grid (outfits.mjs), so one outfit fits
// every frame, build and race.
//
// Body space (voxels): x = 0 at the centre of a cell, +x is the character's right side (arm_r), y = 0 at the
// soles, front faces -z.
import { F, clamp, lerp, smoothstep, round, v3, vadd, vsub, vscale, vmulv, vmin, vmax, visZero, aabb, aabbEnd, aabbMerge } from './gd.mjs';
import { getRace } from './appearance.mjs';
import { VoxelData } from './grid.mjs';

export const VS = 0.03125;
export const NAMES = ['', 'hips', 'torso', 'arm_l', 'forearm_l', 'arm_r', 'forearm_r', 'thigh_l', 'shin_l', 'thigh_r', 'shin_r'];
export const HIPS = 1, TORSO = 2, ARM_L = 3, FORE_L = 4, ARM_R = 5, FORE_R = 6, THIGH_L = 7, SHIN_L = 8, THIGH_R = 9, SHIN_R = 10;
export const LEGS = -1;
export const M_HIPS = 1 << HIPS;
export const M_TORSO = 1 << TORSO;
export const M_ARMS = (1 << ARM_L) | (1 << ARM_R);
export const M_FORE = (1 << FORE_L) | (1 << FORE_R);
export const M_THIGH = (1 << THIGH_L) | (1 << THIGH_R);
export const M_SHIN = (1 << SHIN_L) | (1 << SHIN_R);
export const M_ALL = 0x7fe;
export const CAP = 0, ELL = 1, LOFT = 2;
export const GX = 41, GY = 56, GZ = 29, OX = 20, OZ = 14;
export const MARGIN = 2.6;
/** Voxel Realm's look switches (all on there): a short neck, no small anatomy, the body at 1/16 m. */
export const STYLE = { short_neck: true, simple: true, coarse: true };
const MIRROR = [0, HIPS, TORSO, ARM_R, FORE_R, ARM_L, FORE_L, THIGH_R, SHIN_R, THIGH_L, SHIN_L];

// ------------------------------------------------------------------ proportions

/** Landmarks and radii for a body, in voxels from the soles. */
export function spec(a) {
  const fem = a.body === 1;
  const R = getRace(a.race);
  const mu = Math.max(clamp(a.muscle, 0, 1), R.muscle_min ?? 0);
  const he = clamp(a.heft, 0, 1);
  const s = { fem, mu, he };
  const limb = 0.92 + 0.14 * mu + 0.16 * he;
  const core = 0.94 + 0.08 * mu + 0.12 * he;
  const belly = 0.9 + 0.35 * he - 0.08 * mu;
  if (!fem) {
    Object.assign(s, { knee: 13.0, sock: 25.0, hip: 28.0, waist: 32.0, chest: 37.0, sh: 41.0, neck: 45.5,
      shx: 9.6 + 0.5 * mu + 0.3 * he, hipx: 3.3, upper: 10.0, fore: 9.5, neck_r: 2.2 + 0.35 * mu });
    s.arm_r = [2.35 * limb, 1.85 * limb, 1.95 * limb, 1.35 * limb];
    s.delt = vscale(v3(2.7, 2.9, 2.6), 0.9 + 0.2 * mu + 0.08 * he);
    s.thigh_r = [3.25 * limb, 2.15 * limb];
    s.shin_r = [2.0 * limb, 1.3 * limb];
    s.calf = vscale(v3(2.25, 3.8, 2.15), limb);
    s.hand = v3(1.05, 2.2, 1.7);
    s.foot = [1.65, 4.6];
    s.pelvis = [[22.5, 4.4, 3.0, 0.2], [25.0, 5.7 * core, 3.3, 0.3], [28.0, 5.8 * core, 3.25, 0.1],
      [30.5, 5.5 * belly, 3.05 * belly, -0.1]];
    s.torso = [[29.5, 5.5 * belly, 3.05 * belly, -0.1], [32.0, 5.6 * belly, 3.1 * belly, -0.1],
      [35.0, 6.5 * core, 3.4 * core, -0.2], [37.0, 7.2 * core, 3.7 * core, -0.25], [39.5, 7.4 * core, 3.5 * core, 0.0],
      [41.5, 6.4 * core, 3.0, 0.2], [43.0, 3.8, 2.5, 0.3]];
    s.pec = vscale(v3(3.1, 1.9, 1.15), 0.75 + 0.5 * mu);
    s.glute = vscale(v3(2.6, 2.5, 1.5), 0.9 + 0.2 * he);
    s.bust = v3(0, 0, 0);
  } else {
    Object.assign(s, { knee: 12.5, sock: 24.0, hip: 27.0, waist: 31.0, chest: 34.5, sh: 38.5, neck: 42.5,
      shx: 7.7 + 0.3 * mu + 0.25 * he, hipx: 3.5, upper: 9.0, fore: 8.6, neck_r: 1.65 + 0.15 * mu });
    s.arm_r = [1.95 * limb, 1.55 * limb, 1.6 * limb, 1.15 * limb];
    s.delt = vscale(v3(2.15, 2.4, 2.1), 0.92 + 0.16 * mu + 0.08 * he);
    s.thigh_r = [3.35 * limb, 1.95 * limb];
    s.shin_r = [1.85 * limb, 1.15 * limb];
    s.calf = vscale(v3(2.05, 3.5, 1.95), limb);
    s.hand = v3(0.9, 1.95, 1.45);
    s.foot = [1.4, 4.0];
    s.pelvis = [[22.0, 4.7, 3.0, 0.3], [24.0, 6.6 * core, 3.5, 0.55], [26.0, 6.5 * core, 3.35, 0.35],
      [28.5, 5.1 * belly, 2.85 * belly, 0.0]];
    s.torso = [[28.0, 5.3 * belly, 2.9 * belly, 0.0], [30.5, 4.45 * belly, 2.65 * belly, 0.0],
      [32.5, 4.9 * core, 2.8, -0.05], [34.5, 5.6 * core, 2.95, 0.0], [36.5, 5.7 * core, 2.8, 0.15],
      [38.0, 5.0 * core, 2.45, 0.2], [39.8, 3.2, 2.1, 0.25]];
    s.pec = v3(0, 0, 0);
    s.glute = vscale(v3(2.9, 2.6, 1.7), 0.95 + 0.2 * he);
    s.bust = vscale(vscale(v3(2.25, 2.0, 1.55), 0.9 + 0.25 * he), 0.85 + 0.3 * clamp(a.bust, 0, 1));
  }
  // hips and shoulders sliders (0.5 = the frame's own shape)
  const hp = clamp(a.hips, 0, 1) - 0.5;
  const sp = clamp(a.shoulders, 0, 1) - 0.5;
  s.pelvis = s.pelvis.map(k => [k[0], k[1] * (1.0 + 0.16 * hp), k[2] * (1.0 + 0.1 * hp), k[3]]);
  s.torso = s.torso.map(k => {
    const up = smoothstep(s.waist, s.sh, k[0]);
    return [k[0], k[1] * (1.0 + 0.16 * sp * up + 0.1 * hp * (1.0 - up)), k[2], k[3]];
  });
  s.shx = s.shx * (1.0 + 0.12 * sp);
  s.delt = vscale(s.delt, 1.0 + 0.15 * sp);
  s.glute = vscale(s.glute, 1.0 + 0.25 * hp);
  s.hipx = s.hipx * (1.0 + 0.1 * hp);
  applyRace(s, R);
  if (STYLE.short_neck) s.neck = s.sh + (fem ? 2.2 : 2.5);
  s.arm_y = s.sh - 3.0;
  return s;
}

function applyRace(s, R) {
  const L = R.legs, W = R.width, D = R.depth, M = R.limb, A = R.arms;
  const sock0 = s.sock;
  const dy = sock0 * L - sock0;
  s.knee = s.knee * L;
  for (const k of ['sock', 'hip', 'waist', 'chest', 'sh', 'neck']) s[k] = s[k] + dy;
  for (const k of ['pelvis', 'torso']) s[k] = s[k].map(key => [key[0] + dy, key[1] * W, key[2] * D, key[3] * D]);
  s.shx = s.shx * W;
  s.hipx = s.hipx * lerp(1.0, W, 0.7);
  s.neck_r = s.neck_r * lerp(1.0, W, 0.8);
  s.upper = s.upper * A;
  s.fore = s.fore * A;
  s.arm_r = s.arm_r.map(v => v * M);
  s.thigh_r = s.thigh_r.map(v => v * M);
  s.shin_r = s.shin_r.map(v => v * M);
  s.calf = vscale(s.calf, M);
  s.delt = vmulv(s.delt, v3(lerp(1.0, W, 0.5) * M, M, M));
  s.glute = vmulv(s.glute, v3(W, 1.0, D));
  s.pec = vmulv(s.pec, v3(W, 1.0, D));
  s.bust = vmulv(s.bust, v3(lerp(1.0, W, 0.6), 1.0, D));
  s.hand = vscale(s.hand, R.hand);
  s.foot = [s.foot[0] * lerp(1.0, R.foot, 0.6), s.foot[1] * R.foot];
  s.race = R;
}

/** Joint positions relative to their parent joint, in voxels. */
export function joints(s) {
  const hip = s.hip;
  return {
    hips: [0, hip, 0],
    head: [0, s.neck - hip, 0],
    arm_l: [-s.shx, s.sh - hip, 0], arm_r: [s.shx, s.sh - hip, 0],
    forearm_l: [0, -s.upper, 0], forearm_r: [0, -s.upper, 0],
    hand_l: [0, -s.fore, 0], hand_r: [0, -s.fore, 0],
    thigh_l: [-s.hipx, s.sock - hip, 0], thigh_r: [s.hipx, s.sock - hip, 0],
    shin_l: [0, s.knee - s.sock, 0], shin_r: [0, s.knee - s.sock, 0],
    tail: [0, s.sock + 1.5 - hip, s.pelvis[1][2] + s.pelvis[1][3] - 0.6],
  };
}

// ------------------------------------------------------------------ primitives

export const cap = (part, a, b, r0, r1) => [CAP, part, a, b, r0, r1];
export const ell = (part, c, r) => [ELL, part, c, r];
export const loft = (part, keys, n = 2.0, xc = 0.0) => [LOFT, part, keys, n, xc];

function primAabb(pr, m) {
  switch (pr[0]) {
    case CAP: {
      const a = pr[2], b = pr[3];
      const r = Math.max(pr[4], pr[5]) + m;
      const rr = v3(r, r, r);
      const lo = vsub(vmin(a, b), rr);
      return aabb(lo, vsub(vadd(vmax(a, b), rr), lo));
    }
    case ELL: {
      const c = pr[2];
      const rr = vadd(pr[3], v3(m, m, m));
      return aabb(vsub(c, rr), vscale(rr, 2.0));
    }
    default: {
      const keys = pr[2];
      let w = 0.0, z0 = 99.0, z1 = -99.0;
      for (const k of keys) {
        w = Math.max(w, k[1]);
        z0 = Math.min(z0, k[3] - k[2]);
        z1 = Math.max(z1, k[3] + k[2]);
      }
      const xc = pr[4];
      const y0 = keys[0][0], y1 = keys[keys.length - 1][0];
      return aabb(v3(xc - w - m, y0 - m, z0 - m), v3(2.0 * (w + m), y1 - y0 + 2.0 * m, z1 - z0 + 2.0 * m));
    }
  }
}

function sloft(u, v, w, d, n) {
  const un = Math.pow(u, n);
  const vn = Math.pow(v, n);
  const sm = un + vn;
  const q = Math.pow(sm, 1.0 / n);
  if (q < 0.35) return (q - 1.0) * Math.min(w, d);
  const gx = Math.pow(u, n - 1.0) / w;
  const gz = Math.pow(v, n - 1.0) / d;
  const grad = Math.pow(sm, 1.0 / n - 1.0) * Math.sqrt(gx * gx + gz * gz);
  return (q - 1.0) / Math.max(grad, 0.0001);
}

export function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return lerp(b, a, h) - k * h * (1.0 - h);
}

const ifloor = v => [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
const iceil = v => [Math.ceil(v[0]), Math.ceil(v[1]), Math.ceil(v[2])];
const imax = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
const imin = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];

/** One primitive into a part buffer (smooth union). */
function evalPrim(pr, buf, lo, n, a0, a1, k) {
  const t = pr[0];
  const sx = n[0];
  const sxz = n[0] * n[2];
  const put = (j, d) => {
    const cur = buf[j];
    buf[j] = cur > 50.0 ? d : (Math.abs(cur - d) >= k ? Math.min(cur, d) : smin(cur, d, k));
  };
  if (t === LOFT) {
    const keys = pr[2], ex = pr[3], xc = pr[4];
    const ky0 = keys[0][0], ky1 = keys[keys.length - 1][0];
    for (let y = a0[1]; y <= a1[1]; y++) {
      const py = y + 0.5;
      const yy = clamp(py, ky0, ky1);
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1][0] < yy) i++;
      const ka = keys[i], kb = keys[i + 1];
      const tt = smoothstep(ka[0], kb[0], yy);
      const w = lerp(ka[1], kb[1], tt);
      const dd = lerp(ka[2], kb[2], tt);
      const zc = lerp(ka[3], kb[3], tt);
      const capd = Math.max(ky0 - py, py - ky1);
      for (let z = a0[2]; z <= a1[2]; z++) {
        const v = Math.abs(z - zc) / dd;
        const row = (y - lo[1]) * sxz + (z - lo[2]) * sx - lo[0];
        for (let x = a0[0]; x <= a1[0]; x++) put(row + x, Math.max(sloft(Math.abs(x - xc) / w, v, w, dd, ex), capd));
      }
    }
  } else if (t === ELL) {
    const c = pr[2], r = pr[3];
    const ir = v3(1.0 / r[0], 1.0 / r[1], 1.0 / r[2]);
    const ir2 = vmulv(ir, ir);
    const rmin = -Math.min(r[0], Math.min(r[1], r[2]));
    for (let y = a0[1]; y <= a1[1]; y++) {
      const qy = y + 0.5 - c[1];
      for (let z = a0[2]; z <= a1[2]; z++) {
        const qz = z - c[2];
        const row = (y - lo[1]) * sxz + (z - lo[2]) * sx - lo[0];
        for (let x = a0[0]; x <= a1[0]; x++) {
          const qx = x - c[0];
          const k0 = Math.sqrt(qx * qx * ir2[0] + qy * qy * ir2[1] + qz * qz * ir2[2]);
          const k1 = Math.sqrt(qx * qx * ir2[0] * ir2[0] + qy * qy * ir2[1] * ir2[1] + qz * qz * ir2[2] * ir2[2]);
          put(row + x, k1 > 0.0001 ? k0 * (k0 - 1.0) / k1 : rmin);
        }
      }
    }
  } else {
    const a = pr[2];
    const ab = vsub(pr[3], a);
    const r0 = pr[4], r1 = pr[5];
    const l2 = F(F(F(ab[0] * ab[0]) + F(ab[1] * ab[1])) + F(ab[2] * ab[2]));
    const il = 1.0 / Math.max(l2, 0.0001);
    for (let y = a0[1]; y <= a1[1]; y++) {
      const qy = F(F(y + 0.5) - a[1]);
      for (let z = a0[2]; z <= a1[2]; z++) {
        const qz = F(z - a[2]);
        const row = (y - lo[1]) * sxz + (z - lo[2]) * sx - lo[0];
        for (let x = a0[0]; x <= a1[0]; x++) {
          const qx = F(x - a[0]);
          const dot = F(F(F(qx * ab[0]) + F(qy * ab[1])) + F(qz * ab[2]));
          const tt = clamp(dot * il, 0.0, 1.0);
          const t32 = F(tt);
          const ex = F(qx - F(ab[0] * t32)), ey = F(qy - F(ab[1] * t32)), ez = F(qz - F(ab[2] * t32));
          const len = F(Math.sqrt(F(F(F(ex * ex) + F(ey * ey)) + F(ez * ez))));
          put(row + x, len - lerp(r0, r1, tt));
        }
      }
    }
  }
}

// ------------------------------------------------------------------ the body grid

export const idx = (x, y, z) => (x + OX) + GX * ((z + OZ) + GZ * y);
export const inside = (x, y, z) => x + OX >= 0 && x + OX < GX && y >= 0 && y < GY && z + OZ >= 0 && z + OZ < GZ;

function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export class Body {
  constructor() {
    this.S = {};
    this.dist = new Float32Array(GX * GY * GZ).fill(99.0);
    this.own = new Uint8Array(GX * GY * GZ);
    this.col = new Uint8Array(GX * GY * GZ);
    this.near = [];
  }

  pivot(p) {
    const S = this.S;
    switch (p) {
      case HIPS: case TORSO: return v3(0, S.hip, 0);
      case ARM_L: return v3(-S.shx, S.sh, 0);
      case ARM_R: return v3(S.shx, S.sh, 0);
      case FORE_L: return v3(-S.shx, S.sh - S.upper, 0);
      case FORE_R: return v3(S.shx, S.sh - S.upper, 0);
      case THIGH_L: return v3(-S.hipx, S.sock, 0);
      case THIGH_R: return v3(S.hipx, S.sock, 0);
      case SHIN_L: return v3(-S.hipx, S.knee, 0);
      case SHIN_R: return v3(S.hipx, S.knee, 0);
    }
    return v3(0, 0, 0);
  }

  g(x, y, z) { return inside(x, y, z) ? this.col[idx(x, y, z)] : 0; }

  s(x, y, z, id, part = 0) {
    if (!inside(x, y, z)) return;
    const i = idx(x, y, z);
    this.col[i] = id;
    if (part > 0) this.own[i] = part;
    else if (part === LEGS) this.own[i] = this.legPart(x, y);
    else if (this.own[i] === 0) this.own[i] = this.nearestPart(x, y, z);
  }

  legPart(x, y) {
    const left = x < 0;
    if (y + 0.5 >= this.S.knee) return left ? THIGH_L : THIGH_R;
    return left ? SHIN_L : SHIN_R;
  }

  nearestPart(x, y, z) {
    const S = this.S;
    const yy = y + 0.5;
    if (yy >= S.hip + 1.0) {
      if (Math.abs(x) > S.shx - 1.5 && yy < S.sh + 1.0) {
        const up = yy > S.sh - S.upper;
        if (x < 0) return up ? ARM_L : FORE_L;
        return up ? ARM_R : FORE_R;
      }
      return TORSO;
    }
    if (yy >= S.sock - 1.0 && Math.abs(x) < S.hipx + 2.0) return HIPS;
    return this.legPart(x, y);
  }

  /** Smooth union inside a part, plain min between parts; the left half is evaluated, then mirrored. */
  sculpt(prims, k = 1.1) {
    const byPart = new Map();
    for (const pr of prims) {
      const p = pr[1];
      if (p === ARM_R || p === FORE_R || p === THIGH_R || p === SHIN_R) continue;
      if (!byPart.has(p)) byPart.set(p, []);
      byPart.get(p).push(pr);
    }
    const gmax = [0, GY - 1, GZ - OZ - 1];
    const gmin = [-OX, 0, -OZ];
    for (const [p, list] of byPart) {
      const boxes = list.map(pr => primAabb(pr, MARGIN));
      let box = boxes[0];
      for (const bb of boxes) box = aabbMerge(box, bb);
      const lo = imax(ifloor(box.pos), gmin);
      const hi = imin(iceil(aabbEnd(box)), gmax);
      if (hi[0] < lo[0]) continue;
      const n = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
      const buf = new Float32Array(n[0] * n[1] * n[2]).fill(99.0);
      list.forEach((pr, pi) => {
        const b = boxes[pi];
        const a0 = imax(ifloor(b.pos), lo);
        const a1 = imin(iceil(aabbEnd(b)), hi);
        evalPrim(pr, buf, lo, n, a0, a1, k);
      });
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) {
          const row = (y - lo[1]) * n[0] * n[2] + (z - lo[2]) * n[0] - lo[0];
          const gi = idx(0, y, z);
          for (let x = lo[0]; x <= hi[0]; x++) {
            const d = buf[row + x];
            if (d <= MARGIN && d < this.dist[gi + x]) {
              this.dist[gi + x] = d;
              this.own[gi + x] = p;
            }
          }
        }
      }
    }
    for (let y = 0; y < GY; y++) {
      for (let z = -OZ; z < GZ - OZ; z++) {
        const gi = idx(0, y, z);
        for (let x = 1; x <= OX; x++) {
          if (x + OX >= GX) break;
          this.dist[gi + x] = this.dist[gi - x];
          this.own[gi + x] = MIRROR[this.own[gi - x]];
        }
      }
    }
  }

  /** Fills the skin and records the cells near it. */
  skin(id) {
    this.near = [];
    const dist = this.dist;
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i];
      if (d <= 0.0) this.col[i] = id;
      if (d > -1.4 && d <= MARGIN) this.near.push(i);
    }
  }

  // ---------------------------------------------------------------- painting tools (outfits use these)

  /** Wraps cloth round the body: recolours the outer cells of the masked parts between y0 and y1, then grows
   *  round(t) whole-voxel layers outward. f(x, y, z) narrows the cells. */
  shell(mask, y0, y1, t, id, f = null) {
    const ylo = Math.max(Math.ceil(y0 - 0.5), 0);
    const yhi = Math.min(Math.floor(y1 - 0.5), GY - 1);
    if (yhi < ylo) return;
    const near = this.near, col = this.col, own = this.own, dist = this.dist;
    const i0 = lowerBound(near, GX * GZ * ylo);
    const i1 = lowerBound(near, GX * GZ * (yhi + 1));
    for (let k = i0; k < i1; k++) {
      const i = near[k];
      if (col[i] === 0 || dist[i] <= -1.4 || (mask & (1 << own[i])) === 0) continue;
      if (f) {
        const r = i % (GX * GZ);
        if (!f((r % GX) - OX, Math.trunc(i / (GX * GZ)), Math.trunc(r / GX) - OZ)) continue;
      }
      col[i] = id;
    }
    const steps = [1, -1, GX, -GX, GX * GZ, -GX * GZ];
    const n = GX * GY * GZ;
    const layers = round(t);
    for (let layer = 0; layer < layers; layer++) {
      const add = [], who = [];
      for (let k = i0; k < i1; k++) {
        const i = near[k];
        if (col[i] !== 0) continue;
        const r = i % (GX * GZ);
        const x = r % GX;
        const zz = Math.trunc(r / GX);
        let found = 0;
        for (const st of steps) {
          const j = i + st;
          if (j < 0 || j >= n) continue;
          if ((st === 1 && x === GX - 1) || (st === -1 && x === 0) || (st === GX && zz === GZ - 1) || (st === -GX && zz === 0)) continue;
          if (col[j] !== 0 && (mask & (1 << own[j])) !== 0) { found = own[j]; break; }
        }
        if (found === 0) continue;
        if (f && !f(x - OX, Math.trunc(i / (GX * GZ)), zz - OZ)) continue;
        add.push(i);
        who.push(found);
      }
      for (let m = 0; m < add.length; m++) {
        col[add[m]] = id;
        own[add[m]] = who[m];
      }
    }
  }

  /** Paints a primitive. owner: a part, LEGS, or 0 for the nearest part. hollow > 0 keeps a skin that thick. */
  paint(pr, id, owner = 0, addOnly = false, f = null, hollow = 0.0) {
    const b = primAabb(pr, 0.6);
    const lo = imax(ifloor(b.pos), [-OX, 0, -OZ]);
    const hi = imin(iceil(aabbEnd(b)), [GX - OX - 1, GY - 1, GZ - OZ - 1]);
    if (hi[0] < lo[0] || hi[1] < lo[1] || hi[2] < lo[2]) return;
    const n = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
    const buf = new Float32Array(n[0] * n[1] * n[2]).fill(99.0);
    evalPrim(pr, buf, lo, n, lo, hi, 0.001);
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let z = lo[2]; z <= hi[2]; z++) {
        const row = (y - lo[1]) * n[0] * n[2] + (z - lo[2]) * n[0] - lo[0];
        for (let x = lo[0]; x <= hi[0]; x++) {
          const d = buf[row + x];
          if (d > 0.0 || (hollow > 0.0 && d <= -hollow)) continue;
          if (addOnly && this.g(x, y, z) !== 0) continue;
          if (f && !f(x, y, z)) continue;
          this.put(x, y, z, id, owner);
        }
      }
    }
  }

  put(x, y, z, id, owner) {
    const i = idx(x, y, z);
    this.col[i] = id;
    if (owner > 0) this.own[i] = owner;
    else if (owner === LEGS) this.own[i] = this.legPart(x, y);
    else if (this.dist[i] > MARGIN || this.own[i] === 0) this.own[i] = this.nearestPart(x, y, z);
  }

  rbox(x0, y0, z0, x1, y1, z1, id, owner = 0, addOnly = false) {
    const rnd = x1 - x0 >= 2 && z1 - z0 >= 2;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (rnd && (x === x0 || x === x1) && (z === z0 || z === z1)) continue;
      if (!inside(x, y, z) || (addOnly && this.g(x, y, z) !== 0)) continue;
      this.put(x, y, z, id, owner);
    }
  }

  box(x0, y0, z0, x1, y1, z1, id, owner = 0) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!inside(x, y, z)) continue;
      if (id === 0) this.col[idx(x, y, z)] = 0;
      else this.put(x, y, z, id, owner);
    }
  }

  /** Recolours filled voxels in a box (only those of colour `only`, when given). */
  tint(x0, y0, z0, x1, y1, z1, id, only = -1) {
    for (let y = Math.max(y0, 0); y <= Math.min(y1, GY - 1); y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!inside(x, y, z)) continue;
      const i = idx(x, y, z);
      if (this.col[i] !== 0 && (only < 0 || this.col[i] === only)) this.col[i] = id;
    }
  }

  front(x, y) {
    for (let z = -OZ; z < GZ - OZ; z++) if (this.g(x, y, z) !== 0) return z;
    return 99;
  }

  back(x, y) {
    for (let z = GZ - OZ - 1; z > -OZ - 1; z--) if (this.g(x, y, z) !== 0) return z;
    return -99;
  }

  face(x0, y0, x1, y1, id, raise = 0) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const z = this.front(x, y);
      if (z === 99) continue;
      if (raise > 0) for (let k = 0; k < raise; k++) this.put(x, y, z - 1 - k, id, this.own[idx(x, y, z)]);
      else this.col[idx(x, y, z)] = id;
    }
  }

  depth(x, y, z) { return inside(x, y, z) ? this.dist[idx(x, y, z)] : 99.0; }
  owner(x, y, z) { return inside(x, y, z) ? this.own[idx(x, y, z)] : 0; }

  // ---------------------------------------------------------------- parts

  /** One voxel grid per part, cropped, with the anchor at the part's pivot. */
  partData() {
    const lo = new Map(), hi = new Map();
    const col = this.col, own = this.own;
    for (let i = 0; i < col.length; i++) {
      if (col[i] === 0) continue;
      const p = own[i];
      if (p === 0) continue;
      const y = Math.trunc(i / (GX * GZ));
      const r = i % (GX * GZ);
      const v = [r % GX, y, Math.trunc(r / GX)];
      if (lo.has(p)) {
        lo.set(p, imin(lo.get(p), v));
        hi.set(p, imax(hi.get(p), v));
      } else {
        lo.set(p, v);
        hi.set(p, v);
      }
    }
    const out = [];
    for (const [p, a] of lo) {
      const b = hi.get(p);
      const pv = this.pivot(p);
      let anchor = v3(pv[0] + OX + 0.5 - a[0], pv[1] - a[1], pv[2] + OZ + 0.5 - a[2]);
      let vd;
      if (STYLE.coarse) {
        vd = this.halvePart(p, a, b);
        anchor = vscale(anchor, 0.5);
      } else {
        vd = new VoxelData(b[0] - a[0] + 1, b[1] - a[1] + 1, b[2] - a[2] + 1, VS);
        for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) for (let x = a[0]; x <= b[0]; x++) {
          const i = x + GX * (z + GZ * y);
          if (col[i] !== 0 && own[i] === p) vd.set(x - a[0], y - a[1], z - a[2], col[i]);
        }
      }
      out.push({ name: NAMES[p], part: p, vd, anchor });
    }
    return out;
  }

  /** A part at 1/16 m: each 2x2x2 block becomes one voxel when at least 3 of 8 are filled, coloured by the most
   *  common colour among them. */
  halvePart(p, a, b) {
    const n = [b[0] - a[0] + 1, b[1] - a[1] + 1, b[2] - a[2] + 1];
    const m = [Math.trunc((n[0] + 1) / 2), Math.trunc((n[1] + 1) / 2), Math.trunc((n[2] + 1) / 2)];
    const out = new VoxelData(m[0], m[1], m[2], VS * 2.0);
    const cs = new Int32Array(8);
    const col = this.col, own = this.own;
    for (let y = 0; y < m[1]; y++) for (let z = 0; z < m[2]; z++) for (let x = 0; x < m[0]; x++) {
      let k = 0;
      for (let dy = 0; dy < 2; dy++) {
        const gy = a[1] + y * 2 + dy;
        if (gy > b[1]) continue;
        for (let dz = 0; dz < 2; dz++) {
          const gz = a[2] + z * 2 + dz;
          if (gz > b[2]) continue;
          const row = GX * (gz + GZ * gy);
          for (let dx = 0; dx < 2; dx++) {
            const gx = a[0] + x * 2 + dx;
            if (gx > b[0]) continue;
            const i = gx + row;
            if (col[i] !== 0 && own[i] === p) cs[k++] = col[i];
          }
        }
      }
      if (k < 3) continue;
      let best = cs[0], bn = 0;
      for (let i = 0; i < k; i++) {
        const c = cs[i];
        let cnt = 0;
        for (let j = 0; j < k; j++) if (cs[j] === c) cnt++;
        if (cnt > bn) { bn = cnt; best = c; }
      }
      out.set(x, y, z, best);
    }
    return out;
  }

  // ---------------------------------------------------------------- the body

  bodyPrims() {
    const s = this.S;
    const fem = s.fem;
    const L = [];
    L.push(loft(HIPS, s.pelvis, 2.3));
    L.push(loft(TORSO, s.torso, 2.4));
    const g3 = s.glute;
    const sock = s.sock;
    for (const sdx of [-1.0, 1.0]) L.push(ell(HIPS, v3(sdx * 2.5, sock + 0.4, 1.9 + (fem ? 0.3 : 0.0)), g3));
    const neck = s.neck, nr = s.neck_r;
    L.push(cap(TORSO, v3(0, s.sh + 0.5, 0.3), v3(0, neck + 1.0, 0.0), nr + 0.5, nr));
    const pec = s.pec, bust = s.bust, chest = s.chest;
    const chestFront = loftFront(s.torso, chest);
    for (const sx of [-1.0, 1.0]) {
      if (!visZero(pec) && !STYLE.simple) L.push(ell(TORSO, v3(sx * 3.0, chest + 0.6, chestFront + pec[2] * 0.55), pec));
      if (!visZero(bust)) L.push(ell(TORSO, v3(sx * 2.45, chest - 0.2, chestFront + bust[2] * 0.45), bust));
    }
    if (s.he > 0.45) {
      const bl = (s.he - 0.45) * 2.0;
      L.push(ell(TORSO, v3(0, s.waist - 0.5, -2.2), vscale(v3(4.2, 3.2, 2.0), 0.7 + 0.5 * bl)));
    }
    const shx = s.shx, sh = s.sh, up = s.upper, fo = s.fore, ar = s.arm_r, delt = s.delt, hand = s.hand, mu = s.mu;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1.0 : 1.0;
      const x = sx * shx;
      const pa = side === 0 ? ARM_L : ARM_R;
      const pf = side === 0 ? FORE_L : FORE_R;
      const elbow = sh - up;
      const wrist = elbow - fo + 2.2;
      L.push(ell(pa, v3(x + sx * 0.35, sh - 1.0, 0.0), delt));
      L.push(cap(pa, v3(x, sh - 1.5, 0), v3(x, elbow + 0.3, 0.2), ar[0], ar[1]));
      if (!STYLE.simple) L.push(ell(pa, v3(x, sh - up * 0.45, -0.5), v3(ar[0] * 0.85, up * 0.32, ar[0] * (0.82 + 0.15 * mu))));
      L.push(cap(pf, v3(x, elbow, 0.2), v3(x, wrist, 0.0), ar[2], ar[3]));
      if (!STYLE.simple) L.push(ell(pf, v3(x, elbow - 2.4, -0.1), v3(ar[2] * 1.05, fo * 0.3, ar[2] * 0.98)));
      const hy = elbow - fo;
      L.push(ell(pf, v3(x, hy + 0.2, -0.1), hand));
      L.push(cap(pf, v3(x - sx * 0.4, hy + 1.1, -0.9), v3(x - sx * 0.7, hy - 0.4, -1.6), 0.75, 0.6));
    }
    const hx = s.hipx, knee = s.knee, tr = s.thigh_r, shr = s.shin_r, calf = s.calf, foot = s.foot;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1.0 : 1.0;
      const x = sx * hx;
      const pt = side === 0 ? THIGH_L : THIGH_R;
      const ps = side === 0 ? SHIN_L : SHIN_R;
      L.push(cap(pt, v3(x + sx * 0.3, sock + 0.5, 0.0), v3(x, knee + 0.6, -0.2), tr[0], tr[1]));
      if (!STYLE.simple) {
        L.push(ell(pt, v3(x + sx * 0.5, sock - 3.0, -0.6), v3(tr[0] * 0.95, 5.0, tr[0] * 0.92)));
        L.push(ell(ps, v3(x, knee - 0.2, -0.5), v3(tr[1] * 0.92, 1.6, tr[1] * 0.9)));
      }
      L.push(cap(ps, v3(x, knee, 0.0), v3(x, 2.4, 0.4), shr[0], shr[1]));
      L.push(ell(ps, v3(x + sx * 0.15, knee - 4.0, 0.7), vscale(calf, STYLE.simple ? 0.85 : 1.0)));
      const fw = foot[0], fl = foot[1];
      L.push(cap(ps, v3(x, 1.2, 0.9), v3(x + sx * 0.3, 0.9, 0.9 - fl), fw, fw * 0.8));
    }
    return L;
  }

  /** Race skin patterns: tabaxi fur, goliath stone, dragonborn scales, aasimar freckles. */
  skinMarks(a, ids) {
    const R = this.S.race;
    const kind = R.marks ?? '';
    if (kind === '') return;
    const sk = ids.skin, m1 = ids.mark, m2 = ids.mark2;
    const pat = a.marks;
    const S = this.S;
    const storm = a.heritage === 'storm', frost = a.heritage === 'frost';
    const col = this.col, own = this.own;
    for (const i of this.near) {
      if (col[i] !== sk) continue;
      const y = Math.trunc(i / (GX * GZ));
      const r = i % (GX * GZ);
      const x = (r % GX) - OX;
      const z = Math.trunc(r / GX) - OZ;
      const p = own[i];
      const frontSide = z <= -2 && (p === TORSO || p === HIPS);
      switch (kind) {
        case 'fur': {
          if (frontSide && Math.abs(x) <= 3) { col[i] = m2; continue; }
          if (pat === 0) {
            const wob = round(Math.sin(x * 0.7 + z * 0.5) * 1.2);
            if ((y + wob) % 5 === 0 && !frontSide) col[i] = m1;
          } else if (pat === 1) {
            if (hash(Math.trunc(x / 2), Math.trunc(y / 2), Math.trunc(z / 2)) % 7 === 0) col[i] = m1;
          } else if (pat === 3) {
            const nn = Math.sin(x * 0.45 + 1.3) + Math.sin(y * 0.33) + Math.cos(z * 0.55 + y * 0.1);
            if (nn > 1.1) col[i] = m1; else if (nn < -1.0) col[i] = m2;
          }
          break;
        }
        case 'stone': {
          const limbP = p === ARM_L || p === ARM_R || p === FORE_L || p === FORE_R;
          const upper = y + 0.5 > S.hip && (p === TORSO || limbP);
          let hit = false;
          if (pat === 0) hit = upper && (x + y * 2 + Math.abs(z)) % 9 === 0;
          else if (pat === 1) hit = upper && hash(x, y, z) % 11 === 0;
          else if (pat === 2) hit = limbP && y % 4 === 0;
          if (hit) col[i] = storm ? ids.glow2 : m1;
          else if (frost && y + 0.5 > S.sh - 3.0 && hash(x, y, z) % 5 === 0) col[i] = m2;
          break;
        }
        case 'scales':
          if (frontSide && Math.abs(x) <= 3 && y + 0.5 > S.sock - 1.0 && y + 0.5 < S.chest + 2.0) col[i] = y % 2 === 0 ? m1 : m2;
          else if ((x + y + z) % 2 === 0) col[i] = m1;
          break;
        case 'radiant':
          if (pat === 0 && y + 0.5 > S.chest - 1.0 && hash(x, y, z) % 17 === 0) col[i] = ids.glow;
          break;
      }
    }
  }

  /** Base layer under every outfit: modest, sporty underwear. */
  underwear(ids) {
    const u = ids.under, ut = ids.under_tr;
    const S = this.S;
    const fem = S.fem;
    const top = S.hip + (fem ? 0.4 : 0.8);
    const legCut = S.sock - (fem ? 2.5 : 4.0);
    this.shell(M_HIPS | M_THIGH, legCut, top, 0.0, u);
    this.shell(M_HIPS | M_TORSO, top - 0.9, top + 0.1, 0.0, ut);
    if (fem) {
      const chest = S.chest;
      this.shell(M_TORSO, chest - 2.6, chest + 2.0, 0.0, u);
      this.shell(M_TORSO, chest - 2.6, chest - 1.6, 0.0, ut);
      const sx = 3;
      this.shell(M_TORSO, chest + 2.0, S.sh + 1.5, 0.0, u, x => Math.abs(x) === sx);
    }
  }
}

/** GDScript's _hash: int multiplies wrap at 64 bits; only the low 16 bits are kept. */
function hash(x, y, z) {
  const m = (a, k) => BigInt.asIntN(64, BigInt(a) * BigInt(k));
  return Number((m(x, 73856093) ^ m(y, 19349663) ^ m(z, 83492791)) & 0xffffn);
}

export function loftFront(keys, y) {
  for (let i = 0; i < keys.length - 1; i++) {
    const ka = keys[i], kb = keys[i + 1];
    if (y >= ka[0] && y <= kb[0]) {
      const t = smoothstep(ka[0], kb[0], y);
      return lerp(ka[3], kb[3], t) - lerp(ka[2], kb[2], t);
    }
  }
  return -3.0;
}

/** Builds the bare body: skin, race marks, underwear. */
export function makeBody(a, ids) {
  const B = new Body();
  B.S = spec(a);
  B.sculpt(B.bodyPrims(), STYLE.simple ? 1.8 : 1.1);
  B.skin(ids.skin);
  B.skinMarks(a, ids);
  B.underwear(ids);
  return B;
}

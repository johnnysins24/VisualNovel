// Numeric helpers that copy Godot 4 / GDScript behaviour, so the ported character code builds the same voxels
// as Voxel Realm: GDScript floats are doubles, but Vector3, AABB, Color and PackedFloat32Array hold float32.
// Every helper here rounds where Godot rounds.

export const F = Math.fround;

// ---------------------------------------------------------------- scalars (GDScript semantics)

/** int / int in GDScript truncates toward zero. */
export const idiv = (a, b) => Math.trunc(a / b);
/** round() rounds half away from zero. */
export const round = x => (x < 0 ? -Math.round(-x) : Math.round(x));
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  if (Math.abs(a - b) < 1e-5 * Math.max(1, Math.abs(a))) return a <= b ? (x <= a ? 0 : 1) : (x <= b ? 1 : 0);
  const s = clamp((x - a) / (b - a), 0, 1);
  return s * s * (3 - 2 * s);
}

// ---------------------------------------------------------------- Vector3 (float32 components)

export const v3 = (x, y, z) => [F(x), F(y), F(z)];
export const vadd = (a, b) => [F(a[0] + b[0]), F(a[1] + b[1]), F(a[2] + b[2])];
export const vsub = (a, b) => [F(a[0] - b[0]), F(a[1] - b[1]), F(a[2] - b[2])];
/** Vector3 * float: the double is cast to float32 first. */
export const vscale = (a, s) => { const k = F(s); return [F(a[0] * k), F(a[1] * k), F(a[2] * k)]; };
export const vmulv = (a, b) => [F(a[0] * b[0]), F(a[1] * b[1]), F(a[2] * b[2])];
export const vdot = (a, b) => F(F(F(a[0] * b[0]) + F(a[1] * b[1])) + F(a[2] * b[2]));
export const vlen2 = a => F(F(F(a[0] * a[0]) + F(a[1] * a[1])) + F(a[2] * a[2]));
export const vlen = a => F(Math.sqrt(vlen2(a)));
export const vmin = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
export const vmax = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
export const visZero = a => a[0] === 0 && a[1] === 0 && a[2] === 0;

// ---------------------------------------------------------------- AABB (position + size, float32)

export const aabb = (pos, size) => ({ pos, size });
export const aabbEnd = b => vadd(b.pos, b.size);
export function aabbMerge(a, b) {
  const e1 = vadd(a.size, a.pos);
  const e2 = vadd(b.size, b.pos);
  const lo = vmin(a.pos, b.pos);
  const hi = vmax(e1, e2);
  return { pos: lo, size: vsub(hi, lo) };
}

// ---------------------------------------------------------------- Color (float32 rgba)

export const color8 = (r, g, b) => [F(r / 255), F(g / 255), F(b / 255)];
export const colorF = (r, g, b) => [F(r), F(g), F(b)];
export const darkened = (c, k) => { const m = F(1 - k); return c.map(v => F(v * m)); };
export const lightened = (c, k) => { const kk = F(k); return c.map(v => F(v + F(F(1 - v) * kk))); };
export const clerp = (a, b, t) => { const w = F(t); return a.map((v, i) => F(v + F(F(b[i] - v) * w))); };
/** HSV value. */
export const cval = c => Math.max(c[0], c[1], c[2]);
/** How Godot packs a vertex colour: float * 255, truncated to a byte. */
export const toByte = v => Math.max(0, Math.min(255, Math.trunc(v * 255)));

// ---------------------------------------------------------------- RandomNumberGenerator (PCG32, as Godot seeds it)

const MASK64 = (1n << 64n) - 1n;
const MULT = 6364136223846793005n;
const DEFAULT_INC = 1442695040888963407n;

export class RNG {
  constructor(seed = 0) { this.seed(seed); }
  seed(s) {
    this.inc = ((DEFAULT_INC << 1n) | 1n) & MASK64;
    this.state = 0n;
    this._next();
    this.state = (this.state + (BigInt.asUintN(64, BigInt(s)))) & MASK64;
    this._next();
  }
  _next() {
    const old = this.state;
    this.state = (old * MULT + this.inc) & MASK64;
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  }
  /** randi(): a uint32. */
  randi() { return this._next(); }
  /** randf(): the uint32 cast to float32, times 2^-32. */
  randf() { return F(F(this._next()) / 4294967296); }
}

// ---------------------------------------------------------------- colour spaces

export const srgbToLinearPow = c => Math.pow(c, 2.2);
export function linearToSrgb(c) {
  c = clamp(c, 0, 1);
  return c < 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Rounds to the nearest IEEE half float (the 3D buffer is RGBA16F). */
/** x rounded to an IEEE half (the 3D colour buffer is RGBA16F); towardZero matches the reference GPU's writes best. */
export function half(x, towardZero = false) {
  if (x === 0 || !Number.isFinite(x)) return x;
  const s = Math.sign(x);
  const a = Math.abs(x);
  let e = Math.floor(Math.log2(a));
  if (e < -14) e = -14;
  const q = Math.pow(2, e - 10);
  let m = a / q;
  const r = Math.floor(m);
  const f = m - r;
  m = towardZero ? r : f > 0.5 || (f === 0.5 && r % 2 === 1) ? r + 1 : r;
  return s * m * q;
}

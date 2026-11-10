// The world map: แผ่นดินเจ็ดเสา in the year 312 of the Sealed Era, drawn as pixel art from data.
//
//   art/map/world.yaml    land and water: the coast, terrain zones, mountains, rivers, lakes, woods,
//                         farmland, roads, railways, airship routes (ships here, the routes on the
//                         poster), the seal ring, the fallen pillar
//   art/map/places.yaml   every named place: where it is, its picture, its Thai name and a line of lore
//   art/map/palette.yaml  map-only colours and small pictures (ascii, like the scene props)
//
// Colours are the scene palette's (art/scenes/palette.yaml) plus the map's own, with the same times
// of day: at dusk and night the windows, the blue star-dew lamps of the cities and the red demon-coal
// fires of the mines light up, so the night map shows where each of the two fuels burns.
// Names are not drawn into the pixels: the game and the poster put them on top as text
// (labels.json), so they stay sharp at any size and the picture stays the same in every language.
//
//   node art/kit/map.mjs            write public/map/world_<time>.png, public/map/labels.json
//                                   and art/preview/map_<time>.png (3x); the poster with the names
//                                   set in the game's fonts is art/kit/map-poster.mjs
// The same data always gives the same picture.
import YAML from 'yaml';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG } from './png.mjs';

const ART = decodeURIComponent(new URL('../', import.meta.url).pathname);
const readYaml = rel => YAML.parse(readFileSync(join(ART, rel), 'utf8'));
const rgbOf = h => [0, 2, 4].map(i => parseInt(String(h).padStart(6, '0').slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** Seeded random numbers in 0..1 (same generator as the NPC kit). */
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- noise ----------
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x3c6ef372, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** fractal value noise, 0..1 */
function fbm(x, y, s, oct = 4) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= 0.5; f *= 2.03; }
  return v / n;
}

// ---------- geometry ----------
function inPoly(x, y, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const bboxOf = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
/** Catmull-Rom through the points, sampled every `step` px. Returns [[x, y, t], ...], t = 0..1 along. */
export function smooth(pts, { closed = false, step = 0.5 } = {}) {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push([...pts[pts.length - 1]]);
  let len = 0;
  out.forEach((p, i) => { if (i) len += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]); p[2] = len; });
  out.forEach(p => { p[3] = len; p[2] = len ? p[2] / len : 0; });
  return out;
}
/** Quadratic curve from a to b bowed sideways by `bend` px (airship routes). */
function arc(a, b, bend = 0, step = 0.5) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / L) * bend, cy = my + (dx / L) * bend, n = Math.ceil(L / step), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1], t]);
  }
  return out;
}

/** Load the palettes and the map data. */
export function loadMap() {
  const scenePal = readYaml('scenes/palette.yaml'), mapPal = readYaml('map/palette.yaml');
  const materials = { ...scenePal.materials, ...mapPal.materials };
  for (const m of Object.values(materials)) {
    m.rgb = m.ramp.map(rgbOf);
    if (m.lit) m.litRgb = m.lit.map(rgbOf);
  }
  const times = scenePal.times;
  for (const t of Object.values(times)) { t.skyRgb = t.sky.map(rgbOf); t.tintRgb = rgbOf(t.tint[0]); }
  return {
    materials, times, outline: rgbOf(scenePal.outline), star: rgbOf(scenePal.star),
    legend: { ...scenePal.legend, ...mapPal.legend }, sprites: mapPal.sprites,
    world: readYaml('map/world.yaml'), places: readYaml('map/places.yaml') ?? [],
  };
}

/**
 * Draw the map once into an index picture (material + light level per pixel) plus the lights.
 * Colours come later per time of day (paint). Returns { W, H, mat, lvl, names, lights, sparkle, labels }.
 */
export function buildMap(M) {
  const { world: Wd, places } = M;
  const [W, H] = Wd.size, N = W * H, seed = Wd.seed ?? 312;
  const names = Object.keys(M.materials), id = Object.fromEntries(names.map((n, i) => [n, i]));
  const mat = new Int16Array(N).fill(-1), lvl = new Float32Array(N);
  const lights = [], sparkle = new Uint8Array(N); // sparkle: sea pixels that may catch a star at night
  const shadow = new Float32Array(N); // cast shadow, 0..1: darkens and cools whatever is painted there
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  // A group is one drawn thing (a peak, a sprite, a pillar) that gets a 1 px ring round it.
  const stamp = new Int32Array(N);
  let gen = 0, box = null;
  const put = (x, y, m, l) => {
    x = Math.round(x); y = Math.round(y);
    if (!inside(x, y)) return;
    const i = y * W + x, mi = id[m];
    if (mi === undefined) throw new Error(`map: no material "${m}"`);
    mat[i] = mi; lvl[i] = l;
    if (box) {
      stamp[i] = gen;
      if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
    }
  };
  const get = (x, y) => (inside(x, y) ? names[mat[y * W + x]] : null);
  const shade = (x, y, d) => { x = Math.round(x); y = Math.round(y); if (inside(x, y)) lvl[y * W + x] += d; };
  const group = (draw, how = 'ink') => {
    if (box) throw new Error('map: groups do not nest');
    gen++; box = [W, H, -1, -1];
    draw();
    const [x0, y0, x1, y1] = box;
    box = null;
    if (!how || x1 < x0) return;
    // the ring: the sprites' outline colour, or a dark step of whatever is under it
    const on = i => stamp[i] === gen, ring = [];
    for (let y = Math.max(0, y0 - 1); y <= Math.min(H - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(W - 1, x1 + 1); x++) {
      const i = y * W + x;
      if (on(i)) continue;
      if (how === 'shadow') {
        if ((x > 0 && on(i - 1)) || (y > 0 && on(i - W)) || (x > 0 && y > 0 && on(i - W - 1))) ring.push(i);
      } else if ((x > 0 && on(i - 1)) || (x < W - 1 && on(i + 1)) || (y > 0 && on(i - W)) || (y < H - 1 && on(i + W))) ring.push(i);
    }
    for (const i of ring) {
      if (how === 'ink') { mat[i] = id.ink; lvl[i] = 0; } else if (how === 'shadow') lvl[i] = Math.min(lvl[i] - 1.3, 1); else lvl[i] = Math.min(lvl[i] - 1, 0.8);
    }
  };
  const SOFT = new Set(Wd.soft ?? []);
  const sprite = (name, cx, by, { flip = false, how } = {}) => {
    const art = M.sprites[name];
    if (how === undefined) how = SOFT.has(name) ? 'shadow' : 'ink';
    if (!art) throw new Error(`map: no sprite "${name}"`);
    const rows = art.replace(/\n$/, '').split('\n'), w = Math.max(...rows.map(r => r.length));
    const x0 = Math.round(cx - (w - 1) / 2), y0 = Math.round(by) - rows.length + 1;
    group(() => rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      const ref = M.legend[ch];
      if (!ref) throw new Error(`map: sprite ${name}: no legend entry for "${ch}"`);
      const [m, l] = ref.split('@');
      put(flip ? x0 + w - 1 - i : x0 + i, y0 + j, m, l === undefined ? 3 : Number(l));
    })), how);
  };
  const light = (x, y, r, colour, opts = {}) => lights.push({ x, y, r, colour, ...opts });
  const warpAt = (x, y, amp, sc, s) => [
    x + (fbm(x / sc, y / sc, s) - 0.5) * 2 * amp + (fbm(x / (sc / 4), y / (sc / 4), s + 7) - 0.5) * amp * 0.5,
    y + (fbm(x / sc, y / sc, s + 3) - 0.5) * 2 * amp + (fbm(x / (sc / 4), y / (sc / 4), s + 9) - 0.5) * amp * 0.5,
  ];
  const polyOf = c => (Array.isArray(c) ? { poly: c } : c);
  const inShape = (x, y, c, s) => {
    const [wx, wy] = c.warp ? warpAt(x, y, c.warp, c.scale ?? 14, s) : [x, y];
    return inPoly(wx, wy, c.poly);
  };

  // ---------- land ----------
  const C = Wd.coast, warp = C.warp ?? { amp: 8, scale: 40 };
  const land = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [wx, wy] = warpAt(x, y, warp.amp, warp.scale, seed);
    let on = inPoly(wx, wy, C.land);
    for (const isl of C.islands ?? []) {
      if (isl.poly ? inPoly(wx, wy, isl.poly) : Math.hypot(wx - isl.at[0], (wy - isl.at[1]) * (isl.squash ?? 1)) <= isl.r) on = true;
    }
    for (const cut of C.cuts ?? []) if (inShape(x, y, polyOf(cut), seed + 2)) on = false;
    for (const add of C.adds ?? []) if (inShape(x, y, polyOf(add), seed + 4)) on = true;
    land[y * W + x] = on ? 1 : 0;
  }
  // tidy the coast for pixel art: no lone pixels, no one-pixel notches
  for (let pass = 0; pass < 2; pass++) {
    const next = land.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, n = N8.reduce((s, [dx, dy]) => s + land[(y + dy) * W + x + dx], 0);
      if (land[i] && n <= 2) next[i] = 0;
      if (!land[i] && n >= 6) next[i] = 1;
    }
    land.set(next);
  }
  // chamfer distance (in px) to the nearest pixel of the other kind
  const distance = from => {
    const d = new Float32Array(N).fill(1e9);
    for (let i = 0; i < N; i++) if (from(i)) d[i] = 0;
    const A = 1, B = 1.414;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + A);
      if (y > 0) { d[i] = Math.min(d[i], d[i - W] + A); if (x > 0) d[i] = Math.min(d[i], d[i - W - 1] + B); if (x < W - 1) d[i] = Math.min(d[i], d[i - W + 1] + B); }
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + A);
      if (y < H - 1) { d[i] = Math.min(d[i], d[i + W] + A); if (x < W - 1) d[i] = Math.min(d[i], d[i + W + 1] + B); if (x > 0) d[i] = Math.min(d[i], d[i + W - 1] + B); }
    }
    return d;
  };
  const dSea = distance(i => land[i]); // for water: how far from land
  const dLand = distance(i => !land[i]); // for land: how far from water

  // ---------- zones (terrain kinds), later zones win; borders are ragged by a pixel or two ----------
  const zone = new Int8Array(N).fill(-1), Z = Wd.zones;
  Z.forEach((z, k) => {
    const [bx0, by0, bx1, by1] = bboxOf(z.poly), pad = (z.warp ?? 6) * 1.6 + 3;
    for (let y = Math.max(0, Math.floor(by0 - pad)); y <= Math.min(H - 1, by1 + pad); y++) for (let x = Math.max(0, Math.floor(bx0 - pad)); x <= Math.min(W - 1, bx1 + pad); x++) {
      const i = y * W + x;
      if (!land[i]) continue;
      let [wx, wy] = warpAt(x, y, z.warp ?? 6, z.scale ?? 30, seed + 50 + k);
      const j = z.jitter ?? 1.2;
      wx += (hash3(x, y, seed + k * 7) - 0.5) * 2 * j; wy += (hash3(y, x, seed + k * 7 + 1) - 0.5) * 2 * j;
      if (inPoly(wx, wy, z.poly)) zone[i] = k;
    }
  });
  const kindAt = i => (zone[i] >= 0 ? Z[zone[i]].kind : 'grass');

  // ---------- height: low coasts, raised inland, ranges as ridges ----------
  const hgt = new Float32Array(N);
  const ridge = new Float32Array(N).fill(1e9); // distance to the nearest range line
  const ridgeH = new Float32Array(N), ridgeW = new Float32Array(N).fill(1);
  for (const r of Wd.ranges ?? []) {
    const line = smooth(r.line, { step: 1 }), R = Math.ceil(r.width * 2.4);
    for (const [px, py, t] of line) {
      const hh = (r.height ?? 1) * (r.taper === false ? 1 : 0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 1.15 - 0.075, 0, 1)));
      for (let y = Math.floor(py - R); y <= py + R; y++) for (let x = Math.floor(px - R); x <= px + R; x++) {
        if (!inside(x, y)) continue;
        const i = y * W + x, d = Math.hypot(x - px, y - py);
        if (d < ridge[i]) { ridge[i] = d; ridgeH[i] = hh; ridgeW[i] = r.width; }
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) { hgt[i] = -Math.min(1, dSea[i] / 30) * 0.3; continue; }
    const k = kindAt(i), rough = { mountain: 0.55, heath: 0.3, ash: 0.16, cinder: 0.2, pine: 0.32, ileth: 0.2, wood: 0.2, meadow: 0.14 }[k] ?? 0.12;
    let h = Math.min(1, dLand[i] / 50) * 0.18 + (fbm(x / 34, y / 34, seed + 11) - 0.5) * rough;
    if (ridge[i] < 1e8) h += ridgeH[i] * Math.exp(-((ridge[i] / ridgeW[i]) ** 2)) * (0.75 + 0.5 * fbm(x / 9, y / 9, seed + 13));
    if (k === 'mountain') h += (1 - Math.abs(fbm(x / 13, y / 13, seed + 17) * 2 - 1)) * 0.22;
    hgt[i] = h;
  }
  const slopeLight = (x, y) => {
    // light from the upper left, like the scenes and sprites
    const at = (X, Y) => hgt[clamp(Y, 0, H - 1) * W + clamp(X, 0, W - 1)];
    const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
    return clamp(-(gx + gy) * 9, -1.4, 1.4);
  };

  // ---------- paint the ground ----------
  const r0 = rng(`${seed}:ground`);
  const speck = (amt = 0.5, p = 0.14) => (r0() < p ? (r0() < 0.5 ? -amt : amt) : 0);
  const ASH = Wd.ash ?? {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) continue;
    const k = kindAt(i), sl = slopeLight(x, y), h = hgt[i];
    let m = 'grass', l = 2.6 + sl * 0.8 + speck();
    switch (k) {
      case 'farm': m = 'crop'; l = 2.7 + sl * 0.6 + speck() + (fbm(x / 7, y / 7, seed + 25) - 0.5) * 0.9; break;
      case 'grass': break;
      case 'meadow': m = 'grass'; l = 2.9 + sl * 0.7 + speck() + (fbm(x / 8, y / 8, seed + 26) - 0.5) * 0.9; break;
      case 'wood': m = 'leaf'; l = 1.6 + sl * 0.5 + speck(); break;
      case 'ileth': m = 'elf_leaf'; l = 1.2 + sl * 0.5 + speck(); break;
      case 'pine': m = 'pine'; l = 1.8 + sl * 0.7 + speck(); break;
      case 'clearing': {
        // the logging front: churned ground, stumps, sawdust
        const n = fbm(x / 5, y / 5, seed + 27);
        m = n > 0.56 ? 'dirt' : 'grass'; l = m === 'dirt' ? 2.4 + speck(0.6, 0.3) : 2.2 + speck();
        break;
      }
      case 'heath': m = 'heath'; l = 2.5 + sl * 1 + speck() + (fbm(x / 9, y / 9, seed + 28) - 0.5) * 0.8; break;
      case 'mountain': {
        // between the peaks: bare scree up high, moor in the lower valleys, snow on the very top
        m = h > (Wd.snow ?? 0.62) + (fbm(x / 6, y / 6, seed + 5) - 0.5) * 0.12 ? 'snow' : h > 0.5 ? 'scree' : 'heath';
        l = (m === 'snow' ? 3.2 : 2.8) + sl * 1.1 + speck(0.4, 0.1);
        break;
      }
      case 'ash': {
        // knee-deep grey ash, combed into long low ripples by the wind, darker toward the stump
        m = 'ash';
        const rip = Math.sin((x * 0.5 + y * 0.95 + fbm(x / 18, y / 18, seed + 23) * 26) * 0.95);
        l = 2.7 + sl * 0.6 + (rip > 0.8 ? 0.6 : rip < -0.86 ? -0.5 : 0) + speck(0.5, 0.12);
        if (ASH.centre) l -= clamp(1 - Math.hypot(x - ASH.centre[0], y - ASH.centre[1]) / (ASH.dark ?? 80), 0, 1) * 1.1;
        break;
      }
      case 'cinder': {
        m = 'cinder';
        l = 2.1 + sl * 0.8 + speck(0.6, 0.25);
        if (fbm(x / 4, y / 4, seed + 24) > 0.62) l -= 0.8;
        break;
      }
      case 'marsh': m = (x * 7 + y * 3) % 11 === 0 || r0() < 0.1 ? 'river' : 'marsh'; l = m === 'river' ? 2.8 : 2.4 + speck(); break;
      case 'sand': m = 'sand'; l = 3 + sl * 0.5 + speck(); break;
      case 'city': m = 'stone'; l = 2.6 + speck(0.4, 0.2); break;
      default: throw new Error(`map: unknown zone kind "${k}"`);
    }
    // the coast: sand beaches, grey ash shores, dark rock where the ground is high
    if (dLand[i] <= 1.01) {
      if (k === 'ash' || k === 'cinder') { m = 'ash'; l = 3.6; }
      else if (k === 'mountain' || k === 'heath' || h > 0.38) { m = 'rock'; l = 1.4; }
      else { m = 'sand'; l = 3.4; }
    } else if (dLand[i] <= 2.01 && !['mountain', 'ash', 'cinder', 'heath'].includes(k) && h < 0.3 && fbm(x / 9, y / 9, seed + 21) > 0.48) { m = 'sand'; l = 2.8; }
    put(x, y, m, l);
  }
  // silver grass on the ash, rough tufts on the heath, gorse on the meadows
  {
    const r = rng(`${seed}:tufts`);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!land[i] || dLand[i] < 2) continue;
      const k = kindAt(i), v = r();
      if (k === 'ash') {
        // silver grass grows in clumps across the ash, and not at all in the dark ground by the stump
        const near = ASH.centre ? clamp(1 - Math.hypot(x - ASH.centre[0], y - ASH.centre[1]) / ((ASH.dark ?? 80) * 0.7), 0, 1) : 0;
        if (v < 0.11 * clamp((fbm(x / 13, y / 13, seed + 29) - 0.42) * 3.2, 0, 1) * (1 - near)) { put(x, y, 'silver_grass', 2.4 + r() * 1.4); if (r() < 0.5) put(x + 1, y, 'silver_grass', 1.8); }
      }
      if (k === 'heath' && v < 0.035) put(x, y, 'grass', 1.4);
      if ((k === 'meadow' || k === 'farm') && v < 0.012) put(x, y, 'leaf', 1.6);
    }
  }

  // ---------- water ----------
  {
    const r = rng(`${seed}:sea`), edge = Wd.sea?.edge ?? 26;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (land[i]) continue;
      const d = dSea[i], toEdge = Math.min(x, y, W - 1 - x, H - 1 - y);
      // depth: shallows by the coast, open sea further out, darker toward the frame
      let depth = d <= 2 ? 0 : d <= 5 ? 1 : d <= 9 ? 2 : d <= 15 ? 3 : d <= 24 ? 4 : 5;
      const frac = d <= 2 ? 0 : d <= 5 ? (d - 2) / 3 : d <= 9 ? (d - 5) / 4 : d <= 15 ? (d - 9) / 6 : d <= 24 ? (d - 15) / 9 : 0;
      if (frac > 0 && dither(x, y) < frac * 0.5) depth++; // a dithered seam between depth bands
      if (toEdge < edge && dither(x, y) < (1 - toEdge / edge) * 0.8) depth++;
      const [m, l] = [['shoal', 3.6], ['shoal', 2.6], ['shoal', 1.6], ['sea', 3.6], ['sea', 2.6], ['sea', 1.6], ['sea', 0.6]][Math.min(6, depth)];
      put(x, y, m, l);
      if (d >= 6 && r() < 0.022) sparkle[i] = 1;
    }
    // the coastline itself: a dark line on the water side, surf a pixel further out
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (land[i]) continue;
      if (dSea[i] <= 1.01) put(x, y, 'sea', 0.4);
      else if (dSea[i] <= 2.01 && fbm(x / 5, y / 5, seed + 31) > 0.52) put(x, y, 'shoal', 4.2);
    }
    // little wave marks out at sea
    for (let k = 0; k < (Wd.sea?.waves ?? 160); k++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H), i = y * W + x;
      if (land[i] || dSea[i] < 9 || Math.min(x, y, W - 1 - x, H - 1 - y) < 8) continue;
      const m = names[mat[i]], l = lvl[i] + 1;
      put(x, y, m, l); put(x + 1, y - 1, m, l); put(x + 2, y - 1, m, l); put(x + 3, y, m, l);
    }
    // rocks just under the water: a dark speck ringed with foam
    for (const [x, y] of Wd.sea?.rocks ?? []) {
      put(x, y, 'rock', 1); put(x + 1, y, 'rock', 2.2);
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, 1], [0, 1]]) if (!land[(y + dy) * W + x + dx]) put(x + dx, y + dy, 'shoal', 4.2);
    }
  }

  // ---------- rivers and lakes ----------
  const water = new Uint8Array(N); // rivers and lakes, for bridges
  for (const lake of Wd.lakes ?? []) {
    const g = new Uint8Array(N), [bx0, by0, bx1, by1] = bboxOf(lake.poly);
    for (let y = Math.floor(by0) - 4; y <= by1 + 4; y++) for (let x = Math.floor(bx0) - 4; x <= bx1 + 4; x++) {
      if (!inside(x, y)) continue;
      const [wx, wy] = warpAt(x, y, 2, 12, seed + 61);
      if (inPoly(wx, wy, lake.poly)) { put(x, y, 'river', 2.4 + (dither(x, y) < 0.25 ? 0.6 : 0)); g[y * W + x] = 1; water[y * W + x] = 1; }
    }
    for (let y = Math.floor(by0) - 5; y <= by1 + 5; y++) for (let x = Math.floor(bx0) - 5; x <= bx1 + 5; x++) {
      if (inside(x, y) && !g[y * W + x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && g[(y + dy) * W + x + dx])) put(x, y, 'river', 0.6);
    }
  }
  const riverLines = [];
  (Wd.rivers ?? []).forEach((rv, ri) => {
    // the drawn line wanders a little either side of the given one, fixed at both ends
    const base = smooth(rv.line, { step: 0.3 }), amp = rv.meander ?? 1.6, len = base[0][3];
    const line = base.map(([px, py, t], k) => {
      const a = base[Math.max(0, k - 5)], b = base[Math.min(base.length - 1, k + 5)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const off = (fbm((t * len) / 10, 0.5, seed + 41 + ri) - 0.5) * 2.6 * amp * Math.min(1, t * 10, (1 - t) * 10);
      return [px - (dy / L) * off, py + (dx / L) * off, t];
    });
    riverLines.push(line);
    const [w0, w1] = rv.width ?? [1, 2];
    for (const [px, py, t] of line) {
      const w = w0 + (w1 - w0) * t;
      for (let y = Math.floor(py - w); y <= py + w; y++) for (let x = Math.floor(px - w); x <= px + w; x++) {
        if (Math.hypot(x - px, y - py) > w / 2 + 0.01) continue;
        const i = y * W + x;
        if (!inside(x, y) || !land[i]) continue;
        put(x, y, 'river', w >= 2 ? 2.6 : 2.2); water[i] = 1;
      }
      const X = Math.round(px), Y = Math.round(py);
      if (inside(X, Y) && land[Y * W + X]) { put(X, Y, 'river', w >= 2 ? 3 : 2.2); water[Y * W + X] = 1; }
    }
  });
  // river banks: the ground right of and below the water a step darker
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (water[i] || !land[i]) continue;
    if (water[i - 1] || water[i - W]) shade(x, y, -0.7);
  }

  // ---------- farmland: a patchwork of fields round the villages, hedges between ----------
  const farms = places.filter(p => p.farms).map(p => [p.at[0], p.at[1], p.farms]);
  const farmed = (x, y) => {
    if (!farms.length) return 0;
    let best = 9;
    for (const [fx, fy, fr] of farms) { const d = Math.hypot(x - fx, (y - fy) * 1.15) / fr; if (d < best) best = d; }
    return best;
  };
  for (const f of Wd.fields ?? []) {
    const ang = ((f.angle ?? 12) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const [cw, ch] = f.cell ?? [8, 6], kinds = f.kinds ?? ['field', 'field', 'crop', 'crop', 'dirt', 'grass'];
    const cellOf = (x, y) => {
      const u = x * ca + y * sa, v = -x * sa + y * ca, row = Math.floor(v / ch), shift = hash3(row, 0, seed + 71) * cw;
      return [Math.floor((u + shift) / cw), row, u, v, shift];
    };
    const keep = new Map(); // per field: cultivated or not, decided at its middle
    const cultivated = (cu, cv, shift) => {
      const key = cu * 4096 + cv;
      if (keep.has(key)) return keep.get(key);
      const uc = (cu + 0.5) * cw - shift, vc = (cv + 0.5) * ch, xc = uc * ca - vc * sa, yc = uc * sa + vc * ca;
      const ok = farmed(xc, yc) < (f.reach ?? 1) + (hash3(cu, cv, seed + 74) - 0.5) * 0.35;
      keep.set(key, ok);
      return ok;
    };
    const [bx0, by0, bx1, by1] = bboxOf(f.poly);
    for (let y = Math.max(0, Math.floor(by0) - 6); y <= Math.min(H - 1, by1 + 6); y++) for (let x = Math.max(0, Math.floor(bx0) - 6); x <= Math.min(W - 1, bx1 + 6); x++) {
      const i = y * W + x;
      if (!land[i] || water[i] || dLand[i] < 2.5) continue;
      const [wx, wy] = warpAt(x, y, 4, 22, seed + 73);
      if (!inPoly(wx, wy, f.poly)) continue;
      const [cu, cv, u, , shift] = cellOf(x, y);
      if (farms.length && !cultivated(cu, cv, shift)) continue;
      const [ru, rv] = cellOf(x + 1, y), [du, dv] = cellOf(x, y + 1);
      const hsh = hash3(cu, cv, seed + 77), kind = kinds[Math.floor(hsh * kinds.length)];
      const sl = slopeLight(x, y) * 0.4;
      if (cu !== ru || cv !== dv) {
        // hedge or a cart track between the fields, with gaps
        if (hash3(cu * 3 + (cu !== ru ? 1 : 0), cv, seed + 79) < 0.5) put(x, y, hash3(cu, cv, seed + 80) < 0.6 ? 'leaf' : 'dirt', hash3(cu, cv, seed + 80) < 0.6 ? 2 : 3);
        continue;
      }
      let l = 2.7;
      if (kind === 'field') l = 2.4 + (hsh < 0.25 ? 0.5 : 0) + ((x * 5 + y * 3) % 13 === 0 ? -0.5 : 0);
      if (kind === 'dirt') l = Math.floor(u) % 2 ? 2 : 2.8; // ploughed furrows
      if (kind === 'crop') l = 2.4 + (Math.floor(u / 2) % 2 ? 0.5 : 0) + (hsh > 0.8 ? -0.6 : 0);
      if (kind === 'grass') l = 3.1;
      put(x, y, kind, l + sl);
    }
  }

  // ---------- woods: round crowns, pines, Ileth's giants, lone trees in the fields ----------
  const crowns = [], stumps = [];
  for (const wd of Wd.woods ?? []) {
    const r = rng(`${seed}:wood:${wd.poly[0]}`), [rMin, rMax] = wd.r ?? [2, 3], step = wd.every ?? 3;
    const [bx0, by0, bx1, by1] = bboxOf(wd.poly), pad = (wd.warp ?? 5) * 1.6 + 4;
    for (let y = Math.max(0, Math.floor(by0 - pad)); y <= Math.min(H - 1, by1 + pad); y += step) for (let x = Math.max(0, Math.floor(bx0 - pad)); x <= Math.min(W - 1, bx1 + pad); x += step) {
      const jx = x + (r() - 0.5) * step * 1.4, jy = y + (r() - 0.5) * step * 1.4;
      const [wx, wy] = warpAt(jx, jy, wd.warp ?? 5, wd.scale ?? 26, seed + 91);
      if (!inPoly(wx, wy, wd.poly)) continue;
      const i = Math.round(clamp(jy, 0, H - 1)) * W + Math.round(clamp(jx, 0, W - 1));
      if (!land[i] || water[i] || dLand[i] < 1.5) continue;
      if ((wd.holes ?? []).some(hp => inPoly(wx, wy, hp))) { if (r() < 0.45) stumps.push([jx, jy]); continue; } // felled
      if (wd.clear && fbm(jx / 18, jy / 18, seed + 93) < wd.clear) continue; // glades
      if (r() > (wd.density ?? 0.85)) continue;
      crowns.push({ x: jx, y: jy, r: rMin + r() * (rMax - rMin), kind: wd.kind ?? 'round', mat: wd.mat ?? 'leaf' });
    }
  }
  for (const sc of Wd.scatter ?? []) {
    // hedgerow oaks and orchard trees across the open country
    const r = rng(`${seed}:scatter:${sc.kinds}`), step = sc.every ?? 6, [rMin, rMax] = sc.r ?? [1, 1.6];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const jx = x + (r() - 0.5) * step, jy = y + (r() - 0.5) * step, X = Math.round(jx), Y = Math.round(jy);
      if (!inside(X, Y)) continue;
      const i = Y * W + X;
      if (!land[i] || water[i] || dLand[i] < 3 || !sc.kinds.includes(kindAt(i))) continue;
      if (r() > (sc.p ?? 0.1) * (0.4 + fbm(jx / 20, jy / 20, seed + 95) * 1.2)) continue;
      crowns.push({ x: jx, y: jy, r: rMin + r() * (rMax - rMin), kind: sc.kind ?? 'round', mat: sc.mat ?? 'leaf' });
    }
  }
  for (const t of Wd.trees ?? []) crowns.push({ x: t.at[0], y: t.at[1], r: t.r, kind: t.kind ?? 'round', mat: t.mat ?? 'elf_leaf', big: true });
  for (const [x, y] of stumps) { put(x, y, 'timber', 3.4); shade(x + 1, y, -0.6); }
  crowns.sort((a, b) => a.y - b.y || a.x - b.x);
  const crown = c => {
    if (c.kind === 'pine') {
      const h = Math.round(c.r * 2 + 1), cx = Math.round(c.x), by = Math.round(c.y);
      shade(cx + 1, by + 1, -0.8); shade(cx + 2, by + 1, -0.6);
      for (let j = 0; j < h; j++) {
        const half = Math.floor((j + 1) * 0.45 + (j % 2 ? 0.3 : 0));
        for (let dx = -half; dx <= half; dx++) put(cx + dx, by - h + 1 + j, c.mat, j === 0 ? 3.6 : dx < 0 ? 3 : dx === 0 ? 2.4 : 1.4);
      }
      return;
    }
    const R = c.r, cx = c.x, cy = c.y;
    for (let y = Math.floor(cy - R) + 1; y <= cy + R + 1.5; y++) for (let x = Math.floor(cx - R) + 1; x <= cx + R + 1.5; x++) {
      const d = Math.hypot(x - cx - 0.8, y - cy - 0.9);
      if (d <= R && get(x, y) !== c.mat) shade(x, y, -0.5); // shadow on the ground, lower right
    }
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy * 1.05);
      if (d > R) continue;
      const s = (-dx - dy) / (R * 1.5);
      let l = 2.3 + s * 1.4;
      if (d > R - 0.9 && dx + dy > 0) l = 1.1;
      put(x, y, c.mat, l);
    }
  };
  // Ileth's giants, taller than bell towers: a heap of leaf masses, each lit from the upper left,
  // dark between them, throwing a long shadow over the canopy below
  const giant = c => {
    const R = c.r, rr = rng(`${seed}:giant:${Math.round(c.x)}:${Math.round(c.y)}`), n = Math.max(5, Math.round(R * 0.9));
    const parts = [{ x: c.x, y: c.y - R * 0.2, r: R * 0.55 }];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rr() * 0.5, d = R * (0.5 + rr() * 0.15);
      parts.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.8, r: R * (0.36 + rr() * 0.12) });
    }
    // fill the heap with small leaf clumps, back to front, on a dome lit from the upper left
    const inHeap = (x, y) => parts.some(p => (x - p.x) ** 2 + (y - p.y) ** 2 <= p.r * p.r);
    for (let y = Math.floor(c.y - R); y <= c.y + R * 2.2; y++) for (let x = Math.floor(c.x - R); x <= c.x + R * 2.4; x++) {
      const t = Math.hypot((x - c.x - R * 0.9) / 1.6, y - c.y - R * 0.55);
      if (t < R * 0.95 && inside(x, y) && !inHeap(x, y)) shadow[y * W + x] = Math.max(shadow[y * W + x], 0.45);
    }
    const clumps = [];
    for (let y = c.y - R; y <= c.y + R; y += 1.7) for (let x = c.x - R; x <= c.x + R; x += 1.9) {
      const jx = x + (rr() - 0.5) * 1.2, jy = y + (rr() - 0.5) * 1.2;
      if (inHeap(jx, jy)) clumps.push([jx, jy, 1.5 + rr() * 0.9]);
    }
    clumps.sort((a, b) => a[1] - b[1]);
    for (const [px, py, pr] of clumps) for (let y = Math.floor(py - pr); y <= py + pr; y++) for (let x = Math.floor(px - pr); x <= px + pr; x++) {
      const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
      if (d > pr || !inHeap(x, y)) continue;
      const dome = (-(x - c.x) - (y - c.y)) / (R * 1.6);
      let l = 3.2 + dome * 1.5 + ((-dx - dy) / (pr * 1.4)) * 1.2; // their tops stand up in the sun
      if (d > pr - 0.8 && dx + dy > 0) l -= 1.5; // each clump's shaded under-edge
      put(x, y, c.mat, l);
    }
  };
  for (const c of crowns) if (!c.big) crown(c);
  for (const c of crowns) if (c.big) group(() => giant(c), 'ink'); // the giants stand over the canopy

  // ---------- hills and mountains, drawn back to front ----------
  const peaks = [];
  const MT = Wd.mountains;
  if (MT) {
    // a jittered lattice over the mountain zone; the peaks grow with the height under them
    const every = MT.every ?? 7, rowH = every * (MT.rows ?? 0.55), r = rng(`${seed}:mountains`), [s0, s1] = MT.size ?? [5, 16];
    for (let row = 0, gy = 0; gy < H; row++, gy += rowH) for (let gx = (row % 2) * every * 0.5; gx < W; gx += every) {
      const x = gx + (r() - 0.5) * every * 0.8, y = gy + (r() - 0.5) * rowH * 0.8, X = Math.round(x), Y = Math.round(y);
      const a = r(), b = r(), c = r();
      if (!inside(X, Y)) continue;
      const i = Y * W + X;
      if (!land[i] || kindAt(i) !== 'mountain' || dLand[i] < 2.5) continue;
      if ((MT.gaps ?? []).some(g => Math.hypot(x - g.at[0], y - g.at[1]) < g.r)) continue;
      const t = clamp((hgt[i] - 0.1) / 1.1, 0, 1);
      // fewer peaks where the ground is low: valleys and high meadows show between the ranges
      if (a > (MT.fill ?? 0.3) + t * (MT.climb ?? 0.8) + (fbm(x / 22, y / 22, seed + 19) - 0.5) * 0.8) continue;
      if (t < (MT.foot ?? 0) && a > 0.1) continue; // low ground is left to the rounded foothills
      const size = (s0 + (s1 - s0) * t * t) * (0.7 + b * 0.6), line = MT.snowline ?? 0.9;
      const snow = hgt[i] > line ? clamp((hgt[i] - line) * 1.4 + 0.16, 0, 0.42) : 0;
      peaks.push({ x, y, hw: size * (0.8 + c * 0.6), h: size, snow, mat: c < 0.08 ? 'scree' : 'rock' });
    }
  }
  for (const pk of Wd.peaks ?? []) peaks.push({ x: pk.at[0], y: pk.at[1], hw: pk.w, h: pk.h, snow: pk.snow ?? 0.4, mat: pk.mat ?? 'rock', terraces: pk.terraces, span: pk.span, summit: pk.summit ?? 0, rough: pk.rough ?? 0.6, spurs: pk.spurs ?? 0.32, big: true });
  const hills = [];
  for (const hs of Wd.hills ?? []) {
    const every = hs.every ?? 9, r = rng(`${seed}:hills:${hs.kinds}`), [s0, s1] = hs.size ?? [3, 6];
    for (let row = 0, gy = 0; gy < H; row++, gy += every * 0.6) for (let gx = (row % 2) * every * 0.5; gx < W; gx += every) {
      const x = gx + (r() - 0.5) * every, y = gy + (r() - 0.5) * every * 0.5, X = Math.round(x), Y = Math.round(y);
      const a = r(), b = r();
      if (!inside(X, Y)) continue;
      const i = Y * W + X;
      if (!land[i] || water[i] || dLand[i] < 3 || !hs.kinds.includes(kindAt(i)) || a > (hs.p ?? 0.5)) continue;
      if ((MT?.gaps ?? []).some(g => Math.hypot(x - g.at[0], y - g.at[1]) < g.r)) continue;
      const size = s0 + (s1 - s0) * b;
      hills.push({ x, y, hw: size * 1.3, h: size * 0.75, mat: hs.mat ?? 'heath', hill: true });
    }
  }
  hills.sort((a, b) => a.y - b.y || a.x - b.x);
  peaks.sort((a, b) => a.y - b.y || a.x - b.x);
  const hill = hl => group(() => {
    const { x: cx, y: by, hw, h } = hl, top = by - h;
    for (let y = Math.round(top); y <= Math.round(by); y++) {
      const t = (y - top) / h, half = hw * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        const s = (x - cx) / Math.max(1, hw) - t * 0.4;
        put(x, y, hl.mat, s < -0.25 ? 3.6 : s < 0.15 ? 2.9 : 2.1);
      }
    }
  }, 'darken');
  // A peak is a ridge line seen from the south: a tent with its summit off the middle, broken into
  // shoulders and lesser summits by noise. Each pixel under the ridge is lit by which way the ridge
  // runs above it, looked at more broadly the further down the face it is, so the crags are sharp at
  // the top and the faces merge into one lit flank and one shaded flank toward the foot. Light from
  // the upper left like everything else. Peaks overlap back to front with a dark rim along the
  // crest of the nearer one; the whole range shares one ink outline (one per peak laces it with black).
  const vnoise = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash3(i, 7, s) * (1 - u) + hash3(i + 1, 7, s) * u; };
  const onPeak = new Uint8Array(N);
  const peak = pk => {
    const { x: cx, y: by, hw, h } = pk, rr = rng(`${seed}:pk:${Math.round(cx)}:${Math.round(by)}`);
    const s = pk.summit ?? (rr() - 0.5) * 0.7, o1 = rr() * 50, o2 = rr() * 50, o3 = rr() * 50, rough = pk.rough ?? 1;
    const x0 = Math.floor(cx - hw), x1 = Math.ceil(cx + hw), tops = new Float32Array(x1 - x0 + 1);
    for (let x = x0; x <= x1; x++) {
      const u = clamp((x - cx) / hw, -1, 1), env = Math.min(1, (1 - Math.abs(u)) * 2.4);
      let p = u < s ? (u + 1) / (s + 1) : (1 - u) / (1 - s);
      p += ((vnoise(u * 2.4 + o1, seed + 31) - 0.5) * 0.46 + (vnoise(u * 5.5 + o2, seed + 32) - 0.5) * 0.22 + (vnoise(u * 12 + o3, seed + 33) - 0.5) * 0.1) * env * rough;
      tops[x - x0] = by - h * clamp(p, 0, 1.15);
    }
    const topAt = x => {
      if (x <= x0 || x >= x1) return by;
      const k = x - x0, k0 = Math.floor(k), f = k - k0;
      return tops[k0] * (1 - f) + tops[Math.min(k0 + 1, x1 - x0)] * f;
    };
    // the dark rim where this peak's crest stands in front of another
    for (let x = x0; x <= x1; x++) {
      const T = Math.round(tops[x - x0]);
      if (T >= by) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [1, -1]]) {
        const X = x + dx, Y = T + dy;
        if (inside(X, Y) && onPeak[Y * W + X] && Y < Math.round(topAt(X))) put(X, Y, get(X, Y) === 'snow' ? 'snow' : pk.mat, get(X, Y) === 'snow' ? 1.2 : 0.6);
      }
    }
    // the main summit, and how wide the body is on each side of it, row by row
    let si = 0;
    for (let k = 1; k < tops.length; k++) if (tops[k] < tops[si]) si = k;
    const sx = x0 + si, ys = Math.round(tops[si]), rowL = [], rowR = [];
    for (let y = ys; y <= Math.round(by); y++) {
      let l = sx, rgt = sx;
      while (l - 1 >= x0 && tops[l - 1 - x0] <= y) l--;
      while (rgt + 1 <= x1 && tops[rgt + 1 - x0] <= y) rgt++;
      rowL.push(l); rowR.push(rgt);
    }
    // spurs and gullies run down from the summit: the face turns toward the light or away from it
    // with the bearing round the mountain, and noise in the bearing makes the ridges
    const g = a => vnoise(a * 3.2 + o1, seed + 37) * 0.6 + vnoise(a * 7 + o3, seed + 38) * 0.3;
    for (let x = x0; x <= x1; x++) {
      const T = Math.round(tops[x - x0]);
      if (T >= by) continue;
      for (let y = Math.max(T, ys); y <= Math.round(by); y++) {
        const depth = y - T, L = rowL[y - ys], R = rowR[y - ys];
        const a = x < sx ? -(sx - x) / Math.max(1, sx - L) : (x - sx) / Math.max(1, R - sx);
        const gp = (g(a + 0.04) - g(a - 0.04)) / 0.08, crest = (topAt(x + 1.5) - topAt(x - 1.5)) / 3, wc = clamp(1 - depth / 4, 0, 1);
        const f = (a * 0.9 + gp * (pk.spurs ?? 0.2)) * (1 - wc) + crest * 1.3 * wc;
        let m = pk.mat, l = f < -0.35 ? 3.5 : f < 0.02 ? 2.8 : f < 0.45 ? 1.9 : 1.35;
        if (depth === 0) l = f < 0.02 ? 3.95 : 2.3; // the crest catches the light
        l -= (depth / h) * 0.3;
        if (depth > 1 && hash3(x, Math.floor(y / 2), seed + 34) < 0.05) l -= 0.7; // crags
        const above = (by - y) / h + (g(a) - 0.45) * 0.3 + (vnoise(x * 0.45 + o2, seed + 35) - 0.5) * 0.06;
        if (pk.snow > 0 && above > 1 - pk.snow) { m = 'snow'; l = l >= 3.4 ? 4 : l >= 2.6 ? 3.3 : l >= 1.7 ? 2.2 : 1.6; }
        put(x, y, m, l);
        onPeak[y * W + x] = 1;
      }
    }
    if (pk.terraces) {
      // Tundar: ring roads cut round the mountain under the pillar, lit windows on every level
      const [f0, f1] = pk.span ?? [0.12, 0.7];
      for (let k = 0; k < pk.terraces; k++) {
        const f = f0 + ((f1 - f0) * (k + 0.5)) / pk.terraces, y0 = by - h + h * f;
        for (let x = x0 + 1; x <= x1 - 1; x++) {
          const y = Math.round(y0 + ((x - cx) / hw) * 1.6 * (k % 2 ? 1 : -1)); // the roads climb as they go round
          if (y <= tops[x - x0] + 1 || y >= by - 1) continue;
          put(x, y, 'stone', x < sx ? 3.8 : 2.6);
          if ((x + k * 3) % 3 === 0 && y + 1 < by - 1) put(x, y + 1, 'window', 3);
        }
      }
    }
  };
  for (const hl of hills) hill(hl);
  group(() => { for (const pk of peaks) peak(pk); }, 'ink');

  // ---------- roads, plank ways, railways, bridges ----------
  const road = new Uint8Array(N);
  for (const rd of Wd.roads ?? []) {
    const line = smooth(rd.line, { step: 0.4 }), kind = rd.kind ?? 'road';
    let last = -1, n = 0;
    for (const [px, py] of line) {
      const X = Math.round(px), Y = Math.round(py), i = Y * W + X;
      if (!inside(X, Y) || i === last) continue;
      last = i; n++;
      if (water[i]) { if (kind !== 'ford') put(X, Y, 'plank', 4); road[i] = 2; continue; } // a bridge
      if (!land[i]) continue;
      if ((kind === 'track' || kind === 'ash') && n % 3 === 0) continue;
      if (kind === 'planks') { put(X, Y, 'plank', (X + Y) % 3 === 0 ? 1.6 : 3.6); road[i] = 1; continue; }
      if (kind === 'ash') { put(X, Y, 'ash', 1.4); road[i] = 1; continue; }
      if (kind === 'pass') { put(X, Y, 'dirt', 3.8); road[i] = 1; continue; }
      put(X, Y, 'dirt', kind === 'track' ? 3 : 3.5); road[i] = 1;
    }
  }
  for (const rl of Wd.rails ?? []) {
    const line = smooth(rl.line, { step: 0.35 });
    let last = -1, k = 0;
    for (let n = 0; n < line.length; n++) {
      const [px, py] = line[n], X = Math.round(px), Y = Math.round(py), i = Y * W + X;
      if (!inside(X, Y) || i === last) continue;
      last = i; k++;
      const a = line[Math.max(0, n - 3)], b = line[Math.min(line.length - 1, n + 3)];
      const steep = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
      if (water[i] || !land[i]) {
        // an iron bridge: girders either side
        put(X, Y, 'metal', 3.6);
        if (steep) { put(X - 1, Y, 'ink', 0); put(X + 1, Y, 'ink', 0); } else { put(X, Y - 1, 'ink', 0); put(X, Y + 1, 'ink', 0); }
        continue;
      }
      if (rl.disused) { if (k % 3) put(X, Y, 'dark_stone', 2.4); continue; } // rusting, half under the ash
      if (rl.tram) { put(X, Y, 'metal', 2); continue; }
      put(X, Y, 'dark_stone', 0.6);
      // sleepers: a light tick across the line every other pixel
      if (k % 2 === 0) { if (steep) put(X + 1, Y, 'plank', 3.2); else put(X, Y + 1, 'plank', 3.2); }
      road[i] = 3;
    }
  }

  // ---------- the pillars' long shadows (drawn under the towns) ----------
  const [sdx, sdy] = Wd.shadow ?? [0.86, 0.5];
  for (const pl of places.filter(p => p.pillar && !p.pillar.broken)) {
    const [bx, by] = pl.at, len = pl.pillar.shadow ?? 30, w = pl.pillar.w ?? 5, hit = new Map();
    for (let k = 2; k < len; k += 0.5) for (let j = -w / 2 + 0.5; j <= w / 2 - 0.5; j += 0.5) {
      const x = Math.round(bx + k * sdx - j * sdy), y = Math.round(by + 1 + k * sdy + j * sdx);
      if (inside(x, y) && !hit.has(y * W + x)) hit.set(y * W + x, k / len);
    }
    // dark near the foot, breaking up toward the far end
    for (const [i, t] of hit) if (t < 0.6 || dither(i % W, Math.floor(i / W)) < (1 - t) * 2.2) shadow[i] = Math.max(shadow[i], t < 0.35 ? 0.72 : t < 0.6 ? 0.6 : 0.5);
  }

  // ---------- the seal ring: standing stones round the stump, the forts on it ----------
  if (Wd.ring) {
    const R = Wd.ring, [cx, cy] = R.at, n = Math.round((2 * Math.PI * R.r) / (R.every ?? 4.5));
    const forts = places.filter(p => p.kind === 'fort').map(p => p.at), stones = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI, x = cx + Math.sin(a) * R.r, y = cy - Math.cos(a) * R.r;
      if (forts.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < (R.gap ?? 6))) continue;
      stones.push([Math.round(x), Math.round(y)]);
    }
    stones.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of stones) {
      shade(x + 1, y, -0.9); shade(x + 1, y + 1, -0.6);
      put(x, y, 'bone', 2); put(x, y - 1, 'bone', 3.8);
      put(x - 1, y, 'ink', 0); put(x, y + 1, 'ink', 0); put(x - 1, y - 1, 'ink', 0); put(x, y - 2, 'ink', 0); put(x + 1, y - 1, 'ink', 0);
    }
  }

  // ---------- places ----------
  const labels = [];
  const sorted = [...places].sort((a, b) => a.at[1] - b.at[1]);
  for (const p of sorted) {
    const [x, y] = p.at;
    if (p.district) district(p);
    const how = o => (o === false ? null : o);
    if (p.sprite) sprite(p.sprite, x, y, { flip: p.flip, how: how(p.outline) });
    for (const s of p.extra ?? []) sprite(s.sprite, s.at[0], s.at[1], { flip: s.flip, how: how(s.outline) });
    for (const l of p.lights ?? []) light(l.at?.[0] ?? x, l.at?.[1] ?? y - 1, l.r ?? 5, l.colour ?? 'warm', l);
    if (p.smoke) smoke(p.smoke);
    if (p.fog) {
      // low fog lying over the place: a few long pale wisps, thinning at their ends
      const R = p.fog.r ?? 8, fr = rng(`${seed}:fog:${p.id}`), n = p.fog.wisps ?? 5;
      for (let k = 0; k < n; k++) {
        const wy = Math.round(y - R * 0.7 + (k / Math.max(1, n - 1)) * R * 1.3 + (fr() - 0.5) * 2), len = R * (1.3 + fr() * 0.9), wx = x - len / 2 + (fr() - 0.5) * R;
        for (let j = 0; j < len; j++) {
          const X = Math.round(wx + j), edge = Math.min(j / len, 1 - j / len) * 2;
          if (dither(X, wy) > edge * 1.6) continue;
          put(X, wy, 'cloud', 3.3);
          if (edge > 0.5 && dither(X, wy + 1) < 0.3) put(X, wy + 1, 'cloud', 2.3);
        }
      }
    }
  }
  function smoke(list) {
    for (const s of list) {
      const r = rng(`${seed}:smoke:${s.at}`), m = s.mat ?? 'smoke', puffs = s.puffs ?? 4;
      for (let k = 0; k < puffs; k++) {
        const cx = s.at[0] + k * (s.drift ?? 1) + (r() - 0.5), cy = s.at[1] - k * 2.2, rad = 0.8 + k * 0.45;
        for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++) for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
          if ((xx - cx) ** 2 + (yy - cy) ** 2 <= rad * rad && (k < 2 || dither(xx, yy) < 1 - k / (puffs + 1))) put(xx, yy, m, yy < cy ? 3.6 : 2.5);
        }
      }
    }
  }
  function district(p) {
    // A city: rows of roofs along the streets, packed tight in the middle and thinning out into
    // gardens and fields across its edge. Main roads and rails run through as streets. Each house
    // throws a pixel of shadow to the lower right, which is what draws the streets between the rows.
    const D = p.district, r = rng(`${seed}:district:${p.id}`), roofs = D.roofs ?? ['slate', 'roof_red', 'brick'];
    const [x0, y0, x1, y1] = bboxOf(D.poly), pad = D.sprawl ?? 7;
    const segs = D.poly.map((a, k) => [a, D.poly[(k + 1) % D.poly.length]]);
    const depthIn = (x, y) => {
      let d = 1e9;
      for (const [[ax, ay], [bx2, by2]] of segs) {
        const vx = bx2 - ax, vy = by2 - ay, t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
        d = Math.min(d, Math.hypot(x - ax - vx * t, y - ay - vy * t));
      }
      return inPoly(x, y, D.poly) ? d : -d;
    };
    const ok = (x, y) => inside(x, y) && land[y * W + x] && !water[y * W + x] && dLand[y * W + x] >= 1;
    const free = (x, y) => ok(x, y) && !road[y * W + x];
    const dens = (x, y) => clamp(0.6 + depthIn(x, y) / 5 + (fbm(x / 6, y / 6, seed + 61) - 0.5) * 1.1, 0, 1);
    // the paved middle
    for (let y = Math.floor(y0 - pad); y <= y1 + pad; y++) for (let x = Math.floor(x0 - pad); x <= x1 + pad; x++) {
      if (free(x, y) && dens(x, y) > 0.8) put(x, y, D.paving ?? 'stone', (x * 7 + y * 3) % 11 === 0 ? 2.6 : 3.2);
    }
    const gardens = [], pitch = D.pitch ?? 4;
    group(() => {
      for (let y = Math.floor(y0 - pad) + Math.floor(r() * pitch); y <= y1 + pad; y += pitch) {
        let x = Math.floor(x0 - pad) + Math.floor(r() * 3);
        while (x <= x1 + pad) {
          const bw = 2 + Math.floor(r() * 3), roll = r(), d = dens(x + bw / 2, y + 1);
          // each quarter keeps mostly to one roof, with a few odd ones out
          const q = fbm((x + bw / 2) / 9, y / 9, seed + 63), mine = roofs[clamp(Math.floor(((q - 0.3) / 0.4) * roofs.length), 0, roofs.length - 1)];
          const roof = r() < 0.75 ? mine : roofs[Math.floor(r() * roofs.length)];
          if (roll < d * (1 - (D.gaps ?? 0.1))) {
            let placed = 0;
            for (let k = 0; k < bw; k++) for (let j = 0; j < pitch - 1; j++) {
              if (!free(x + k, y + j)) continue;
              if (j === 0) put(x + k, y + j, roof, k === 0 ? 3.9 : 3.3); // the roof's lit slope
              else if (j === 1) put(x + k, y + j, roof, k === bw - 1 ? 1.5 : 2); // the eaves
              else put(x + k, y + j, D.walls ?? 'plaster', k === bw - 1 ? 2 : 3); // the wall under them
              placed++;
            }
            if (placed > 3 && D.dishes && r() < D.dishes && free(x + 1, y)) put(x + 1, y, 'lamp', 4); // star-dew dishes face the sky
            if (placed > 3 && pitch > 3 && D.windows && r() < D.windows && free(x, y + 2)) put(x, y + 2, 'window', 1);
          } else if (d > 0.25 && r() < 0.35) gardens.push([x, y, bw]);
          x += bw + (r() < 0.5 ? 1 : 0);
        }
      }
      if (D.wall) {
        // the old town's wall: a pale stone line with a tower at every corner
        const n = D.wall.length;
        for (let k = 0; k < n; k++) {
          const [ax, ay] = D.wall[k], [bx2, by2] = D.wall[(k + 1) % n], L = Math.hypot(bx2 - ax, by2 - ay);
          for (let s = 0; s <= L; s += 0.5) {
            const x = Math.round(ax + ((bx2 - ax) * s) / L), y = Math.round(ay + ((by2 - ay) * s) / L);
            if (ok(x, y)) put(x, y, 'stone', 3.7);
          }
        }
        for (const [ax, ay] of D.wall) for (const [dx, dy, l] of [[0, -1, 4], [1, -1, 3.4], [0, 0, 3], [1, 0, 2]]) if (ok(ax + dx, ay + dy)) put(ax + dx, ay + dy, 'stone', l);
      }
    }, 'shadow');
    for (const [x, y, bw] of gardens) for (let k = 0; k < bw; k++) for (let j = 0; j < pitch - 1; j++) if (free(x + k, y + j) && (k + j) % 2 === 0 && get(x + k, y + j) !== 'stone') put(x + k, y + j, 'leaf', 2.6);
    for (const d of D.docks ?? []) {
      // piers into the water
      for (let k = 0; k < d.len; k++) put(d.at[0] + (d.dir?.[0] ?? 0) * k, d.at[1] + (d.dir?.[1] ?? 1) * k, 'plank', 3.6);
    }
    for (const l of D.lights ?? []) {
      // the night city: lit windows and lamps across its roofs
      for (let k = 0; k < l.count; k++) {
        const x = Math.round(x0 + r() * (x1 - x0)), y = Math.round(y0 + r() * (y1 - y0));
        if (inPoly(x, y, D.poly) && ok(x, y) && get(x, y) !== 'stone') put(x, y, l.mat ?? 'window', 4);
      }
    }
  }

  // ---------- the fallen top of Astel's pillar, lying out to the east sea ----------
  if (Wd.fallen) {
    // the column broke into drums where it hit; each lies a little askew, half sunk in the ash
    const F = Wd.fallen, [ax, ay] = F.from, [bx, by] = F.to, L = Math.hypot(bx - ax, by - ay);
    const ux0 = (bx - ax) / L, uy0 = (by - ay) / L, w = F.w ?? 6, seg = F.segment ?? 15, r = rng(`${seed}:fallen`);
    const rubble = [];
    group(() => {
      for (let s0 = 0; s0 < L; ) {
        const len = seg * (0.75 + r() * 0.5), gap = s0 === 0 ? 0 : 1.5 + r() * 1.5, s1 = Math.min(L, s0 + gap + len);
        const tilt = (r() - 0.5) * 0.12, ux = ux0 * Math.cos(tilt) - uy0 * Math.sin(tilt), uy = ux0 * Math.sin(tilt) + uy0 * Math.cos(tilt);
        const nx = -uy, ny = ux, shift = (r() - 0.5) * 1.6, sink = r() * 0.35;
        const sx = ax + ux0 * (s0 + gap) + nx * shift, sy = ay + uy0 * (s0 + gap) + ny * shift;
        for (let s = 0; s <= s1 - s0 - gap; s += 0.4) {
          for (let o = -w / 2; o <= w / 2 - sink * w; o += 0.4) {
            const x = sx + ux * s + nx * o, y = sy + uy * s + ny * o;
            // the upper side catches the light, the side toward the viewer is in shade
            let l = o < -w * 0.3 ? 3 : o < w * 0.02 ? 2.4 : o < w * 0.28 ? 1.6 : 0.9, m = 'bone';
            if (s < 0.8 || s > s1 - s0 - gap - 0.8) l -= 0.6; // the broken ends
            if (hash3(Math.round(x), Math.round(y), seed + 97) < 0.08) l -= 0.8; // pitting
            // three hundred years of ash lie along its top
            if (o < -w * 0.05 && fbm(x / 4, y / 4, seed + 98) > 0.5) { m = 'ash'; l = o < -w * 0.3 ? 3.6 : 3; }
            put(x, y, m, l);
          }
        }
        rubble.push([sx, sy], [sx + ux * (s1 - s0 - gap), sy + uy * (s1 - s0 - gap)]);
        s0 = s1;
      }
    }, 'ink');
    for (const [x, y] of rubble) for (let k = 0; k < 3; k++) { const X = x + (r() - 0.5) * w * 1.4, Y = y + (r() - 0.2) * w; put(X, Y, 'bone', 2 + r()); put(X + 1, Y, 'ink', 0); }
    // ash drifted against the near side
    for (let s = 0; s < L; s += 1.3) { const x = ax + ux0 * s + -uy0 * (w / 2 + 0.5), y = ay + uy0 * s + ux0 * (w / 2 + 0.5); if (r() < 0.5) put(x, y, 'ash', 3.4); }
  }

  // ---------- the seven pillars ----------
  // Bone-coloured stone, cold even at noon, so tall the cloud takes the top (world bible). Above the
  // cloud bank the shaft goes on as a pale shape in the haze, thinning to nothing.
  for (const p of places.filter(q => q.pillar)) pillar(p);
  function pillar(p) {
    const P = p.pillar, [bx, by] = p.at, w = P.w ?? 5, h = P.h ?? 70, r = rng(`${seed}:pillar:${p.id}`);
    const x0 = Math.round(bx - (w - 1) / 2), x1 = x0 + w - 1, top = by - h;
    const tone = x => { const u = (clamp(x, x0, x1) - x0) / Math.max(1, w - 1); return u < 0.1 ? 4 : u < 0.3 ? 3.4 : u < 0.62 ? 2.8 : u < 0.85 ? 2.1 : 1.3; };
    if (P.broken) {
      // the stump: the break runs down at a slant, ragged, scorched; the cracks still glow
      const jag = Array.from({ length: w + 6 }, (_, k) => Math.floor(k * 0.5 + r() * 4));
      group(() => {
        for (let y = Math.max(0, top); y <= by; y++) {
          const fromFoot = by - y, foot = fromFoot < 2 ? 2 : fromFoot < 5 ? 1 : 0;
          for (let x = x0 - foot; x <= x1 + foot; x++) {
            if (y < top + jag[clamp(x - x0 + 2, 0, w + 5)]) continue;
            let l = (x < x0 ? 3.6 : x > x1 ? 1.2 : tone(x)) - 0.5, m = 'bone';
            if (fromFoot % 7 === 3) l -= 0.4; // courses
            if (y > by - (P.ashline ?? 0)) m = 'ash'; // ash drifted up the stump
            const burn = clamp((fromFoot / h - 0.35) * 1.6, 0, 1); // scorched more the higher it goes
            if (hash3(x, y, seed + 45) < burn * 0.7) { m = 'ash'; l = l > 2.5 ? 2.2 : 1; }
            put(x, y, m, l);
          }
        }
        // a skirt of fallen stone and ash round the foot
        for (let y = by - 4; y <= by + 2; y++) for (let x = x0 - 7; x <= x1 + 7; x++) {
          const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, hgtHere = 5 - dx * 0.8 + (hash3(x, 3, seed + 46) - 0.5) * 2;
          if (dx === 0 || by + 2 - y > hgtHere) continue;
          put(x, y, hash3(x, y, seed + 47) < 0.6 ? 'ash' : 'bone', x < x0 ? (y === Math.ceil(by + 2 - hgtHere) ? 3.4 : 2.4) : 1.6);
        }
        for (const [cx, cy, len] of P.cracks ?? []) for (let k = 0; k < (len ?? 3); k++) put(bx + cx + (k % 2), by - h + cy + k, 'fire', 0.6);
      }, 'ink');
      return;
    }
    const cloudAt = top + Math.round(h * (P.cloud ?? 0.3)), mid = x0 + (w - 1) / 2;
    for (let y = Math.max(0, top); y < cloudAt; y++) {
      // above the cloud: the shaft goes on up, narrowing and paling into the haze until it is gone
      const t = (y - top) / Math.max(1, cloudAt - top), half = (w / 2) * (0.3 + 0.7 * t); // t: 0 at the top, 1 at the cloud
      for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
        if (hash3(x, y, seed + 44) > t * 1.1) continue;
        const u = (x - (mid - half)) / Math.max(1, 2 * half);
        put(x, y, t < 0.45 ? 'cloud' : 'bone', u < 0.3 ? 4 : u < 0.7 ? 3.4 : 2.4);
      }
    }
    group(() => {
      for (let y = Math.max(0, cloudAt - 3); y <= by; y++) {
        const fromFoot = by - y, foot = fromFoot < 2 ? 2 : fromFoot < 5 ? 1 : 0;
        const band = fromFoot > 8 && (fromFoot - 9) % 20 === 0, under = fromFoot > 8 && (fromFoot - 8) % 20 === 0;
        const out = Math.max(foot, band ? 1 : 0);
        for (let x = x0 - out; x <= x1 + out; x++) {
          let l = x < x0 ? 3.8 : x > x1 ? 1.2 : tone(x);
          if (band) l += 0.35; // a carved band round the shaft catches the light
          else if (under) l -= 0.7; // and throws a line of shadow under it
          else if (!foot && fromFoot % 7 === 3) l -= 0.3; // the courses of stone
          put(x, y, 'bone', l);
        }
      }
      for (let x = x0 - 3; x <= x1 + 3; x++) put(x, by + 1, 'bone', x === x0 - 3 ? 3.8 : x > x1 + 1 ? 1.6 : 2.6); // the plinth
    }, 'ink');
    // the cloud bank where the shaft goes up into the sky
    cloud(bx - 6, cloudAt - 2, w + 8, 1);
    cloud(bx + 6, cloudAt - 1, w + 10, 1.1);
    cloud(bx - 1, cloudAt + 2, w + 20, 1.3);
  }
  function cloud(cx, cy, size, puff = 1) {
    const r = rng(`${seed}:cloud:${cx}:${cy}`), n = Math.max(3, Math.round(size / 3.5));
    const blobs = Array.from({ length: n }, (_, k) => [cx - size / 2 + (k + 0.5) * (size / n) + (r() - 0.5) * 2, cy + (r() - 0.5) * 2 - (k % 2) * puff, (1.6 + r() * 1.6) * puff]);
    group(() => {
      for (let y = Math.floor(cy - 7); y <= cy + 5; y++) for (let x = Math.floor(cx - size / 2 - 5); x <= cx + size / 2 + 5; x++) {
        const inC = blobs.some(([bx2, by2, br]) => (x - bx2) ** 2 + ((y - by2) * 1.4) ** 2 <= br * br);
        if (!inC) continue;
        // lit from the upper left like everything else
        const below = blobs.some(([bx2, by2, br]) => (x - bx2 + 1) ** 2 + ((y - by2 + 1) * 1.4) ** 2 <= br * br);
        put(x, y, 'cloud', !below ? 4 : y > cy + 1 ? 2 : 3);
      }
    }, 'shadow');
  }

  // ---------- wind that never stops, between the pillars of Ulwen and Talis ----------
  for (const wd of Wd.winds ?? []) {
    // long gentle strokes bowed upward, each ending in a curl, blowing from Ulwen's pillar to Talis's
    const [[ax, ay], [bx, by]] = wd.between, r = rng(`${seed}:wind:${ax}:${ay}`);
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    for (let k = 0; k < (wd.count ?? 5); k++) {
      const t = (k + 0.5) / (wd.count ?? 5), side = (r() - 0.5) * (wd.spread ?? 14), lift = wd.lift ?? 30;
      const sx = ax + (bx - ax) * t - uy * side - ux * 8, sy = ay + (by - ay) * t + ux * side - lift * (0.35 + r() * 0.65);
      const len = 12 + Math.floor(r() * 6);
      for (let j = 0; j < len; j += 0.5) {
        const bow = -Math.sin((j / len) * Math.PI) * 1.2;
        put(sx + ux * j, sy + uy * j + bow, 'cloud', j < 3 ? 2.6 : 4);
      }
      // the curl at the end: a small hook turning back up and over
      const ex = sx + ux * len, ey = sy + uy * len;
      for (const [cx2, cy2] of [[1, -1], [1, -2], [0, -3], [-1, -3], [-2, -2]]) put(ex + cx2, ey + cy2, 'cloud', 4);
    }
  }

  // ---------- airships on their routes ----------
  for (const rt of Wd.routes ?? []) {
    // the routes themselves are drawn on the poster; the map shows the ships on them
    const line = arc(rt.from, rt.to, rt.bend ?? 0, 0.5);
    for (const t of rt.ships ?? []) {
      const [px, py] = line[Math.floor(t * (line.length - 1))];
      // its shadow on the ground, then the ship
      for (let dx = -2; dx <= 2; dx++) shade(px + dx + 3, py + 5, -0.7);
      sprite('airship', px, py + 1, { flip: rt.to[0] < rt.from[0] });
      light(px, py, 3, 'star', { only: ['night'] });
    }
  }
  for (const c of Wd.clouds ?? []) cloud(c.at[0], c.at[1], c.size ?? 10);

  // ---------- label positions for the overlay ----------
  for (const p of places) {
    if (!p.th || p.label === false) continue;
    const L = p.label ?? {};
    labels.push({
      id: p.id, th: p.th, en: p.en, kind: p.kind, cls: L.cls ?? p.kind, x: L.at?.[0] ?? p.at[0], y: L.at?.[1] ?? p.at[1] + 6,
      anchor: L.anchor ?? 'middle', minor: L.minor ?? false, note: p.note, region: p.region, tag: p.tag, at: p.at,
      pin: p.pin, home: p.home, // the game's "you are here" pin (src/ui/mapLayout.ts pinFor)
    });
  }
  // for the poster: the airship routes (drawn there, not here) and the tall things names must not cover
  const routes = (Wd.routes ?? []).map(rt => {
    const [a, b] = [rt.from, rt.to], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, bend = rt.bend ?? 0;
    const c = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / L) * bend, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / L) * bend];
    return { from: a, to: b, c, ships: rt.ships ?? [] };
  });
  const obstacles = places.filter(p => p.pillar).map(p => {
    const P = p.pillar, w = P.w ?? 5, h = P.h ?? 70, [bx, by] = p.at, x0 = Math.round(bx - (w - 1) / 2);
    return P.broken ? [x0 - 7, by - h, x0 + w + 7, by + 3] : [x0 - 1, by - h + Math.round(h * (P.cloud ?? 0.3)) - 6, x0 + w + 1, by + 2];
  });
  for (const t of Wd.texts ?? []) labels.push({ id: t.id, th: t.th, cls: t.cls, x: t.at[0], y: t.at[1], anchor: t.anchor ?? 'middle', angle: t.angle ?? 0, spacing: t.spacing ?? 0, minor: t.minor ?? false });
  return { W, H, mat, lvl, names, lights, sparkle, shadow, labels, routes, obstacles, land, riverLines };
}

/** Colour the index picture for a time of day ('day' | 'dusk' | 'night'). Returns { w, h, rgba }. */
export function paintMap(M, B, time = 'day') {
  const T = M.times[time];
  if (!T) throw new Error(`map: no time "${time}"`);
  const { W, H, mat, lvl, names } = B, out = new Uint8ClampedArray(W * H * 4);
  const cache = new Map();
  const colour = (mi, l) => {
    const key = mi * 16 + Math.round(clamp(l, 0, 4) * 2);
    if (cache.has(key)) return cache.get(key);
    const m = M.materials[names[mi]], step = clamp(Math.round(l), 0, 4);
    let c;
    if (m.lit && T.lights) c = m.litRgb[Math.min(step, m.litRgb.length - 1)];
    else {
      c = m.rgb[Math.min(step, m.rgb.length - 1)];
      if (!m.glow) c = mix(c.map((v, i) => v * T.mul[i]), T.tintRgb, T.tint[1]);
    }
    cache.set(key, c);
    return c;
  };
  const SH = [0.5, 0.56, 0.74], sk = time === 'night' ? 0.35 : time === 'dusk' ? 0.8 : 1; // shadows are cool, and faint at night
  for (let i = 0; i < W * H; i++) {
    let c = mat[i] < 0 ? [0, 0, 0] : colour(mat[i], lvl[i]);
    const a = B.shadow ? B.shadow[i] * sk : 0;
    if (a > 0) c = c.map((v, k) => v * (1 - a + a * SH[k]));
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  const blend = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const q = (y * W + x) * 4;
    out[q] += (c[0] - out[q]) * a; out[q + 1] += (c[1] - out[q + 1]) * a; out[q + 2] += (c[2] - out[q + 2]) * a;
  };
  // stars caught in the sea on clear nights (the fishermen say there are more down there than up)
  if (T.stars) {
    const star = M.star;
    for (let i = 0; i < W * H; i++) if (B.sparkle[i]) blend(i % W, Math.floor(i / W), star, 0.55);
  }
  // lights: a solid wash in the middle, a sparse dither at the rim; stronger at night
  const COL = { warm: 'f2c46e', star: 'aad6fb', fire: 'e0742f', ember: 'c2502a' };
  for (const L of B.lights) {
    if (L.only && !L.only.includes(time)) continue;
    const strength = time === 'night' ? 1 : time === 'dusk' ? 0.7 : 0;
    if (!strength) continue;
    const c = rgbOf(COL[L.colour] ?? L.colour);
    for (let y = -L.r; y <= L.r; y++) for (let x = -L.r; x <= L.r; x++) {
      const d = Math.hypot(x, y) / L.r;
      if (d > 1) continue;
      const X = Math.round(L.x + x), Y = Math.round(L.y + y);
      const a = d < 0.35 ? 0.42 : d < 0.7 ? 0.24 : dither(X, Y) < 0.4 ? 0.14 : 0;
      blend(X, Y, c, a * strength * (L.power ?? 1));
    }
  }
  return { w: W, h: H, rgba: out };
}

/** Scale a picture up by a whole number (nearest neighbour). */
export function scaleUp(img, s) {
  const { w, h, rgba } = img, out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const p = ((Math.floor(y / s) * w + Math.floor(x / s)) * 4), q = (y * w * s + x) * 4;
    out[q] = rgba[p]; out[q + 1] = rgba[p + 1]; out[q + 2] = rgba[p + 2]; out[q + 3] = rgba[p + 3];
  }
  return { w: w * s, h: h * s, rgba: out };
}

/** Cut a rectangle out of a picture: [x, y, w, h]. */
export function crop(img, [x0, y0, w, h]) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = ((y0 + y) * img.w + x0 + x) * 4, q = (y * w + x) * 4;
    out[q] = img.rgba[p]; out[q + 1] = img.rgba[p + 1]; out[q + 2] = img.rgba[p + 2]; out[q + 3] = img.rgba[p + 3];
  }
  return { w, h, rgba: out };
}

// ---------- command line ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const M = loadMap(), B = buildMap(M), times = ['day', 'dusk', 'night'];
  const pub = join(ART, '..', 'public', 'map');
  mkdirSync(pub, { recursive: true });
  mkdirSync(join(ART, 'preview'), { recursive: true });
  for (const t of times) {
    const img = paintMap(M, B, t);
    writeFileSync(join(pub, `world_${t}.png`), encodePNG(img));
    writeFileSync(join(ART, 'preview', `map_${t}.png`), encodePNG(scaleUp(img, 3)));
  }
  writeFileSync(join(pub, 'labels.json'), JSON.stringify({ width: B.W, height: B.H, labels: B.labels, routes: B.routes, obstacles: B.obstacles }, null, 1) + '\n');
  console.log(`wrote public/map/world_{${times}}.png (${B.W} x ${B.H}), labels.json (${B.labels.length} names) and art/preview/map_*.png`);
}

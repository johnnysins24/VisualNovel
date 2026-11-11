// Scene backgrounds: the places behind the character (one per location tag, art/scenes/*.yaml).
//
// A scene is a list of layers drawn back to front: sky, stars, clouds, sun or moon, ridges (hills
// and mountains), skylines, trees, fields, ground, roads and small hand-drawn props (ascii, like the
// sprite pieces). Colours come from art/scenes/palette.yaml as 5-step ramps (0 dark .. 4 light);
// a time of day (day, dusk, night) tints every colour except lights, which switch on at dusk.
// Far layers mix toward the horizon colour (haze), so the figure in front always reads first.
// The same scene, time and seed always give the same picture.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ART, readYaml } from './kit.mjs';
import { rng } from './npc.mjs';
import { THINGS, metrePen } from './things.mjs';

// The picture is a wide panorama, SW x SH. Scenes are written in stage coordinates: the middle
// STAGE columns (x 0..255) are where the figure stands, and the wings (x -256..-1 and 256..511) reach
// out to the sides, so a wide screen sees more of the place while a phone sees only the stage.
// Layers that fill the picture (sky, walls, floors, ground, ridges, skylines) cover the whole width.
export const STAGE = 256, SW = 768, SH = 112, OX = (SW - STAGE) / 2;
const XL = -OX, XR = SW - OX - 1; // first and last stage column of the picture
/** the row the figures' soles stand on (scene `stand:`), and where the stage's middle is */
export const STAND = 106, MID = STAGE / 2;
// The camera. A grown figure (1.7 m) is 50 px tall on the stand row, and the camera is at a standing
// person's eye height, so the horizon (where the floor or the ground would vanish) is EYE_ROWS above
// the stand row. Something standing on row y is then PXM * (y - eye) / (stand - eye) pixels per
// metre: big at the front, smaller toward the back, nothing at the horizon. FOCUS (metres from the
// camera to the figures) only matters for spacing things evenly along a line going into the picture.
export const PXM = 50 / 1.7, EYE_ROWS = 46, FOCUS = 9;
/** the camera of a scene: eye row, pixels per metre on a row, depth of a row and back */
export function camera(sc = {}) {
  const stand = sc.stand ?? STAND, eye = sc.eye ?? stand - EYE_ROWS, f = PXM * FOCUS;
  const ppm = y => (PXM * (y - eye)) / (stand - eye);
  const Z = y => f / Math.max(1e-6, ppm(y)), rowAt = z => eye + ((stand - eye) * f) / (PXM * z);
  return { stand, eye, f, ppm, Z, rowAt, back: sc.back ?? 92 };
}
const rgbOf = h => [0, 2, 4].map(i => parseInt(String(h).padStart(6, '0').slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

/** Palette and every scene in art/scenes (id = file name). */
export function loadScenes() {
  const pal = readYaml('scenes/palette.yaml');
  for (const m of Object.values(pal.materials)) {
    m.rgb = m.ramp.map(rgbOf);
    if (m.lit) m.litRgb = m.lit.map(rgbOf);
  }
  for (const t of [...Object.values(pal.times), ...Object.values(pal.interior_times)]) {
    t.skyRgb = t.sky.map(rgbOf);
    t.tintRgb = rgbOf(t.tint[0]);
  }
  pal.outlineRgb = rgbOf(pal.outline);
  const scenes = {};
  for (const f of readdirSync(join(ART, 'scenes')).sort()) {
    if (f.endsWith('.yaml') && f !== 'palette.yaml') scenes[f.slice(0, -5)] = readYaml(`scenes/${f}`);
  }
  return { pal, scenes };
}

/** Smooth 1D value noise in 0..1. */
function noise1(seed) {
  const r = rng(seed), v = Array.from({ length: 64 }, r);
  return x => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    const a = v[((i % 64) + 64) % 64], b = v[(((i + 1) % 64) + 64) % 64];
    return a + (b - a) * s;
  };
}

/** Render scene `id` at a time of day ('day' | 'dusk' | 'night'). Returns { w, h, rgba }. */
export function renderScene(S, id, time = 'day', opts = {}) {
  const { pal, scenes } = S, sc = scenes[id];
  if (!sc) throw new Error(`no scene "${id}"`);
  const cam = camera(sc), { ppm } = cam;
  const items = []; // with opts.trace: every sized thing drawn, its row, scale and box (for check.mjs)
  let track = null;
  // rooms use their own times: warm lamplight instead of blue night, the sky only through windows
  const T = (sc.interior ? pal.interior_times : pal.times)[time], OUT = pal.times[time];
  if (!T) throw new Error(`no time "${time}"`);
  const out = new Uint8ClampedArray(SW * SH * 4);
  const horizonRgb = sc.interior ? rgbOf(pal.interior_haze) : T.skyRgb[T.skyRgb.length - 1];
  let layer = {}, mask = null, shift = 0; // shift: a repeated layer's offset (`repeat: [dx, ..]`)

  /** colour of material level after the time of day and the layer's haze */
  const colour = (matName, lvl) => {
    const m = pal.materials[matName];
    if (!m) throw new Error(`${id}: no scene material "${matName}"`);
    const l = Math.max(0, Math.min(4, Math.round(lvl)));
    if (m.lit && T.lights) return m.litRgb[Math.min(l, m.litRgb.length - 1)];
    let c = m.rgb[Math.min(l, m.rgb.length - 1)];
    if (!m.glow) c = mix(c.map((v, i) => v * T.mul[i]), T.tintRgb, T.tint[1]);
    const haze = layer.haze ?? 0;
    return haze ? mix(c, horizonRgb, haze) : c;
  };
  const putRgb = (x, y, c) => {
    x = Math.round(x) + OX + shift; y = Math.round(y);
    if (track) { track.x0 = Math.min(track.x0, x - OX); track.x1 = Math.max(track.x1, x - OX); track.y0 = Math.min(track.y0, y); track.y1 = Math.max(track.y1, y); }
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    const p = (y * SW + x) * 4;
    out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
    if (mask) mask[y * SW + x] = 1;
  };
  const put = (x, y, mat, lvl) => putRgb(x, y, colour(mat, lvl));
  /** points every `every` metres on the ground from [x, row] to [x, row], far ones first */
  const alongLine = ([x0, r0], [x1, r1], every) => {
    const P = ([x, r]) => [(x - MID) / ppm(r), cam.Z(r)], [X0, Z0] = P([x0, r0]), [X1, Z1] = P([x1, r1]);
    const n = Math.max(1, Math.round(Math.hypot(X1 - X0, Z1 - Z0) / every)), out = [];
    for (let i = 0; i <= n; i++) { const X = X0 + ((X1 - X0) * i) / n, Z = Z0 + ((Z1 - Z0) * i) / n, row = cam.rowAt(Z); out.push([MID + X * ppm(row), row]); }
    return out.sort((a, b) => a[1] - b[1]);
  };
  const span = (y, x0, x1, mat, lvl) => { for (let x = Math.ceil(x0); x <= x1; x++) put(x, y, mat, lvl); };
  /** a room `width:` metres wide (scene): the back wall's columns, and for any column outside them the
   *  depth of the side wall there, its floor row, its ceiling row and pixels per metre */
  const room = () => {
    const W = sc.width, kb = ppm(cam.back), E = (cam.stand - cam.eye) / PXM;
    const back = [Math.round(MID - (W / 2) * kb), Math.round(MID + (W / 2) * kb) - 1];
    const at = x => {
      const dxp = x < back[0] ? MID - x : x > back[1] ? x - MID : 0;
      if (!dxp) return null;
      const z = ((W / 2) * cam.f) / dxp, k = cam.f / z;
      return { z, k, left: x < MID, floor: cam.rowAt(z), ceil: sc.ceiling ? cam.eye - (sc.ceiling - E) * k : -1 };
    };
    return { W, back, at, zBack: cam.Z(cam.back) };
  };

  const draw = {
    sky(p) {
      const hz = p.horizon ?? 70, cols = T.skyRgb, n = cols.length - 1;
      for (let y = 0; y < SH; y++) for (let x = XL; x <= XR; x++) {
        const t = Math.min(1, y / hz) * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
        // dithered bands: 4 steps between each pair of sky colours
        const q = Math.floor(f * 4 + dither(x, y)) / 4;
        putRgb(x, y, mix(cols[i], cols[i + 1], Math.min(1, q)));
      }
    },
    stars(p) {
      if (!T.stars) return;
      const r = rng(`${id}:stars`);
      for (let i = 0; i < Math.round((p.count ?? 60) * SW / STAGE); i++) {
        const x = XL + Math.floor(r() * SW), y = Math.floor(r() * (p.below ?? 50)), b = r();
        putRgb(x, y, mix(T.skyRgb[0], rgbOf(pal.star), b > 0.8 ? 1 : 0.55));
        if (b > 0.96) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) putRgb(x + dx, y + dy, mix(T.skyRgb[0], rgbOf(pal.star), 0.4));
      }
    },
    body(p) {
      const b = p[time];
      if (!b) return;
      const [cx, cy, rad] = b, c = rgbOf(T.body), rim = mix(c, T.skyRgb[1], 0.4);
      for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) {
        const d = Math.hypot(x, y);
        if (d <= rad - 0.3) putRgb(cx + x, cy + y, time === 'night' && (x * 3 + y * 5) % 7 === 0 && d < rad - 1 ? mix(c, T.skyRgb[0], 0.18) : c);
        else if (d <= rad + 0.7) putRgb(cx + x, cy + y, rim);
      }
    },
    clouds(p) {
      const r = rng(`${id}:clouds:${p.seed ?? 0}`);
      for (let i = 0; i < Math.round((p.count ?? 4) * SW / STAGE); i++) {
        const cx = XL + r() * SW, cy = (p.y ?? [8, 30])[0] + r() * ((p.y ?? [8, 30])[1] - (p.y ?? [8, 30])[0]);
        const w = 14 + r() * (p.size ?? 22), puffs = 3 + Math.floor(r() * 3), base = Math.round(cy + 3);
        const blobs = Array.from({ length: puffs }, (_, k) => [cx - w / 2 + (k + 0.5) * (w / puffs), cy - r() * 3, 3 + r() * 3]);
        for (let y = Math.floor(cy - 8); y <= base; y++) for (let x = Math.floor(cx - w / 2 - 6); x <= cx + w / 2 + 6; x++) {
          const inside = blobs.some(([bx, by, br]) => (x - bx) ** 2 + ((y - by) * 1.3) ** 2 <= br * br);
          if (inside) put(x, y, 'cloud', y >= base - 1 ? 2 : y < cy - 3 ? 4 : 3);
        }
      }
    },
    ridge(p) {
      const n = noise1(`${id}:ridge:${p.seed ?? 0}`), sc = p.scale ?? 0.05, jag = p.jag ?? 0;
      const top = x => {
        const X = x + OX;
        let v = n(X * sc) * 0.65 + n(X * sc * 2.3 + 17) * 0.25 + n(X * sc * 5.1 + 33) * 0.1;
        if (jag) v = v * (1 - jag) + jag * (1 - Math.abs(((X * sc * 1.7) % 2) - 1)) * n(X * sc * 0.5 + 5);
        // `vee: px` lifts the ridge toward both sides of the stage, so it makes the walls of a valley
        const lift = p.vee ? p.vee * Math.min(1.5, ((x - MID) / MID) ** 2) : 0;
        return Math.round((p.base ?? 70) - (p.amp ?? 10) * v - lift);
      };
      const to = p.to ?? SH - 1;
      // `rock: true`: a mountain face. Each peak's flank toward the light (`lit: left|right`) is light and
      // the other is in shade, split by a ridgeline running down from the peak, with a scatter of cracks.
      const peaks = [];
      if (p.rock) for (let x = XL - 6; x <= XR + 6; x++) {
        const t = top(x);
        let peak = true;
        for (let k = -4; k <= 4 && peak; k++) if (k && top(x + k) < t) peak = false;
        if (peak && !(peaks.length && x - peaks[peaks.length - 1][0] < 5)) peaks.push([x, t, Math.sin(x * 12.9898) * 0.35]);
      }
      const litRight = p.lit === 'right';
      for (let x = XL; x <= XR; x++) {
        const y0 = top(x), slope = top(x + 1) - top(x - 1);
        for (let y = y0; y <= to; y++) {
          const d = y - y0;
          let mat = p.mat, lvl = d === 0 ? 4 : d < 2 ? 3 : slope > 0 ? 1.6 : 2.4;
          if (p.rock && d >= 2) {
            let line = null, best = 1e9;
            for (const [px, pt, drift] of peaks) {
              if (pt > y) continue;
              const rx = px + (y - pt) * drift;
              if (Math.abs(x - rx) < best) { best = Math.abs(x - rx); line = rx; }
            }
            lvl = line == null ? 2 : (x > line) === litRight ? 2.8 : 1.5;
            // rough plates of rock leaning across the face, cracks, and snow lying on ledges up high
            const X = x + OX, cell = ((Math.floor(X / 5 + y * 0.35) * 73856093) ^ (Math.floor(y / 4 - X * 0.12) * 19349663)) >>> 0;
            lvl += ((cell >>> 3) % 5 - 2) * 0.3;
            const h = Math.sin(X * 91.7 + y * 47.3) * 43758.5453;
            if (h - Math.floor(h) < 0.06) lvl -= 1;
            if (p.snow && y < p.snow + 16 && (cell >>> 7) % 7 === 0 && Math.floor(y / 4 - X * 0.12) !== Math.floor((y - 1) / 4 - X * 0.12)) { mat = 'snow'; lvl = 3; }
          }
          if (p.snow && y0 < p.snow && d < 2 + (p.snow - y0) / 3) { mat = 'snow'; lvl = slope > 0 ? 2 : 3.5; }
          if (p.fade && d > p.fade) lvl -= 0.6;
          put(x, y, mat, lvl);
        }
      }
    },
    ground(p) {
      const r = rng(`${id}:ground:${p.seed ?? 0}`);
      for (let y = p.y; y < SH; y++) for (let x = XL; x <= XR; x++) put(x, y, p.mat, y === p.y ? 3.4 : 2.6 + (r() - 0.5) * (p.noise ?? 0.9));
      for (let i = 0; i < Math.round((p.tufts ?? 0) * SW / STAGE); i++) {
        const x = XL + Math.floor(r() * SW), y = p.y + 2 + Math.floor(r() * (SH - p.y - 3));
        put(x, y, p.tuft ?? p.mat, 4); put(x - 1, y + 1, p.tuft ?? p.mat, 3.5); put(x + 1, y + 1, p.tuft ?? p.mat, 3.5);
      }
    },
    field(p) {
      // rows that widen toward the viewer
      let y = p.y0, k = 0, step = 1;
      while (y <= p.y1) {
        for (let j = 0; j < step && y <= p.y1; j++, y++) span(y, p.x0 ?? XL, p.x1 ?? XR, p.mat, k % 2 ? 2.2 : 3.4);
        k++; step = 1 + Math.floor((y - p.y0) / 5);
      }
    },
    road(p) {
      // `wm` (metres wide) and `xm` (metres off the middle): a road going straight into the picture
      const [y0, y1] = p.y;
      for (let y = y0; y <= y1; y++) {
        let a, b;
        if (p.wm) { const k = ppm(y), c = MID + (p.xm ?? 0) * k; a = c - (p.wm / 2) * k; b = c + (p.wm / 2) * k; }
        else { const t = (y - y0) / Math.max(1, y1 - y0); a = p.top[0] + (p.bottom[0] - p.top[0]) * t; b = p.top[1] + (p.bottom[1] - p.top[1]) * t; }
        span(y, a, b, p.mat, 2.8 + ((y * 7) % 3 === 0 ? 0.6 : 0));
        // wheel ruts a cart-width apart
        if (p.ruts && p.wm) { const k = ppm(y), c = MID + (p.xm ?? 0) * k; for (const d of [-0.75, 0.75]) put(c + d * k, y, p.mat, 1.8); }
      }
    },
    rect(p) { for (let y = p.y; y < p.y + p.h; y++) span(y, p.x, p.x + p.w - 1, p.mat, p.lvl ?? 3); },
    trees(p) {
      const r = rng(`${id}:trees:${p.seed ?? 0}`);
      const every = p.everym ? p.everym * ppm(p.base) : p.every;
      for (let x = p.x?.[0] ?? XL - 4; x < (p.x?.[1] ?? XR + 4); x += every * (0.6 + r() * 0.8)) {
        // `hm: [lo, hi]` metres: sized for the base row (a forest edge far off is small)
        const h = p.hm ? (p.hm[0] + r() * (p.hm[1] - p.hm[0])) * ppm(p.base) : p.h[0] + r() * (p.h[1] - p.h[0]), base = p.base + Math.round((r() - 0.5) * (p.jitter ?? 2));
        if (p.kind === 'pine') {
          for (let d = 0; d < h; d++) {
            const y = base - d, half = (h - d) * 0.32 + ((d % 4) === 0 ? 0.8 : 0);
            for (let dx = -Math.floor(half); dx <= half; dx++) put(x + dx, y, p.mat, d === Math.floor(h) - 1 ? 4 : dx < 0 ? 3.2 : dx === 0 ? 2.8 : 1.8);
          }
        } else {
          const rad = h * 0.42, cy = base - h + rad;
          for (let y = base; y > cy; y--) put(x, y, p.trunk ?? 'wood', 2);
          for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let dx = -Math.ceil(rad); dx <= rad; dx++) {
            const d = Math.hypot(dx, (y - cy) * 1.1);
            if (d <= rad) put(x + dx, y, p.mat, d > rad - 1 ? (dx + (y - cy) < 0 ? 3.6 : 1.6) : dx + (y - cy) < -rad * 0.3 ? 3.4 : 2.4);
          }
        }
      }
    },
    skyline(p) {
      const r = rng(`${id}:skyline:${p.seed ?? 0}`);
      let x = p.x?.[0] ?? XL - 2;
      while (x < (p.x?.[1] ?? XR + 1)) {
        const mm = p.hm ? ppm(p.base) : 1, W = p.wm ?? p.w, H = p.hm ?? p.h; // `wm`/`hm` in metres for the base row
        const w = Math.max(3, Math.round((W[0] + r() * (W[1] - W[0])) * mm)), h = Math.max(3, Math.round((H[0] + r() * (H[1] - H[0])) * mm));
        const top = p.base - h, gable = r() < (p.gables ?? 0.4);
        for (let y = top; y <= p.base; y++) span(y, x, x + w - 1, p.wall, y === top ? 3.4 : x % 2 ? 2.6 : 2.2);
        span(top, x - 1, x + w, p.roof, 2);
        if (gable) for (let k = 1; k <= Math.floor(w / 2); k++) span(top - k, x + k - 1, x + w - k, p.roof, k === Math.floor(w / 2) ? 3.4 : 2.6);
        // windows: lit at dusk and night, a few dark
        for (let y = top + 3; y < p.base - 2; y += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          if (r() < (p.windows ?? 0.5)) put(wx, y, r() < 0.8 ? 'window' : 'window_dark', 3);
        }
        if (r() < (p.chimneys ?? 0)) { const cx = x + 1 + Math.floor(r() * (w - 3)); for (let y = top - (gable ? w / 2 : 0) - 4; y < top; y++) span(y, cx, cx + 1, p.roof, 1.8); }
        if (r() < (p.dishes ?? 0)) { const cx = x + Math.floor(w / 2); put(cx, top - (gable ? Math.floor(w / 2) : 0) - 1, 'metal', 3); span(top - (gable ? Math.floor(w / 2) : 0) - 2, cx - 2, cx + 2, 'metal', 4); put(cx, top - (gable ? Math.floor(w / 2) : 0) - 3, 'lamp', 4); }
        x += w + Math.floor(r() * (p.gap ?? 1));
      }
    },
    pillar(p) {
      // a sky pillar: pale bone stone, always cold, rising past the top of the picture
      const r = rng(`${id}:pillar:${p.x}`);
      for (let y = p.top ?? 0; y <= p.base; y++) {
        const w = p.w + (y > p.base - 3 ? 2 : 0);
        // a broken pillar (the dead god's stump) has a ragged top
        if (p.top && y < p.top + 3 && r() < 0.5) continue;
        for (let dx = 0; dx < w; dx++) put(p.x - Math.floor(w / 2) + dx, y, 'bone', dx === 0 ? 4 : dx === w - 1 ? 1.6 : 2.8 + ((y >> 3) % 2 ? 0.3 : 0));
      }
      if (opts.trace) items.push({ kind: 'pillar', row: p.base, box: { x0: p.x - Math.floor(p.w / 2) - 1, x1: p.x + Math.ceil(p.w / 2), y0: p.top ?? 0, y1: p.base } });
    },
    wall(p) {
      // a back wall with a surface pattern: planks, logs, blocks (stone), brick, plaster, weave
      const [x0, x1] = p.x ?? (sc.width ? room().back : [XL, XR]), pat = p.pattern ?? 'plaster', r = rng(`${id}:wall:${p.y0}`);
      for (let y = p.y0; y <= p.y1; y++) for (let X = x0; X <= x1; X++) {
        const x = X + OX; // patterns run on picture columns (never negative)
        let l = 2.6 + (r() - 0.5) * (p.noise ?? 0.5);
        if (pat === 'planks') { if (x % 7 === 0) l = 1.4; else if (x % 7 === 1) l = 3.4; if ((y * 3 + Math.floor(x / 7) * 11) % 37 === 0) l = 1.6; }
        if (pat === 'logs') { const k = (y - p.y0) % 6; l = k === 0 ? 1.2 : k === 1 ? 3.6 : k === 5 ? 1.8 : 2.8; }
        if (pat === 'blocks' || pat === 'brick') {
          const bh = pat === 'brick' ? 3 : 6, bw = pat === 'brick' ? 7 : 12, row = Math.floor((y - p.y0) / bh);
          const off = row % 2 ? bw / 2 : 0;
          if ((y - p.y0) % bh === 0 || Math.floor(x + off) % bw === 0) l = 1.2; else if ((y - p.y0) % bh === 1) l = 3.2;
        }
        if (pat === 'weave') l = ((x + y) % 4 < 2) !== ((x - y + 64) % 6 < 3) ? 3.2 : 2.2;
        put(X, y, p.mat, l);
      }
      if (p.battlements) {
        const k = ppm(p.y1 + 1), [mh, ev] = p.battlements, mpx = Math.max(2, Math.round(mh * k)), epx = Math.max(4, Math.round(ev * k));
        for (let X = x0; X <= x1; X++) {
          if (((X + OX) % epx) >= epx / 2) continue;
          for (let y = p.y0 - mpx; y < p.y0; y++) put(X, y, p.mat, y === p.y0 - mpx ? 3.4 : ((X + OX) % epx) === 0 ? 3.1 : ((X + OX) % epx) === Math.floor(epx / 2) - 1 ? 1.6 : 2.5);
        }
      }
      for (const bx of p.beams ?? []) for (let y = p.y0; y <= p.y1; y++) { put(bx, y, 'wood', 3.2); put(bx + 1, y, 'wood', 2.2); put(bx + 2, y, 'wood', 1.4); }
      for (const by of p.rails ?? []) for (let x = x0; x <= x1; x++) { put(x, by, 'wood', 3.4); put(x, by + 1, 'wood', 2.2); put(x, by + 2, 'wood', 1.2); }
      // `skirt: <material>`: a skirting board where the wall meets the floor, so the room has a corner
      if (p.skirt) for (let x = x0; x <= x1; x++) { put(x, p.y1 - 3, p.skirt, 3.6); put(x, p.y1 - 2, p.skirt, 2.6); put(x, p.y1 - 1, p.skirt, 2.2); put(x, p.y1, p.skirt, 1.2); }
      // `wainscot: [row, material]`: panelling on the lower wall up to `row`
      if (p.wainscot) {
        const [wy, wm] = p.wainscot;
        for (let y = wy; y <= p.y1; y++) for (let x = x0; x <= x1; x++) put(x, y, wm, y === wy ? 3.6 : y === wy + 1 ? 1.4 : ((x + OX) % 16 === 0 ? 1.6 : (x + OX) % 16 === 1 ? 3.2 : 2.6));
      }
    },
    floor(p) {
      // a floor in perspective: board seams run to a vanishing point above the middle of the room
      const vx = MID, vy = p.depth != null ? p.y0 - p.depth : cam.eye, pat = p.pattern ?? 'boards';
      for (let y = p.y0; y < SH; y++) {
        const t = (y - vy) / (SH - vy); // grows toward the viewer
        for (let x = XL; x <= XR; x++) {
          const u = (x - vx) / t; // floor coordinate across
          const v = 1 / t; // depth coordinate
          let l = 2.6, mat = p.mat;
          if (pat === 'boards') { if (Math.abs((u / (p.board ?? 9)) % 1) < 0.1 || y === p.y0) l = 1.4; else if (Math.floor(u / (p.board ?? 9)) % 2) l = 2.9; }
          if (pat === 'flags' || pat === 'checker') {
            const cu = Math.floor(u / (p.tile ?? 14) + 1000), cv = Math.floor(v * (p.rows ?? 18));
            const fu = (u / (p.tile ?? 14)) % 1, edge = Math.abs(fu) < 0.06 || Math.abs((v * (p.rows ?? 18)) % 1) < 0.08;
            if (pat === 'checker') { if ((cu + cv) % 2) mat = p.mat2; l = edge ? 2 : 3; } else l = edge ? 1.3 : 2.4 + (((cu * 7 + cv * 13) % 5) - 2) * 0.2;
          }
          if (pat === 'earth') l = 2.6 + ((((x * 7 + y * 13) ^ (x * y)) & 7) - 3.5) * 0.14; // beaten earth
          // the corner where the wall meets the floor sits in shadow
          put(x, y, mat, l + (y === p.y0 ? -0.8 : y === p.y0 + 1 ? -0.45 : y === p.y0 + 2 ? -0.2 : 0));
        }
      }
      if (p.track) {
        // rails `track` metres apart running into the picture, sleepers every 0.7 m
        for (let y = p.y0; y < SH; y++) {
          const k = ppm(y), z = cam.Z(y), z2 = cam.Z(y + 1);
          if (Math.floor(z / 0.7) !== Math.floor(z2 / 0.7)) for (let q = 0; q < Math.max(1, Math.round(0.12 * k)); q++) span(y - q, MID - (p.track / 2 + 0.25) * k, MID + (p.track / 2 + 0.25) * k, 'wood', q ? 1.6 : 2.6);
          for (const sx of [-1, 1]) { const x = MID + sx * (p.track / 2) * k; for (let t = 0; t < Math.max(1, Math.round(0.06 * k)); t++) put(x + t * sx, y, 'metal', t ? 2 : 3.6); }
        }
      }
      if (p.carpet) {
        const [w0, w1] = p.carpet; // half widths at the far edge and at the bottom
        for (let y = p.y0; y < SH; y++) { const t = (y - p.y0) / (SH - p.y0), hw = w0 + (w1 - w0) * t; span(y, vx - hw, vx + hw, p.carpet_mat ?? 'red_cloth', Math.abs(Math.abs(0) - hw) < 0 ? 2 : 2.8); put(Math.ceil(vx - hw), y, p.carpet_trim ?? 'gold', 3); put(Math.floor(vx + hw), y, p.carpet_trim ?? 'gold', 3); }
      }
    },
    pane(p) {
      // a window to the outside: the real sky of this time of day, stars at night, then the frame.
      // In metres: `at: [centre x]` on the back wall, sill `on` m up (0.9), `wm` x `hm` (1.0 x 1.2)
      if (p.at) {
        const k = ppm(cam.back), w = Math.round((p.wm ?? 1) * k), h = Math.round((p.hm ?? 1.2) * k);
        p = { ...p, x: Math.round(p.at[0] - w / 2), y: Math.round(cam.back - ((p.on ?? 0.9) + (p.hm ?? 1.2)) * k), w, h };
      }
      const cols = OUT.skyRgb, sr = rng(`${id}:pane:${p.x}:${p.y}`);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const t = y / p.h, c = mix(cols[0], cols[Math.min(2, cols.length - 1)], Math.min(1, Math.floor((t * 3 + dither(x, y)) ) / 3));
        putRgb(p.x + x, p.y + y, c);
        if (OUT.stars && sr() < 0.035) putRgb(p.x + x, p.y + y, rgbOf(pal.star));
      }
      // what is outside: `leaves: mat` (clumps of leaves, a house in a tree), `roofs: mat` (the
      // rooftops of a town below, lit windows at night)
      if (p.leaves) {
        const lr = rng(`${id}:leaves:${p.x}`);
        for (let n = 0; n < Math.round((p.w * p.h) / 14); n++) {
          const cx = lr() * p.w, cy = p.h * (0.3 + lr() * 0.8), rad = 1.5 + lr() * 2.5;
          for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(p.h, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(p.w, cx + rad); x++) {
            const d = Math.hypot(x - cx, (y - cy) * 1.2);
            if (d <= rad) put(p.x + x, p.y + y, p.leaves, d > rad - 1 ? (x - cx + y - cy < 0 ? 3.6 : 1.4) : x - cx + y - cy < 0 ? 3 : 2.2);
          }
        }
      }
      if (p.roofs) {
        const lr = rng(`${id}:roofs:${p.x}`);
        let top = Math.round(p.h * 0.55), run = 0;
        for (let x = 0; x < p.w; x++) {
          if (run-- <= 0) { top = Math.round(p.h * (0.45 + lr() * 0.3)); run = 3 + Math.floor(lr() * 5); }
          for (let y = top; y < p.h; y++) put(p.x + x, p.y + y, p.roofs, y === top ? 2.4 : 1.2);
          if (T.lights && lr() < 0.12) put(p.x + x, p.y + top + 2 + Math.floor(lr() * 3), 'window', 4);
        }
      }
      if (p.arch) for (let x = 0; x < p.w; x++) { const h = Math.round(p.w / 2 - Math.sqrt(Math.max(0, (p.w / 2) ** 2 - (x - p.w / 2 + 0.5) ** 2))); for (let y = 0; y < h; y++) put(p.x + x, p.y + y, p.frame_bg ?? 'stone', 2.6); }
      const fm = p.frame ?? 'wood';
      for (let x = -1; x <= p.w; x++) { put(p.x + x, p.y - 1, fm, 3.4); put(p.x + x, p.y + p.h, fm, 1.6); put(p.x + x, p.y + p.h + 1, fm, 3); }
      for (let y = 0; y < p.h; y++) { put(p.x - 1, p.y + y, fm, 3); put(p.x + p.w, p.y + y, fm, 1.6); if (p.cross !== false) put(p.x + Math.floor(p.w / 2), p.y + y, fm, 2.4); }
      if (p.cross !== false && !p.arch) for (let x = 0; x < p.w; x++) put(p.x + x, p.y + Math.floor(p.h / 2), fm, 2.4);
    },
    vignette(p) {
      // darken toward the edges and the top: the room's corners fall out of the lamp's reach
      const k = p.strength ?? 0.35, dark = rgbOf(pal.outline);
      for (let y = 0; y < SH; y++) for (let x = XL; x <= XR; x++) {
        // the light falls off from the stage outward, gently, so the wings still read
        const dx = (x - MID) / (STAGE * 1.1), dy = (y - SH * 0.62) / (SH * 0.62);
        const d = Math.max(0, Math.hypot(dx * 0.9, dy) - 0.55) * k * 1.6 * (T.lights ? 1.3 : 1);
        if (d <= 0) continue;
        const q = (y * SW + x + OX) * 4, a = Math.min(0.75, Math.floor((d + dither(x, y) * 0.12) * 8) / 8);
        putRgb(x, y, mix([out[q], out[q + 1], out[q + 2]], dark, a));
      }
    },
    furn(p) {
      // a thing at its real size (art/kit/things.mjs): `at: [centre x, row]` = where it stands on the
      // floor or ground (the row sets its distance, so its size); `on: m` lifts it that many metres
      // (a shelf on the wall, a lamp under the ceiling); no row = against the back wall (`back`).
      // `along: { to: [x, row], every: m }` repeats it on a line going into the picture.
      const draw1 = THINGS[p.kind];
      if (!draw1) throw new Error(`${id}: unknown thing "${p.kind}"`);
      let [ax, ay] = p.at;
      const row0 = ay ?? cam.back;
      // `side: left | right` with `at: [metres from that wall to the thing's centre, row]`
      if (p.side) { const kk = ppm(row0), half = sc.width / 2 - ax; ax = Math.round(p.side === 'left' ? MID - half * kk : MID + half * kk); }
      if (p.xm != null) ax = Math.round(MID + p.xm * ppm(row0));
      const sideX = row => (p.xm != null ? Math.round(MID + p.xm * ppm(row)) : Math.round(MID + (p.side === 'left' ? -1 : 1) * (sc.width / 2 - p.at[0]) * ppm(row)));
      const to = p.along && typeof p.along.to === 'number' ? [sideX(p.along.to), p.along.to] : p.along?.to;
      // `at_rows: [..]` stands one on each of those rows along the same line (lamps placed by hand so none
      // rises behind a figure's head), `along` spaces them evenly
      const spots = p.at_rows ? p.at_rows.map(r => [sideX(r), r]) : p.along ? alongLine([ax, row0], to, p.along.every ?? 3) : [[ax, row0]];
      let prev = null;
      for (const [x, row] of spots) {
        const k = ppm(row), yb = Math.round(row - (p.on ?? 0) * k), cx = Math.round(x);
        const r = rng(`${id}:furn:${p.kind}:${p.at}:${x}`);
        const ctx = {
          r, lit: !!T.lights, put: (X, Y, m, l) => { if (l > -5) put(X, Y, m, l); },
          ppm, Z: cam.Z, rowAt: cam.rowAt,
          ceiling: sc.ceiling ? Math.round(row - sc.ceiling * k) : -10,
        };
        track = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
        // a fence: rails from the last post to this one, then the post
        if (p.kind === 'fence' && prev) for (const hgt of [0.5, 0.95]) {
          const [px, prow] = prev, pk = ppm(prow), t = Math.max(1, Math.round(0.08 * k));
          const ya = prow - hgt * pk, yb2 = row - hgt * k;
          const n = Math.max(1, Math.abs(Math.round(x - px)));
          for (let s = 0; s <= n; s++) { const fx = px + ((x - px) * s) / n, fy = ya + ((yb2 - ya) * s) / n; for (let q = 0; q < t; q++) put(fx, fy + q, p.mat ?? 'wood', q === 0 ? 3.6 : 2.2); }
        }
        draw1(metrePen(ctx.put, cx, yb, k, !!p.flip), p, ctx);
        if (opts.trace) items.push({ kind: p.kind, row, k, x: cx, yb, on: p.on ?? 0, box: { ...track } });
        track = null;
        // `glow: { r, colour, only }` lights it where it hangs (a lamp's flame, `up` m above its foot)
        if (p.glow) draw.glow({ ...p.glow, at: [cx, Math.round(yb - (p.glow.up ?? 0.15 * (p.s ?? 1)) * k)] });
        prev = [x, row];
      }
    },
    sides(p) {
      // the room's side walls in one-point perspective (scene `width:` in metres): from the back wall's
      // corners out to the edges of the picture, so a room reads as a box and not as one long wall.
      // Patterns run in metres on the wall (boards, logs, blocks, brick get bigger toward the front);
      // `beams: m` posts along the wall, `rails: [m]`, `wainscot: [m, mat]`, `skirt: mat`.
      const R = room(), pat = p.pattern ?? 'plaster', r = rng(`${id}:sides`), dark = rgbOf(pal.outline);
      const crossed = (a, b, s, off = 0) => Math.floor((a + off) / s) !== Math.floor((b + off) / s);
      for (let x = XL; x <= XR; x++) {
        const w = R.at(x);
        if (!w) continue;
        const w2 = R.at(x + (w.left ? -1 : 1)), zOut = w2 ? w2.z : 0; // the next column toward the edge
        const base = 2.6 + (w.left ? (p.left ?? -1.15) : (p.right ?? -0.7));
        const post = p.beams && ((R.zBack - w.z) % p.beams) < (p.beam_w ?? 0.2) && R.zBack - w.z > 0.05;
        const y0 = Math.max(0, Math.ceil(w.ceil)), y1 = Math.min(SH - 1, Math.floor(w.floor));
        for (let y = y0; y <= y1; y++) {
          const h = (w.floor - y) / w.k, hUp = h + 1 / w.k; // metres up the wall at this row and the next up
          let l = base + (r() - 0.5) * (p.noise ?? 0.5), mat = p.mat;
          if (pat === 'planks' && crossed(w.z, zOut, p.board ?? 0.22)) l = base - 1.2;
          if (pat === 'logs') { const c = p.course ?? 0.26, f = (h % c) / c; l = crossed(h, hUp, c) ? base - 1.4 : f > 0.75 ? base + 0.8 : f < 0.2 ? base - 0.7 : base + 0.2; }
          if (pat === 'blocks' || pat === 'brick') {
            const bh = pat === 'brick' ? 0.09 : 0.32, bw = pat === 'brick' ? 0.24 : 0.62, off = Math.floor(h / bh) % 2 ? bw / 2 : 0;
            if (crossed(h, hUp, bh) || crossed(w.z, zOut, bw, off)) l = base - 1.3; else if (crossed(h, h + 2 / w.k, bh)) l = base + 0.5;
          }
          if (pat === 'rock') {
            // rough rock: blotches by the metre, and seams of demon coal glowing red (`seams: mat`)
            const cell = ((Math.floor(w.z * 4.5 + h * 1.3) * 73856093) ^ (Math.floor(h * 5 - w.z * 0.7) * 19349663)) >>> 0;
            l = base + ((cell >>> 3) % 5 - 2) * 0.36 + (((x + y) & 3) === 0 ? -0.2 : 0);
            if (p.seams) {
              // a seam is where a wavy field crosses zero, one pixel wide, only in some stretches of rock
              const a = (z, hh) => Math.sin(z * 1.3 + Math.sin(hh * 2.1) * 1.6) * Math.cos(hh * 2.6 - z * 0.7) + 0.15;
              const v = a(w.z, h), patch = Math.sin(w.z * 0.45 + 1.3) * Math.sin(h * 1.1 + w.z * 0.2);
              if (patch > -0.25 && (Math.sign(v) !== Math.sign(a(zOut, h)) || Math.sign(v) !== Math.sign(a(w.z, hUp)))) { mat = p.seams; l = T.lights ? 4 : 3.2; }
            }
          }
          if (pat === 'weave') l = base + (((x + OX + y) % 4 < 2) !== ((x + OX - y + 64) % 6 < 3) ? 0.5 : -0.5);
          if (p.wainscot && h < p.wainscot[0]) { mat = p.wainscot[1]; l = crossed(h, hUp, p.wainscot[0]) ? base + 1 : crossed(w.z, zOut, 0.8) ? base - 1 : base; }
          for (const rh of p.rails ?? []) if (h >= rh && h < rh + 0.1) { mat = p.rail_mat ?? 'wood'; l = h < rh + 0.04 ? base - 1 : base + 0.6; }
          if (post) { mat = p.beam_mat ?? 'wood'; l = base - 0.3 + (crossed(w.z, zOut, p.beams, (R.zBack % p.beams)) ? -0.9 : 0); }
          if (p.windows) {
            // `windows: { every, w, h, sill, storey, from }` in metres: a grid of windows on a facade
            const W2 = p.windows, ev = W2.every ?? 3.4, ww = W2.w ?? 1.1, wh = W2.h ?? 1.6, st = W2.storey ?? 3.4, sill = W2.sill ?? 1.0;
            const zz = (w.z - (W2.start ?? 0)) % ev, fl = Math.floor((h - (W2.from ?? 0)) / st), hh = (h - (W2.from ?? 0)) - fl * st;
            if (fl >= 0 && zz > (ev - ww) / 2 && zz < (ev + ww) / 2 && hh > sill && hh < sill + wh) {
              const edge = crossed(w.z, zOut, ev, ev / 2 - ww / 2 - (W2.start ?? 0)) || crossed(w.z, zOut, ev, ev / 2 + ww / 2 - (W2.start ?? 0)) || hh < sill + 1.5 / w.k;
              const lit = T.lights && ((Math.floor(w.z / ev) * 7 + fl * 3) % 5) < 3;
              mat = edge ? (W2.frame ?? 'wood') : lit ? 'window' : 'window_dark'; l = edge ? base - 0.5 : lit ? 3.4 : 2 + (hh > sill + wh * 0.6 ? 0.8 : 0);
            }
          }
          if (p.skirt && h < 0.12) { mat = p.skirt; l = h < 0.03 ? base - 1.4 : base; }
          if (y === y0 && w.ceil > 0) l = base - 1.4; // the edge under the ceiling
          put(x, y, mat, l);
        }
        // the floor along the foot of the wall sits in shadow
        for (const [dy, a] of [[1, 0.35], [2, 0.18]]) {
          const Y = y1 + dy, q = (Y * SW + x + OX) * 4;
          if (Y < SH && x + OX >= 0 && x + OX < SW) putRgb(x, Y, mix([out[q], out[q + 1], out[q + 2]], dark, a));
        }
      }
      // the back corners
      const kb = ppm(cam.back), top = sc.ceiling ? Math.round(cam.back - sc.ceiling * kb) : 0;
      for (const cx of R.back) for (let y = Math.max(0, top); y <= cam.back; y++) put(cx, y, p.mat, 1.2);
    },
    cracks(p) {
      // cracks in the ground glowing with ember (the Ashland): jagged lines that widen toward the front
      const r = rng(`${id}:cracks:${p.seed ?? 0}`), [y0, y1] = p.y ?? [64, 111];
      for (let n = 0; n < (p.count ?? 12); n++) {
        let x = XL + r() * (XR - XL), y = y0 + r() * (y1 - y0), dir = r() < 0.5 ? -1 : 1;
        const len = 6 + r() * 26 * ((y - cam.eye) / (SH - cam.eye) + 0.3);
        for (let i = 0; i < len; i++) {
          const t = Math.max(1, Math.round(ppm(y) * 0.05));
          for (let q = 0; q < t; q++) put(x + q, y, p.mat ?? 'fire', T.lights ? 4 : i % 4 === 0 ? 3.4 : 2.6);
          x += dir * (0.6 + r() * 1.2); y += (r() - 0.45) * 1.1;
          if (r() < 0.1) dir = -dir;
          if (y < y0 || y > SH - 1) break;
        }
      }
    },
    rope(p) {
      // a rope bridge hanging between two points: planks under a pair of ropes, sagging `sag` px
      const [[x0, y0], [x1, y1]] = p.from, sag = p.sag ?? 6, n = Math.max(2, Math.abs(x1 - x0));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t);
        put(x, y, p.mat ?? 'plank', i % 3 === 0 ? 1.6 : 3);
        put(x, y + 1, p.mat ?? 'plank', 1.8);
        put(x, y - (p.rail ?? 4), 'thatch', 2.6);
        if (i % 4 === 0) for (let q = 1; q < (p.rail ?? 4); q++) put(x, y - q, 'thatch', 2);
      }
    },
    canopy(p) {
      // leaves hanging in from the top edge of the picture (an open roof under a tree)
      const r = rng(`${id}:canopy:${p.seed ?? 0}`), [x0, x1] = p.x ?? [XL, XR], [r0, r1] = p.r ?? [5, 11];
      for (let n = 0; n < (p.count ?? 10); n++) {
        const cx = x0 + r() * (x1 - x0), cy = (p.y ?? 8) * r() - 2, rad = r0 + r() * (r1 - r0);
        for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
          const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy * 1.15);
          if (d <= rad && y >= 0) put(x, y, p.mat ?? 'leaf', d > rad - 1 ? (dx + dy < 0 ? 3.6 : 1.4) : dx + dy < -rad * 0.3 ? 3.2 : (x * 3 + y * 5) % 7 === 0 ? 1.8 : 2.4);
        }
      }
    },
    envelope(p) {
      // the underside of an airship's gas bag filling the top of the picture: canvas gores whose seams
      // run toward the middle, darker toward its lowest curve
      const cx = p.cx ?? MID, rx = p.rx ?? 210, base = p.base ?? 2, sag = p.sag ?? 22, mat = p.mat ?? 'canvas';
      for (let x = XL; x <= XR; x++) {
        const t = Math.min(1, Math.abs(x - cx) / rx), yb = Math.round(base + sag * (1 - t * t));
        for (let y = 0; y <= yb; y++) {
          // gores: seams that spread out toward the top (the bag curves away above us)
          const seam = Math.abs(((x - cx) / (0.35 + 0.65 * (y + 4) / (yb + 4))) % (p.gore ?? 22)) < 0.9;
          const shade = 3.3 - ((y + 2) / (yb + 2)) * 1.6 - (x > cx ? 0.3 : 0);
          put(x, y, mat, y === yb ? 0.8 : y === yb - 1 ? 1.6 : seam ? shade - 0.9 : shade);
        }
      }
    },
    pipe(p) {
      // a pipe along the wall: from [x, y] to [x, y] (rows), straight runs with one bend, `wm` thick
      const [[x0, y0], [tx, ty]] = [p.from, p.to], t = Math.max(2, Math.round((p.wm ?? 0.12) * ppm(cam.back)));
      for (let x = Math.min(x0, tx); x <= Math.max(x0, tx); x++) for (let k = 0; k < t; k++) put(x, y0 + k, p.mat ?? 'metal', k === 0 ? 3.6 : k === t - 1 ? 1.4 : 2.6);
      for (let y = Math.min(y0, ty); y <= Math.max(y0, ty); y++) for (let k = 0; k < t; k++) put(tx + k, y, p.mat ?? 'metal', k === 0 ? 3.6 : k === t - 1 ? 1.4 : 2.6);
      for (let x = Math.min(x0, tx); x <= Math.max(x0, tx); x += p.joints ?? 14) for (let k = -1; k <= t; k++) put(x, y0 + k, 'brass', 3);
    },
    ceiling(p) {
      // the ceiling of a low room (scene `ceiling:` = its height in metres) seen from below: boards
      // running into the room (their seams meet at the eye point, like the floor's) and joists across
      // the room that come further apart toward the top of the picture
      const hc = sc.ceiling, top = Math.round(cam.back - hc * ppm(cam.back)), mat = p.mat ?? 'wood', board = p.board_mat ?? 'plank';
      const above = hc - (cam.stand - cam.eye) / PXM, rowOf = z => cam.eye - (above * cam.f) / z;
      for (let y = 0; y < top; y++) {
        const s = (cam.eye - y) / (cam.eye - top);
        for (let x = XL; x <= XR; x++) { const u = (x - MID) / s / (p.board ?? 12); put(x, y, board, Math.abs(u - Math.round(u)) < 0.06 ? 1 : 1.9 + (Math.round(u) % 2 ? 0.3 : 0)); }
      }
      for (let z = cam.Z(cam.back) - (p.every ?? 1.2) / 2; z > 1; z -= p.every ?? 1.2) {
        const y = Math.round(rowOf(z)), th = Math.max(2, Math.round((0.16 * cam.f) / z));
        if (y < 0) break;
        for (let j = 0; j < th; j++) for (let x = XL; x <= XR; x++) put(x, y - j, mat, j === 0 ? 1 : j === th - 1 ? 3.2 : 2.3);
      }
      for (let x = XL; x <= XR; x++) { put(x, top, mat, 3.4); put(x, top - 1, mat, 2.4); put(x, top + 1, mat, 1.2); }
    },
    slope(p) {
      // a sloping ceiling under the roof: fills everything above the line from `from` to `to` with
      // rafters every `every` px (an attic room)
      const [[x0, y0], [x1, y1]] = p.from;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const yl = Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1));
        for (let y = 0; y <= yl; y++) {
          const raft = ((x + OX) % (p.every ?? 14)) < 3;
          put(x, y, p.mat ?? 'wood', y >= yl - 1 ? 3.6 : y === yl - 2 ? 1.2 : raft ? ((x + OX) % (p.every ?? 14) === 0 ? 3.2 : 1.6) : 2.2);
        }
      }
    },
    line(p) {
      // a straight line of a given thickness (rails, ropes, beams); `ties` adds cross ties every n px
      const [[x0, y0], [x1, y1]] = p.from, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
        for (let t = 0; t < (p.w ?? 1); t++) put(x, y + t, p.mat, t === 0 ? 3.6 : 2.4);
        if (p.ties && i % p.ties === 0) for (let t = 1; t <= 3; t++) put(x, y + t, p.tie ?? 'wood', 2);
      }
    },
    smoke(p) {
      const r = rng(`${id}:smoke:${p.at.join(',')}`);
      for (let i = 0; i < (p.puffs ?? 6); i++) {
        const cx = p.at[0] + i * (p.drift ?? 1.5) + r() * 2, cy = p.at[1] - i * 4, rad = 1.5 + i * 0.5;
        for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && (i < 3 || dither(x, y) < 1 - i / 9)) put(x, y, p.mat ?? 'smoke', y < cy ? 3.6 : 2.6);
        }
      }
    },
    glow(p) {
      // a soft round light (furnace mouth, lamp): dithered halo, stronger at night
      if (p.only && !p.only.includes(time)) return;
      if (opts.trace) items.push({ kind: 'glow', x: p.at[0] + shift, y: p.at[1], r: p.r });
      const c = rgbOf(p.colour), strength = T.lights ? 1 : 0.45;
      for (let y = -p.r; y <= p.r; y++) for (let x = -p.r; x <= p.r; x++) {
        const d = Math.hypot(x, y) / p.r;
        if (d > 1) continue;
        const X = p.at[0] + x, Y = p.at[1] + y;
        const CX = X + OX + shift;
        if (CX < 0 || Y < 0 || CX >= SW || Y >= SH) continue;
        // two soft rings: a solid inner wash, then a sparse dither at the rim
        const a = d < 0.45 ? 0.3 : d < 0.75 ? 0.18 : dither(X, Y) < 0.35 ? 0.12 : 0;
        if (!a) continue;
        const q = (Y * SW + CX) * 4;
        putRgb(X, Y, mix([out[q], out[q + 1], out[q + 2]], c, a * strength));
      }
    },
    prop(p) {
      const legend = { ...pal.legend, ...(p.legend ?? {}) };
      const art = (pal.props?.[p.art] ?? p.ascii);
      if (!art) throw new Error(`${id}: prop without art (${p.art})`);
      const lines = art.replace(/\n$/, '').split('\n');
      for (const at of p.at.length && Array.isArray(p.at[0]) ? p.at : [p.at]) {
        const [x0, yb] = at, y0 = yb - lines.length + 1; // `at` = left column, bottom row
        lines.forEach((line, j) => [...line].forEach((ch, i) => {
          if (ch === '.' || ch === ' ') return;
          const ref = legend[ch];
          if (!ref) throw new Error(`${id}: no scene legend entry for "${ch}"`);
          const [m, l] = ref.split('@');
          put(p.flip ? x0 + line.length - 1 - i : x0 + i, y0 + j, m, l === undefined ? 3 : Number(l));
        }));
      }
    },
  };

  // `base: { scene, layers }` starts from the first layers of another scene (a market on a street)
  // The base layers are seeded with the base scene's id, so its hills, clouds and stars come out the same
  const layers = sc.base ? [...scenes[sc.base.scene].layers.slice(0, sc.base.layers), ...sc.layers] : sc.layers;
  const own = id, nBase = sc.base ? sc.base.layers : 0;
  for (const [i, L] of layers.entries()) {
    id = i < nBase ? sc.base.scene : own;
    const [kind] = Object.keys(L).filter(k => k in draw);
    if (!kind) throw new Error(`${id}: layer with no known kind: ${Object.keys(L).join(', ')}`);
    if (L.only && !L.only.includes(time)) continue;
    layer = { haze: L.haze ?? 0 };
    mask = L.outline ? new Uint8Array(SW * SH) : null;
    // `repeat: [dx, ..]` draws the same layer again further along (a row of shelves into the wings)
    for (const dx of [0, ...(L.repeat ?? [])]) { shift = dx; draw[kind](L[kind] ?? {}); }
    shift = 0;
    if (mask) {
      // a 1 px outline round the layer in the sprites' outline colour, softened by time and haze
      const c = colour('ink', 0), m = mask; mask = null;
      // contact shadow: what stands on the ground throws a short shadow down and to the right
      if (L.shadow !== false) {
        const sh = [];
        for (let y = 0; y < SH - 1; y++) for (let x = 0; x < SW; x++) {
          if (!m[y * SW + x] || m[(y + 1) * SW + x] || y < (sc.floor ?? 84)) continue;
          for (const [dx, dy, a] of [[1, 1, 0.38], [2, 1, 0.3], [3, 1, 0.18], [2, 2, 0.12]]) {
            const X = x + dx, Y = y + dy;
            if (X < SW && Y < SH && !m[Y * SW + X]) sh.push([X, Y, a]);
          }
        }
        for (const [X, Y, a] of sh) { const q = (Y * SW + X) * 4; putRgb(X - OX, Y, mix([out[q], out[q + 1], out[q + 2]], c, a)); }
      }
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        if (m[y * SW + x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < SW && Y < SH && m[Y * SW + X]; })) putRgb(x - OX, y, c);
      }
    }
  }
  id = own;
  return { w: SW, h: SH, rgba: out, stand: sc.stand ?? STAND, items };
}

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

// The picture is a wide panorama, SW x SH. Scenes are written in stage coordinates: the middle
// STAGE columns (x 0..255) are where the figure stands, and the wings (x -256..-1 and 256..511) reach
// out to the sides, so a wide screen sees more of the place while a phone sees only the stage.
// Layers that fill the picture (sky, walls, floors, ground, ridges, skylines) cover the whole width.
export const STAGE = 256, SW = 768, SH = 112, OX = (SW - STAGE) / 2;
const XL = -OX, XR = SW - OX - 1; // first and last stage column of the picture
/** the row the figures' soles stand on (scene `stand:`), and where the stage's middle is */
export const STAND = 106, MID = STAGE / 2;
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
export function renderScene(S, id, time = 'day') {
  const { pal, scenes } = S, sc = scenes[id];
  if (!sc) throw new Error(`no scene "${id}"`);
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
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    const p = (y * SW + x) * 4;
    out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
    if (mask) mask[y * SW + x] = 1;
  };
  const put = (x, y, mat, lvl) => putRgb(x, y, colour(mat, lvl));
  const span = (y, x0, x1, mat, lvl) => { for (let x = Math.ceil(x0); x <= x1; x++) put(x, y, mat, lvl); };

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
        x += OX;
        let v = n(x * sc) * 0.65 + n(x * sc * 2.3 + 17) * 0.25 + n(x * sc * 5.1 + 33) * 0.1;
        if (jag) v = v * (1 - jag) + jag * (1 - Math.abs(((x * sc * 1.7) % 2) - 1)) * n(x * sc * 0.5 + 5);
        return Math.round((p.base ?? 70) - (p.amp ?? 10) * v);
      };
      const to = p.to ?? SH - 1;
      for (let x = XL; x <= XR; x++) {
        const y0 = top(x), slope = top(x + 1) - top(x - 1);
        for (let y = y0; y <= to; y++) {
          const d = y - y0;
          let mat = p.mat, lvl = d === 0 ? 4 : d < 2 ? 3 : slope > 0 ? 1.6 : 2.4;
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
      const [y0, y1] = p.y, [a0, a1] = p.top, [b0, b1] = p.bottom;
      for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / Math.max(1, y1 - y0);
        span(y, a0 + (b0 - a0) * t, a1 + (b1 - a1) * t, p.mat, 2.8 + ((y * 7) % 3 === 0 ? 0.6 : 0));
      }
    },
    rect(p) { for (let y = p.y; y < p.y + p.h; y++) span(y, p.x, p.x + p.w - 1, p.mat, p.lvl ?? 3); },
    trees(p) {
      const r = rng(`${id}:trees:${p.seed ?? 0}`);
      for (let x = p.x?.[0] ?? XL - 4; x < (p.x?.[1] ?? XR + 4); x += p.every * (0.6 + r() * 0.8)) {
        const h = p.h[0] + r() * (p.h[1] - p.h[0]), base = p.base + Math.round((r() - 0.5) * (p.jitter ?? 2));
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
        const w = Math.round(p.w[0] + r() * (p.w[1] - p.w[0])), h = Math.round(p.h[0] + r() * (p.h[1] - p.h[0]));
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
    },
    wall(p) {
      // a back wall with a surface pattern: planks, logs, blocks (stone), brick, plaster, weave
      const [x0, x1] = p.x ?? [XL, XR], pat = p.pattern ?? 'plaster', r = rng(`${id}:wall:${p.y0}`);
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
      const vx = MID, vy = p.y0 - (p.depth ?? 70), pat = p.pattern ?? 'boards';
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
          // the corner where the wall meets the floor sits in shadow
          put(x, y, mat, l + (y === p.y0 ? -0.8 : y === p.y0 + 1 ? -0.45 : y === p.y0 + 2 ? -0.2 : 0));
        }
      }
      if (p.carpet) {
        const [w0, w1] = p.carpet; // half widths at the far edge and at the bottom
        for (let y = p.y0; y < SH; y++) { const t = (y - p.y0) / (SH - p.y0), hw = w0 + (w1 - w0) * t; span(y, vx - hw, vx + hw, p.carpet_mat ?? 'red_cloth', Math.abs(Math.abs(0) - hw) < 0 ? 2 : 2.8); put(Math.ceil(vx - hw), y, p.carpet_trim ?? 'gold', 3); put(Math.floor(vx + hw), y, p.carpet_trim ?? 'gold', 3); }
      }
    },
    pane(p) {
      // a window to the outside: the real sky of this time of day, stars at night, then the frame
      const cols = OUT.skyRgb, sr = rng(`${id}:pane:${p.x}:${p.y}`);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const t = y / p.h, c = mix(cols[0], cols[Math.min(2, cols.length - 1)], Math.min(1, Math.floor((t * 3 + dither(x, y)) ) / 3));
        putRgb(p.x + x, p.y + y, c);
        if (OUT.stars && sr() < 0.035) putRgb(p.x + x, p.y + y, rgbOf(pal.star));
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
      // furniture and fittings at figure scale, drawn from a few numbers: `at` = [left, bottom row]
      const r = rng(`${id}:furn:${p.kind}:${p.at}`), [x0, yb] = p.at, w = p.w ?? 20, h = p.h ?? 20, y0 = yb - h + 1;
      const box = (x, y, bw, bh, mat, top = 3.4, body = 2.6) => {
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) put(x + i, y + j, mat, j === 0 ? top : i === 0 ? body + 0.5 : i === bw - 1 || j === bh - 1 ? body - 1 : body);
      };
      const ITEM = ['red_cloth', 'cloth', 'brass', 'plaster', 'leaf', 'water', 'brick', 'stone'];
      const items = (x, y, iw, kind) => {
        // small things on a shelf or table top standing on row y: pots, bottles, books
        for (let i = 0; i < iw;) {
          const t = kind ?? (r() < 0.5 ? 'book' : 'pot'), mat = ITEM[Math.floor(r() * ITEM.length)];
          if (r() < (kind === 'book' ? 0.05 : 0.3)) { i += 2; continue; }
          if (t === 'book') { const bh = 4 + Math.floor(r() * 3), bw = 1 + (r() < 0.4 ? 1 : 0); box(x + i, y - bh + 1, bw, bh, mat, 3.2, 2.4); i += bw; }
          else { const ph = 3 + Math.floor(r() * 2); for (let j = 0; j < ph; j++) span(y - j, x + i + (j === ph - 1 ? 1 : 0), x + i + 2 - (j === ph - 1 ? 1 : 0), mat, j === ph - 1 ? 3.6 : 2.4); i += 4; }
        }
      };
      switch (p.kind) {
        case 'table': case 'bench': {
          box(x0, y0, w, 3, p.mat ?? 'wood', 3.8, 2.6);
          for (const lx of [x0 + 1, x0 + w - 3]) box(lx, y0 + 3, 2, h - 3, p.mat ?? 'wood', 2.4, 2);
          if (p.kind === 'table' && p.items !== false) items(x0 + 2, y0 - 1, w - 4, 'pot');
          break;
        }
        case 'shelf': case 'bookcase': {
          box(x0, y0, w, h, 'wood', 3.2, 1.4);
          const rows = p.rows ?? Math.max(2, Math.floor(h / 9));
          for (let k = 0; k < rows; k++) {
            const sy = y0 + Math.round(((k + 1) * (h - 2)) / rows);
            span(sy, x0, x0 + w - 1, 'wood', 3.4);
            for (let yy = sy - Math.round((h - 2) / rows) + 1; yy < sy; yy++) span(yy, x0 + 1, x0 + w - 2, 'wood', 1);
            items(x0 + 2, sy - 1, w - 4, p.kind === 'bookcase' ? 'book' : undefined);
          }
          break;
        }
        case 'drawers': {
          box(x0, y0, w, h, p.mat ?? 'wood', 3.4, 2.2);
          const cw = p.cell ?? 6, ch = p.cellh ?? 5;
          for (let y = y0 + 2; y + ch <= yb - 1; y += ch + 1) for (let x = x0 + 2; x + cw <= x0 + w - 2; x += cw + 1) { box(x, y, cw, ch, p.mat ?? 'wood', 3, 2.6); put(x + Math.floor(cw / 2), y + Math.floor(ch / 2), 'brass', 4); }
          break;
        }
        case 'bed': {
          box(x0, y0 + 4, w, h - 4, 'wood', 3.2, 2);
          box(x0 + 1, y0 + 4, w - 2, 4, p.mat ?? 'cloth', 3.6, 2.8);
          box(x0 + 2, y0 + 2, 7, 3, 'plaster', 3.8, 3);
          for (let y = y0; y <= yb; y++) put(x0, y, 'wood', 3);
          for (let y = y0 + 2; y <= yb; y++) put(x0 + w - 1, y, 'wood', 1.6);
          break;
        }
        case 'counter': {
          box(x0, y0, w, h, p.mat ?? 'wood', 3.8, 2.4);
          for (let x = x0 + 3; x + 8 < x0 + w; x += 11) { for (let y = y0 + 3; y < yb - 1; y++) { put(x, y, p.mat ?? 'wood', 1.4); put(x + 8, y, p.mat ?? 'wood', 3.2); } }
          if (p.items !== false) items(x0 + 2, y0 - 1, w - 4, 'pot');
          break;
        }
        case 'barrel': {
          for (let j = 0; j < h; j++) { const bulge = Math.round(Math.sin((j / (h - 1)) * Math.PI) * 1.5); for (let i = -bulge; i < w + bulge; i++) put(x0 + i, y0 + j, j === 2 || j === h - 3 ? 'metal' : 'wood', i === -bulge ? 3.4 : i === w + bulge - 1 ? 1.4 : (i % 3 === 0 ? 2 : 2.8)); }
          span(y0, x0, x0 + w - 1, 'wood', 3.8);
          break;
        }
        case 'crate': {
          box(x0, y0, w, h, 'plank', 3.6, 2.6);
          for (let y = y0 + 3; y < yb; y += 4) span(y, x0 + 1, x0 + w - 2, 'plank', 1.4);
          break;
        }
        case 'hearth': {
          if (p.chimney) box(x0 + 3, 0, w - 6, y0 + 1, 'stone', 2.8, 2.4);
          box(x0, y0, w, 4, 'stone', 3.8, 2.6);
          box(x0 + 1, y0 + 4, w - 2, h - 4, 'stone', 2.8, 2.4);
          box(x0 + 5, y0 + 7, w - 10, h - 8, 'dark_stone', 0.8, 0.6);
          const fx = x0 + w / 2;
          for (let j = 0; j < 7; j++) span(yb - 2 - j, fx - 4 + j * 0.6, fx + 4 - j * 0.6, p.fire ?? 'fire', 4 - j * 0.4);
          span(yb - 1, fx - 6, fx + 6, 'wood', 2);
          break;
        }
        case 'door': {
          box(x0 - 2, y0 - 2, w + 4, h + 2, p.frame ?? 'wood', 3.4, 1.8);
          box(x0, y0, w, h, p.mat ?? 'plank', 3, 2.6);
          for (let x = x0 + 3; x < x0 + w - 1; x += 4) for (let y = y0 + 1; y < yb; y++) put(x, y, p.mat ?? 'plank', 1.6);
          put(x0 + w - 3, y0 + Math.floor(h / 2), 'brass', 4);
          if (p.arch) for (let i = 0; i < w + 4; i++) { const hh = Math.round((w / 2 + 2) - Math.sqrt(Math.max(0, (w / 2 + 2) ** 2 - (i - w / 2 - 1.5) ** 2))); for (let j = 0; j < hh; j++) put(x0 - 2 + i, y0 - 2 + j, p.wall ?? 'stone', 2.6); }
          break;
        }
        case 'board': {
          box(x0, y0, w, h, 'wood', 3.4, 1.6);
          box(x0 + 1, y0 + 1, w - 2, h - 2, 'plank', 2.2, 2);
          for (let k = 0; k < (p.notes ?? 7); k++) {
            const nx = x0 + 2 + Math.floor(r() * (w - 8)), ny = y0 + 2 + Math.floor(r() * (h - 9)), nw = 4 + Math.floor(r() * 3), nh = 5 + Math.floor(r() * 2);
            box(nx, ny, nw, nh, 'plaster', 4, 3.4);
            for (let j = 2; j < nh - 1; j += 2) span(ny + j, nx + 1, nx + nw - 2, 'stone', 1.6);
            put(nx + Math.floor(nw / 2), ny, 'red_cloth', 3);
          }
          break;
        }
        case 'stall': {
          const aw = p.mat ?? 'red_cloth';
          for (const px of [x0, x0 + w - 2]) box(px, y0, 2, h, 'wood', 3, 2);
          for (let j = 0; j < 6; j++) for (let i = -1 - (j >> 1); i < w + 1 + (j >> 1); i++) put(x0 + i, y0 + j, Math.floor((i + 40) / 4) % 2 ? aw : 'plaster', j === 0 ? 3.8 : j === 5 ? 2 : 3);
          for (let i = -3; i < w + 3; i += 2) put(x0 + i, y0 + 6, aw, 1.8);
          box(x0 + 1, yb - 9, w - 2, 10, 'wood', 3.8, 2.4);
          items(x0 + 3, yb - 10, w - 6, 'pot');
          break;
        }
        case 'still': {
          // a refinery still: a round brass belly, a domed head, a pipe off to the side, star dew glowing in a glass
          const cx = x0 + w / 2, rad = w / 2;
          for (let j = 0; j < h - 6; j++) {
            const t = j / (h - 7), half = rad * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2 * 0.6));
            for (let i = -half; i <= half; i++) put(cx + i, yb - 3 - j, 'brass', i < -half + 2 ? 3.8 : i > half - 2 ? 1.4 : 2.6 + (i < 0 ? 0.6 : 0));
          }
          box(Math.round(cx - 1), y0 - 4, 3, 6, 'brass', 3.6, 2.6);
          for (let i = 0; i < (p.pipe ?? 10); i++) { put(cx + 1 + i, y0 - 4, 'metal', 3.4); put(cx + 1 + i, y0 - 3, 'metal', 2); }
          box(Math.round(cx + (p.pipe ?? 10)), y0 - 4, 2, Math.floor(h / 2), 'metal', 3.4, 2);
          box(Math.round(cx + (p.pipe ?? 10)) - 1, y0 - 4 + Math.floor(h / 2), 4, 5, 'star_dew', 4, 3);
          box(x0 - 1, yb - 2, w + 2, 3, 'dark_stone', 3, 2);
          break;
        }
        case 'altar': {
          box(x0, y0 + 4, w, h - 4, 'stone', 3.8, 2.6);
          box(x0 - 1, y0 + 3, w + 2, 2, p.mat ?? 'cloth', 3.8, 2.8);
          for (let j = 0; j < 7; j++) put(x0 + 2, y0 + 4 + j, p.mat ?? 'cloth', 2.8);
          for (let j = 0; j < 7; j++) put(x0 + w - 3, y0 + 4 + j, p.mat ?? 'cloth', 2.8);
          break;
        }
        case 'column': {
          box(x0 - 1, y0, w + 2, 3, p.mat ?? 'stone', 3.8, 2.6);
          for (let y = y0 + 3; y < yb - 2; y++) for (let i = 0; i < w; i++) put(x0 + i, y, p.mat ?? 'stone', i === 0 ? 3.6 : i === w - 1 ? 1.4 : i % 3 === 1 ? 2.2 : 3);
          box(x0 - 1, yb - 2, w + 2, 3, p.mat ?? 'stone', 3.8, 2.4);
          break;
        }
        case 'banner': {
          for (let i = -1; i <= w; i++) put(x0 + i, y0, 'wood', 3);
          for (let j = 1; j < h; j++) {
            const cut = j > h - Math.ceil(w / 2) ? j - (h - Math.ceil(w / 2)) : 0;
            for (let i = 0; i < w; i++) if (Math.abs(i - (w - 1) / 2) >= cut - 0.5 || cut === 0) { if (cut && Math.abs(i - (w - 1) / 2) < cut - 0.5) continue; put(x0 + i, y0 + j, p.mat ?? 'red_cloth', i === 0 ? 3.4 : i === w - 1 ? 1.8 : 2.8); }
          }
          if (p.sign) box(x0 + Math.floor(w / 2) - 1, y0 + Math.floor(h / 3), 3, 3, p.sign, 4, 3.6);
          break;
        }
        case 'lamp': { // hangs from the ceiling; `at` row = the top of the lamp
          for (let y = 0; y < yb; y++) put(x0 + 1, y, 'metal', 2);
          box(x0, yb, 3, 4, 'metal', 3.4, 2);
          put(x0 + 1, yb + 1, p.light ?? 'window', 4); put(x0 + 1, yb + 2, p.light ?? 'window', 4);
          break;
        }
        case 'chandelier': { // `at` row = the candle tops
          for (let y = 0; y < yb; y++) put(x0 + Math.floor(w / 2), y, 'metal', 2);
          for (let i = 0; i < w; i++) { put(x0 + i, yb + 2, 'brass', 3); put(x0 + i, yb + 3, 'brass', 1.6); }
          for (let i = 0; i < w; i += 3) { put(x0 + i, yb + 1, p.light ? 'metal' : 'plaster', 3.8); put(x0 + i, yb, p.light ?? 'window', 4); }
          for (let i = 3; i < w - 3; i++) put(x0 + i, yb + 4 + Math.round(Math.abs(i - w / 2) < 3 ? 1 : 0), 'brass', 2.4);
          break;
        }
        case 'curtain': {
          for (const cx of [x0, x0 + w - 4]) for (let y = y0; y <= yb; y++) for (let i = 0; i < 4; i++) put(cx + i, y, p.mat ?? 'red_cloth', (i + (cx === x0 ? 0 : 1)) % 2 ? 2 : 3.2);
          span(y0 - 1, x0 - 1, x0 + w, 'brass', 3.6);
          break;
        }
        case 'cart': {
          box(x0, y0, w, h - 5, 'plank', 3.6, 2.6);
          for (const wx of [x0 + 3, x0 + w - 9]) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const d = Math.hypot(i, j); if (d <= 3.4 && d >= 2.2) put(wx + 3 + i, yb - 3 + j, 'wood', 1.6); if (d < 1) put(wx + 3 + i, yb - 3 + j, 'metal', 3); }
          if (p.load) for (let i = 1; i < w - 1; i++) for (let j = 1; j <= 3 - Math.abs(i - w / 2) / (w / 4); j++) put(x0 + i, y0 - j, p.load, 1 + ((i * 7 + j) % 3) * 0.6);
          break;
        }
        case 'rail_cart': {
          box(x0, y0, w, h - 3, 'metal', 3.6, 2.2);
          for (let i = 1; i < w - 1; i++) for (let j = 1; j <= 2; j++) put(x0 + i, y0 - j, 'dark_stone', 1 + ((i + j) % 3) * 0.5);
          for (const wx of [x0 + 2, x0 + w - 5]) box(wx, yb - 2, 3, 3, 'dark_stone', 2, 1);
          break;
        }
        case 'tent': {
          for (let j = 0; j < h; j++) { const half = (j / h) * (w / 2); for (let i = -half; i <= half; i++) put(x0 + w / 2 + i, y0 + j, p.mat ?? 'cloth', i < 0 ? 3 : 2); }
          for (let j = Math.floor(h / 2); j < h; j++) { const half = ((j - h / 2) / h) * 4; for (let i = -half; i <= half; i++) put(x0 + w / 2 + i, y0 + j, 'dark_stone', 0.8); }
          break;
        }
        case 'chair': {
          box(x0, y0, 2, h, p.mat ?? 'wood', 3.4, 2.2); // back
          box(x0, yb - Math.floor(h / 2), w, 2, p.mat ?? 'wood', 3.8, 2.6); // seat
          box(x0 + w - 2, yb - Math.floor(h / 2) + 2, 2, Math.floor(h / 2) - 1, p.mat ?? 'wood', 2.4, 1.6);
          break;
        }
        case 'plant': { // a pot with a leafy top; `mat` = the pot
          const pw = Math.max(5, Math.round(w * 0.6)), px = x0 + Math.round((w - pw) / 2);
          box(px, yb - 5, pw, 6, p.mat ?? 'brick', 3.6, 2.4);
          const cx = x0 + w / 2, cy = yb - 5 - (h - 6) / 2, rx = w / 2, ry = (h - 6) / 2;
          for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            if (d <= 1 && r() < 0.92) put(x, y, p.leaf ?? 'leaf', d > 0.7 ? (x < cx ? 3.6 : 1.6) : (x + y) % 3 === 0 ? 3.4 : 2.4);
          }
          break;
        }
        case 'rug': { // a rug lying on the floor in perspective: `at` = far left corner's bottom row, h = depth
          for (let j = 0; j < h; j++) {
            const grow = (j / Math.max(1, h - 1)) * (p.spread ?? 6);
            for (let i = -grow; i < w + grow; i++) {
              const edge = j === 0 || j === h - 1 || i < -grow + 1 || i >= w + grow - 1;
              put(x0 + i, y0 + j, edge ? (p.trim ?? 'gold') : p.mat ?? 'red_cloth', edge ? 3 : (Math.floor((i + 40) / 3) + j) % 4 === 0 ? 3.4 : 2.6);
            }
          }
          break;
        }
        case 'sconce': { // a lamp on the wall
          box(x0, yb - 3, 3, 4, 'metal', 3.4, 2);
          put(x0 + 1, yb - 4, p.light ?? 'window', 4); put(x0 + 1, yb - 5, p.light ?? 'window', 4);
          break;
        }
        case 'frame': { // a picture or a map on the wall: `mat` = what is painted
          box(x0, y0, w, h, p.frame ?? 'gold', 3.6, 2.2);
          for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) put(x0 + i, y0 + j, j < h * 0.55 ? (p.sky ?? 'water') : p.mat ?? 'leaf', j < h * 0.55 ? 3.4 - j * 0.1 : 2.6 + ((i * 3 + j) % 4 === 0 ? 0.8 : 0));
          break;
        }
        case 'pipe': { // a pipe along a wall: `at` = start, `to` = [x, y] end (straight runs, one bend)
          const [tx, ty] = p.to, t = p.w ?? 3;
          for (let x = Math.min(x0, tx); x <= Math.max(x0, tx); x++) for (let k = 0; k < t; k++) put(x, yb + k, p.mat ?? 'metal', k === 0 ? 3.6 : k === t - 1 ? 1.4 : 2.6);
          for (let y = Math.min(yb, ty); y <= Math.max(yb, ty); y++) for (let k = 0; k < t; k++) put(tx + k, y, p.mat ?? 'metal', k === 0 ? 3.6 : k === t - 1 ? 1.4 : 2.6);
          for (let x = Math.min(x0, tx); x <= Math.max(x0, tx); x += p.joints ?? 14) for (let k = -1; k <= t; k++) put(x, yb + k, 'brass', 3);
          break;
        }
        case 'crates': { // a stack: a big crate, a small one on top, a sack
          box(x0, yb - 11, 14, 12, 'plank', 3.6, 2.6);
          for (let y = yb - 8; y < yb; y += 4) span(y, x0 + 1, x0 + 12, 'plank', 1.4);
          box(x0 + 3, yb - 19, 9, 8, 'plank', 3.6, 2.4);
          for (let j = 0; j < 8; j++) span(yb - j, x0 + 15 + (j > 5 ? 1 : 0), x0 + 21 - (j > 5 ? 1 : 0), 'cloth', j === 7 ? 3.8 : 2.6 + (j % 3 === 0 ? 0.5 : 0));
          break;
        }
        default: throw new Error(`${id}: unknown furniture "${p.kind}"`);
      }
    },
    bigtree(p) {
      // an old giant: a thick trunk with flared roots and a crown of overlapping leaf clumps
      const r = rng(`${id}:bigtree:${p.x}`), [x, base, top, tw] = [p.x, p.base, p.top, p.trunk ?? 8];
      for (let y = top + 10; y <= base; y++) {
        const flare = Math.max(0, (y - (base - 6)) * 1.2), w = tw + flare;
        for (let dx = -w / 2; dx <= w / 2; dx++) put(x + dx, y, 'wood', dx < -w / 2 + 2 ? 3.4 : dx > w / 2 - 2 ? 1.4 : ((y + Math.round(dx)) % 9 === 0 ? 1.8 : 2.4));
      }
      const blobs = Array.from({ length: p.clumps ?? 9 }, () => [x + (r() - 0.5) * (p.spread ?? 50), top + r() * (p.depth ?? 24), 7 + r() * 6]);
      blobs.sort((a, b) => a[1] - b[1]);
      for (const [cx, cy, rad] of blobs) for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let dx = -Math.ceil(rad); dx <= rad; dx++) {
        const d = Math.hypot(dx, (y - cy) * 1.15);
        if (d <= rad) put(cx + dx, y, p.mat ?? 'elf_leaf', d > rad - 1.2 ? (dx + (y - cy) < 0 ? 3.8 : 1.4) : dx + (y - cy) < -rad * 0.2 ? 3.2 : 2.2);
      }
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
  const layers = sc.base ? [...scenes[sc.base.scene].layers.slice(0, sc.base.layers), ...sc.layers] : sc.layers;
  for (const L of layers) {
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
  return { w: SW, h: SH, rgba: out, stand: sc.stand ?? STAND };
}

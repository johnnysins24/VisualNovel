// Things in a scene drawn from their real size in metres: furniture, fittings, animals, carts,
// houses and trees. The scene kit works out how many pixels a metre is on the row a thing stands on
// (the camera in scene.mjs), so the same table is big at the front of a room and small at the back,
// and a horse is always the right size next to the people.
//
// Each drawing gets a pen `g` that works in metres: x across from the thing's centre (positive =
// the way it faces), y up from the ground. Light comes from the upper left, as on the sprites.

/** A pen in metres for one thing: centre column `cx`, bottom row `yb`, `k` pixels per metre. */
export function metrePen(put, cx, yb, k, flip = false) {
  const sx = flip ? -1 : 1;
  const X = xm => cx + sx * xm * k, Y = ym => yb + 1 - ym * k;
  const level = (shade, u, v, i, j, w, h, x, y) => (typeof shade === 'function' ? shade(u, v, i, j, w, h, x, y) : shade);

  /** fill a polygon given in metres; `shade` is a level or (u, v, i, j, w, h) => level, where u and
   *  v run -1..1 across the shape's box on screen (v = -1 at the top) and i, j count its pixels */
  function poly(pts, mat, shade = 2.6) {
    const P = pts.map(([x, y]) => [X(x), Y(y)]);
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const bx = Math.floor(Math.min(...xs)), bw = Math.max(1, Math.ceil(Math.max(...xs)) - bx);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys)) - 1, bh = Math.max(1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, hits = [];
      for (let n = 0; n < P.length; n++) {
        const [ax, ay] = P[n], [qx, qy] = P[(n + 1) % P.length];
        if ((ay <= yc) !== (qy <= yc)) hits.push(ax + ((yc - ay) / (qy - ay)) * (qx - ax));
      }
      // a sliver thinner than a pixel still leaves one pixel, so legs and ropes never vanish
      if (!hits.length && bh === 1) hits.push(Math.min(...xs), Math.max(...xs));
      hits.sort((a, b) => a - b);
      for (let n = 0; n + 1 < hits.length; n += 2) {
        let xa = Math.round(hits[n]), xb = Math.round(hits[n + 1]);
        if (xb <= xa && hits[n + 1] - hits[n] > 0.2) xb = xa + 1;
        for (let x = xa; x < xb; x++) {
          const u = ((x + 0.5 - bx) / bw) * 2 - 1, v = ((yc - y0) / bh) * 2 - 1;
          put(x, y, mat, level(shade, u, v, x - bx, y - y0, bw, bh, x, y));
        }
      }
    }
  }
  const rect = (x0, y0, x1, y1, mat, shade) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mat, shade);
  /** an ellipse: centre and radii in metres, at least half a pixel */
  function ell(xm, ym, rxm, rym, mat, shade = 2.6) {
    const cxp = X(xm), cyp = Y(ym), rx = Math.max(0.6, rxm * k), ry = Math.max(0.6, rym * k);
    for (let y = Math.floor(cyp - ry); y <= Math.ceil(cyp + ry); y++) for (let x = Math.floor(cxp - rx); x <= Math.ceil(cxp + rx); x++) {
      const u = (x + 0.5 - cxp) / rx, v = (y + 0.5 - cyp) / ry;
      if (u * u + v * v <= 1) put(x, y, mat, level(shade, u, v, Math.floor(x - cxp + rx), Math.floor(y - cyp + ry), Math.ceil(rx * 2), Math.ceil(ry * 2), x, y));
    }
  }
  /** a straight stick from one point to another, `w` metres thick (at least a pixel) */
  function seg(x0, y0, x1, y1, w, mat, shade = 2.6) {
    const ax = X(x0), ay = Y(y0), bx = X(x1), by = Y(y1), len = Math.hypot(bx - ax, by - ay) || 1;
    const t = Math.max(0.5, (w * k) / 2), nx = (-(by - ay) / len) * t, ny = ((bx - ax) / len) * t;
    // back to metres for poly (it maps through X and Y again)
    const m = (px, py) => [((px - cx) / k) * sx, (yb + 1 - py) / k];
    if (len < 1.5 && t <= 0.5) { put(Math.floor(ax), Math.floor(ay), mat, typeof shade === 'function' ? 2.6 : shade); return; }
    poly([m(ax + nx, ay + ny), m(bx + nx, by + ny), m(bx - nx, by - ny), m(ax - nx, ay - ny)], mat, shade);
  }
  /** one pixel at a point in metres */
  const dot = (xm, ym, mat, lvl) => put(Math.floor(X(xm)), Math.floor(Y(ym)), mat, lvl);
  return { k, X, Y, poly, rect, ell, seg, dot, px: m => m * k };
}

// shading helpers --------------------------------------------------------------------------------
/** a box: a lit top row, lighter left edge, darker right and bottom edges */
export const boxed = (top = 3.4, body = 2.6) => (u, v, i, j, w, h) => (j === 0 ? top : i === 0 ? body + 0.5 : i === w - 1 || j === h - 1 ? body - 1 : body);
/** a rounded body lit from the upper left */
export const round = (base = 2.6, depth = 1.1) => (u, v) => base + depth * (-0.5 * u - 0.75 * v) * 0.8 + (u * u + v * v > 0.8 ? -0.5 : 0);
/** a cylinder standing up: light on the left, dark on the right */
export const cyl = (base = 2.6) => u => base + (u < -0.6 ? 0.9 : u < -0.2 ? 0.4 : u > 0.6 ? -1 : u > 0.25 ? -0.4 : 0);
/** lighter at the top */
export const vert = (base = 2.6, span = 1) => (u, v) => base - v * span * 0.5;

const COATS = { bay: ['bay', 'dark_stone'], chestnut: ['chestnut', 'chestnut'], black: ['dark_stone', 'dark_stone'], grey: ['grey_coat', 'stone'], white: ['plaster', 'stone'], brown: ['dirt', 'wood'] };

// the things ---------------------------------------------------------------------------------------
// Every entry: (g, p, ctx) where ctx = { r: random 0..1, lit: lamps lit now, mat(name, fallback) }.
// The sizes in a comment at the top of each are the real ones it is drawn at (s scales them).
export const THINGS = {
  table(g, p, c) { // 0.76 tall, `wm` long (1.6)
    const w = (p.wm ?? 1.6) / 2, h = p.hm ?? 0.76, mat = p.mat ?? 'wood', t = Math.max(0.05, 1.6 / g.k);
    for (const lx of [-w + 0.08, w - 0.16]) g.rect(lx, 0, lx + 0.08, h - t, mat, boxed(2.4, 2));
    g.rect(-w + 0.04, h - t - 0.08, w - 0.04, h - t, mat, 1.6); // apron
    g.rect(-w, h - t, w, h, mat, boxed(3.8, 2.6));
    if (p.items !== false) things_on(g, c, -w + 0.15, w - 0.15, h, p.items ?? 'pots');
  },
  bench(g, p) { // 0.45 tall
    const w = (p.wm ?? 1.6) / 2, h = p.hm ?? 0.45, mat = p.mat ?? 'wood', t = Math.max(0.05, 1.6 / g.k);
    for (const lx of [-w + 0.1, w - 0.18]) g.rect(lx, 0, lx + 0.08, h - t, mat, boxed(2.4, 2));
    g.rect(-w, h - t, w, h, mat, boxed(3.8, 2.6));
  },
  chair(g, p) { // seat 0.46, back 0.95, side view: the back on the left unless flipped
    const mat = p.mat ?? 'wood', seat = p.cloth;
    g.rect(-0.22, 0, -0.17, 0.95, mat, boxed(3.4, 2.2));
    g.rect(0.17, 0, 0.22, 0.42, mat, boxed(2.4, 1.6));
    g.rect(-0.22, 0.42, 0.24, 0.48, seat ?? mat, boxed(3.8, 2.6));
    g.rect(-0.22, 0.62, -0.15, 0.9, seat ?? mat, 2.8);
  },
  stool(g, p) { // 0.6
    const mat = p.mat ?? 'wood';
    g.seg(-0.14, 0, -0.08, 0.56, 0.05, mat, 2.2); g.seg(0.14, 0, 0.08, 0.56, 0.05, mat, 1.8);
    g.rect(-0.17, 0.55, 0.17, 0.6, mat, boxed(3.8, 2.6));
  },
  barrel(g, p) { // 0.9 tall, 0.6 wide
    const h = 0.9 * (p.s ?? 1), w = 0.3 * (p.s ?? 1), mat = p.mat ?? 'wood', band = p.band ?? 'metal';
    g.poly([[-w * 0.86, 0], [w * 0.86, 0], [w, h * 0.5], [w * 0.86, h], [-w * 0.86, h], [-w, h * 0.5]], mat, (u, v, i, j, W) => {
      const l = cyl(2.6)(u);
      return i % Math.max(3, Math.round(W / 5)) === 0 && i > 0 && i < W - 1 ? l - 0.7 : l;
    });
    for (const yy of [0.14, 0.78]) g.rect(-w * 0.97, h * yy, w * 0.97, h * yy + Math.max(0.05, 1 / g.k), band, cyl(2.8));
    g.rect(-w * 0.86, h - Math.max(0.04, 1 / g.k), w * 0.86, h, mat, 3.8);
    if (p.water) g.rect(-w * 0.7, h - Math.max(0.04, 1 / g.k), w * 0.7, h, 'water', 3.4); // a quench tub
  },
  crate(g, p) { // 0.6 cube
    const s = (p.wm ?? 0.6) / 2, h = p.hm ?? p.wm ?? 0.6, mat = p.mat ?? 'plank', e = Math.max(0.05, 1 / g.k);
    g.rect(-s, 0, s, h, mat, boxed(3.6, 2.6));
    g.rect(-s + e, e, s - e, h - e, mat, (u, v, i, j) => (j % Math.max(3, Math.round(0.15 * g.k)) === 0 ? 1.6 : 2.4));
    g.seg(-s + e, e, s - e, h - e, 0.05, mat, 3.2);
  },
  crates(g, p, c) { // a big crate, a small one on it and a sack beside
    sub(g, 'crate', { wm: 0.75 }, c, -0.25, 0);
    sub(g, 'crate', { wm: 0.5 }, c, -0.3, 0.75);
    sub(g, 'sack', {}, c, 0.38, 0);
  },
  sack(g, p) { // 0.6 tall, 0.45 wide
    const mat = p.mat ?? 'burlap';
    g.poly([[-0.22, 0], [0.22, 0], [0.24, 0.3], [0.16, 0.52], [0.06, 0.6], [-0.06, 0.6], [-0.18, 0.5], [-0.24, 0.28]], mat, round(2.7, 1));
    g.rect(-0.07, 0.5, 0.07, 0.54, 'thatch', 2);
  },
  sacks(g, p, c) { sub(g, 'sack', p, c, -0.22, 0); sub(g, 'sack', p, c, 0.24, 0); sub(g, 'sack', p, c, 0, 0.45); },
  bed(g, p) { // 2.0 long, mattress top 0.55, headboard 1.0 (on the left unless flipped)
    const w = (p.wm ?? 2) / 2, mat = p.mat ?? 'cloth', frame = p.frame ?? 'wood';
    g.rect(-w, 0, -w + 0.08, 1.0, frame, boxed(3.4, 2.4));
    g.rect(w - 0.08, 0, w, 0.7, frame, boxed(3, 1.8));
    g.rect(-w + 0.08, 0.12, w - 0.08, 0.38, frame, boxed(2.8, 2));
    g.rect(-w + 0.08, 0.38, w - 0.08, 0.55, 'plaster', boxed(3.8, 3));
    g.ell(-w + 0.32, 0.6, 0.2, 0.09, 'plaster', round(3.6, 0.8)); // pillow
    g.poly([[-w + 0.6, 0.57], [w - 0.06, 0.57], [w - 0.04, 0.25], [-w + 0.62, 0.25]], mat, (u, v, i, j) => (j === 0 ? 3.6 : (i + j) % 7 === 0 ? 2 : 2.7)); // blanket
  },
  cradle(g, p) { // 0.6 tall, 0.9 long, on rockers
    const mat = p.mat ?? 'wood';
    g.poly([[-0.45, 0.06], [0.45, 0.06], [0.38, 0], [-0.38, 0]], mat, 2);
    g.rect(-0.38, 0.12, 0.38, 0.45, mat, boxed(3.2, 2.4));
    g.rect(-0.45, 0.06, -0.38, 0.6, mat, boxed(3.6, 2.6)); g.rect(0.38, 0.06, 0.45, 0.52, mat, boxed(3, 2));
    g.rect(-0.36, 0.45, 0.36, 0.5, p.cloth ?? 'plaster', 3.4);
  },
  shelf(g, p, c) { // an open shelf on the wall: `wm` wide (1.0), two boards 0.3 apart
    const w = (p.wm ?? 1) / 2, rows = p.rows ?? 2, mat = p.mat ?? 'wood', t = Math.max(0.04, 1.2 / g.k);
    for (let r = 0; r < rows; r++) {
      const y = r * 0.32;
      g.rect(-w, y, w, y + t, mat, boxed(3.6, 2.2));
      g.rect(-w + 0.04, y - 0.1, -w + 0.08, y, mat, 1.8); g.rect(w - 0.08, y - 0.1, w - 0.04, y, mat, 1.6); // brackets
      if (p.items !== false) things_on(g, c, -w + 0.06, w - 0.06, y + t, p.items ?? 'mixed');
    }
  },
  cupboard(g, p, c) { // a dresser: closed cupboard below, open shelves above; 1.9 tall, `wm` wide (1.1)
    const w = (p.wm ?? 1.1) / 2, h = p.hm ?? 1.9, mat = p.mat ?? 'wood';
    g.rect(-w, 0, w, 0.9, mat, boxed(3.6, 2.4));
    for (const dx of [-w + 0.06, 0.03]) g.rect(dx, 0.08, dx + w - 0.09, 0.82, mat, boxed(2.2, 2.8));
    g.rect(-w + 0.04, 0.9, w - 0.04, h, mat, 1.2);
    g.rect(-w, 0.9, -w + 0.06, h, mat, 3); g.rect(w - 0.06, 0.9, w, h, mat, 1.8);
    g.rect(-w - 0.03, h - 0.06, w + 0.03, h, mat, 3.6);
    for (const y of [0.9, 1.25, 1.6]) { g.rect(-w + 0.06, y, w - 0.06, y + 0.04, mat, 3.4); things_on(g, c, -w + 0.1, w - 0.1, y + 0.04, 'pots'); }
  },
  bookcase(g, p, c) { // 2.1 tall, `wm` wide (1.0)
    const w = (p.wm ?? 1) / 2, h = p.hm ?? 2.1, mat = p.mat ?? 'wood';
    g.rect(-w, 0, w, h, mat, boxed(3.2, 1.4));
    g.rect(-w + 0.05, 0.05, w - 0.05, h - 0.06, mat, 0.9);
    for (let y = 0.05; y < h - 0.3; y += 0.36) { g.rect(-w + 0.05, y, w - 0.05, y + 0.04, mat, 3.4); things_on(g, c, -w + 0.07, w - 0.07, y + 0.04, 'books'); }
  },
  drawers(g, p) { // a wall of small drawers or deposit boxes: `wm` wide, `hm` tall
    const w = (p.wm ?? 2.4) / 2, h = p.hm ?? 2.6, mat = p.mat ?? 'wood', cw = p.cell ?? 0.3, ch = p.cellh ?? 0.2;
    g.rect(-w, 0, w, h, mat, boxed(3.4, 2.2));
    const nx = Math.floor((2 * w - 0.1) / (cw + 0.03)), ny = Math.floor((h - 0.25) / (ch + 0.03));
    const ox = -w + (2 * w - nx * (cw + 0.03)) / 2;
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
      const x = ox + a * (cw + 0.03), y = 0.12 + b * (ch + 0.03);
      g.rect(x, y, x + cw, y + ch, mat, boxed(3, 2.6));
      g.dot(x + cw / 2, y + ch / 2, 'brass', 4);
    }
  },
  counter(g, p, c) { // 1.05 tall, `wm` long
    const w = (p.wm ?? 2.4) / 2, h = p.hm ?? 1.05, mat = p.mat ?? 'wood', t = Math.max(0.06, 1.6 / g.k);
    g.rect(-w + 0.04, 0, w - 0.04, h - t, mat, boxed(2.4, 2.4));
    for (let x = -w + 0.12; x + 0.5 < w; x += 0.62) g.rect(x, 0.1, x + 0.5, h - t - 0.1, mat, boxed(1.6, 2.8));
    g.rect(-w, h - t, w, h, mat, boxed(3.8, 2.8));
    if (p.items !== false) things_on(g, c, -w + 0.15, w - 0.15, h, p.items ?? 'pots');
  },
  hearth(g, p, c) { // a fireplace: 1.6 wide, mantel at 1.3, chimney breast up to `to` (a row) or the top
    const w = (p.wm ?? 1.6) / 2, mat = p.mat ?? 'stone', top = c.ceiling ?? -10;
    if (p.chimney !== false) g.poly([[-w * 0.7, 1.3], [w * 0.7, 1.3], [w * 0.7, (g.Y(0) - top) / g.k], [-w * 0.7, (g.Y(0) - top) / g.k]], mat, (u, v, i, j, W) => (i === 0 ? 3.2 : i === W - 1 ? 1.6 : (j % 6 === 0 ? 2 : 2.6)));
    g.rect(-w, 0, w, 1.2, mat, (u, v, i, j, W) => (i < 2 ? 3.2 : i >= W - 2 ? 1.8 : (j % 5 === 0 || (i + (j / 5 | 0) * 3) % 9 === 0) ? 2.1 : 2.7));
    g.rect(-w - 0.08, 1.2, w + 0.08, 1.32, p.mantel ?? 'wood', boxed(3.8, 2.6));
    g.poly([[-0.45, 0], [0.45, 0], [0.45, 0.62], [0.3, 0.78], [-0.3, 0.78], [-0.45, 0.62]], 'dark_stone', 0.6);
    if (p.fire !== false) {
      g.rect(-0.32, 0, 0.32, 0.06, 'wood', 2);
      g.poly([[-0.28, 0.05], [0.28, 0.05], [0.16, 0.3], [0.04, 0.46], [-0.08, 0.32], [-0.2, 0.22]], p.fire ?? 'fire', (u, v) => 4 - (v + 1) * 0.9);
    }
  },
  stove(g, p, c) { // a pot-bellied iron stove, 0.9 tall, its pipe up to the ceiling
    const mat = p.mat ?? 'dark_stone', top = c.ceiling ?? -10;
    g.rect(-0.06, 0.8, 0.06, (g.Y(0) - top) / g.k, mat, cyl(2.4));
    for (const lx of [-0.2, 0.15]) g.rect(lx, 0, lx + 0.05, 0.14, mat, 1.6);
    g.ell(0, 0.42, 0.26, 0.3, mat, round(2.4, 1));
    g.rect(-0.22, 0.12, 0.22, 0.2, mat, 2);
    g.rect(-0.25, 0.72, 0.25, 0.8, mat, boxed(3.4, 2.4));
    g.rect(-0.1, 0.32, 0.1, 0.5, 'fire', (u, v, i, j) => (i % 2 ? 2.4 : 3.6 - j * 0.2));
  },
  door(g, p) { // 2.05 x 0.95 with a frame; `arch` rounds the top
    const w = (p.wm ?? 0.95) / 2, h = p.hm ?? 2.05, fr = Math.max(0.06, 1.2 / g.k), mat = p.mat ?? 'plank', frame = p.frame ?? 'wood';
    const top = p.arch ? h + w : h;
    const shape = d => (p.arch ? [[-w - d, 0], [w + d, 0], [w + d, h], ...Array.from({ length: 9 }, (_, n) => { const a = (n / 8) * Math.PI; return [(w + d) * Math.cos(a), h + (w + d) * Math.sin(a) * 0.8]; }), [-w - d, h]] : [[-w - d, 0], [w + d, 0], [w + d, h + d], [-w - d, h + d]]);
    g.poly(shape(fr), frame, boxed(3.4, 1.8));
    g.poly(shape(0), mat, (u, v, i, j, W) => (i % Math.max(3, Math.round(0.2 * g.k)) === 0 ? 1.6 : (i === 1 ? 3 : 2.6)));
    for (const y of [0.35, h - 0.45]) g.rect(-w, y, w, y + Math.max(0.05, 1 / g.k), mat, 1.8);
    g.dot(w * 0.6, h * 0.48, 'brass', 4);
    void top;
  },
  window(g, p, c) { // a window seen from inside: the sky of this time of day through it; sill at the bottom
    const w = (p.wm ?? 1) / 2, h = p.hm ?? 1.2, fr = Math.max(0.05, 1 / g.k), mat = p.frame ?? 'wood';
    const sky = c.sky;
    g.rect(-w - fr, -fr, w + fr, h + fr, mat, boxed(3.4, 1.8));
    g.poly([[-w, 0], [w, 0], [w, p.arch ? h - w * 0.8 : h], ...(p.arch ? Array.from({ length: 9 }, (_, n) => { const a = (n / 8) * Math.PI; return [w * Math.cos(a), h - w * 0.8 + w * Math.sin(a) * 0.8]; }) : []), [-w, p.arch ? h - w * 0.8 : h]], 'sky', (u, v, i, j, W, H, x, y) => sky(v, x, y));
    if (p.cross !== false) { g.rect(-fr / 2, 0, fr / 2, h, mat, 2.4); if (!p.arch) g.rect(-w, h / 2 - fr / 2, w, h / 2 + fr / 2, mat, 2.4); }
    g.rect(-w - fr * 2, -fr * 2, w + fr * 2, -fr, mat, boxed(3.8, 2.6)); // sill
  },
  board(g, p, c) { // a notice board 1.2 x 0.9 with pinned notes
    const w = (p.wm ?? 1.2) / 2, h = p.hm ?? 0.9;
    g.rect(-w, 0, w, h, 'wood', boxed(3.4, 1.6));
    g.rect(-w + 0.05, 0.05, w - 0.05, h - 0.05, 'plank', 2.2);
    for (let n = 0; n < (p.notes ?? 7); n++) {
      const nx = -w + 0.08 + c.r() * (2 * w - 0.3), ny = 0.08 + c.r() * (h - 0.35), nw = 0.14 + c.r() * 0.06, nh = 0.18 + c.r() * 0.05;
      g.rect(nx, ny, nx + nw, ny + nh, 'plaster', (u, v, i, j) => (j === 0 ? 4 : j % 2 === 0 && i > 0 ? 2.4 : 3.4));
      g.dot(nx + nw / 2, ny + nh - 0.01, 'red_cloth', 3);
    }
  },
  frame(g, p) { // a picture or map on the wall
    const w = (p.wm ?? 0.7) / 2, h = p.hm ?? 0.5, f = Math.max(0.05, 1.5 / g.k);
    g.rect(-w, 0, w, h, p.frame ?? 'gold', boxed(3.6, 2.2));
    g.rect(-w + f, f, w - f, h - f, p.sky ?? 'water', (u, v) => (v < 0.1 ? 3.4 - (v + 1) : 2.6));
    g.poly([[-w + f, f], [w - f, f], [w - f, h * 0.45], [w * 0.2, h * 0.6], [-w * 0.3, h * 0.4], [-w + f, h * 0.5]], p.mat ?? 'leaf', (u, v, i, j) => ((i * 3 + j) % 5 === 0 ? 3.4 : 2.6));
  },
  column(g, p, c) { // from the floor to the ceiling (or the top of the picture): 0.6 wide
    const w = (p.wm ?? 0.6) / 2, mat = p.mat ?? 'stone', top = (g.Y(0) - (c.ceiling ?? -10)) / g.k;
    g.rect(-w - 0.08, 0, w + 0.08, 0.3, mat, boxed(3.8, 2.4));
    g.rect(-w, 0.3, w, top, mat, (u, v, i, j, W) => (i === 0 ? 3.6 : i === W - 1 ? 1.4 : i % 3 === 1 ? 2.2 : 3));
    g.rect(-w - 0.08, top - 0.3, w + 0.08, top - 0.05, mat, boxed(3.8, 2.6));
  },
  banner(g, p) { // hangs from its top: 0.7 x 2.4, swallowtail end
    const w = (p.wm ?? 0.7) / 2, h = p.hm ?? 2.4, mat = p.mat ?? 'red_cloth';
    g.rect(-w - 0.1, -0.05, w + 0.1, 0.03, 'wood', 3);
    g.poly([[-w, 0], [w, 0], [w, -h], [0, -h + w], [-w, -h]], mat, (u, v, i, j, W) => (i === 0 ? 3.4 : i === W - 1 ? 1.8 : 2.8));
    if (p.sign) g.ell(0, -h * 0.35, w * 0.45, w * 0.45, p.sign, 3.8);
  },
  lamp(g, p, c) { // a hanging lantern 0.3 tall (`s` times bigger); its cord goes up to the ceiling
    const top = (g.Y(0) - (c.ceiling ?? -10)) / g.k, light = p.light ?? 'window', s = p.s ?? 1, mat = p.mat ?? 'metal';
    g.seg(0, 0.3 * s, 0, top, 0.02 * s, mat, 2);
    g.rect(-0.1 * s, 0.04 * s, 0.1 * s, 0.26 * s, mat, boxed(3.4, 2));
    g.rect(-0.06 * s, 0.07 * s, 0.06 * s, 0.22 * s, light, 4);
    g.poly([[-0.14 * s, 0.26 * s], [0.14 * s, 0.26 * s], [0, 0.34 * s]], mat, 3);
    if (s > 1.5) { g.poly([[-0.1 * s, 0.04 * s], [0.1 * s, 0.04 * s], [0, -0.08 * s]], mat, 2.4); g.rect(-0.12 * s, 0.14 * s, 0.12 * s, 0.16 * s, mat, 3.4); }
  },
  chandelier(g, p, c) { // 1.0 wide ring of candles
    const w = (p.wm ?? 1) / 2, top = (g.Y(0) - (c.ceiling ?? -10)) / g.k;
    g.seg(0, 0.2, 0, top, 0.03, 'metal', 2);
    g.rect(-w, 0, w, 0.06, 'brass', boxed(3.4, 1.8));
    g.poly([[-w * 0.6, 0], [w * 0.6, 0], [0, -0.18]], 'brass', 2.4);
    for (let x = -w; x <= w + 0.01; x += w / 3) { g.rect(x - 0.02, 0.06, x + 0.02, 0.14, p.light ? 'metal' : 'plaster', 3.8); g.dot(x, 0.17, p.light ?? 'window', 4); }
  },
  sconce(g, p) { // a lamp on the wall
    g.rect(-0.06, 0, 0.06, 0.06, 'metal', 2.4);
    g.rect(-0.08, 0.06, 0.08, 0.24, 'metal', boxed(3.4, 2));
    g.rect(-0.04, 0.09, 0.04, 0.2, p.light ?? 'window', 4);
  },
  curtain(g, p) { // two drapes either side of a window: `wm` wide, `hm` tall, hung from the top
    const w = (p.wm ?? 1.4) / 2, h = p.hm ?? 1.5, mat = p.mat ?? 'red_cloth', d = 0.28;
    g.rect(-w - 0.05, -0.05, w + 0.05, 0, 'brass', 3.6);
    for (const [a, b] of [[-w, -w + d], [w - d, w]]) g.poly([[a, 0], [b, 0], [b + (a < 0 ? 0.04 : -0.04), -h], [a, -h]], mat, (u, v, i) => (i % 3 === 0 ? 2 : 3.1));
  },
  rug(g, p, c) { // a rug on the floor in perspective: `wm` wide, `dm` deep, `at` = its front edge
    const near = c.Z(g.Y(0) - 1), far = near + (p.dm ?? 1.5), w = (p.wm ?? 2.4) / 2;
    const y1 = Math.round(c.rowAt(near)), y0 = Math.round(c.rowAt(far));
    for (let y = y0; y <= y1; y++) {
      const kk = c.ppm(y), hw = w * kk, cx = g.X(0), edge = y === y0 || y === y1;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const side = x <= Math.round(cx - hw) || x >= Math.round(cx + hw);
        c.put(x, y, edge || side ? (p.trim ?? 'gold') : p.mat ?? 'red_cloth', edge || side ? 3 : (Math.floor((x - cx) / Math.max(2, kk * 0.25) + 50) + y) % 4 === 0 ? 3.4 : 2.6);
      }
    }
  },
  altar(g, p) { // 1.0 tall, 1.8 wide, a cloth over the top
    const w = (p.wm ?? 1.8) / 2, mat = p.mat ?? 'cloth';
    g.rect(-w, 0, w, 0.92, p.stone ?? 'stone', boxed(3.4, 2.6));
    g.rect(-w - 0.06, 0.92, w + 0.06, 1.0, p.stone ?? 'stone', boxed(3.8, 3));
    g.poly([[-w * 0.5, 1.0], [w * 0.5, 1.0], [w * 0.5, 0.35], [w * 0.38, 0.28], [w * 0.26, 0.35], [-w * 0.5, 0.35]], mat, (u, v, i, W) => (i === 0 ? 3.4 : 2.8));
    g.rect(-w * 0.5, 0.97, w * 0.5, 1.0, 'gold', 3.6);
  },
  still(g, p) { // a refinery still 2.4 tall: a riveted brass boiler with a domed head, a sight glass
    // of star dew and a gauge, the swan neck over to a pipe dripping into a glass jar
    const w = (p.wm ?? 0.8) / 2, pipe = p.pipe ?? 0.45, band = Math.max(3, Math.round(0.35 * g.k));
    g.rect(-w - 0.08, 0, w + 0.08, 0.15, 'dark_stone', boxed(3, 2));
    g.rect(-w, 0.15, w, 1.55, 'brass', (u, v, i, j) => cyl(2.7)(u) + (j % band === 0 ? -0.8 : 0));
    g.ell(0, 1.55, w, 0.3, 'brass', round(2.9, 1));
    g.rect(-0.05, 1.8, 0.05, 2.32, 'brass', cyl(2.8));
    g.seg(0, 2.3, w + pipe, 2.16, 0.07, 'metal', 3);
    g.seg(w + pipe, 2.18, w + pipe, 0.75, 0.07, 'metal', cyl(2.6));
    g.rect(w + pipe - 0.12, 0.45, w + pipe + 0.12, 0.75, 'star_dew', (u, v) => (v < -0.4 ? 4 : 3));
    g.rect(w + pipe - 0.14, 0.4, w + pipe + 0.14, 0.45, 'metal', 2.4);
    g.rect(-w * 0.45, 0.4, -w * 0.15, 1.25, 'star_dew', (u, v) => (v < -0.2 ? 2.6 : 3.8));
    g.ell(w * 0.45, 1.15, 0.1, 0.1, 'plaster', (u, v) => (Math.hypot(u, v) > 0.7 ? 1.8 : 3.8));
  },
  stall(g, p, c) { // a market stall: 2.6 wide, counter 0.9, striped awning at 2.1 to 2.4
    const w = (p.wm ?? 2.6) / 2, aw = p.mat ?? 'red_cloth', stripe = Math.max(0.2, 3 / g.k);
    g.rect(-w + 0.1, 0.9, w - 0.1, 2.1, p.back ?? 'cloth', (u, v, i, j) => 1.2 + (j % 4 === 0 ? 0.3 : 0));
    for (const px of [-w, w - 0.1]) g.rect(px, 0, px + 0.1, 2.4, 'wood', boxed(3, 2));
    g.rect(-w + 0.05, 0, w - 0.05, 0.9, 'plank', (u, v, i, j, W) => (j === 0 ? 3.8 : i % Math.max(3, Math.round(0.3 * g.k)) === 0 ? 1.8 : 2.6));
    g.rect(-w - 0.05, 0.86, w + 0.05, 0.92, 'wood', 3.6);
    things_on(g, c, -w + 0.15, w - 0.15, 0.92, p.goods ?? 'produce');
    g.poly([[-w - 0.25, 2.1], [w + 0.25, 2.1], [w + 0.05, 2.45], [-w - 0.05, 2.45]], 'plaster', (u, v, i, j, W, H, x) => (Math.floor((x - g.X(-w)) / (stripe * g.k)) % 2 ? 3.2 : -9));
    g.poly([[-w - 0.25, 2.1], [w + 0.25, 2.1], [w + 0.05, 2.45], [-w - 0.05, 2.45]], aw, (u, v, i, j, W, H, x) => (Math.floor((x - g.X(-w)) / (stripe * g.k)) % 2 ? -9 : j === 0 ? 3.8 : 2.8));
    for (let x = -w - 0.25; x < w + 0.25; x += stripe) g.ell(x + stripe / 2, 2.08, stripe / 2, 0.08, Math.round((x + w + 0.25) / stripe) % 2 ? aw : 'plaster', 2.2); // scallops
  },
  tent(g, p) { // a canvas ridge tent seen end on: 3.0 wide, 2.2 tall
    const w = (p.wm ?? 3) / 2, h = p.hm ?? 2.2, mat = p.mat ?? 'canvas';
    g.seg(-w - 0.5, 0, 0, h + 0.15, 0.02, 'thatch', 2); g.seg(w + 0.5, 0, 0, h + 0.15, 0.02, 'thatch', 2);
    g.poly([[-w, 0], [w, 0], [0, h]], mat, (u, v) => (u < 0 ? 3.1 : 2.3) - (v > 0.7 ? 0.3 : 0));
    g.poly([[-w * 0.36, 0], [w * 0.36, 0], [0, h * 0.62]], 'dark_stone', 0.6);
    g.poly([[w * 0.1, 0], [w * 0.4, 0], [0.02, h * 0.62]], mat, 1.8); // the flap tied back
    g.rect(-0.04, h - 0.05, 0.04, h + 0.2, 'wood', 2.6);
  },
  cart(g, p, c) { // a farm cart in profile: bed 2.4 long at 0.8, wheels 1.0, shafts forward; `load`
    const mat = p.mat ?? 'plank', hx = 1.25;
    if (p.horse) sub(g, 'horse', { coat: p.horse }, c, 2.75, 0);
    // shafts forward to the horse, or with no horse resting on the ground in front
    if (p.horse) g.seg(1.0, 0.95, 3.4, 1.05, 0.07, 'wood', 2.6);
    else g.seg(1.0, 0.9, 2.3, 0.06, 0.07, 'wood', 2.6);
    if (p.load) g.poly([[-1.15, 1.2], [1.15, 1.2], [0.9, 1.55], [0.3, 1.7], [-0.4, 1.66], [-1.0, 1.5]], p.load, (u, v, i, j, W, H, x, y) => 2.2 + ((x * 7 + y * 13) % 5) * 0.35 - (v > 0.3 ? 0.4 : 0));
    g.rect(-hx, 0.72, hx, 1.25, mat, (u, v, i, j, W, H) => (j === 0 ? 3.8 : j === H - 1 ? 1.4 : (i % Math.max(4, Math.round(0.45 * g.k)) === 0 ? 1.8 : 2.7)));
    wheel(g, -0.55, 0.5, 0.5, 'wood');
    wheel(g, 0.75, 0.5, 0.5, 'wood');
  },
  carriage(g, p, c) { // a closed carriage in profile facing right: 3 long, 2.4 tall, wheels 1.2 and 0.9
    const mat = p.mat ?? 'carriage', trim = p.trim ?? 'gold';
    if (p.horse) sub(g, 'horse', { coat: p.horse }, c, 2.9, 0);
    g.seg(1.3, 1.0, 3.4, 1.12, 0.07, 'wood', 2.4); // shaft
    g.seg(-0.8, 0.62, 1.0, 0.5, 0.12, 'dark_stone', 2); // perch
    wheel(g, -0.8, 0.6, 0.6, 'wood');
    g.poly([[-1.25, 0.95], [0.55, 0.95], [0.62, 1.35], [0.55, 2.1], [-1.25, 2.1], [-1.32, 1.35]], mat, (u, v, i, j, W, H) => (j === 0 ? 3.6 : i === 0 ? 3.2 : i === W - 1 || j === H - 1 ? 1.6 : 2.5));
    g.rect(-1.36, 2.1, 0.66, 2.22, mat, boxed(3.8, 2.8)); // roof
    g.rect(-1.2, 2.22, 0.5, 2.32, 'dark_stone', 2.4); // luggage
    g.rect(-0.65, 1.0, -0.05, 2.0, mat, boxed(2, 2.8)); // door
    g.rect(-0.58, 1.48, -0.12, 1.92, 'window', (u, v) => (u + v < -0.6 ? 4 : 2.6));
    g.rect(-1.25, 1.36, 0.55, 1.42, trim, 3.4);
    g.dot(-0.12, 1.3, trim, 4);
    g.rect(0.6, 1.5, 1.25, 1.6, mat, boxed(3.6, 2.4)); // driver's seat
    g.seg(1.2, 1.5, 1.35, 1.05, 0.06, mat, 2);
    g.rect(0.6, 1.6, 0.66, 1.9, mat, 2.8);
    g.rect(0.56, 1.8, 0.68, 1.98, 'metal', 3); g.dot(0.62, 1.88, 'window', 4); // lamp
    wheel(g, 0.95, 0.45, 0.45, 'wood');
  },
  rail_cart(g, p) { // a mine cart 1.5 long, 1.0 tall, heaped with coal
    const mat = p.mat ?? 'metal';
    g.poly([[-0.72, 1.0], [0.72, 1.0], [0.6, 0.25], [-0.6, 0.25]], mat, (u, v, i, j, W, H) => (j === 0 ? 3.6 : i === 0 ? 3 : i === W - 1 ? 1.6 : (i % Math.max(3, Math.round(0.35 * g.k)) === 0 ? 1.9 : 2.5)));
    if (p.load !== false) g.poly([[-0.68, 1.0], [0.68, 1.0], [0.4, 1.18], [-0.1, 1.24], [-0.5, 1.14]], p.load ?? 'dark_stone', (u, v, i, j, W, H, x, y) => 1 + ((x * 5 + y * 3) % 4) * 0.5);
    for (const wx of [-0.38, 0.38]) g.ell(wx, 0.15, 0.15, 0.15, 'dark_stone', round(2, 1));
  },
  horse(g, p) { // withers 1.6, poll 2.2, 2.5 long nose to tail; faces right unless flipped
    const [coat, mane] = COATS[p.coat ?? 'bay'] ?? COATS.bay;
    const far = (u, v) => 1.4 - v * 0.3;
    // far legs (darker), then the near ones
    leg(g, 0.6, coat, far, -0.04, true); leg(g, -0.52, coat, far, 0.05, false);
    g.poly([[-0.92, 1.42], [-1.04, 1.3], [-1.1, 0.9], [-1.05, 0.55], [-0.96, 0.6], [-0.95, 1.0], [-0.86, 1.3]], mane, (u, v) => 2 - v * 0.4); // tail
    g.ell(-0.48, 1.24, 0.42, 0.38, coat, round(2.6, 1));
    g.ell(0.05, 1.2, 0.72, 0.36, coat, round(2.6, 1));
    g.ell(0.55, 1.18, 0.32, 0.34, coat, round(2.7, 1));
    g.poly([[0.22, 1.55], [0.84, 2.04], [1.06, 1.8], [0.84, 1.2], [0.5, 1.12]], coat, (u, v) => 2.9 - u * 0.4 - v * 0.3);
    g.poly([[0.84, 2.1], [0.98, 2.18], [1.5, 1.82], [1.54, 1.7], [1.46, 1.6], [1.12, 1.68], [0.98, 1.84]], coat, (u, v) => 3 - v * 0.6 - u * 0.2);
    g.poly([[0.86, 2.13], [0.9, 2.32], [0.97, 2.15]], coat, 2.6);
    g.seg(0.24, 1.6, 0.86, 2.1, 0.08, mane, 1.8); // mane
    leg(g, 0.46, coat, round(2.7, 0.6), 0, true); leg(g, -0.64, coat, round(2.6, 0.6), 0, false);
    g.dot(1.1, 1.96, 'ink', 0); g.dot(1.47, 1.7, coat, 0.6);
    if (p.harness !== false) { g.seg(0.62, 1.3, 0.92, 1.9, 0.06, 'leather', 1.8); g.seg(1.05, 1.92, 1.42, 1.72, 0.04, 'leather', 1.8); }
  },
  dog(g, p) { // 0.6 at the shoulder, 0.95 long; faces right unless flipped
    const coat = p.coat ?? 'dirt', dark = p.dark ?? coat;
    for (const x of [0.28, -0.26]) g.rect(x, 0, x + 0.06, 0.4, coat, 1.5); // far legs
    g.poly([[-0.3, 0.5], [-0.36, 0.6], [-0.44, 0.7], [-0.42, 0.74], [-0.32, 0.64], [-0.26, 0.54]], dark, 2.4); // tail
    g.ell(-0.03, 0.46, 0.34, 0.14, coat, round(2.6, 1));
    g.ell(0.25, 0.47, 0.13, 0.15, coat, round(2.8, 1));
    g.poly([[0.26, 0.54], [0.35, 0.66], [0.46, 0.62], [0.38, 0.44]], coat, 2.8);
    g.ell(0.42, 0.65, 0.09, 0.08, coat, round(3, 0.8));
    g.poly([[0.47, 0.68], [0.62, 0.63], [0.62, 0.57], [0.47, 0.58]], coat, (u, v) => 2.8 - v * 0.6);
    g.dot(0.61, 0.62, 'ink', 0);
    g.poly([[0.37, 0.71], [0.39, 0.81], [0.44, 0.72]], dark, 2.2);
    for (const x of [0.34, -0.2]) g.rect(x, 0, x + 0.06, 0.42, coat, 2.6); // near legs
    g.dot(0.45, 0.67, 'ink', 0);
  },
  chicken(g, p) { // 0.4 tall
    const mat = p.coat ?? 'plaster';
    g.seg(0.0, 0, 0.0, 0.12, 0.02, 'brass', 3);
    g.poly([[-0.12, 0.22], [-0.22, 0.36], [-0.17, 0.2]], mat, 2.4); // tail
    g.ell(0, 0.2, 0.14, 0.1, mat, round(3, 0.8));
    g.ell(0.11, 0.33, 0.05, 0.06, mat, 3.2);
    g.dot(0.12, 0.4, 'red_cloth', 3.6); g.dot(0.17, 0.33, 'brass', 4); g.dot(0.12, 0.34, 'ink', 0);
  },
  cat(g, p) { // sitting, 0.32 tall
    const mat = p.coat ?? 'dark_stone';
    g.seg(-0.08, 0.02, -0.2, 0.06, 0.03, mat, 2);
    g.ell(0, 0.12, 0.09, 0.12, mat, round(2.4, 0.8));
    g.ell(0.03, 0.26, 0.06, 0.055, mat, round(2.6, 0.8));
    g.poly([[-0.01, 0.29], [0.0, 0.34], [0.03, 0.3]], mat, 2.4); g.poly([[0.05, 0.3], [0.07, 0.34], [0.09, 0.29]], mat, 2.4);
    g.dot(0.05, 0.27, 'field', 4);
  },
  golem(g, p, c) { // a guard golem 2.1 tall, seen from the front: brass plates, a glowing eye slit
    const mat = p.mat ?? 'metal', plate = p.plate ?? 'brass';
    for (const sx of [-1, 1]) {
      g.rect(sx * 0.32 - 0.13, 0, sx * 0.32 + 0.13, 0.12, 'dark_stone', boxed(2.4, 1.6));
      g.rect(sx * 0.32 - 0.11, 0.12, sx * 0.32 + 0.11, 0.78, mat, cyl(2.6));
      g.ell(sx * 0.32, 0.46, 0.12, 0.08, 'dark_stone', 2);
    }
    g.rect(-0.42, 0.78, 0.42, 0.95, 'dark_stone', boxed(2.6, 2));
    g.poly([[-0.4, 0.92], [0.4, 0.92], [0.5, 1.7], [-0.5, 1.7]], mat, (u, v) => cyl(2.7)(u) + (v < -0.6 ? 0.4 : 0));
    g.poly([[-0.26, 1.08], [0.26, 1.08], [0.32, 1.6], [-0.32, 1.6]], plate, (u, v) => cyl(2.8)(u));
    for (const [x, y] of [[-0.2, 1.15], [0.2, 1.15], [-0.25, 1.52], [0.25, 1.52]]) g.dot(x, y, 'dark_stone', 1);
    g.ell(0, 1.34, 0.06, 0.06, 'dark_stone', 1); // the key slot
    for (const sx of [-1, 1]) {
      g.ell(sx * 0.56, 1.6, 0.16, 0.15, plate, round(2.8, 1));
      g.rect(sx * 0.6 - 0.09, 0.9, sx * 0.6 + 0.09, 1.52, mat, cyl(2.5));
      g.rect(sx * 0.6 - 0.12, 0.72, sx * 0.6 + 0.12, 0.92, 'dark_stone', boxed(2.6, 2));
    }
    g.rect(-0.08, 1.7, 0.08, 1.76, 'dark_stone', 2);
    g.poly([[-0.17, 1.76], [0.17, 1.76], [0.15, 2.08], [-0.15, 2.08]], mat, (u, v) => cyl(2.9)(u) + (v < -0.5 ? 0.5 : 0));
    g.rect(-0.12, 1.88, 0.12, 1.93, p.eye ?? 'star_dew', p.dead ? 0.5 : 4);
  },
  anvil(g, p) { // a horn anvil on a wooden stump, 0.8 tall
    const mat = p.mat ?? 'dark_stone';
    g.rect(-0.22, 0, 0.22, 0.5, 'wood', (u, v, i, j, W) => (j === 0 ? 3.6 : i === 0 ? 3 : i === W - 1 ? 1.6 : (i % 3 === 0 ? 1.9 : 2.5)));
    g.poly([[-0.24, 0.5], [0.24, 0.5], [0.18, 0.56], [-0.18, 0.56]], mat, 2.2);
    g.rect(-0.09, 0.56, 0.09, 0.68, mat, 2);
    g.poly([[-0.3, 0.68], [0.3, 0.68], [0.32, 0.8], [-0.3, 0.8], [-0.3, 0.74]], mat, (u, v, i, j) => (j === 0 ? 3.8 : 2.6));
    g.poly([[0.3, 0.8], [0.32, 0.68], [0.56, 0.77]], mat, 2.4); // horn
    if (p.hammer !== false) { g.seg(-0.2, 0.81, 0.05, 0.86, 0.035, 'wood', 3); g.rect(-0.26, 0.8, -0.16, 0.88, 'metal', 3); }
  },
  fire_bowl(g, p) { // a brazier on a tripod, 1.0 to the rim, flames above
    const mat = p.mat ?? 'brass';
    g.seg(-0.3, 0, 0, 0.72, 0.04, mat, 2.6); g.seg(0.3, 0, 0, 0.72, 0.04, mat, 2); g.seg(0, 0, 0, 0.72, 0.04, mat, 1.6);
    g.poly([[-0.32, 1.0], [0.32, 1.0], [0.24, 0.84], [0.1, 0.76], [-0.1, 0.76], [-0.24, 0.84]], mat, (u, v, i, j) => (j === 0 ? 3.8 : cyl(2.8)(u)));
    if (p.fire !== false) g.poly([[-0.24, 1.0], [0.24, 1.0], [0.12, 1.2], [0.02, 1.36], [-0.06, 1.22], [-0.16, 1.14]], 'fire', (u, v) => 4 - (v + 1) * 0.9);
  },
  statue(g, p) { // a robed figure 1.9 tall holding up a lamp, on a plinth 0.6 tall and 1.0 wide
    const mat = p.mat ?? 'bone', st = p.stone ?? 'stone', P = 0.6;
    g.rect(-0.5, 0, 0.5, P - 0.08, st, boxed(3, 2.6));
    g.rect(-0.56, P - 0.1, 0.56, P, st, boxed(3.8, 3));
    g.rect(-0.56, 0, 0.56, 0.08, st, 2.2);
    // the robe: shoulders, a long skirt with folds
    g.poly([[-0.38, P], [0.38, P], [0.3, P + 0.7], [0.26, P + 1.28], [0.2, P + 1.42], [-0.2, P + 1.42], [-0.26, P + 1.28], [-0.31, P + 0.7]], mat, (u, v, i, j, W) => cyl(2.9)(u) - ((i + 2) % 4 === 0 && v > -0.4 ? 0.8 : 0));
    g.ell(0, P + 1.36, 0.25, 0.09, mat, round(3, 0.8));
    // the other arm across the chest
    g.seg(-0.2, P + 1.32, 0.08, P + 1.1, 0.1, mat, 2.4);
    // hooded head: the hood light, the face inside in shadow
    g.ell(0, P + 1.6, 0.14, 0.17, mat, round(3.2, 1));
    g.ell(0.03, P + 1.57, 0.07, 0.1, mat, 1.6);
    // the raised arm and the lamp
    g.seg(0.2, P + 1.38, 0.3, P + 1.9, 0.11, mat, (u) => 3 - u);
    g.rect(0.22, P + 1.9, 0.38, P + 2.08, p.lamp ?? 'brass', boxed(3.6, 2.6));
    g.rect(0.27, P + 1.94, 0.33, P + 2.03, 'window', 4);
  },
  bell(g, p) { // an alarm bell under a frame: posts 2.3, the bell 0.45
    const mat = p.mat ?? 'wood';
    for (const x of [-0.6, 0.6]) g.rect(x - 0.06, 0, x + 0.06, 2.3, mat, cyl(2.6));
    g.rect(-0.72, 2.18, 0.72, 2.3, mat, boxed(3.6, 2.4));
    g.rect(-0.02, 2.0, 0.02, 2.18, 'metal', 2);
    g.poly([[-0.22, 1.56], [0.22, 1.56], [0.16, 1.68], [0.12, 1.94], [0, 2.0], [-0.12, 1.94], [-0.16, 1.68]], p.metal ?? 'brass', (u, v) => cyl(2.8)(u));
    g.seg(0.02, 1.56, 0.06, 1.0, 0.02, 'thatch', 2.6);
  },
  cannon(g, p) { // a ship's gun on its wooden truck, barrel 1.8 long, muzzle to the right
    const mat = p.mat ?? 'dark_stone';
    g.poly([[-0.6, 0.18], [0.55, 0.18], [0.55, 0.52], [0.1, 0.52], [0.1, 0.62], [-0.6, 0.62]], 'wood', boxed(3.4, 2.4));
    for (const wx of [-0.4, 0.35]) wheel(g, wx, 0.2, 0.2, 'wood', 4);
    g.poly([[-0.75, 0.82], [-0.7, 0.92], [1.12, 0.84], [1.12, 0.66], [-0.7, 0.56], [-0.75, 0.66]], mat, (u, v) => 2.6 - v * 1.2);
    for (const x of [-0.5, 0.3, 1.04]) g.rect(x, 0.6, x + 0.06, 0.88, mat, 3.4);
    g.ell(-0.84, 0.74, 0.07, 0.07, mat, 2.6);
  },
  helm(g, p) { // a ship's wheel on its post: wheel 1.2 across, hub at 1.15
    const mat = p.mat ?? 'wood', R = 0.56, cy = 1.15;
    g.rect(-0.12, 0, 0.12, cy - 0.05, mat, cyl(2.6));
    g.rect(-0.18, 0, 0.18, 0.1, mat, boxed(3.4, 2.4));
    for (let n = 0; n < 8; n++) { const a = (n / 8) * Math.PI * 2; g.seg(Math.cos(a) * 0.06, cy + Math.sin(a) * 0.06, Math.cos(a) * (R + 0.14), cy + Math.sin(a) * (R + 0.14), 0.04, mat, 2.8); }
    g.ell(0, cy, R, R, mat, (u, v) => { const d = Math.hypot(u, v); return d > 0.86 ? (u + v < 0 ? 3.6 : 2.2) : -9; });
    g.ell(0, cy, 0.08, 0.08, 'brass', 3.6);
  },
  drum(g, p) { // a war drum 0.6 tall
    g.rect(-0.27, 0.04, 0.27, 0.56, p.mat ?? 'red_cloth', (u, v, i, j, W, H) => (Math.abs(((i + j) % 8) - 4) < 1 ? 3.6 : cyl(2.6)(u)));
    for (const y of [0, 0.54]) g.rect(-0.29, y, 0.29, y + 0.06, 'wood', 3);
    g.ell(0, 0.6, 0.27, 0.04, 'plaster', 3.6);
  },
  gear(g, p) { // a cog on the wall, `dm` across (0.5)
    const R = (p.dm ?? 0.5) / 2, n = Math.max(6, Math.round(R * 34)), mat = p.mat ?? 'brass';
    g.ell(0, R + 0.06, R, R, mat, (u, v, i, j, W, H, x, y) => {
      const a = Math.atan2(v, u), d = Math.hypot(u, v), tooth = Math.cos(a * n) > 0.1;
      if (d > 0.82 && !tooth) return -9; if (d < 0.3) return d < 0.16 ? 0.6 : 3.2;
      return d > 0.82 ? 2.4 : 2.8 - u * 0.5 - v * 0.5;
    });
  },
  coal(g, p) { // a heap of demon coal 0.4 high, 1.0 across, red at the cracks
    const w = (p.wm ?? 1) / 2;
    g.poly([[-w, 0], [w, 0], [w * 0.6, 0.2], [w * 0.1, 0.4], [-w * 0.4, 0.3], [-w * 0.8, 0.12]], 'dark_stone', (u, v, i, j, W, H, x, y) => { const n = (x * 7 + y * 11 + x * y) % 9; return n === 0 ? -9 : n < 3 ? 1 : n < 6 ? 2 : 3; });
    g.poly([[-w, 0], [w, 0], [w * 0.6, 0.2], [w * 0.1, 0.4], [-w * 0.4, 0.3], [-w * 0.8, 0.12]], 'fire', (u, v, i, j, W, H, x, y) => ((x * 7 + y * 11 + x * y) % 9 === 0 ? 3 : -9));
  },
  tools(g, p) { // a rack of smithing tools on the wall, 1.2 long
    const w = (p.wm ?? 1.2) / 2;
    g.rect(-w, 0.6, w, 0.68, 'wood', boxed(3.6, 2.4));
    const hang = [['tongs', -w + 0.12], ['hammer', -w + 0.36], ['tongs', -w + 0.58], ['shoe', -w + 0.82], ['hammer', -w + 1.0]];
    for (const [t, x] of hang) {
      if (x > w - 0.05) continue;
      if (t === 'tongs') { g.seg(x, 0.62, x - 0.04, 0.12, 0.025, 'metal', 2.8); g.seg(x + 0.04, 0.62, x + 0.06, 0.12, 0.025, 'metal', 2); }
      if (t === 'hammer') { g.seg(x, 0.62, x, 0.2, 0.03, 'wood', 3); g.rect(x - 0.07, 0.12, x + 0.07, 0.22, 'metal', boxed(3.6, 2.4)); }
      if (t === 'shoe') g.ell(x, 0.44, 0.07, 0.08, 'metal', (u, v) => (Math.hypot(u, v) < 0.55 && v > -0.4 ? -9 : 2.6));
    }
  },
  herbs(g, p, c) { // bunches of herbs drying from a beam: `n` bunches 0.35 long, hung from the top
    const w = (p.wm ?? 1.2) / 2, n = p.n ?? 4;
    g.rect(-w, -0.04, w, 0.0, 'wood', 3);
    for (let i = 0; i < n; i++) {
      const x = -w + ((i + 0.5) / n) * 2 * w, l = 0.28 + c.r() * 0.12, m = ['leaf', 'field', 'elf_leaf', 'thatch'][i % 4];
      g.seg(x, 0, x, -0.08, 0.02, 'thatch', 2.6);
      g.poly([[x - 0.05, -0.08], [x + 0.05, -0.08], [x + 0.09, -l], [x - 0.09, -l]], m, (u, v, a, b) => ((a + b) % 3 === 0 ? 3.4 : 2.4));
    }
  },
  basin(g, p) { // a washstand 0.85 tall with a bowl and a jug
    for (const x of [-0.2, 0.16]) g.rect(x, 0, x + 0.04, 0.72, 'wood', 2.2);
    g.rect(-0.24, 0.24, 0.24, 0.28, 'wood', 2.6);
    g.rect(-0.26, 0.72, 0.26, 0.78, 'wood', boxed(3.6, 2.6));
    g.poly([[-0.2, 0.86], [0.2, 0.86], [0.13, 0.78], [-0.13, 0.78]], 'plaster', 3.4);
    g.rect(-0.18, 0.84, 0.18, 0.86, 'water', 3.4);
    g.poly([[0.1, 0.78], [0.22, 0.78], [0.24, 0.95], [0.2, 1.02], [0.12, 1.02], [0.08, 0.95]], 'plaster', cyl(3));
  },
  plant(g, p, c) { // a pot (0.35) with a leafy plant up to `hm` (1.0)
    const h = p.hm ?? 1.0, w = (p.wm ?? 0.6) / 2;
    g.poly([[-0.16, 0], [0.16, 0], [0.19, 0.32], [-0.19, 0.32]], p.mat ?? 'brick', (u, v, i, j) => (j === 0 ? 3.6 : cyl(2.5)(u)));
    for (let n = 0; n < 7; n++) {
      const a = (n / 6) * 2 - 1, x = a * w * 0.7, y = 0.32 + (h - 0.32) * (0.45 + 0.4 * (1 - Math.abs(a)) * (0.8 + c.r() * 0.3));
      g.ell(x, y, w * 0.38, (h - 0.32) * 0.22, p.leaf ?? 'leaf', round(2.7, 1.2));
    }
  },
  well(g, p) { // a village well: stone ring 1.4 across and 0.8 tall, posts to 2.1, a little roof
    const st = p.stone ?? 'stone', w = 0.7;
    for (const x of [-w + 0.08, w - 0.08]) g.rect(x - 0.06, 0.7, x + 0.06, 2.1, 'wood', cyl(2.6));
    g.rect(-w + 0.08, 1.5, w - 0.08, 1.58, 'wood', 2.2);
    g.seg(0, 1.5, 0, 1.0, 0.02, 'thatch', 2.6);
    g.rect(-0.1, 0.86, 0.1, 1.04, 'wood', boxed(3, 2.2));
    g.rect(-w, 0, w, 0.8, st, (u, v, i, j, W) => { const row = Math.floor(j / Math.max(2, Math.round(0.2 * g.k))); return j % Math.max(2, Math.round(0.2 * g.k)) === 0 || (i + row * 3) % Math.max(3, Math.round(0.35 * g.k)) === 0 ? 1.6 : (i === 0 ? 3.2 : 2.6); });
    g.rect(-w - 0.05, 0.74, w + 0.05, 0.84, st, 3.6);
    g.poly([[-w - 0.25, 2.0], [w + 0.25, 2.0], [0, 2.55]], p.roof ?? 'thatch', (u, v, i, j) => (j % 2 ? 2.4 : 3.2) - (u > 0 ? 0.6 : 0));
  },
  lamppost(g, p) { // a street lamp 3.6 tall; `light` is the lamp's colour (sky lamps are blue)
    const mat = p.mat ?? 'dark_stone', light = p.light ?? 'lamp';
    g.rect(-0.14, 0, 0.14, 0.3, mat, boxed(3, 2));
    g.rect(-0.05, 0.3, 0.05, 3.1, mat, cyl(2.6));
    g.rect(-0.16, 3.05, 0.16, 3.12, mat, 3);
    g.poly([[-0.14, 3.12], [0.14, 3.12], [0.18, 3.5], [-0.18, 3.5]], light, (u, v) => 4 - Math.abs(u));
    for (const x of [-0.18, 0.15]) g.rect(x, 3.12, x + 0.03, 3.5, mat, 2.4);
    g.poly([[-0.24, 3.5], [0.24, 3.5], [0, 3.66]], mat, 3);
  },
  seal_stone(g, p, c) { // a Seal Warden standing stone 1.9 tall and 0.7 wide, a seal cut in its face
    const mat = p.mat ?? 'stone', w = 0.35;
    g.poly([[-w, 0], [w, 0], [w * 0.92, 1.6], [w * 0.6, 1.85], [0, 1.92], [-w * 0.6, 1.85], [-w * 0.92, 1.6]], mat, (u, v, i, j, W, H, x, y) => cyl(2.7)(u) + (((x * 13 + y * 7) % 11) === 0 ? -0.8 : 0) - (v > 0.7 ? 0.3 : 0));
    g.ell(0, 1.3, 0.16, 0.16, p.sigil ?? 'star_dew', (u, v) => (Math.hypot(u, v) > 0.62 ? (c.lit ? 3.6 : 2) : (Math.abs(u) < 0.25 || Math.abs(v) < 0.25) ? (c.lit ? 3 : 1.6) : -9));
  },
  haystack(g, p) { // 2.2 tall, 2.0 across
    const w = (p.wm ?? 2) / 2, h = p.hm ?? 2.2;
    g.poly([[-w, 0], [w, 0], [w * 0.95, h * 0.45], [w * 0.6, h * 0.85], [0, h], [-w * 0.6, h * 0.85], [-w * 0.95, h * 0.45]], p.mat ?? 'field', (u, v, i, j, W, H, x) => (round(2.6, 1.2)(u, v) + ((x * 5 + j) % 7 === 0 ? -0.8 : 0)));
    g.seg(0, h, 0, h + 0.3, 0.05, 'wood', 2.6);
  },
  forge(g, p, c) { // a smith's forge: a brick hearth 0.85 high and `wm` wide (1.8), the coal bed on
    // top, a hood from 1.55 m and its chimney up to the ceiling, bellows on a stand at the left
    const w = (p.wm ?? 1.8) / 2, mat = p.mat ?? 'brick', top = (g.Y(0) - (c.ceiling ?? -10)) / g.k;
    const bh = Math.max(2, Math.round(0.09 * g.k)), brick = (u, v, i, j, W, H, x, y) => (j % bh === 0 || (x + (Math.floor(j / bh) % 2) * 3) % 6 === 0 ? 1.7 : i === 0 ? 3.2 : i === W - 1 ? 1.8 : 2.6);
    g.rect(-0.32, 2.2, 0.32, top, mat, brick);
    g.poly([[-w - 0.05, 1.55], [w + 0.05, 1.55], [0.4, 2.25], [-0.4, 2.25]], mat, brick);
    g.rect(-w - 0.08, 1.5, w + 0.08, 1.58, 'dark_stone', boxed(3.4, 2));
    g.rect(-w, 0, w, 0.85, mat, brick);
    g.poly([[-0.3, 0], [0.3, 0], [0.3, 0.32], [0, 0.42], [-0.3, 0.32]], 'dark_stone', 0.6);
    g.rect(-w - 0.04, 0.82, w + 0.04, 0.9, 'dark_stone', boxed(3.2, 2));
    g.poly([[-w * 0.7, 0.9], [w * 0.7, 0.9], [w * 0.45, 1.04], [0, 1.1], [-w * 0.4, 1.05]], p.fire ?? 'fire', (u, v, i, j, W, H, x, y) => ((x * 5 + y * 3) % 4 === 0 ? 1.8 : 3.8 - (v + 1) * 0.6));
    g.seg(-w - 0.45, 0, -w - 0.45, 0.95, 0.06, 'wood', 2.2);
    g.poly([[-w - 0.75, 1.0], [-w - 0.1, 0.98], [-w - 0.1, 1.08], [-w - 0.75, 1.28]], 'leather', round(2.4, 1));
    g.seg(-w - 0.75, 1.14, -w - 1.0, 1.18, 0.04, 'wood', 2.8);
  },
  throne(g, p) { // a high-backed chair seen from the front: seat 0.5, back `hm` (1.7), arms
    const mat = p.mat ?? 'gold', cloth = p.cloth ?? 'red_cloth', h = p.hm ?? 1.7;
    g.rect(-0.36, 0, -0.3, 0.45, mat, 2.4); g.rect(0.3, 0, 0.36, 0.45, mat, 1.8);
    g.poly([[-0.32, 0.45], [0.32, 0.45], [0.32, h - 0.15], [0.16, h], [-0.16, h], [-0.32, h - 0.15]], mat, boxed(3.6, 2.4));
    g.rect(-0.24, 0.55, 0.24, h - 0.2, cloth, (u, v, i, j) => ((i + j) % 4 === 0 ? 3.2 : 2.6));
    g.rect(-0.38, 0.42, 0.38, 0.52, cloth, boxed(3.6, 2.6));
    for (const sx of [-1, 1]) g.rect(sx * 0.42 - 0.05, 0.42, sx * 0.42 + 0.05, 0.75, mat, boxed(3.4, 2));
    g.ell(0, h, 0.06, 0.06, mat, 3.8);
  },
  step(g, p) { // a dais: `wm` wide, `hm` high (0.3), with a second step `top` on it
    const w = (p.wm ?? 4) / 2, h = p.hm ?? 0.3, mat = p.mat ?? 'stone';
    g.rect(-w, 0, w, h, mat, boxed(3.8, 2.4));
    if (p.top) g.rect(-p.top / 2, h, p.top / 2, h * 2, mat, boxed(3.8, 2.6));
  },
  candles(g, p, c) { // a candle stand 1.2 tall with three candles (lit when the lamps are)
    const mat = p.mat ?? 'brass', h = p.hm ?? 1.2;
    g.seg(0, 0, 0, h, 0.04, mat, cyl(2.8)); g.rect(-0.12, 0, 0.12, 0.04, mat, 3);
    g.rect(-0.2, h - 0.03, 0.2, h, mat, 3.4);
    for (const x of [-0.17, 0, 0.17]) { g.rect(x - 0.02, h, x + 0.02, h + 0.12, 'plaster', 3.8); g.dot(x, h + 0.16, c.lit ? 'lamp' : 'fire', 4); }
  },
  names(g, p, c) { // a wall panel cut with names row on row: `wm` x `hm`
    const w = (p.wm ?? 4) / 2, h = p.hm ?? 2.4, mat = p.mat ?? 'stone';
    g.rect(-w - 0.08, -0.08, w + 0.08, h + 0.08, mat, boxed(3.6, 2.2));
    const rowH = Math.max(2 / g.k, 0.12);
    for (let y = 0.1; y < h - 0.08; y += rowH) for (let x = -w + 0.08; x < w - 0.12;) {
      const len = 0.12 + c.r() * 0.22;
      if (x + len > w - 0.08) break;
      g.rect(x, y, x + len, y + Math.max(0.03, 1 / g.k), mat, 1.2);
      x += len + 0.08;
    }
  },
  chart(g, p) { // a star chart in a brass ring on the wall, `dm` across (1.6)
    const R = (p.dm ?? 1.6) / 2;
    g.ell(0, R, R, R, p.ring ?? 'brass', (u, v) => (Math.hypot(u, v) > 0.88 ? (u + v < 0 ? 3.6 : 2) : -9));
    g.ell(0, R, R * 0.86, R * 0.86, p.mat ?? 'slate', (u, v, i, j, W, H, x, y) => { const n = (x * 37 + y * 91) % 23; return n === 0 ? 4.5 : Math.abs(Math.hypot(u, v) - 0.6) < 0.05 ? 3 : 0.8; });
    g.seg(-R * 0.86, R, R * 0.86, R, 0.02, 'brass', 3); g.seg(0, R * 0.14, 0, R * 1.86, 0.02, 'brass', 3);
  },
  orrery(g, p) { // a brass orrery 0.5 tall on a desk: a sun, rings and planets on arms
    const mat = p.mat ?? 'brass';
    g.rect(-0.1, 0, 0.1, 0.05, mat, boxed(3.4, 2)); g.seg(0, 0.05, 0, 0.3, 0.025, mat, 2.6);
    g.ell(0, 0.33, 0.24, 0.07, mat, (u, v) => (Math.hypot(u, v) > 0.8 ? 3 : -9));
    g.ell(0, 0.33, 0.06, 0.06, 'lamp', 4);
    for (const [x, y] of [[-0.22, 0.31], [0.16, 0.38], [0.05, 0.27]]) g.ell(x, y, 0.03, 0.03, 'metal', 3.4);
  },
  telescope(g, p) { // a brass telescope 1.8 long on a tripod, pointing up to the right
    const mat = p.mat ?? 'brass';
    g.seg(0, 1.1, -0.35, 0, 0.04, 'wood', 2.6); g.seg(0, 1.1, 0.35, 0, 0.04, 'wood', 2); g.seg(0, 1.1, 0.05, 0, 0.04, 'wood', 1.6);
    g.seg(-0.6, 0.85, 0.9, 1.55, 0.16, mat, (u, v) => 2.8 - v * 0.8);
    g.seg(0.9, 1.55, 1.15, 1.67, 0.2, mat, 3.4);
    g.seg(-0.75, 0.78, -0.6, 0.85, 0.07, mat, 2.2);
    g.ell(0, 1.12, 0.06, 0.06, 'dark_stone', 2);
  },
  grille(g, p) { // iron bars on a counter: `wm` wide, from `from` (1.05) up to `hm` (2.3)
    const w = (p.wm ?? 3) / 2, y0 = p.from ?? 1.05, h = p.hm ?? 2.3, mat = p.mat ?? 'metal';
    for (let x = -w; x <= w + 0.001; x += 0.16) g.rect(x - 0.015, y0, x + 0.015, h, mat, 2.4);
    g.rect(-w - 0.04, h - 0.06, w + 0.04, h, mat, boxed(3.4, 2.2));
    g.rect(-0.25, y0, 0.25, y0 + 0.25, 'dark_stone', 1); // the clerk's slot
  },
  scales(g, p, c) { // the iron scales hanging on a chain: beam 1.6 wide, pans 0.5 below it
    const w = (p.wm ?? 1.6) / 2, mat = p.mat ?? 'metal', top = (g.Y(0) - (c.ceiling ?? -10)) / g.k;
    g.seg(0, 0.6, 0, top, 0.03, mat, 2);
    g.poly([[-0.08, 0.6], [0.08, 0.6], [0, 0.78]], mat, 3);
    g.rect(-w, 0.56, w, 0.62, mat, boxed(3.4, 2));
    for (const sx of [-1, 1]) { g.seg(sx * w, 0.56, sx * (w - 0.2), 0.08, 0.015, mat, 2); g.seg(sx * w, 0.56, sx * (w + 0.2), 0.08, 0.015, mat, 2); g.poly([[sx * w - 0.26, 0.08], [sx * w + 0.26, 0.08], [sx * w + 0.16, 0], [sx * w - 0.16, 0]], p.pan ?? 'brass', 3); }
  },
  catwalk(g, p) { // an iron walkway overhead, `wm` long, its deck at the pen's ground, railing 1.0
    const w = (p.wm ?? 8) / 2, mat = p.mat ?? 'metal';
    g.rect(-w, -0.18, w, 0, mat, (u, v, i, j, W, H) => (j === 0 ? 3.6 : j === H - 1 ? 1 : 2));
    for (let x = -w; x <= w + 0.001; x += 0.5) g.rect(x - 0.02, 0, x + 0.02, 1.0, mat, 2.2);
    for (const y of [0.5, 0.97]) g.rect(-w, y, w, y + 0.04, mat, 3.2);
    for (let x = -w + 1; x < w; x += 3) g.seg(x, -0.18, x + 0.6, -0.9, 0.05, mat, 1.8); // brackets
  },
  railing(g, p) { // a ship's balustrade `wm` long, 1.05 tall: balusters every 0.22 under a rail
    const w = (p.wm ?? 6) / 2, mat = p.mat ?? 'brass';
    g.rect(-w, 0, w, 0.08, p.base ?? 'wood', boxed(3.4, 2.2));
    for (let x = -w; x <= w; x += 0.22) { g.rect(x - 0.025, 0.08, x + 0.025, 0.95, mat, (u, v, i, j, W, H) => (j % Math.max(3, Math.round(0.3 * g.k)) === 0 ? 3.6 : i === 0 ? 3 : 2.2)); }
    g.rect(-w, 0.95, w, 1.05, mat, boxed(3.8, 2.6));
  },
  mine_set(g, p) { // a mine set: two timber props `wm` apart (4.0) under a cap at `hm` (2.7), braces
    const w = (p.wm ?? 4) / 2, h = p.hm ?? 2.7, t = 0.24, mat = p.mat ?? 'wood';
    for (const sx of [-1, 1]) g.rect(sx * w - t / 2, 0, sx * w + t / 2, h, mat, (u, v, i, j, W) => (i === 0 ? 3.2 : i === W - 1 ? 1.4 : (j % 7 === 0 ? 1.9 : 2.5)));
    g.rect(-w - t, h, w + t, h + t, mat, boxed(3.4, 2.2));
    for (const sx of [-1, 1]) g.seg(sx * (w - 0.1), h - 0.55, sx * (w - 0.6), h + 0.02, 0.12, mat, 2.2);
  },
  pick(g, p) { // a pickaxe leaning on a wall, 0.9 long
    g.seg(0, 0, 0.18, 0.88, 0.04, 'wood', 2.8);
    g.poly([[-0.04, 0.8], [0.4, 0.96], [0.42, 0.9], [0.18, 0.84], [0.0, 0.76]], 'metal', 3);
  },
  train(g, p, c) { // a small steam train in profile going right: a locomotive 9 long and `cars` coal cars
    const mat = p.mat ?? 'dark_stone';
    let x = -((p.cars ?? 3) * 6.4 + 9) / 2;
    for (let n = 0; n < (p.cars ?? 3); n++) { // coal cars, 6 long
      g.rect(x + 0.2, 0.9, x + 6, 2.6, p.car ?? 'wood', (u, v, i, j, W, H) => (j === 0 ? 3.4 : i % Math.max(3, Math.round(0.8 * g.k)) === 0 ? 1.6 : 2.4));
      g.poly([[x + 0.4, 2.6], [x + 5.8, 2.6], [x + 5.2, 3.1], [x + 1.2, 3.2]], 'dark_stone', (u, v, i, j, W, H, X, Y) => 1 + ((X * 5 + Y * 3) % 4) * 0.5);
      for (const wx of [x + 1.4, x + 4.8]) g.ell(wx, 0.5, 0.5, 0.5, mat, round(2, 1));
      g.rect(x + 6, 1.1, x + 6.4, 1.3, mat, 2);
      x += 6.4;
    }
    // the locomotive: tender, cab, boiler, funnel, wheels
    g.rect(x, 0.9, x + 2.4, 2.8, mat, boxed(3, 2.2));
    g.rect(x + 2.4, 0.9, x + 4.4, 4.0, mat, boxed(3.2, 2.4));
    g.rect(x + 2.7, 2.6, x + 3.6, 3.5, 'window', (u, v) => (c.lit ? 4 : u + v < 0 ? 3 : 1.8));
    g.rect(x + 2.2, 3.9, x + 4.7, 4.25, mat, 3);
    g.rect(x + 4.4, 1.3, x + 8.6, 3.2, p.boiler ?? 'slate', (u, v, i, j, W, H) => cyl(2.6)(-v) + (i % Math.max(3, Math.round(1.1 * g.k)) === 0 ? -0.7 : 0));
    g.rect(x + 7.4, 3.2, x + 7.9, 4.4, mat, cyl(2.6)); g.rect(x + 7.25, 4.3, x + 8.05, 4.55, mat, 3.2);
    g.ell(x + 5.8, 3.35, 0.35, 0.2, 'brass', 3.4);
    g.poly([[x + 8.6, 1.0], [x + 9.4, 0.3], [x + 9.4, 1.0]], mat, 2);
    for (const wx of [x + 3.0, x + 5.0, x + 7.0]) { g.ell(wx, 0.65, 0.65, 0.65, p.wheels ?? 'red_cloth', (u, v) => (Math.hypot(u, v) > 0.7 ? 1.6 : 2.6)); g.ell(wx, 0.65, 0.12, 0.12, 'metal', 3); }
    g.seg(x + 3.0, 0.65, x + 7.0, 0.65, 0.08, 'metal', 3.2);
    if (p.smoke !== false) for (let n = 0; n < 6; n++) g.ell(x + 7.6 - n * 1.1, 4.9 + n * 0.45, 0.4 + n * 0.25, 0.32 + n * 0.18, 'smoke', round(3.4, 0.8));
  },
  gate(g, p, c) { // a great gate cut in a mountain face: `wm` wide (8), `hm` tall (12), carved jambs
    const w = (p.wm ?? 8) / 2, h = p.hm ?? 12, mat = p.mat ?? 'stone', door = p.door ?? 'dark_stone';
    const arch = (d) => [[-w - d, 0], [w + d, 0], [w + d, h - w * 0.6], ...Array.from({ length: 13 }, (_, n) => { const a = (n / 12) * Math.PI; return [(w + d) * Math.cos(a), h - w * 0.6 + (w * 0.6 + d) * Math.sin(a)]; }), [-w - d, h - w * 0.6]];
    g.poly(arch(1.4), mat, (u, v, i, j, W, H, x, y) => (i < 2 ? 3.6 : (x + y) % 9 === 0 ? 1.8 : 2.8 - v * 0.4));
    g.poly(arch(0.5), mat, (u, v, i, j, W, H, x, y) => (j % Math.max(3, Math.round(1.2 * g.k)) === 0 ? 1.4 : 2.2));
    g.poly(arch(0), door, (u, v, i, j, W, H, x, y) => (Math.abs(u) < 0.03 ? 0.6 : (i % Math.max(3, Math.round(1.0 * g.k)) === 0 ? 1.2 : 2) + (c.lit && v > 0.3 ? 0.6 : 0)));
    for (const sx of [-1, 1]) for (let y = 1; y < h - 2; y += 2.5) g.rect(sx * w * 0.5 - 0.3, y, sx * w * 0.5 + 0.3, y + 0.25, 'brass', 3.2);
    // `light`: a lit wicket door in the gate, `light_at` metres off the middle (keep it off a figure's head)
    const lx = p.light_at ?? 0;
    if (p.light) g.rect(lx - 0.6, 0, lx + 0.6, Math.min(h * 0.5, 3.2), 'fire', (u, v) => (c.lit ? 3.4 : 2.4) - (v + 1) * 0.4);
  },
  furnace(g, p, c) { // a dwarf furnace: a brick dome `wm` across (5) and 4 tall, a glowing mouth, a stack
    const w = (p.wm ?? 5) / 2, h = p.hm ?? 4, mat = p.mat ?? 'brick';
    g.rect(-0.6, h * 0.6, 0.6, h + 3.5, mat, (u, v, i, j, W) => (i === 0 ? 3.2 : i === W - 1 ? 1.6 : j % 4 === 0 ? 1.9 : 2.6));
    g.rect(-0.75, h + 3.3, 0.75, h + 3.6, 'dark_stone', 3);
    g.ell(0, 0, w, h, mat, (u, v, i, j, W, H, x, y) => (v > 0 ? -9 : round(2.6, 1)(u, v) + ((x + Math.floor(j / 3) * 2) % 5 === 0 || j % 3 === 0 ? -0.6 : 0)));
    g.poly([[-0.9, 0], [0.9, 0], [0.9, 1.1], [0, 1.6], [-0.9, 1.1]], 'fire', (u, v) => (c.lit ? 4 : 3.4) - (v + 1) * 0.5);
    g.rect(-1.0, 0, 1.0, 0.25, 'dark_stone', 2);
  },
  tower(g, p, c) { // a square stone tower `wm` wide (5), `hm` tall (14), arrow slits, battlements
    const w = (p.wm ?? 5) / 2, h = p.hm ?? 14, mat = p.mat ?? 'stone', bh = Math.max(2, Math.round(0.6 * g.k));
    g.rect(-w, 0, w, h, mat, (u, v, i, j, W, H, x, y) => (j % bh === 0 || (x + (Math.floor(j / bh) % 2) * 3) % 7 === 0 ? 1.7 : i < 2 ? 3.2 : i >= W - 2 ? 1.8 : 2.6));
    for (let y = 3; y < h - 2; y += 3.2) g.rect(-0.12, y, 0.12, y + 1.0, 'dark_stone', 0.5);
    g.rect(-w - 0.3, h, w + 0.3, h + 0.5, mat, boxed(3.6, 2.4));
    for (let x = -w - 0.3; x < w + 0.2; x += 1.2) g.rect(x, h + 0.5, x + 0.65, h + 1.3, mat, boxed(3.6, 2.4));
    if (p.flag) { g.seg(0, h + 0.5, 0, h + 4.5, 0.1, 'wood', 2.6); g.poly([[0, h + 4.4], [2.2, h + 3.9], [0, h + 3.3]], p.flag, (u, v) => 3 - v * 0.6); }
  },
  fern(g, p, c) { // a clump of ferns `hm` tall (0.8)
    const h = p.hm ?? 0.8, mat = p.mat ?? 'leaf';
    for (let n = 0; n < 7; n++) {
      const a = (n / 6) * 2 - 1, tx = a * h * 0.9, ty = h * (0.55 + 0.45 * (1 - Math.abs(a)));
      g.seg(0, 0, tx, ty, 0.05, mat, 2);
      for (let q = 1; q < 6; q++) { const t = q / 6, px = tx * t, py = ty * t + Math.sin(t * 3) * 0.05; g.ell(px, py, h * 0.07, h * 0.04, mat, n % 2 ? 3.2 : 2.6); }
    }
  },
  fence(g, p, c) { // a post-and-rail fence: posts 1.15 tall every `every` m; drawn by the kit along a line
    g.rect(-0.06, 0, 0.06, 1.15, p.mat ?? 'wood', (u, v, i, j) => (j === 0 ? 3.6 : i === 0 ? 3 : 2.2));
  },
  house(g, p, c) { // a house front: `wm` wide, walls `hm` to the eaves, a `roof` that tall; gable to the front
    houseFront(g, p, c);
  },
  tree(g, p, c) { // a broadleaf tree `hm` tall (9), its crown 0.7 of that across
    const h = p.hm ?? 9, w = (p.wm ?? h * 0.7) / 2, tw = p.trunk ?? Math.max(0.25, h * 0.045), mat = p.mat ?? 'leaf';
    g.poly([[-tw * 1.4, 0], [tw * 1.4, 0], [tw, h * 0.15], [tw * 0.8, h * 0.55], [-tw * 0.8, h * 0.55], [-tw, h * 0.15]], p.wood ?? 'wood', (u, v, i, j, W) => cyl(2.4)(u) + ((j + i * 3) % 9 === 0 ? -0.6 : 0));
    g.seg(0, h * 0.42, w * 0.5, h * 0.62, tw * 0.6, p.wood ?? 'wood', 2.2);
    g.seg(0, h * 0.45, -w * 0.45, h * 0.66, tw * 0.6, p.wood ?? 'wood', 2.6);
    const blobs = Array.from({ length: p.clumps ?? 11 }, () => [(c.r() - 0.5) * 1.5 * w, h * (0.52 + c.r() * 0.36), w * (0.32 + c.r() * 0.18)]);
    blobs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of blobs) g.ell(x, y, r, r * 0.9, mat, (u, v) => (u * u + v * v > 0.78 ? (u + v < 0 ? 3.6 : 1.5) : u + v < -0.3 ? 3.3 : 2.4));
  },
  pine(g, p, c) { // a conifer `hm` tall (14)
    const h = p.hm ?? 14, w = (p.wm ?? h * 0.42) / 2, mat = p.mat ?? 'pine', tiers = Math.max(3, Math.round(h / 2.6));
    g.rect(-h * 0.02, 0, h * 0.02, h * 0.2, p.wood ?? 'wood', cyl(2.2));
    for (let t = 0; t < tiers; t++) {
      const y0 = h * (0.12 + (t / tiers) * 0.8), y1 = Math.min(h, y0 + h * 0.26), ww = w * (1 - t / tiers) + h * 0.03;
      g.poly([[-ww, y0], [ww, y0], [0, y1]], mat, (u, v) => (u < -0.15 ? 3.2 : u < 0.1 ? 2.8 : 1.8) - (v > 0.6 ? 0.6 : 0));
    }
  },
  bigtree(g, p, c) { // an old giant of Ileth: trunk `wm` wide (4), as tall as `hm`, crown clumps above
    const h = p.hm ?? 60, tw = (p.wm ?? 4) / 2, mat = p.mat ?? 'elf_leaf';
    const fl = p.flare ?? 2;
    g.poly([[-tw * fl, 0], [tw * fl, 0], [tw * 1.05, Math.min(h * 0.06, 2.5)], [tw, h * 0.75], [-tw, h * 0.75], [-tw * 1.05, Math.min(h * 0.06, 2.5)]], 'wood', (u, v, i, j, W) => cyl(2.4)(u) + (i % Math.max(3, Math.round(0.45 * g.k)) === 0 ? -0.6 : 0) + ((j * 3 + i) % 17 === 0 ? -0.5 : 0));
    for (const [y, dir, len] of p.branches ?? [[0.4, 1, 0.4], [0.55, -1, 0.35]]) g.seg(0, h * y, dir * h * len * 0.5, h * (y + 0.1), tw * 0.5, 'wood', dir < 0 ? 2.8 : 2);
    const crown = p.crown ?? [0.6, 1.0];
    const blobs = Array.from({ length: p.clumps ?? 14 }, () => [(c.r() - 0.5) * (p.spread ?? h * 0.6), h * (crown[0] + c.r() * (crown[1] - crown[0])), h * (0.07 + c.r() * 0.05)]);
    blobs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of blobs) g.ell(x, y, r, r * 0.85, mat, (u, v) => (u * u + v * v > 0.8 ? (u + v < 0 ? 3.8 : 1.4) : u + v < -0.3 ? 3.2 : 2.2));
  },
};

/** draw another thing inside this one, offset in metres (a sack next to crates, a horse at a cart) */
function sub(g, kind, p, c, dx, dy) {
  const flip = g.X(1) < g.X(0);
  const inner = metrePen(c.put, Math.round(g.X(dx)), Math.round(g.Y(dy) - 1), g.k, flip);
  THINGS[kind](inner, p, c);
}

/** a spoked wheel: centre (x, y) and radius in metres */
function wheel(g, x, y, r, mat, spokes = 8) {
  g.ell(x, y, r, r, mat, (u, v) => { const d = Math.hypot(u, v); return d > 0.78 ? (u + v < 0 ? 3.4 : 1.8) : -9; });
  for (let n = 0; n < spokes; n++) { const a = (n / spokes) * Math.PI * 2 + 0.2; g.seg(x, y, x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, 0.03, mat, 2.4); }
  g.ell(x, y, r * 0.2, r * 0.2, 'metal', 3);
}

/** a horse's leg: front legs straight, hind legs with the hock bent back */
function leg(g, x, mat, shade, dx, front) {
  x += dx;
  if (front) g.poly([[x - 0.1, 1.05], [x + 0.11, 1.05], [x + 0.07, 0.55], [x + 0.06, 0.12], [x - 0.04, 0.12], [x - 0.06, 0.55]], mat, shade);
  else g.poly([[x - 0.14, 1.15], [x + 0.18, 1.1], [x + 0.03, 0.58], [x + 0.06, 0.12], [x - 0.04, 0.12], [x - 0.1, 0.5], [x - 0.16, 0.7]], mat, shade);
  g.rect(x - 0.06, 0, x + 0.09, 0.12, 'dark_stone', 1.4);
}

/** small things on a shelf, table or counter top between x0 and x1 (metres), standing on y */
function things_on(g, c, x0, x1, y, kind) {
  const ITEM = ['red_cloth', 'cloth', 'brass', 'plaster', 'leaf', 'water', 'brick', 'stone'];
  const FRUIT = ['field', 'red_cloth', 'leaf', 'brass', 'chestnut'];
  for (let x = x0; x < x1;) {
    const r = c.r();
    if (kind === 'ledger') { // one big open book
      const m = (x0 + x1) / 2;
      g.poly([[m - 0.28, y], [m, y + 0.02], [m + 0.28, y], [m + 0.28, y + 0.05], [m, y + 0.06], [m - 0.28, y + 0.05]], 'plaster', (u, v, i) => (i % 3 === 0 ? 2.8 : 3.8));
      g.rect(m - 0.3, y - 0.01, m + 0.3, y + 0.01, 'red_cloth', 2);
      return;
    }
    if (kind === 'books') {
      const bw = 0.04 + r * 0.04, bh = 0.18 + c.r() * 0.1;
      if (c.r() < 0.06) { x += 0.08; continue; }
      if (x + bw > x1) break;
      g.rect(x, y, x + bw, y + bh, ITEM[Math.floor(c.r() * ITEM.length)], boxed(3.2, 2.4));
      x += bw + 0.01;
    } else if (kind === 'produce') {
      const w = 0.3 + r * 0.15;
      if (x + w > x1) break;
      g.rect(x, y, x + w, y + 0.12, 'plank', boxed(3.4, 2));
      g.poly([[x + 0.02, y + 0.12], [x + w - 0.02, y + 0.12], [x + w * 0.7, y + 0.24], [x + w * 0.3, y + 0.26]], FRUIT[Math.floor(c.r() * FRUIT.length)], (u, v, i, j, W, H, X, Y) => ((X + Y) % 3 === 0 ? 3.6 : 2.6));
      x += w + 0.06;
    } else {
      const w = 0.1 + r * 0.08, h = 0.12 + c.r() * 0.16, m = ITEM[Math.floor(c.r() * ITEM.length)];
      if (c.r() < 0.25) { x += 0.12; continue; }
      if (x + w > x1) break;
      if (kind === 'mixed' && c.r() < 0.4) g.rect(x, y, x + 0.05, y + 0.22, m, boxed(3.2, 2.4));
      else g.poly([[x, y], [x + w, y], [x + w, y + h * 0.7], [x + w * 0.7, y + h], [x + w * 0.3, y + h], [x, y + h * 0.7]], m, cyl(2.7));
      x += w + 0.06;
    }
  }
}

/** a house front (see THINGS.house) */
function houseFront(g, p, c) {
  const w = (p.wm ?? 6) / 2, h = p.hm ?? 3, roof = p.roof ?? 3, wall = p.wall ?? 'plaster', rmat = p.roof_mat ?? 'thatch';
  const ov = 0.35, pat = p.pattern ?? (wall === 'brick' ? 'brick' : wall === 'stone' || wall === 'dark_stone' ? 'blocks' : wall === 'plank' || wall === 'wood' ? 'planks' : 'plaster');
  const k = g.k, unit = Math.max(2, Math.round(0.25 * k));
  // the wall, with its pattern on screen pixels
  g.rect(-w, 0, w, h, wall, (u, v, i, j, W, H, x, y) => {
    let l = 2.6 + (i === 0 ? 0.5 : i === W - 1 ? -0.8 : 0);
    if (pat === 'blocks' || pat === 'brick') { const bh = pat === 'brick' ? Math.max(2, Math.round(0.1 * k)) : unit, bw = bh * (pat === 'brick' ? 2.4 : 2); const row = Math.floor(j / bh); if (j % bh === 0 || Math.floor(x + (row % 2) * bw / 2) % Math.round(bw) === 0) l = 1.5; }
    if (pat === 'planks' && i % Math.max(2, Math.round(0.22 * k)) === 0) l = 1.6;
    if (pat === 'plaster' && ((x * 7 + y * 13) % 23 === 0)) l = 2.1;
    return l;
  });
  // timber frame on plaster: posts at the corners and between, a beam under the eaves
  if (p.timber) {
    const tm = p.timber === true ? 'wood' : p.timber, t = Math.max(0.12, 1 / k);
    for (let x = -w; x <= w + 0.01; x += (2 * w) / Math.max(2, Math.round(w / 1.4))) g.rect(Math.min(x, w - t), 0, Math.min(x, w - t) + t, h, tm, 2);
    g.rect(-w, h - t, w, h, tm, 2.2); g.rect(-w, h * 0.5, w, h * 0.5 + t, tm, 2.2);
  }
  // windows and the door
  for (const [x, y0, ww, hh] of p.windows ?? defaultWindows(w, h, p)) {
    g.rect(x - ww / 2 - 0.08, y0 - 0.1, x + ww / 2 + 0.08, y0 + hh + 0.06, p.trim ?? 'wood', boxed(3.4, 2));
    g.rect(x - ww / 2, y0, x + ww / 2, y0 + hh, 'window', (u, v, i, j, W, H) => (c.lit ? (v < -0.2 ? 4 : 3) : (u + v < -0.5 ? 3.2 : 1.8)) - (i === Math.floor(W / 2) || j === Math.floor(H / 2) ? 1.4 : 0));
  }
  if (p.door !== false) {
    const dx = typeof p.door === 'number' ? p.door : 0, dw = p.door_w ?? 1.0, dh = p.door_h ?? 2.0;
    g.rect(dx - dw / 2 - 0.08, 0, dx + dw / 2 + 0.08, dh + 0.1, p.trim ?? 'wood', boxed(3.4, 2));
    g.rect(dx - dw / 2, 0, dx + dw / 2, dh, p.door_mat ?? 'plank', (u, v, i, j, W) => (i % Math.max(2, Math.round(0.2 * k)) === 0 ? 1.6 : 2.6));
    g.dot(dx + dw * 0.3, dh * 0.48, 'brass', 4);
  }
  // the roof: a gable (triangle) to the front, or the long side (a sloping band seen from below)
  if (p.gable) {
    g.poly([[-w - ov, h - 0.1], [w + ov, h - 0.1], [0, h + roof]], rmat, (u, v, i, j, W, H, x, y) => roofLevel(rmat, u, v, i, j, x, y, k));
    g.poly([[-w + 0.2, h], [w - 0.2, h], [0, h + roof - 0.45]], wall, (u, v) => 2.4 - u * 0.4); // the gable wall under the roof's edge
    if (p.loft !== false) g.rect(-0.3, h + 0.3, 0.3, h + 0.95, 'window', c.lit ? 3.4 : 1.8);
  } else {
    g.poly([[-w - ov, h - 0.15], [w + ov, h - 0.15], [w + ov - roof * 0.35, h + roof], [-w - ov + roof * 0.35, h + roof]], rmat, (u, v, i, j, W, H, x, y) => roofLevel(rmat, u, v, i, j, x, y, k));
  }
  if (p.chimney != null) {
    const cx = p.chimney, top = h + roof + 0.6;
    g.rect(cx - 0.3, h + roof * 0.4, cx + 0.3, top, p.chimney_mat ?? 'stone', boxed(3.4, 2.4));
  }
  if (p.tower) { // a bell tower on the roof (a chapel): `tower` = its height above the ridge
    const tw = 0.9, base = h + roof * 0.5, top = h + roof + p.tower;
    g.rect(-tw, base, tw, top, wall, (u, v, i, j, W) => (i === 0 ? 3.1 : i === W - 1 ? 1.8 : 2.6));
    g.rect(-tw * 0.55, top - 1.4, tw * 0.55, top - 0.3, 'dark_stone', 0.8);
    g.ell(0, top - 0.85, 0.28, 0.32, p.light ? (c.lit ? 'lamp' : 'brass') : 'brass', c.lit ? 4 : 3);
    g.poly([[-tw - 0.25, top], [tw + 0.25, top], [0, top + 2.4]], rmat, (u, v, i, j, W, H, x, y) => roofLevel(rmat, u, v, i, j, x, y, k));
  }
}
function defaultWindows(w, h, p) {
  const out = [], floors = p.floors ?? 1, fh = h / floors, n = Math.max(1, Math.round(w / 1.6));
  for (let f = 0; f < floors; f++) for (let i = 0; i < n * 2; i++) {
    const x = -w + ((i + 0.5) / (n * 2)) * 2 * w;
    if (f === 0 && p.door !== false && Math.abs(x - (typeof p.door === 'number' ? p.door : 0)) < 1.0) continue;
    out.push([x, f * fh + Math.min(1.0, fh * 0.32), 0.8, Math.min(1.1, fh * 0.42)]);
  }
  return out;
}
function roofLevel(mat, u, v, i, j, x, y, k) {
  const row = Math.max(2, Math.round(0.28 * k));
  if (mat === 'thatch') return 2.6 + (j % row === 0 ? 0.8 : 0) - (((x * 5 + j * 3) % 7) === 0 ? 0.7 : 0) - (v > 0.75 ? 0.6 : 0);
  // tiles or slates: rows of scales
  const off = Math.floor(j / row) % 2 ? row : 0;
  return 2.6 + (j % row === 0 ? -0.9 : 0) + (((x + off) % (row * 2)) === 0 ? -0.7 : 0) + (v < -0.8 ? 0.6 : 0);
}

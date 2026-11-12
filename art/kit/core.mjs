// The game's own 2D sprite kit.
//
// A piece is a short YAML spec: shapes with a material, placed by body landmarks (art/bodies.yaml).
// buildPiece() turns it into an index layer: material + shade level (0 dark .. 4 light) per pixel,
// with soft shading (darker part edges, per-material speckle). compose() stacks layers by z, adds
// the contact shadow and the 1 px outline, and colours them from palette ramps. Colours are only
// chosen at compose time, so one piece serves every palette.
// Pure code, no Node APIs: the game imports this file in the browser (src/sprites/kit.ts).

export const W = 64, H = 96, CX = 31; // canvas, centre column (figures are symmetric around it)
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * A kit from already-parsed YAML: { palette, bodies, pieces: { "hair/m/short": spec, ... } } plus
 * optional data files (npcs, races, hair, outfits, items) kept on kit.data. Works in Node and in the
 * browser (the game bundles the YAML; loadKit in kit.mjs reads it from disk).
 */
export function makeKit({ palette, bodies, pieces, ...data }) {
  const pal = structuredClone(palette);
  // YAML reads all-digit colours such as 303242 as numbers; turn them back into hex strings
  const hex = v => {
    const s = typeof v === 'number' ? String(v).padStart(6, '0') : String(v);
    if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error(`bad colour ${v} in palette.yaml (quote it)`);
    return s;
  };
  for (const k of Object.keys(pal.ramps)) pal.ramps[k] = pal.ramps[k].map(hex);
  pal.outline = hex(pal.outline);
  // each piece knows its slot (the folder: hair, weapon, acc...) for the bodies' `bare` lists
  for (const [id, spec] of Object.entries(pieces)) if (spec && !('slot' in spec)) Object.defineProperty(spec, 'slot', { value: id.split('/')[0] });
  if (pal.item_outline) pal.item_outline = { ...pal.item_outline, colour: hex(pal.item_outline.colour) };
  const kit = { pal, pieces, bodies, mats: Object.keys(pal.materials), cache: {}, data };
  kit.matId = Object.fromEntries(kit.mats.map((m, i) => [m, i]));
  return kit;
}

// ---------- rows and landmarks ----------

/**
 * 57 | "chin" | "chin+2" | "hip-1" -> row number. The same for columns of an ascii `at`, from a
 * body's `cols` (e.g. "hand-2": two columns left of where that body's weapon hand is).
 */
export function rowOf(v, marks) {
  if (typeof v === 'number') return v;
  const m = /^\s*([a-z_]+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(String(v));
  if (!m || !(m[1] in marks)) throw new Error(`unknown row "${v}"`);
  return marks[m[1]] + (m[2] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0);
}

/** [[row, a, b..], ...] -> one entry per row, values interpolated linearly and rounded. */
function perRow(points, marks) {
  const pts = points.map(([r, ...v]) => [rowOf(r, marks), ...v]).sort((a, b) => a[0] - b[0]);
  const out = [];
  pts.forEach((a, i) => {
    const b = pts[i + 1];
    const last = b ? b[0] - 1 : a[0];
    for (let y = a[0]; y <= last; y++) {
      const t = b ? (y - a[0]) / (b[0] - a[0]) : 0;
      out.push([y, ...a.slice(1).map((v, k) => Math.round(v + ((b ? b[k + 1] : v) - v) * t))]);
    }
  });
  return out;
}

function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const seedOf = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
// a piece's speckle comes from its name, not from the body folder it sits in: hair/m/short shades
// exactly as hair/short did when the look was approved
const seedName = (kit, id) => id.split('/').filter(s => !(s in kit.bodies)).join('/');

// ---------- layers ----------

export function newLayer() {
  const n = W * H;
  return {
    mat: new Int16Array(n).fill(-1), // material id, -1 = empty
    lvl: new Int8Array(n).fill(-1), // shade level; -1 = shade automatically
    auto: new Uint8Array(n), // 1 = level came from shading (contact shadow may darken it)
    part: new Int16Array(n).fill(-1), // shading region; edges between parts get darker
    nx: new Int16Array(n), // x used for speckle noise (mirrored halves share a pattern)
  };
}

/** "hair" | "hair@0" -> [matId, level or -1] */
function matRef(kit, s) {
  const [name, l] = String(s).split('@');
  if (!(name in kit.matId)) throw new Error(`unknown material "${name}"`);
  return [kit.matId[name], l === undefined ? -1 : Number(l)];
}

/** Body layer and named part masks for a body type (cached). */
export function bodyOf(kit, bodyKey) {
  const key = `body:${bodyKey}`;
  if (kit.cache[key]) return kit.cache[key];
  const body = kit.bodies[bodyKey];
  if (!body) throw new Error(`unknown body "${bodyKey}"`);
  const spec = { z: body.z ?? 10, shapes: Object.entries(body.parts).map(([name, s]) => ({ mat: 'skin', ...s, name })) };
  const masks = {};
  const layer = buildSpec(kit, spec, { bodyKey, marks: body.marks, cols: body.cols ?? {}, masks, seed: seedOf(key) });
  return (kit.cache[key] = { layer, masks, marks: body.marks, cols: body.cols ?? {} });
}

/** A shape's body / variant field: one name or a list of names. */
const has = (v, k) => (Array.isArray(v) ? v.includes(k) : v === k);

/**
 * Does a `body` field (one name or a list) take this body? A body with `like:` (the child bodies,
 * art/bodies.yaml) also takes what its grown-up body takes: the child heads are the adult heads, so
 * hair/m/short and the male face shapes fit the boy too.
 */
export const bodyIs = (kit, bodyKey, v) => has(v, bodyKey) || (!!kit?.bodies[bodyKey]?.like && has(v, kit.bodies[bodyKey].like));

/**
 * A body's age stage (art/bodies.yaml `age`: baby, toddler, child, teen); a body without one is
 * "child" when it has `like:` (cm, cf) and "adult" otherwise.
 */
export const ageOf = (kit, bodyKey) => {
  const b = kit?.bodies[bodyKey];
  return b?.age ?? (b?.like ? 'child' : 'adult');
};

/**
 * A piece with a top-level `body` (one name or a list) is only for those bodies, e.g. hair/m/short;
 * one with `ages` (baby, toddler, child, teen, adult) only for bodies of those stages, or whose
 * `wears` names one of them (a toddler wears the child clothes, a teen the grown-up ones). A piece
 * with `grown: true` (beards, wrinkles) is for grown-up bodies only, whatever they wear. A body's
 * `bare` list names slots it never wears unless the piece is made for its stage (a baby holds no
 * sword and wears no hat; its basket is acc/ with `ages: [baby]`).
 */
export const fitsBody = (spec, bodyKey, kit) => {
  if (spec?.body && !bodyIs(kit, bodyKey, spec.body)) return false;
  const b = kit?.bodies[bodyKey], age = ageOf(kit, bodyKey);
  if (spec?.grown && age !== 'adult') return false;
  if (spec?.ages) return [age, ...(b?.wears ?? [])].some(a => has(spec.ages, a));
  return !(spec?.slot && b?.bare?.includes(spec.slot));
};

/**
 * Build one piece for one body. opts.variant picks variant-only shapes (e.g. a face expression).
 * Returns { id, z, cast, colors, layers: { main, back?, front? } }.
 */
export function buildPiece(kit, id, bodyKey, opts = {}) {
  if (id === 'body') return { id, z: 10, cast: false, colors: {}, layers: { main: bodyOf(kit, bodyKey).layer } };
  const spec = kit.pieces[id];
  if (!spec) throw new Error(`unknown piece "${id}"`);
  if (!fitsBody(spec, bodyKey, kit)) throw new Error(`${id} is only for ${[spec.body ?? [], spec.ages ?? []].flat().join(', ')}, not ${bodyKey}`);
  const { marks, cols, masks } = bodyOf(kit, bodyKey);
  const pick = s => (!s.body || bodyIs(kit, bodyKey, s.body)) && (!s.variant || has(s.variant, opts.variant));
  const shapes = (spec.shapes ?? []).filter(pick);
  const layers = {};
  for (const name of new Set(shapes.map(s => s.layer ?? 'main'))) {
    layers[name] = buildSpec(kit, { shapes: shapes.filter(s => (s.layer ?? 'main') === name), legend: spec.legend },
      { bodyKey, marks, cols, masks, seed: seedOf(`${seedName(kit, id)}:${name}`) });
  }
  return { id, z: spec.z ?? 50, backZ: spec.back_z ?? 5, frontZ: spec.front_z ?? 61, cast: spec.cast ?? true, colors: spec.colors ?? {}, layers };
}

function buildSpec(kit, spec, ctx) {
  const L = newLayer();
  const legend = { ...kit.pal.legend, ...(spec.legend ?? {}) };
  let nextPart = 0;
  for (const s of spec.shapes) {
    const [mat, lvl] = s.mat ? matRef(kit, s.mat) : [-1, -1];
    const parts = [nextPart++, s.mirror ? nextPart++ : -1];
    const put = (x, y, m, l, part, nx) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      const p = y * W + x;
      if (s.cut || m === -2) { L.mat[p] = -1; L.lvl[p] = -1; L.part[p] = -1; return; }
      if (s.paint) { if (L.mat[p] >= 0) { L.mat[p] = m; L.lvl[p] = l; } return; } // recolour only, keep the part
      L.mat[p] = m; L.lvl[p] = l; L.part[p] = part; L.nx[p] = nx;
      if (s.name && ctx.masks) (ctx.masks[s.name] ??= new Uint8Array(W * H))[p] = 1;
    };
    const span = (y, x0, x1, half) => {
      for (let x = x0; x <= x1; x++) put(x, y, mat, lvl, parts[half], half ? 2 * CX - x : x);
    };
    if (s.sym) for (const [y, h] of perRow(s.sym, ctx.marks)) span(y, CX - h, CX + h, 0);
    else if (s.span) {
      for (const [y, a, b] of perRow(s.span, ctx.marks)) {
        span(y, CX + a, CX + b, 0);
        if (s.mirror) span(y, CX - b, CX - a, 1);
      }
    } else if (s.rect) {
      const [dx, r, w, h] = s.rect, y0 = rowOf(r, ctx.marks);
      for (let y = y0; y < y0 + h; y++) {
        span(y, CX + dx, CX + dx + w - 1, 0);
        if (s.mirror) span(y, CX - dx - w + 1, CX - dx, 1);
      }
    } else if (s.region) {
      const { parts: names, rows, grow = 0, side } = s.region;
      const y0 = rowOf(rows[0], ctx.marks), y1 = rowOf(rows[1], ctx.marks);
      for (let y = y0; y <= y1; y++) {
        const row = new Uint8Array(W);
        for (const n of names) {
          const m = ctx.masks?.[n];
          if (!m) throw new Error(`region: no body part "${n}"`);
          for (let x = 0; x < W; x++) if (m[y * W + x]) row[x] = 1;
        }
        for (let x = 0; x < W; x++) {
          let on = row[x];
          for (let k = 1; k <= grow && !on; k++) on = row[x - k] || row[x + k];
          if (side === 'left' ? x > CX : side === 'right' ? x < CX : false) on = 0;
          if (on) put(x, y, mat, lvl, parts[0], x);
        }
      }
    } else if (s.ascii) {
      const [c, r] = s.at ?? [0, 0], dx = rowOf(c, ctx.cols ?? {}), y0 = rowOf(r, ctx.marks);
      s.ascii.replace(/\n$/, '').split('\n').forEach((line, j) => {
        [...line].forEach((ch, i) => {
          if (ch === '.' || ch === ' ') return;
          let m, l;
          if (ch === 'x') [m, l] = [-2, -1];
          else if (legend[ch]) [m, l] = matRef(kit, legend[ch]);
          else throw new Error(`ascii: no legend entry for "${ch}"`);
          const x = CX + dx + i, y = y0 + j;
          put(x, y, m, l, parts[0], x);
          if (s.mirror) put(2 * CX - x, y, m, l, parts[1], x);
        });
      });
    } else throw new Error(`shape has no geometry: ${JSON.stringify(s).slice(0, 80)}`);
  }
  shade(kit, L, ctx.seed);
  return L;
}

/** Fill automatic levels: base tone, darker part edges (less on top edges), speckle. */
function shade(kit, L, seed) {
  const dist = new Uint8Array(W * H), q = [];
  const same = (p, x, y) => x >= 0 && x < W && y >= 0 && y < H && L.mat[y * W + x] >= 0 && L.part[y * W + x] === L.part[p];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (L.mat[p] < 0) continue;
    if (N4.some(([dx, dy]) => !same(p, x + dx, y + dy))) { dist[p] = 1; q.push(p); }
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i], x = p % W, y = (p / W) | 0;
    for (const [dx, dy] of N4) {
      const n = (y + dy) * W + x + dx;
      if (same(p, x + dx, y + dy) && !dist[n]) { dist[n] = dist[p] + 1; q.push(n); }
    }
  }
  for (let p = 0; p < W * H; p++) {
    if (L.mat[p] < 0 || L.lvl[p] >= 0) continue;
    const m = kit.pal.materials[kit.mats[L.mat[p]]], x = p % W, y = (p / W) | 0;
    const [e1 = 0, e2 = 0] = m.edge ?? [];
    // edge darkening is ragged by default: mostly small, now and then a much darker pixel
    // (mean = edge value); rag: 0 makes it even
    const rag = m.rag === 0 ? 1 : 4 * hash(L.nx[p], y, seed + 1) ** 3;
    let t = m.tone ?? 3;
    if (dist[p] === 1) {
      const sideOrBottom = !same(p, x - 1, y) || !same(p, x + 1, y) || !same(p, x, y + 1);
      t -= e1 * rag * (sideOrBottom ? 1 : m.top ?? 0.3);
    } else if (dist[p] === 2) t -= e2 * rag;
    t += (m.noise ?? 0) * (hash(L.nx[p], y, seed) - 0.5);
    L.lvl[p] = Math.max(0, Math.min(4, Math.round(t)));
    L.auto[p] = 1;
  }
}

// ---------- colour and compose ----------

const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Ramp (5 colours, dark -> light) for a material of a piece: look override > piece default > palette default. */
function rampFor(kit, piece, matName, look = {}) {
  const name = look[`${piece.id}.${matName}`] ?? look[matName] ?? piece.colors[matName] ?? kit.pal.materials[matName].ramp;
  const ramp = kit.pal.ramps[name];
  if (!ramp) throw new Error(`unknown ramp "${name}"`);
  return ramp.map(rgb);
}

/**
 * pieces: results of buildPiece. look: colour overrides { hair: "hair_black", "under/briefs.cloth": "red" }.
 * Returns { w, h, rgba }.
 */
export function compose(kit, pieces, look = {}) {
  const heldSlots = kit.pal.item_outline?.slots ?? [];
  const stack = [];
  for (const pc of pieces) {
    for (const [name, L] of Object.entries(pc.layers)) {
      const ramps = kit.mats.map(m => (L.mat.includes(kit.matId[m]) ? rampFor(kit, pc, m, look) : null));
      stack.push({ z: { back: pc.backZ, front: pc.frontZ }[name] ?? pc.z, cast: pc.cast, L, ramps, held: heldSlots.includes(pc.id.split('/')[0]) });
    }
  }
  stack.sort((a, b) => a.z - b.z);
  const top = new Int16Array(W * H).fill(-1);
  stack.forEach((s, i) => { for (let p = 0; p < W * H; p++) if (s.L.mat[p] >= 0) top[p] = i; });
  const out = new Uint8ClampedArray(W * H * 4);
  const outline = rgb(kit.pal.outline);
  const set = (p, c) => { out.set(c, p * 4); out[p * 4 + 3] = 255; };
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p / W) | 0, i = top[p];
    if (i < 0) {
      if (N4.some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && X < W && Y >= 0 && Y < H && top[Y * W + X] >= 0; })) set(p, outline);
      continue;
    }
    const { L, ramps } = stack[i];
    let lv = L.lvl[p];
    // contact shadow: a casting piece right beside this pixel darkens it one level
    if (L.auto[p] && [x - 1, x + 1].some(X => X >= 0 && X < W && top[y * W + X] > i && stack[top[y * W + X]].cast)) lv -= 1;
    const ramp = ramps[L.mat[p]];
    set(p, ramp[Math.max(0, Math.min(ramp.length - 1, lv))]);
  }
  if (stack.some(s => s.held)) itemOutline(kit, stack, top, out, set);
  return { w: W, h: H, rgba: out };
}

/**
 * Held items (palette.yaml `item_outline`: weapons, off-hand things) get a 1 px ring so they read
 * apart from the figure behind them: every pixel next to the item that is not the item takes the ring
 * colour, on the body as well as outside it. A ring lighter than the outline also moves the dark
 * outline out around itself; a ring in the outline colour simply outlines the item over the body.
 */
function itemOutline(kit, stack, top, out, set) {
  const isHeld = p => top[p] >= 0 && stack[top[p]].held;
  const near = (p, f) => { const x = p % W, y = (p / W) | 0; return N4.some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && X < W && Y >= 0 && Y < H && f(Y * W + X); }); };
  const ring = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (!isHeld(p) && near(p, isHeld)) ring[p] = 1;
  const light = rgb(kit.pal.item_outline.colour), dark = rgb(kit.pal.outline);
  for (let p = 0; p < W * H; p++) if (ring[p]) set(p, light);
  if (kit.pal.item_outline.colour === kit.pal.outline) return;
  // the ring may stick out past the silhouette: outline it so it never melts into a light background
  for (let p = 0; p < W * H; p++) if (!ring[p] && top[p] < 0 && near(p, q => ring[q] && top[q] < 0)) set(p, dark);
}

/**
 * Colour overrides of a look: its choices (palette.yaml `choices`, e.g. { skin: "honey" } sets the
 * skin, lip and blush ramps), then its own colors on top.
 */
export function lookColours(kit, look) {
  const out = {};
  for (const [group, name] of Object.entries(look.choices ?? {})) {
    const set = kit.pal.choices?.[group]?.[name];
    if (!set) throw new Error(`no ${group} choice "${name}" in palette.yaml`);
    Object.assign(out, set);
  }
  return { ...out, ...(look.colors ?? {}) };
}

/** Convenience: build and compose a look { body, pieces: [...ids], face, choices, colors }. */
export function renderLook(kit, look) {
  const pcs = ['body', ...(look.pieces ?? [])].map(id =>
    buildPiece(kit, id, look.body, { variant: id.startsWith('face/') ? look.face : undefined }));
  applyHides(kit, pcs, look.body);
  return compose(kit, pcs, lookColours(kit, look));
}

/**
 * A piece with `hides: { pieces: [hair, horns], above: head+3 }` (hats) erases the pixels of those
 * slots' pieces above that row, in every layer, so a topknot or horns do not poke through the
 * crown while the hair below the brim still shows. Changes the built pieces in place.
 */
export function applyHides(kit, pcs, bodyKey) {
  const { marks } = bodyOf(kit, bodyKey);
  for (const pc of pcs) {
    const h = kit.pieces[pc.id]?.hides;
    if (!h) continue;
    const y1 = rowOf(h.above, marks);
    for (const other of pcs) {
      if (other === pc || !h.pieces.some(s => other.id.startsWith(`${s}/`))) continue;
      for (const L of Object.values(other.layers)) for (let p = 0; p < y1 * W; p++) { L.mat[p] = -1; L.lvl[p] = -1; }
    }
  }
}

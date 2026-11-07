// The Voxel Realm portrait studio, ported to JS (char_portrait.gd + mesher.gd + voxel.gdshader): a front
// orthographic view of the voxel character with one pixel per head voxel, the voxel grid on the pixel grid,
// greedy-meshed faces with per-vertex ambient occlusion, the voxel shader's lighting under the studio sun and
// sky, then a one-pixel dark outline.
import { RNG, toByte, linearToSrgb, half, clamp, round } from './gd.mjs';
import { FLAGS, KINDS, EMISSION, K_GLOW, F_OPAQUE, F_VISIBLE } from './pal.mjs';

export const OUTLINE = [43, 40, 64];
const E = 0.006;                        // quads overlap by a hair (mesher.gd)
const VARIATION = 0.03;                 // characters' material (VoxelMats.get_mat(VS, false, 0.03))
const AMB_SKY = [0.5, 0.52, 0.6];
const AMB_GROUND = [0.36, 0.34, 0.36];
const SUN_ENERGY = 0.95;
// the studio sun, rotation_degrees (-24, 14, 0): the direction toward the light
const SUN = (() => {
  const rx = -24 * Math.PI / 180, ry = 14 * Math.PI / 180;
  const v = [0, Math.sin(rx), -Math.cos(rx)];               // Rx * (0, 0, -1)
  const d = [Math.sin(ry) * v[2], v[1], Math.cos(ry) * v[2]]; // Ry * v
  return [-d[0], -d[1], -d[2]];
})();

// ---------------------------------------------------------------- the noise texture (VoxelMats.detail_noise)

let NOISE_B = null;
function noiseB() {
  if (!NOISE_B) {
    const rng = new RNG(20261014);
    NOISE_B = new Uint8Array(256 * 256);
    for (let i = 0; i < NOISE_B.length; i++) NOISE_B[i] = (rng.randi() >>> 16) & 0xff;
  }
  return NOISE_B;
}
const gmod = (x, y) => x - y * Math.floor(x / y);
function hash13(cx, cy, cz) {
  const px = cx + 17, py = cy + 17, pz = cz + 17;
  const ix = gmod(px + py * 41, 256), iy = gmod(pz + py * 89, 256);
  return noiseB()[iy * 256 + ix] / 255;
}

// ---------------------------------------------------------------- mesher: the faces turned to the camera (-z)

const opaque = id => (FLAGS[id] & F_OPAQUE) ? 1 : 0;
const visible = id => (FLAGS[id] & F_VISIBLE) !== 0;

/** Greedy quads of the -z faces, in the mesher's order: [plane, u0, v0, w, h, id, ao]. */
export function frontQuads(vd) {
  const nx = vd.sx, ny = vd.sy, nz = vd.sz;
  const Px = nx + 2, Py = ny + 2, Pz = nz + 2;
  const pad = new Uint8Array(Px * Py * Pz);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const id = vd.get(x, y, z);
    if (id) pad[(x + 1) + (z + 1) * Px + (y + 1) * Px * Pz] = id;
  }
  const su = 1, sv = Px * Pz, sa = Px;
  const off = -sa;
  const nu = nx, nv = ny;
  const mask = new Int32Array(nu * nv);
  const out = [];
  for (let i = 0; i < nz; i++) {
    let any = false;
    let mi = 0;
    for (let kv = 0; kv < nv; kv++) {
      const base = (1 + i) * sa + (1 + kv) * sv + su;
      for (let ju = 0; ju < nu; ju++) {
        const idx = base + ju * su;
        const b = pad[idx];
        mask[mi] = 0;
        if (b !== 0 && visible(b)) {
          const nb = pad[idx + off];
          if (!opaque(nb)) {
            const q = idx + off;
            const s0 = opaque(pad[q - su]), s1 = opaque(pad[q + su]);
            const t0 = opaque(pad[q - sv]), t1 = opaque(pad[q + sv]);
            const a0 = s0 && t0 ? 0 : 3 - (s0 + t0 + opaque(pad[q - su - sv]));
            const a1 = s1 && t0 ? 0 : 3 - (s1 + t0 + opaque(pad[q + su - sv]));
            const a2 = s1 && t1 ? 0 : 3 - (s1 + t1 + opaque(pad[q + su + sv]));
            const a3 = s0 && t1 ? 0 : 3 - (s0 + t1 + opaque(pad[q - su + sv]));
            mask[mi] = b | ((a0 | (a1 << 2) | (a2 << 4) | (a3 << 6)) << 8) | (1 << 16);
            any = true;
          }
        }
        mi++;
      }
    }
    if (!any) continue;
    for (let kv = 0; kv < nv; kv++) {
      let ju = 0;
      while (ju < nu) {
        const m = mask[ju + kv * nu];
        if (m === 0) { ju++; continue; }
        let wq = 1;
        while (ju + wq < nu && mask[ju + wq + kv * nu] === m) wq++;
        let hq = 1;
        let done = false;
        while (kv + hq < nv) {
          const row = (kv + hq) * nu;
          for (let t = 0; t < wq; t++) if (mask[ju + t + row] !== m) { done = true; break; }
          if (done) break;
          hq++;
        }
        for (let hh = 0; hh < hq; hh++) {
          const row2 = (kv + hh) * nu;
          for (let t = 0; t < wq; t++) mask[ju + t + row2] = 0;
        }
        out.push([i, ju, kv, wq, hq, m & 0xff, (m >> 8) & 0xff]);
        ju += wq;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- shading (voxel.gdshader under the studio)

export function shade(rgb8, kindId, aoLin, h) {
  const a0 = 0.45 + (1.0 - 0.45) * aoLin;
  const a = a0 * a0 * (3.0 - 2.0 * a0);
  const albedoK = 0.62 + (1.0 - 0.62) * a;
  const ndl = SUN[2];                                   // front faces: normal +z toward the camera
  const d = clamp((ndl + 0.1) / 1.1, 0, 1);
  const direct = SUN_ENERGY * d * (1.0 + (a - 1.0) * 0.3);  // AO_LIGHT_AFFECT = 0.3
  const glow = KINDS[kindId] === K_GLOW ? (toByte(clamp(EMISSION[kindId] / 4.0, 0, 1)) / 255) * 4.0 * 0.6 : 0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const col = Math.pow(rgb8[c] / 255, 2.2) * (1.0 + (h - 0.5) * 2.0 * VARIATION);
    const albedo = col * albedoK;
    const hemi = AMB_GROUND[c] + (AMB_SKY[c] - AMB_GROUND[c]) * 0.5;
    const lin = albedo * direct + albedo * hemi * a + col * glow;
    out[c] = Math.round(linearToSrgb(half(lin, true)) * 255);
  }
  return out;
}

// ---------------------------------------------------------------- the camera and the raster

/** Draw order, which settles faces at exactly the same depth (a hair strand flush with a sleeve): the body's meshes
 *  first, then the head material's (head, hair, helm, horns, tail, acc), each in mesh creation order; an expression
 *  makes a new head mesh after the others. Checked against the baked creator sprites. */
export function drawOrder(parts, expr) {
  const headGroup = ['head', 'hair', 'helm', 'horns', 'tail', 'acc'];
  const h = parts.filter(p => headGroup.includes(p.name));
  if (expr) {
    const i = h.findIndex(p => p.name === 'head');
    if (i >= 0) h.push(h.splice(i, 1)[0]);
  }
  return [...parts.filter(p => !headGroup.includes(p.name)), ...h];
}

/** The head's box in world space (CharPortrait.frame uses it to put the voxel grid on the pixel grid). */
function headBox(model) {
  const hp = model.parts.find(p => p.name === 'head');
  const vd = hp.vd;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let y = 0; y < vd.sy; y++) for (let z = 0; z < vd.sz; z++) for (let x = 0; x < vd.sx; x++) {
    if (!vd.get(x, y, z)) continue;
    lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); lo[2] = Math.min(lo[2], z);
    hi[0] = Math.max(hi[0], x + 1); hi[1] = Math.max(hi[1], y + 1); hi[2] = Math.max(hi[2], z + 1);
  }
  const toWorld = (v, axis) => {
    const m = hp.joint[axis] * 0.03125 + hp.scale * (v - hp.anchor[axis]) * vd.voxelSize;
    return model.rigScale * m;
  };
  // rotated by PI round y: world x = -x
  const x0 = -toWorld(hi[0] + E, 0), x1 = -toWorld(lo[0] - E, 0);
  const y0 = toWorld(lo[1] - E, 1), y1 = toWorld(hi[1] + E, 1);
  return { pos: [x0, y0], size: [x1 - x0, y1 - y0] };
}

/**
 * Renders a character into a w x h RGBA buffer the way CharPortrait does (before the crop).
 * centre: the world point to aim at instead of the head (still snapped so the voxel grid sits on the pixels).
 * For debugging: trace[] gets each pixel's shading inputs, frags[] every fragment drawn there, and order
 * replaces drawOrder.
 * Returns { w, h, rgba, X0, Y1, vs, eyeY, headPx }.
 */
export function render(model, { w = 48, h = 48, expr = '', trace = null, frags = null, order = null, centre = null } = {}) {
  const vs = model.pixel;
  const ab = headBox(model);
  const halfW = w * vs * 0.5, halfH = h * vs * 0.5;
  // the camera looks at the head (portraits) or at a given world point, always with the voxel grid on the pixels
  const cxm = centre ? centre[0] : ab.pos[0] + ab.size[0] * 0.5, cym = centre ? centre[1] : ab.pos[1] + ab.size[1] * 0.5;
  const cx = ab.pos[0] - round((ab.pos[0] - (cxm - halfW)) / vs) * vs + halfW;
  const cy = ab.pos[1] - round((ab.pos[1] - (cym - halfH)) / vs) * vs + halfH;
  const X0 = cx - halfW, Y1 = cy + halfH;
  const eyeWorld = ab.pos[1] + ab.size[1] * 0.45;

  const rgba = new Uint8ClampedArray(w * h * 4);
  const depth = new Float64Array(w * h).fill(-Infinity);
  const rs = model.rigScale;
  for (const part of (order ? order(model.parts, expr) : drawOrder(model.parts, expr))) {
    const vd = part.vd, pv = vd.voxelSize, k = part.scale, an = part.anchor;
    const jx = part.joint[0] * 0.03125, jy = part.joint[1] * 0.03125, jz = part.joint[2] * 0.03125;
    // local voxel coordinate <-> screen
    const sx = lx => (-rs * (jx + k * (lx - an[0]) * pv) - X0) / vs;
    const sy = ly => (Y1 - rs * (jy + k * (ly - an[1]) * pv)) / vs;
    const lxOf = px => ((-(X0 + px * vs) / rs) - jx) / (k * pv) + an[0];
    const lyOf = py => ((Y1 - py * vs) / rs - jy) / (k * pv) + an[1];
    const pal8 = model.pal8 ?? (model.pal8 = model.pal.map(c => (c ? c.map(toByte) : null)));
    for (const [plane, u0, v0, qw, qh, id, aov] of frontQuads(vd)) {
      const z = -rs * (jz + k * (plane - an[2]) * pv);   // world z (nearer = larger)
      const ua = u0 - E, ub = u0 + qw + E, va = v0 - E, vb = v0 + qh + E;
      const ao = [aov & 3, (aov >> 2) & 3, (aov >> 4) & 3, (aov >> 6) & 3].map(v => v / 3);
      const flip = ao[0] + ao[2] < ao[1] + ao[3];
      const pxa = sx(ub), pxb = sx(ua), pya = sy(vb), pyb = sy(va);
      const i0 = Math.max(0, Math.ceil(pxa - 0.5)), i1 = Math.min(w - 1, Math.floor(pxb - 0.5));
      const j0 = Math.max(0, Math.ceil(pya - 0.5)), j1 = Math.min(h - 1, Math.floor(pyb - 0.5));
      const cz = Math.floor(plane - an[2] + 0.5);
      for (let j = j0; j <= j1; j++) {
        const ly = lyOf(j + 0.5);
        if (!(ly > va && ly < vb)) continue;
        const t = (ly - va) / (vb - va);
        for (let i = i0; i <= i1; i++) {
          const lx = lxOf(i + 0.5);
          if (!(lx > ua && lx < ub)) continue;
          const pi = j * w + i;
          if (frags) (frags[pi] ??= []).push({ part: part.name, z, id, plane });
          if (z < depth[pi]) continue;
          const s = (lx - ua) / (ub - ua);
          let aoLin;
          if (!flip) aoLin = t <= s ? ao[0] * (1 - s) + ao[1] * (s - t) + ao[2] * t : ao[0] * (1 - t) + ao[2] * s + ao[3] * (t - s);
          else aoLin = s + t <= 1 ? ao[0] * (1 - s - t) + ao[1] * s + ao[3] * t : ao[1] * (1 - t) + ao[2] * (s + t - 1) + ao[3] * (1 - s);
          const hh = hash13(Math.floor(lx - an[0]), Math.floor(ly - an[1]), cz);
          const c = shade(pal8[id], id, aoLin, hh);
          if (trace) trace[pi] = { part: part.name, rgb8: pal8[id], id, aoLin, h: hh };
          depth[pi] = z;
          rgba[pi * 4] = c[0]; rgba[pi * 4 + 1] = c[1]; rgba[pi * 4 + 2] = c[2]; rgba[pi * 4 + 3] = 255;
        }
      }
    }
  }
  return {
    w, h, rgba, X0, Y1, vs,
    eyeY: round((Y1 - eyeWorld) / vs),
    headPx: { x: (ab.pos[0] - X0) / vs, y: (Y1 - (ab.pos[1] + ab.size[1])) / vs, w: ab.size[0] / vs, h: ab.size[1] / vs },
  };
}

// ---------------------------------------------------------------- the sprite

export function crop(img, nw, nh, left, top) {
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = x + left, sy = y + top;
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    for (let c = 0; c < 4; c++) out[(y * nw + x) * 4 + c] = img.rgba[(sy * img.w + sx) * 4 + c];
  }
  return { w: nw, h: nh, rgba: out };
}

/** Image.get_used_rect: the box round every pixel with any alpha. */
export function usedRect(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!img.rgba[(y * img.w + x) * 4 + 3]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** CharPortrait.crop: an n x n sprite round the face, the eyes on a fixed row; portraits (n >= 32) are centred on
 *  the camera, smaller face icons on what was drawn. */
export function portraitCrop(img, n, eyeY) {
  const eyeRow = n >= 32 ? round(n * 0.47) : round(n * 0.55);
  const top = clamp(eyeY - eyeRow, 0, img.h - n);
  const used = usedRect(img);
  let cx = used.x + Math.trunc(used.w / 2);
  if (n >= 32) cx = Math.trunc(img.w / 2);
  const left = clamp(cx - Math.trunc(n / 2), 0, img.w - n);
  return crop(img, n, n, left, top);
}

/** A one-pixel dark outline round everything solid (4-neighbour). */
export function outline(img, color = OUTLINE) {
  const { w, h } = img;
  const src = img.rgba.slice();
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) {
      const i = (y * w + x) * 4;
      img.rgba[i] = color[0]; img.rgba[i + 1] = color[1]; img.rgba[i + 2] = color[2]; img.rgba[i + 3] = 255;
    }
  }
  return img;
}

export function scale(img, k) {
  const w = img.w * k, h = img.h * k;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (Math.trunc(y / k) * img.w + Math.trunc(x / k)) * 4, di = (y * w + x) * 4;
    out[di] = img.rgba[si]; out[di + 1] = img.rgba[si + 1]; out[di + 2] = img.rgba[si + 2]; out[di + 3] = img.rgba[si + 3];
  }
  return { w, h, rgba: out };
}

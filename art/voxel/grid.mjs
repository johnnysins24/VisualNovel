// Voxel grids, ported from Voxel Realm: VoxelData (one byte per voxel), Models.B (a model being drawn) and
// CharModels.P (paint through an offset so parts can use negative coordinates).
import { RNG } from './gd.mjs';

export class VoxelData {
  constructor(sx, sy, sz, voxelSize) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.voxelSize = voxelSize;
    this.v = new Uint8Array(sx * sy * sz);
  }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.v[x + this.sx * (z + this.sz * y)];
  }
  set(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.v[x + this.sx * (z + this.sz * y)] = id;
  }
  fill(x0, y0, z0, x1, y1, z1, id) {
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1);
    const ly = Math.min(y0, y1), hy = Math.max(y0, y1);
    const lz = Math.min(z0, z1), hz = Math.max(z0, z1);
    for (let y = ly; y <= hy; y++) for (let z = lz; z <= hz; z++) for (let x = lx; x <= hx; x++) this.set(x, y, z, id);
  }
}

/** Models.B: a model of sx * sy * sz voxels with its own RNG and an anchor (voxels) for the mesh origin. */
export class B {
  constructor(sx, sy, sz, vs, seed = 1) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.vd = new VoxelData(sx, sy, sz, vs);
    this.rng = new RNG(seed);
    this.anchor = null;
  }
  s(x, y, z, id) { this.vd.set(x, y, z, id); }
  g(x, y, z) { return this.vd.get(x, y, z); }
  box(x0, y0, z0, x1, y1, z1, id) { this.vd.fill(x0, y0, z0, x1, y1, z1, id); }
}

/** CharModels.P: paints into a B through an offset. */
export class P {
  constructor(b, o) { this.b = b; this.o = o; }
  s(x, y, z, id) { this.b.s(x + this.o[0], y + this.o[1], z + this.o[2], id); }
  g(x, y, z) { return this.b.g(x + this.o[0], y + this.o[1], z + this.o[2]); }
  box(x0, y0, z0, x1, y1, z1, id) {
    const o = this.o;
    this.b.box(x0 + o[0], y0 + o[1], z0 + o[2], x1 + o[0], y1 + o[1], z1 + o[2], id);
  }
  /** Box with the four vertical edges removed. */
  rbox(x0, y0, z0, x1, y1, z1, id) {
    const round = x1 - x0 >= 2 && z1 - z0 >= 2;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (round && (x === x0 || x === x1) && (z === z0 || z === z1)) continue;
      this.s(x, y, z, id);
    }
  }
  /** Recolour voxels that already exist inside the box. */
  tint(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (this.g(x, y, z) !== 0) this.s(x, y, z, id);
    }
  }
  /** Fill only empty cells. */
  add(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (this.g(x, y, z) === 0) this.s(x, y, z, id);
    }
  }
  front(x, y) {
    for (let z = -this.o[2]; z < this.b.sz - this.o[2]; z++) if (this.g(x, y, z) !== 0) return z;
    return 99;
  }
  face(x0, y0, x1, y1, id) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const z = this.front(x, y);
      if (z !== 99) this.s(x, y, z, id);
    }
  }
  back(x, y) {
    for (let z = this.b.sz - this.o[2] - 1; z > -this.o[2] - 1; z--) if (this.g(x, y, z) !== 0) return z;
    return -99;
  }
}

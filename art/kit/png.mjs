// Minimal PNG read/write: any non-interlaced PNG in, 8-bit RGBA out, no dependencies.
import { deflateSync, inflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** channels per pixel for each PNG colour type */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** img: { w, h, rgba } -> PNG bytes */
export function encodePNG(img) {
  const { w, h, rgba } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let i = 0; i < w * 4; i++) raw[y * (w * 4 + 1) + 1 + i] = rgba[y * w * 4 + i];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Adam7 passes of an interlaced PNG: [first column, first row, column step, row step]
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/**
 * PNG bytes -> { w, h, rgba }. Reads truecolour (RGB, RGBA), grey, grey + alpha and palette PNGs at
 * 1 to 16 bits (16-bit samples keep their high byte), with tRNS transparency, interlaced or not.
 * About half of the Dungeon Crawl tiles are palette PNGs and a few dozen are interlaced.
 */
export function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 8, interlaced = false, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; interlaced = data[12] === 1;
      if (!(ct in CHANNELS) || ![1, 2, 4, 8, 16].includes(bd) || data[12] > 1) throw new Error('unsupported PNG');
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (ct === 3 && !plte) throw new Error('palette PNG without a palette');
  const ch = CHANNELS[ct], bpp = Math.max(1, (ch * bd) >> 3), max = (1 << bd) - 1;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(w * h * 4);
  let at = 0; // read position in the inflated data
  for (const [x0, y0, dx, dy] of interlaced ? ADAM7 : [[0, 0, 1, 1]]) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * ch * bd) / 8), px = Buffer.alloc(stride * ph);
    for (let y = 0; y < ph; y++) {
      const f = raw[at], src = at + 1, dst = y * stride;
      for (let i = 0; i < stride; i++) {
        const x = raw[src + i];
        const a = i >= bpp ? px[dst + i - bpp] : 0;
        const b = y > 0 ? px[dst - stride + i] : 0;
        const c = i >= bpp && y > 0 ? px[dst - stride + i - bpp] : 0;
        let v;
        if (f === 0) v = x;
        else if (f === 1) v = x + a;
        else if (f === 2) v = x + b;
        else if (f === 3) v = x + ((a + b) >> 1);
        else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        px[dst + i] = v & 0xff;
      }
      at += stride + 1;
    }
    // channel k of pixel x on row y of this pass, at the file's own bit depth
    const value = (y, x, k) => {
      const n = x * ch + k;
      if (bd === 16) return px.readUInt16BE(y * stride + n * 2);
      if (bd === 8) return px[y * stride + n];
      return (px[y * stride + ((n * bd) >> 3)] >> (8 - bd - ((n * bd) & 7))) & max;
    };
    const byte = (y, x, k) => (bd === 16 ? value(y, x, k) >> 8 : bd === 8 ? value(y, x, k) : Math.round((value(y, x, k) * 255) / max));
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const o = ((y0 + y * dy) * w + x0 + x * dx) * 4;
      if (ct === 3) {
        const i = value(y, x, 0);
        if (i * 3 + 2 >= plte.length) throw new Error('palette index out of range');
        rgba[o] = plte[i * 3]; rgba[o + 1] = plte[i * 3 + 1]; rgba[o + 2] = plte[i * 3 + 2];
        rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (ct === 0 || ct === 4) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = byte(y, x, 0);
        rgba[o + 3] = ct === 4 ? byte(y, x, 1) : trns && trns.length >= 2 && value(y, x, 0) === trns.readUInt16BE(0) ? 0 : 255;
      } else {
        for (let k = 0; k < 3; k++) rgba[o + k] = byte(y, x, k);
        const keyed = ct === 2 && trns && trns.length >= 6 && [0, 1, 2].every(k => value(y, x, k) === trns.readUInt16BE(k * 2));
        rgba[o + 3] = ct === 6 ? byte(y, x, 3) : keyed ? 0 : 255;
      }
    }
  }
  return { w, h, rgba };
}

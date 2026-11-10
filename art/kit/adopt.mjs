// Adopt free icons (art/thirdparty/, see CREDITS.md) into the game's look: snap every colour to our
// ramps (art/palette.yaml + art/scenes/palette.yaml), draw the outline in #2b2840 and drop
// half-transparent pixels. Single-colour vector icons (game-icons.net SVGs) are drawn at `size` px
// (headless Chromium through Playwright, the only SVG renderer we have),
// filled with one ramp lit from the top left, then outlined the same way.
// List: art/adopted.yaml. Output: art/adopted/<id>.png and art/preview/adopted.png (source | adopted).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ART, readYaml } from './kit.mjs';
import { decodePNG, encodePNG } from './png.mjs';
import { oklab } from './colour.mjs';
import { crop, sheet, savePNG } from './sheet.mjs';

const hexRGB = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = (r, g, b) => [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

/** Every ramp colour we use, with its OKLab value. Skin, lips, blush, eyes and tears stay out. */
export function adoptPalette() {
  const sprite = readYaml('palette.yaml'), scene = readYaml('scenes/palette.yaml');
  const skip = /^(skin|lip|blush|eye|tear|lash|white)/;
  const hexes = new Set();
  for (const [k, ramp] of Object.entries(sprite.ramps)) if (!skip.test(k)) ramp.forEach(h => hexes.add(String(h)));
  for (const m of Object.values(scene.materials)) (m.ramp ?? []).forEach(h => hexes.add(String(h)));
  const outline = String(sprite.outline);
  hexes.delete(outline);
  return { outline, colours: [...hexes].map(h => ({ h, rgb: hexRGB(h), lab: oklab(h) })) };
}

function nearest(pal, rgb) {
  const L = oklab(toHex(...rgb));
  let best = pal.colours[0], bd = Infinity;
  for (const c of pal.colours) {
    // lightness counts double so shading steps survive the snap
    const d = 2 * (c.lab[0] - L[0]) ** 2 + (c.lab[1] - L[1]) ** 2 + (c.lab[2] - L[2]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.rgb;
}

const alphaAt = (img, x, y) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.rgba[(y * img.w + x) * 4 + 3]);

/** Snap colours, then outline: dark pixels on the silhouette edge and near-black inner lines. */
export function adoptPixels(img, pal) {
  const { w, h } = img, out = new Uint8ClampedArray(w * h * 4);
  const O = hexRGB(pal.outline), cache = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (img.rgba[i + 3] < 128) continue;
    const rgb = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
    const L = oklab(toHex(...rgb))[0];
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => alphaAt(img, x + dx, y + dy) < 128);
    let c;
    if (L < 0.3 || (edge && L < 0.45)) c = O;
    else { const k = rgb.join(); c = cache.get(k) ?? nearest(pal, rgb); cache.set(k, c); }
    out.set([...c, 255], i);
  }
  // close the outline where the source had none (light pixels touching the outside)
  const res = { w, h, rgba: out };
  addOutline(res, O);
  return res;
}

/** Any filled pixel touching transparency that is not outline yet gets a 1 px outline outside it. */
function addOutline(img, O) {
  const { w, h, rgba } = img, src = new Uint8ClampedArray(rgba);
  const isO = i => src[i] === O[0] && src[i + 1] === O[1] && src[i + 2] === O[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3]) continue;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) return false;
      const j = (Y * w + X) * 4;
      return src[j + 3] && !isO(j);
    });
    if (touches) rgba.set([...O, 255], i);
  }
}

/** Draw one-colour SVGs at their sizes in one headless Chromium; returns { path: {w, h, rgba} }. */
export async function rasterSvgs(jobs) {
  const out = {};
  if (!jobs.length) return out;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
  try {
    const page = await browser.newPage();
    for (const { path, size } of jobs) {
      const svg = readFileSync(path, 'utf8');
      if (/<script|\son[a-z]+=|href=/i.test(svg)) throw new Error(`refusing SVG with scripts or links: ${path}`);
      const data = await page.evaluate(async ({ svg, size }) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(svg);
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, size, size);
        return Array.from(g.getImageData(0, 0, size, size).data);
      }, { svg, size });
      out[path] = { w: size, h: size, rgba: Uint8ClampedArray.from(data) };
    }
  } finally { await browser.close(); }
  return out;
}

/** Fill a drawn silhouette with a ramp lit from the top left, then outline it. */
function fillSilhouette(img, ramp, pal) {
  const cols = (readYaml('palette.yaml').ramps[ramp] ?? []).map(h => hexRGB(String(h)));
  if (!cols.length) throw new Error(`no ramp ${ramp}`);
  const { w, h } = img, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (img.rgba[i + 3] < 128) continue;
    const lit = alphaAt(img, x - 1, y) < 128 || alphaAt(img, x, y - 1) < 128;
    const dark = alphaAt(img, x + 1, y) < 128 || alphaAt(img, x, y + 1) < 128;
    const t = 1 - (x + y) / (w + h); // 1 top left .. 0 bottom right
    let lv = Math.round(1 + t * 2);
    if (lit && !dark) lv = 4; else if (dark && !lit) lv = 0;
    out.set([...cols[Math.min(cols.length - 1, lv)], 255], i);
  }
  const padded = crop({ w, h, rgba: out }, { x: -1, y: -1, w: w + 2, h: h + 2 }); // room for the outline
  addOutline(padded, hexRGB(pal.outline));
  return padded;
}

/** Source image for an entry, before adopting (for the preview). */
function sourceOf(e) {
  const p = join(ART, 'thirdparty', e.from);
  if (!existsSync(p)) throw new Error(`missing ${e.from}`);
  if (p.endsWith('.svg')) return null;
  const img = decodePNG(readFileSync(p));
  // drop: exact colours to clear first, e.g. the pure black drop shadows of the Dungeon Crawl tiles
  for (const h of e.drop ?? []) {
    const [r, g, b] = hexRGB(String(h));
    for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i] === r && img.rgba[i + 1] === g && img.rgba[i + 2] === b) img.rgba[i + 3] = 0;
  }
  return e.cell ? crop(img, { x: e.cell[0], y: e.cell[1], w: e.cell[2], h: e.cell[3] }) : img;
}

const svgJob = e => ({ path: join(ART, 'thirdparty', e.from), size: e.size ?? 28 });

/** Adopt every entry of a list: { id: {w, h, rgba} }. */
export async function adoptAll(list, pal = adoptPalette()) {
  const svgs = await rasterSvgs(Object.values(list).filter(e => e.from.endsWith('.svg')).map(svgJob));
  const out = {};
  for (const [id, e] of Object.entries(list)) {
    out[id] = e.from.endsWith('.svg') ? fillSilhouette(svgs[svgJob(e).path], e.ramp ?? 'metal_iron', pal) : adoptPixels(sourceOf(e), pal);
  }
  return out;
}

export function loadAdopted() {
  return readYaml('adopted.yaml');
}

// CLI: node art/kit/adopt.mjs  -> writes every icon in adopted.yaml and the preview
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const list = loadAdopted(), done = await adoptAll(list);
  mkdirSync(join(ART, 'adopted'), { recursive: true });
  const rows = [];
  let row = [];
  for (const [id, e] of Object.entries(list)) {
    const img = done[id];
    writeFileSync(join(ART, 'adopted', `${id}.png`), encodePNG(img));
    row.push(sourceOf(e) ?? { w: img.w, h: img.h, rgba: new Uint8ClampedArray(img.w * img.h * 4) }, img);
    if (row.length >= 16) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  savePNG(join(ART, 'preview', 'adopted.png'), sheet(rows, { scale: 3, gap: 6 }));
  console.log(`adopted ${Object.keys(list).length} icons -> art/adopted/, preview art/preview/adopted.png`);
}

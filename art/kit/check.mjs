// Script checks, so most mistakes show up as text before anyone has to look at an image.
import { loadKit, buildPiece, renderLook, readYaml, W, H } from './kit.mjs';
import { crop } from './sheet.mjs';
import { lockBare, lockFace, faceBox } from './lock.mjs';

export const FACES = ['smile', 'angry', 'surprised'];
const hexRGB = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const LETTER = { skin: 's', hair: 'h', eye: 'e', white: 'w', lash: 'k', lip: 'n', blush: 'p', cloth: 'c', trim: 't' };

/** pixel -> one letter for what it is (outline, skin, hair, eye...) by nearest palette colour. */
export function classifier(kit) {
  const cols = [[...hexRGB(kit.pal.outline), '#']];
  for (const [name, m] of Object.entries(kit.pal.materials)) for (const hx of kit.pal.ramps[m.ramp]) cols.push([...hexRGB(hx), LETTER[name] ?? '?']);
  for (const hx of kit.pal.ramps.sky) cols.push([...hexRGB(hx), 'c']);
  for (const hx of kit.pal.ramps.blue) cols.push([...hexRGB(hx), 't']);
  return (img, p) => {
    if (!img.rgba[p * 4 + 3]) return '.';
    let best = '?', bd = 1e9;
    for (const [r, g, b, l] of cols) {
      const d = (r - img.rgba[p * 4]) ** 2 + (g - img.rgba[p * 4 + 1]) ** 2 + (b - img.rgba[p * 4 + 2]) ** 2;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  };
}

/** Rows where a and b differ by pixel class: [{ y, a, b }]. */
export function diffRows(cls, a, b) {
  const rows = [];
  for (let y = 0; y < a.h; y++) {
    let sa = '', sb = '';
    for (let x = 0; x < a.w; x++) { sa += cls(a, y * a.w + x); sb += cls(b, y * b.w + x); }
    if (sa !== sb) rows.push({ y, a: sa, b: sb });
  }
  return rows;
}

/** Share of each shade level (0..4) per material, in %, by nearest ramp colour. */
export function levelMix(kit, cls, img, mats = ['skin', 'hair']) {
  const out = Object.fromEntries(mats.map(m => [m, [0, 0, 0, 0, 0]]));
  const byLetter = Object.fromEntries(mats.map(m => [LETTER[m], m]));
  for (let p = 0; p < img.w * img.h; p++) {
    const m = byLetter[cls(img, p)];
    if (!m) continue;
    const ramp = kit.pal.ramps[kit.pal.materials[m].ramp].map(hexRGB);
    let best = 0, bd = 1e9;
    ramp.forEach(([r, g, b], i) => { const d = (r - img.rgba[p * 4]) ** 2 + (g - img.rgba[p * 4 + 1]) ** 2 + (b - img.rgba[p * 4 + 2]) ** 2; if (d < bd) { bd = d; best = i; } });
    out[m][best]++;
  }
  for (const m of mats) { const n = out[m].reduce((a, b) => a + b, 0) || 1; out[m] = out[m].map(v => Math.round((100 * v) / n)); }
  return out;
}

export const colourCount = img => {
  const s = new Set();
  for (let p = 0; p < img.w * img.h; p++) if (img.rgba[p * 4 + 3]) s.add(img.rgba[p * 4] << 16 | img.rgba[p * 4 + 1] << 8 | img.rgba[p * 4 + 2]);
  return s.size;
};

/** Run every check. Returns { errors: [...], notes: [...] }. */
export function runChecks(kit = loadKit()) {
  const errors = [], notes = [];
  const looks = readYaml('looks.yaml');
  // every piece (and each of its variants) builds on every body
  for (const [id, spec] of Object.entries(kit.pieces)) {
    const variants = [...new Set((spec.shapes ?? []).map(s => s.variant).filter(Boolean))];
    for (const body of Object.keys(kit.bodies)) for (const variant of variants.length ? variants : [undefined]) {
      try { buildPiece(kit, id, body, { variant }); } catch (e) { errors.push(`${id} on ${body}${variant ? ` (${variant})` : ''}: ${e.message}`); }
    }
  }
  // looks: fit the canvas with room for the outline, stay within the colour budget
  for (const [name, look] of Object.entries(looks)) for (const face of FACES) {
    let img;
    try { img = renderLook(kit, { ...look, face }); } catch (e) { errors.push(`${name}: ${e.message}`); continue; }
    for (let p = 0; p < W * H; p++) {
      const x = p % W, y = (p / W) | 0;
      if (img.rgba[p * 4 + 3] && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { errors.push(`${name}: touches the canvas edge at ${x},${y}`); break; }
    }
    const n = colourCount(img);
    if (n > (kit.pal.budget ?? 48)) errors.push(`${name} (${face}): ${n} colours, budget ${kit.pal.budget ?? 48}`);
  }
  // the proof looks are the locked look
  const cls = classifier(kit);
  for (const body of ['m', 'f']) {
    const look = looks[`proof_${body}`];
    const d = diffRows(cls, lockBare(body), renderLook(kit, { ...look, face: 'smile' }));
    if (d.length) errors.push(`proof_${body} differs from the locked body on rows ${d.map(r => r.y).join(', ')}`);
    for (const face of FACES) {
      const f = diffRows(cls, lockFace(body, face), crop(renderLook(kit, { ...look, face }), faceBox(body)));
      if (f.length) errors.push(`proof_${body} ${face} face differs from the lock on portrait rows ${f.map(r => r.y).join(', ')}`);
    }
    const mix = levelMix(kit, cls, renderLook(kit, { ...look, face: 'smile' }));
    const lockMix = levelMix(kit, cls, lockBare(body));
    notes.push(`proof_${body} shade mix % (levels 0..4): skin ${mix.skin.join('/')} (lock ${lockMix.skin.join('/')}), hair ${mix.hair.join('/')} (lock ${lockMix.hair.join('/')})`);
  }
  return { errors, notes };
}

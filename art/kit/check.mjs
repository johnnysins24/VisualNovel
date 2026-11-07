// Script checks, so most mistakes show up as text before anyone has to look at an image.
import { loadKit, buildPiece, renderLook, readYaml, fitsBody, W, H } from './kit.mjs';
import { crop } from './sheet.mjs';
import { lockBare, lockFace, faceBox, EXPRESSIONS } from './lock.mjs';

/** Every expression of the locked look; each one is compared with the lock. */
export const FACES = EXPRESSIONS;
const hexRGB = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const LETTER = { skin: 's', hair: 'h', eye: 'e', white: 'w', lash: 'k', lip: 'n', blush: 'p', tear: 'r', cloth: 'c', trim: 't' };

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
  const looks = readYaml('looks.yaml'), hairList = readYaml('hair.yaml');
  // every piece (and each of its variants) builds on every body it is for; a piece in a folder named
  // after a body (hair/m/short) is for that body only and says so
  for (const [id, spec] of Object.entries(kit.pieces)) {
    const variants = [...new Set((spec.shapes ?? []).flatMap(s => s.variant ?? []))];
    if (id.startsWith('face/')) for (const v of variants) if (!FACES.includes(v)) errors.push(`${id}: unknown expression "${v}"`);
    const folder = id.split('/').slice(1, -1).find(s => s in kit.bodies);
    if (folder && spec.body !== folder) errors.push(`${id}: pieces in ${folder}/ need "body: ${folder}"`);
    for (const body of Object.keys(kit.bodies).filter(b => fitsBody(spec, b))) for (const variant of variants.length ? variants : [undefined]) {
      try { buildPiece(kit, id, body, { variant }); } catch (e) { errors.push(`${id} on ${body}${variant ? ` (${variant})` : ''}: ${e.message}`); }
    }
  }
  // hairstyles never hide the eyes, mouth, cheeks or tears of any expression (brows may sit under a fringe)
  const features = ['lash', 'white', 'eye', 'lip', 'blush', 'tear'].map(m => kit.matId[m]);
  for (const body of Object.keys(kit.bodies)) {
    const hairs = Object.keys(kit.pieces).filter(id => id.startsWith('hair/') && fitsBody(kit.pieces[id], body));
    const built = Object.fromEntries(hairs.map(id => [id, buildPiece(kit, id, body).layers.main]));
    for (const face of FACES) {
      const F = buildPiece(kit, 'face/basic', body, { variant: face }).layers.main;
      for (const id of hairs) {
        let n = 0;
        for (let p = 0; p < W * H; p++) if (features.includes(F.mat[p]) && built[id]?.mat[p] >= 0) n++;
        if (n) errors.push(`${id} on ${body} hides ${n} px of the ${face} face (eyes, mouth, cheeks)`);
      }
    }
  }
  // colour choices: each sets existing materials to existing ramps of the same length as the
  // material's own; a skin tone brings its own lips and blush
  for (const [group, sets] of Object.entries(kit.pal.choices ?? {})) for (const [name, set] of Object.entries(sets)) {
    for (const [mat, ramp] of Object.entries(set)) {
      if (!kit.pal.materials[mat]) errors.push(`choice ${group}.${name}: no material "${mat}"`);
      else if (!kit.pal.ramps[ramp]) errors.push(`choice ${group}.${name}: no ramp "${ramp}"`);
      else if (kit.pal.ramps[ramp].length !== kit.pal.ramps[kit.pal.materials[mat].ramp].length) errors.push(`choice ${group}.${name}: ramp "${ramp}" has ${kit.pal.ramps[ramp].length} colours, ${mat} needs ${kit.pal.ramps[kit.pal.materials[mat].ramp].length}`);
    }
    if (group === 'skin') for (const mat of ['skin', 'lip', 'blush']) if (!set[mat]) errors.push(`choice skin.${name}: sets no ${mat}`);
  }
  // hairstyle lists (hair.yaml): each body's list names exactly the pieces in hair/<body>/
  for (const body of Object.keys(kit.bodies)) {
    const listed = Object.keys(hairList[body] ?? {}).map(h => `hair/${body}/${h}`);
    const pieces = Object.keys(kit.pieces).filter(id => id.startsWith(`hair/${body}/`));
    for (const id of listed) if (!kit.pieces[id]) errors.push(`hair.yaml lists ${id} but there is no such piece`);
    for (const id of pieces) if (!listed.includes(id)) errors.push(`${id} is missing from hair.yaml`);
  }
  // every hairstyle on its body, worn with the proof look's other pieces and some colour choice,
  // is checked like the looks below (each colour choice gets used by some hairstyle)
  const hairLooks = {};
  const pick = (group, i) => { const names = Object.keys(kit.pal.choices?.[group] ?? {}); return names.length ? { [group]: names[i % names.length] } : {}; };
  for (const body of Object.keys(kit.bodies)) Object.keys(hairList[body] ?? {}).forEach((h, i) => {
    if (!kit.pieces[`hair/${body}/${h}`]) return; // reported above
    const base = looks[`proof_${body}`]?.pieces ?? [];
    hairLooks[`hair/${body}/${h}`] = { body, pieces: [...base.filter(id => !id.startsWith('hair/')), `hair/${body}/${h}`], choices: { ...pick('skin', i), ...pick('hair', i), ...pick('eyes', i) } };
  });
  // looks: fit the canvas with room for the outline, stay within the colour budget
  for (const [name, look] of Object.entries({ ...looks, ...hairLooks })) for (const face of FACES) {
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

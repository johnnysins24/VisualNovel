#!/usr/bin/env node
// Sprite kit CLI (run from the repo root).
//   node art/kit/build.mjs check        run the script checks (also part of npm test)
//   node art/kit/build.mjs proof [-v]   write art/preview/proof.png (bodies and the three faces of
//                                       the approved proof) and faces.png (all 17 expressions): the
//                                       kit next to the locked look; -v prints rows that differ
//   node art/kit/build.mjs look <name> [face]   write art/preview/<name>.png from art/looks.yaml
import { join } from 'node:path';
import { loadKit, renderLook, readYaml, ART } from './kit.mjs';
import { sheet, crop, savePNG } from './sheet.mjs';
import { lockBare, lockFace, faceBox } from './lock.mjs';
import { runChecks, classifier, diffRows, FACES } from './check.mjs';

const BODY_BOX = { x: 12, y: 38, w: 40, h: 58 }; // the figure without the empty canvas above it
const PROOF_FACES = ['smile', 'angry', 'surprised']; // the faces in the proof Phupha approved
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'check') {
  const { errors, notes } = runChecks();
  notes.forEach(n => console.log(n));
  errors.forEach(e => console.log('ERROR', e));
  console.log(errors.length ? `${errors.length} problem(s)` : 'all checks pass');
  process.exit(errors.length ? 1 : 0);
} else if (cmd === 'proof') {
  const kit = loadKit(), looks = readYaml('looks.yaml'), cls = classifier(kit);
  const row1 = [], pairs = { m: [], f: [] }, faceRows = [];
  for (const b of ['m', 'f']) {
    const img = renderLook(kit, { ...looks[`proof_${b}`], face: 'smile' });
    row1.push(crop(lockBare(b), BODY_BOX), crop(img, BODY_BOX));
    const lock = [], mine = [];
    for (const e of FACES) {
      const k = crop(renderLook(kit, { ...looks[`proof_${b}`], face: e }), faceBox(b));
      lock.push(lockFace(b, e));
      mine.push(k);
      if (PROOF_FACES.includes(e)) pairs[b].push(lockFace(b, e), k);
      if (args.includes('-v')) for (const r of diffRows(cls, lockFace(b, e), k)) console.log(`${b} ${e} ${r.y}\n lock ${r.a}\n kit  ${r.b}`);
    }
    faceRows.push(lock, mine); // the locked faces, and the kit's right under them
    if (args.includes('-v')) for (const r of diffRows(cls, lockBare(b), img)) console.log(`${b} body ${r.y}\n lock ${r.a}\n kit  ${r.b}`);
  }
  for (const b of ['m', 'f']) row1.push(crop(renderLook(kit, { ...looks[`swap_${b}`], face: 'smile' }), BODY_BOX));
  for (const [file, rows] of [['proof.png', [row1, pairs.m, pairs.f]], ['faces.png', faceRows]]) {
    const out = join(ART, 'preview', file);
    savePNG(out, sheet(rows));
    console.log('wrote', out);
  }
} else if (cmd === 'look') {
  const kit = loadKit(), looks = readYaml('looks.yaml');
  const [name, face = 'smile'] = args;
  if (!looks[name]) throw new Error(`no look "${name}" in art/looks.yaml`);
  const out = join(ART, `preview/${name}.png`);
  savePNG(out, sheet([[crop(renderLook(kit, { ...looks[name], face }), BODY_BOX)]]));
  console.log('wrote', out);
} else {
  console.log('usage: node art/kit/build.mjs check | proof [-v] | look <name> [face]');
}

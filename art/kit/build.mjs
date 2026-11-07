#!/usr/bin/env node
// Sprite kit CLI (run from the repo root).
//   node art/kit/build.mjs check        run the script checks (also part of npm test)
//   node art/kit/build.mjs proof [-v]   write art/preview/proof.png (bodies and the three faces of
//                                       the approved proof) and faces.png (all 17 expressions): the
//                                       kit next to the locked look; -v prints rows that differ.
//                                       Also hair.png (the men's hairstyles on the male body, the
//                                       women's on the female body, in hair.yaml order) and
//                                       colours.png (the skin, hair and eye choices) and races.png
//                                       (race pieces from races.yaml on men, women and children)
//   node art/kit/build.mjs look <name> [face]   write art/preview/<name>.png from art/looks.yaml
//   node art/kit/build.mjs ramp <ramp> <hex>     print a ramp shaped like <ramp> with <hex> as level 3
//                                                (for a skin ramp also the lips and blush that go with it)
import { join } from 'node:path';
import { loadKit, renderLook, readYaml, ART } from './kit.mjs';
import { sheet, crop, savePNG } from './sheet.mjs';
import { lockBare, lockFace, faceBox } from './lock.mjs';
import { runChecks, classifier, diffRows, FACES } from './check.mjs';
import { rampLike, follow } from './colour.mjs';

const BODY_BOX = { x: 12, y: 38, w: 40, h: 58 }; // the figure without the empty canvas above it
const RACE_BOX = { x: 12, y: 34, w: 40, h: 62 }; // room for horns above the head
const PROOF_FACES = ['smile', 'angry', 'surprised']; // the faces in the proof Phupha approved
const hairBox = b => ({ x: 14, y: b === 'm' ? 35 : 37, w: 36, h: 44 }); // head to waist, room for knots, tails and tufts
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'check') {
  const { errors, notes } = runChecks();
  notes.forEach(n => console.log(n));
  errors.forEach(e => console.log('ERROR', e));
  console.log(errors.length ? `${errors.length} problem(s)` : 'all checks pass');
  process.exit(errors.length ? 1 : 0);
} else if (cmd === 'proof') {
  const kit = loadKit(), looks = readYaml('looks.yaml'), hairList = readYaml('hair.yaml'), cls = classifier(kit);
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
  // each body's own hairstyles (hair.yaml) in the locked colours: men's row, then women's row
  const wearing = b => looks[`proof_${b}`].pieces.filter(id => !id.startsWith('hair/'));
  const hairRows = ['m', 'f'].map(b => Object.keys(hairList[b]).map(h => crop(renderLook(kit, { body: b, pieces: [...wearing(b), `hair/${b}/${h}`], face: 'smile' }), hairBox(b))));
  // colour choices: skin tones on both bodies, then hair and eye colours on the locked heads
  const ch = kit.pal.choices;
  const colourRows = ['m', 'f'].map(b => Object.keys(ch.skin).map(k => crop(renderLook(kit, { ...looks[`proof_${b}`], face: 'smile', choices: { skin: k } }), BODY_BOX)));
  for (const g of ['hair', 'eyes']) colourRows.push(Object.keys(ch[g]).map((k, i) => { const b = i % 2 ? 'm' : 'f'; return crop(renderLook(kit, { ...looks[`proof_${b}`], face: 'neutral', choices: { [g]: k } }), faceBox(b)); }));
  // race pieces (races.yaml): men, women, then the child bodies; each piece once, colours rotating
  const races = readYaml('races.yaml'), under = { m: ['under/briefs'], f: ['under/bra', 'under/panties'], cm: ['under/briefs', 'under/vest'], cf: ['under/briefs', 'under/vest'] };
  const hairOf = { m: ['short', 'long', 'messy', 'undercut', 'slicked', 'topknot', 'ponytail'], f: ['bob', 'long', 'braid', 'pixie', 'wavy', 'ponytail', 'twin_braids'] };
  const raceRows = ['m', 'f', 'c'].map(g => {
    const out = [];
    for (const [race, r] of Object.entries(races)) {
      const sets = race === 'human' ? (g === 'c' ? [[]] : []) : Object.entries(r).filter(([k]) => k !== 'name' && k !== 'always').flatMap(([, v]) => Object.keys(v).map(id => [id]));
      for (const extra of sets.length ? sets : [[]]) {
        if (extra.some(id => id.startsWith('beard/')) && g !== 'm') continue;
        const bodies = g === 'c' ? ['cm', 'cf'] : [g];
        for (const b of bodies) {
          const i = out.length, hs = hairOf[kit.bodies[b].like ?? b];
          const pieces = ['face/basic', ...under[b], `hair/${kit.bodies[b].like ?? b}/${hs[i % hs.length]}`, ...(r.always ?? []), ...extra];
          const choices = { skin: Object.keys(ch.skin)[i % 5], hair: Object.keys(ch.hair)[(i * 3) % 7], eyes: race === 'tiefling' ? 'amber' : race === 'elf' ? 'violet' : Object.keys(ch.eyes)[i % 4] };
          out.push(crop(renderLook(kit, { body: b, pieces, face: 'smile', choices }), RACE_BOX));
        }
      }
    }
    return out;
  });
  for (const [file, rows, opts] of [['proof.png', [row1, pairs.m, pairs.f]], ['faces.png', faceRows], ['hair.png', hairRows, { scale: 5 }], ['colours.png', colourRows], ['races.png', raceRows]]) {
    const out = join(ART, 'preview', file);
    savePNG(out, sheet(rows, opts));
    console.log('wrote', out);
  }
} else if (cmd === 'look') {
  const kit = loadKit(), looks = readYaml('looks.yaml');
  const [name, face = 'smile'] = args;
  if (!looks[name]) throw new Error(`no look "${name}" in art/looks.yaml`);
  const out = join(ART, `preview/${name}.png`);
  savePNG(out, sheet([[crop(renderLook(kit, { ...looks[name], face }), BODY_BOX)]]));
  console.log('wrote', out);
} else if (cmd === 'ramp') {
  const { pal } = loadKit(), [ref, base] = args;
  if (!pal.ramps[ref] || !/^[0-9a-f]{6}$/i.test(base ?? '')) throw new Error('usage: ramp <ramp in palette.yaml> <rrggbb>');
  console.log(`[${rampLike(pal.ramps[ref], base, pal.outline).join(', ')}]`);
  if (ref.startsWith('skin')) for (const m of ['lip', 'blush']) console.log(m, follow(pal.ramps[pal.materials[m].ramp][0], pal.ramps[pal.materials.skin.ramp], base));
} else {
  console.log('usage: node art/kit/build.mjs check | proof [-v] | look <name> [face] | ramp <ramp> <hex>');
}

// NPC looks from the recipes in art/npcs.yaml (A25): seeded random picks from the shared pieces.
import { readYaml, fitsBody } from './kit.mjs';

const UNDER = { m: ['under/briefs'], f: ['under/bra', 'under/panties'], cm: ['under/briefs', 'under/vest'], cf: ['under/briefs', 'under/vest'] };

/** A small seeded random source: the same string always gives the same numbers. */
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * The look of NPC number `seed` of a group: { body, pieces, face, choices, colors, race, god }.
 * opts: body, race, god, face to fix them instead of picking.
 */
export function npcLook(kit, groupKey, seed, opts = {}, data = {}) {
  const npcs = data.npcs ?? readYaml('npcs.yaml'), races = data.races ?? readYaml('races.yaml');
  const hairList = data.hair ?? readYaml('hair.yaml'), outfits = data.outfits ?? readYaml('outfits.yaml');
  const g = npcs.groups[groupKey];
  if (!g) throw new Error(`no NPC group "${groupKey}" in art/npcs.yaml`);
  const r = rng(`${groupKey}:${seed}`), one = a => a[Math.floor(r() * a.length)];
  const body = opts.body ?? one(g.bodies ?? ['m', 'f']);
  const like = kit.bodies[body].like ?? body, adult = !kit.bodies[body].like;
  const fits = id => id && kit.pieces[id] && fitsBody(kit.pieces[id], body, kit);
  const race = opts.race ?? one(g.races ?? ['human']), rc = races[race];
  const pieces = ['face/basic', ...UNDER[body]];
  pieces.push(`hair/${like}/${one(Object.keys(hairList[like]))}`);
  pieces.push(...(rc.always ?? []));
  for (const [key, list] of Object.entries(rc)) {
    if (['name', 'always'].includes(key)) continue;
    const opts2 = Object.keys(list).filter(fits);
    if (!opts2.length) continue;
    if (key === 'beard' && r() >= (npcs.facial_hair[race] ?? npcs.facial_hair.other)) continue;
    pieces.push(one(opts2));
  }
  const wear = (g.wear ?? []).filter(fits);
  if (wear.length) {
    const w = one(wear);
    pieces.push(w);
    const feet = Object.values(outfits).map(grp => grp?.[w]?.feet).find(Boolean);
    if (feet) pieces.push(feet);
  }
  pieces.push(...(g.always ?? []).filter(fits));
  for (const list of Object.values(g.slots ?? {})) { const p = one(list); if (fits(p)) pieces.push(p); }
  for (const [id, p] of Object.entries({ ...npcs.marks, ...(g.chance ?? {}) })) if (r() < p && fits(id) && !pieces.includes(id)) pieces.push(id);
  const choices = {
    skin: one(Object.keys(kit.pal.choices.skin)),
    hair: one(Object.keys(kit.pal.choices.hair)),
    eyes: race === 'tiefling' ? 'amber' : one(Object.keys(kit.pal.choices.eyes)),
  };
  if (adult && r() < (g.old ?? 0)) {
    if (fits('mark/wrinkles') && !pieces.includes('mark/wrinkles')) pieces.push('mark/wrinkles');
    if (r() < 0.5) choices.hair = 'silver';
  }
  const colors = {};
  for (const [mat, list] of Object.entries(g.colors ?? {})) colors[mat] = one(list);
  let god = null;
  if (g.god) {
    god = opts.god ?? one(Object.keys(npcs.gods));
    Object.assign(colors, npcs.gods[god].colors);
  }
  return { body, race, god, pieces, choices, colors, face: opts.face ?? 'neutral' };
}

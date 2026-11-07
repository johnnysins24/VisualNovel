// Assembles a character from its look, ported from Voxel Realm (CharRig.build_parts and the rest pose): the
// sculpted body with its outfit, cut into rig parts, plus head, hair, horns, tail and head accessories, each
// placed at its joint.
import { palette, SKIN, SKIN_SH, UNDER, UNDER_TR, MARK, MARK2, GLOW, GLOW2 } from './pal.mjs';
import { getRace } from './appearance.mjs';
import { makeBody, joints, VS } from './body.mjs';
import { dress } from './outfits.mjs';
import { head, hair, horns, tail, accessories } from './head.mjs';

// joint -> parent (CharRig._build_skeleton)
const PARENT = {
  hips: null, torso: 'hips', head: 'torso', hair: 'head', horns: 'head', helm: 'head', acc: 'head',
  arm_l: 'torso', forearm_l: 'arm_l', hand_l: 'forearm_l', arm_r: 'torso', forearm_r: 'arm_r', hand_r: 'forearm_r',
  thigh_l: 'hips', shin_l: 'thigh_l', thigh_r: 'hips', shin_r: 'thigh_r', tail: 'hips',
};
const UNDER_HEAD = new Set(['head', 'hair', 'horns', 'helm', 'acc']);

/**
 * Builds every part of a character.
 * Returns { parts: [{ name, vd, anchor, joint: [x,y,z] in body voxels, scale }], S, look }.
 * Parts come in Voxel Realm's mesh creation order (body parts by first voxel, then head, hair, ...).
 */
export function buildCharacter(a, { expr = '', blink = false, hide = [] } = {}) {
  const pal = palette(a);
  const ids = { skin: SKIN, skin_sh: SKIN_SH, under: UNDER, under_tr: UNDER_TR, mark: MARK, mark2: MARK2, glow: GLOW, glow2: GLOW2 };
  const B = makeBody(a, ids);
  dress(B, a);
  const R = getRace(a.race);
  const parts = [];
  for (const d of B.partData()) parts.push({ name: d.name, vd: d.vd, anchor: d.anchor });
  const hb = head(a, expr, blink);
  parts.push({ name: 'head', vd: hb.vd, anchor: hb.anchor });
  const hr = hair(a);
  parts.push({ name: 'hair', vd: hr.vd, anchor: hr.anchor });
  if (R.horns || R.dragon) { const m = horns(a); parts.push({ name: 'horns', vd: m.vd, anchor: m.anchor }); }
  if (R.tail) { const m = tail(a); parts.push({ name: 'tail', vd: m.vd, anchor: m.anchor }); }
  if (a.acc.length) { const m = accessories(a); parts.push({ name: 'acc', vd: m.vd, anchor: m.anchor }); }

  // rest pose: joints only translate; the head joint carries the head scale down to its children
  const J = joints(B.S);
  const local = { torso: [0, 0, 0], hair: [0, 0, 0], horns: [0, 0, 0], helm: [0, 0, 0], acc: [0, 0, 0], ...J };
  const world = {};
  const pos = name => {
    if (world[name]) return world[name];
    const off = local[name] ?? [0, 0, 0];
    const parent = PARENT[name];
    let w;
    if (!parent) w = off;
    else {
      const pw = pos(parent);
      const k = parent === 'head' || UNDER_HEAD.has(parent) ? headScale : 1;
      w = [pw[0] + off[0] * k, pw[1] + off[1] * k, pw[2] + off[2] * k];
    }
    world[name] = w;
    return w;
  };
  const headScale = a.head_size * R.head;
  for (const p of parts) {
    p.joint = pos(p.name);
    p.scale = UNDER_HEAD.has(p.name) ? headScale : 1;
  }
  return {
    look: a, pal, S: B.S,
    parts: parts.filter(p => !hide.includes(p.name)),
    rigScale: a.height * R.scale,
    pixel: VS * a.height * R.scale * a.head_size * R.head,
  };
}

export { VS };

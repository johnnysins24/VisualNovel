// Heads, faces, expressions, hair, horns, tails and head accessories at 1/32 m, ported from Voxel Realm
// (CharModels in char_models.gd). Head-local space: x 2..12 (centre 7.5), y 0..11 (chin to crown), z 0..10
// (face at z = 0).
import { round, idiv, lerp } from './gd.mjs';
import { B, P } from './grid.mjs';
import { getRace, hornStyles, HAIR_STYLES } from './appearance.mjs';
import {
  SKIN, SKIN_SH, HAIR, HAIR_DK, HAIR_LT, EYE, EYE_W, MAIN, MAIN_DK, TRIM, LEATHER, METAL, METAL_DK, BELT, GOLD,
  MOUTH, BLUSH, CLOTH_W, DARK, ACCENT, EYE_DK, LASH, TUSK, HORN, HORN_DK, HORN_TIP, MARK, MARK2, NOSE, FACE_MK, TEAR, GLOW,
} from './pal.mjs';

export const VS = 0.03125;

/** [eyes, brows, mouth, blush]; only eyes, brows and mouth change, the base face stays. */
export const EXPRESSIONS = {
  '': ['', '', '', false],
  smile: ['', '', 'smile', false],
  happy: ['joy', '', 'grin', true],
  laugh: ['joy', 'raised', 'laugh', true],
  sad: ['sad', 'worried', 'frown', false],
  cry: ['shut', 'worried', 'wobble', true],
  angry: ['narrow', 'angry', 'grit', false],
  surprised: ['wide', 'raised', 'o', false],
  shy: ['down', 'worried', 'small', true],
  smug: ['half', '', 'smirk', false],
  pain: ['><', 'worried', 'grit', false],
  sleepy: ['half', '', 'small', false],
  asleep: ['closed', '', 'small', false],
  wink: ['wink', '', 'smile', false],
  ko: ['x', '', 'o', false],
  eat: ['joy', '', 'chew', true],
  focus: ['narrow', '', '', false],
};
export const CLOSED_EYES = ['joy', 'shut', 'closed', '><', 'x'];
export const FACE_SHAPES = ['default', 'soft', 'sharp', 'square', 'slim'];
export const EYE_SHAPES = ['default', 'round', 'sharp', 'narrow', 'gentle'];
export const BROWS = ['default', 'thin', 'soft', 'bold', 'angled'];
export const FACE_MARKS = ['none', 'freckles', 'scar', 'war paint', 'tattoo', 'beauty mark', 'blush'];
export const ACCESSORIES = ['hat_wide', 'hat_feather', 'hat_straw', 'cap', 'glasses', 'glasses_thick', 'quill', 'veil', 'wrinkles', 'circlet'];

export const raceOf = a => getRace(a.race);
export const faceShape = a => (a.face > 0 ? FACE_SHAPES[a.face] : a.body === 0 ? 'square' : 'soft');
export const eyeShape = a => (a.eye_shape > 0 ? EYE_SHAPES[a.eye_shape] : a.body === 0 ? 'sharp' : 'round');
export const browStyle = a => (a.brows > 0 ? BROWS[a.brows] : a.body === 0 ? 'angled' : 'thin');
export const browsLow = a => { const s = browStyle(a); return s === 'bold' || s === 'angled'; };
export function earType(a) {
  const e = raceOf(a).ears;
  if (a.race === 'human' && a.ear === 1) return 'long';
  return e;
}
export function beardStyle(a) {
  if (a.beard >= 0) return a.beard;
  return a.body === 0 ? (raceOf(a).beard ?? 0) : 0;
}
export function hasHat(a) {
  return a.acc.some(x => String(x).startsWith('hat') || x === 'cap' || x === 'veil');
}

// ---------------------------------------------------------------- head

export function head(a, expr = '', blink = false) {
  const R = raceOf(a);
  const ex = EXPRESSIONS[expr] ?? EXPRESSIONS[''];
  let exEyes = ex[0];
  if (blink && !CLOSED_EYES.includes(exEyes)) exEyes = 'closed';
  if (R.dragon) return dragonHead(a, exEyes);
  const b = new B(19, 21, 12, VS);
  const p = new P(b, [2, 0, 1]);
  b.anchor = [9.5, 0, 6.5];
  const male = a.body === 0;
  let shape = faceShape(a);
  const eyes = eyeShape(a);
  const brows = browStyle(a);
  const jaw = Math.trunc(R.jaw ?? 0);
  if (jaw >= 1 && shape === 'soft') shape = male ? 'square' : 'sharp';
  // cranium: wide and rounded on top, the lower face shaped by the face shape
  p.rbox(2, 5, 0, 12, 10, 10, SKIN);
  p.rbox(3, 11, 1, 11, 11, 9, SKIN);
  switch (shape) {
    case 'square':
      p.rbox(2, 2, 1, 12, 4, 9, SKIN);
      p.rbox(3, 1, 0, 11, 4, 9, SKIN);
      p.rbox(4, 0, 1, 10, 0, 7, SKIN);
      p.box(5, 0, 0, 9, 0, 0, SKIN);
      p.s(3, 1, 0, SKIN_SH); p.s(11, 1, 0, SKIN_SH);
      p.s(2, 2, 1, SKIN_SH); p.s(12, 2, 1, SKIN_SH);
      break;
    case 'sharp':
      p.rbox(3, 3, 0, 11, 4, 9, SKIN);
      p.rbox(4, 2, 0, 10, 2, 8, SKIN);
      p.rbox(5, 1, 0, 9, 1, 7, SKIN);
      p.rbox(6, 0, 1, 8, 0, 6, SKIN);
      p.box(7, 0, 0, 7, 0, 0, SKIN);
      break;
    case 'slim':
      p.rbox(3, 3, 0, 11, 4, 9, SKIN);
      p.rbox(4, 1, 0, 10, 2, 8, SKIN);
      p.rbox(5, 0, 1, 9, 0, 6, SKIN);
      p.box(6, 0, 0, 8, 0, 0, SKIN);
      p.tint(2, 3, 0, 2, 4, 2, SKIN_SH); p.tint(12, 3, 0, 12, 4, 2, SKIN_SH);
      break;
    default:
      p.rbox(3, 3, 0, 11, 4, 9, SKIN);
      p.rbox(4, 1, 0, 10, 2, 8, SKIN);
      p.rbox(5, 0, 1, 9, 0, 6, SKIN);
  }
  if (R.cheeks) p.rbox(2, 2, 1, 12, 4, 8, SKIN);
  if (jaw >= 1) p.rbox(2, 2, 1, 12, 4, 9, SKIN);
  p.tint(2, 0, 7, 12, 11, 10, SKIN_SH);
  if (exEyes === '') paintEyes(p, a, R, eyes, male);
  else paintExprEyes(p, a, R, exEyes);
  paintBrows(p, ex[1] === '' ? brows : ex[1], male);
  if (R.brow) {
    p.box(3, 8, -1, 11, 8, -1, SKIN);
    p.box(3, 8, 0, 11, 8, 0, SKIN_SH);
  }
  if (R.nose) {
    p.s(7, 3, -1, SKIN); p.s(7, 4, -1, SKIN); p.s(7, 2, -1, SKIN_SH);
    if (a.race === 'gnome' && a.feature === 1) { p.s(7, 3, -2, SKIN); p.s(7, 2, -2, SKIN_SH); }
  } else if (male) {
    p.s(7, 3, -1, SKIN); p.s(8, 3, 0, SKIN_SH); p.s(8, 4, 0, SKIN_SH);
  } else {
    p.s(7, 3, 0, SKIN_SH);
  }
  const my = male || shape === 'sharp' ? 1 : 2;
  if (male) { p.s(3, 3, 0, SKIN_SH); p.s(11, 3, 0, SKIN_SH); }
  else { p.s(4, 3, 0, BLUSH); p.s(10, 3, 0, BLUSH); p.s(3, 3, 1, BLUSH); p.s(11, 3, 1, BLUSH); }
  paintMouth(p, ex[2], my, male);
  paintFaceMark(p, a);
  if (a.acc.includes('wrinkles')) {
    p.box(4, 3, 0, 5, 3, 0, SKIN_SH); p.box(9, 3, 0, 10, 3, 0, SKIN_SH);
    p.s(5, 1, 0, SKIN_SH); p.s(9, 1, 0, SKIN_SH);
  }
  if (ex[3]) { p.box(3, 3, 0, 5, 3, 0, BLUSH); p.box(9, 3, 0, 11, 3, 0, BLUSH); }
  if (expr === 'cry') for (const x of [4, 10]) p.box(x, 1, 0, x, 3, 0, TEAR);
  if (R.cat) {
    p.box(6, 1, 0, 8, 3, 0, MARK2);
    p.s(7, 3, 0, NOSE); p.s(7, 2, 0, MARK2);
    p.s(6, 2, 0, MOUTH); p.s(8, 2, 0, MOUTH);
    p.s(7, 3, -1, 0);
    for (const x of [2, 3, 11, 12]) p.s(x, 3, 0, MARK);
    p.s(3, 2, 0, MARK); p.s(11, 2, 0, MARK);
    for (const x of [6, 8]) p.box(x, 9, 0, x, 10, 0, MARK);
  }
  if (R.tusks) {
    const big = a.feature === 1, tiny = a.feature === 2;
    for (const x of [5, 9]) {
      p.s(x, 1, -1, TUSK);
      if (!tiny) p.s(x, 2, -1, TUSK);
      if (big || (male && !tiny)) p.s(x, 3, -1, TUSK);
      if (big) p.s(x + (x < 7 ? -1 : 1), 3, -1, TUSK);
    }
  }
  paintEars(p, a);
  return b;
}

function paintEyes(p, a, R, shape, male) {
  const raceEyes = R.eyes ?? '';
  if (raceEyes === 'slit') {
    for (const [x0, , xo] of [[3, 5, 2], [9, 11, 12]]) {
      p.box(x0, 4, 0, x0 + 2, 6, 0, EYE);
      p.box(x0 + 1, 4, 0, x0 + 1, 6, 0, EYE_DK);
      p.box(x0, 7, 0, x0 + 2, 7, 0, LASH); p.s(xo, 7, 0, LASH);
      if (shape === 'sharp' || shape === 'narrow') p.s(xo, 6, 0, LASH);
      p.s(x0 < 7 ? x0 : x0 + 2, 6, 0, EYE_W);
    }
    return;
  }
  const iris = raceEyes === 'solid' || raceEyes === 'glow' ? GLOW : EYE;
  for (const [x0, x1, xo, hl, xi] of [[4, 5, 3, 4, 6], [9, 10, 11, 10, 8]]) {
    const top = iris === EYE ? EYE_DK : iris;
    switch (shape) {
      case 'sharp':
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xo, 7, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(xi, 6, 0, LASH);
        p.s(x0, 6, 0, top); p.s(x1, 6, 0, top);
        p.s(x0, 5, 0, iris); p.s(x1, 5, 0, iris);
        if (raceEyes !== 'solid') p.s(hl, 6, 0, EYE_W);
        p.s(hl === x1 ? x0 : x1, 4, 0, SKIN_SH);
        break;
      case 'narrow':
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xo, 7, 0, LASH); p.s(xi, 7, 0, LASH);
        p.s(x0, 6, 0, LASH); p.s(x1, 6, 0, LASH);
        p.s(x0, 5, 0, iris); p.s(x1, 5, 0, top);
        if (raceEyes !== 'solid') p.s(hl, 5, 0, EYE_W);
        p.s(xo, 5, 0, LASH);
        break;
      case 'gentle':
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xo, 6, 0, LASH); p.s(xo, 5, 0, LASH);
        p.s(x0, 6, 0, top); p.s(x1, 6, 0, top);
        p.s(x0, 5, 0, iris); p.s(x1, 5, 0, iris);
        p.s(x0, 4, 0, iris); p.s(x1, 4, 0, iris);
        if (raceEyes !== 'solid') { p.s(hl, 6, 0, EYE_W); p.s(hl === x1 ? x0 : x1, 4, 0, raceEyes === 'big' ? EYE_W : iris); }
        break;
      default:
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xo, 7, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(x0, 6, 0, top); p.s(x1, 6, 0, top);
        p.s(x0, 5, 0, hl !== x0 ? top : iris); p.s(x1, 5, 0, hl !== x1 ? top : iris);
        p.s(x0, 4, 0, iris); p.s(x1, 4, 0, iris);
        if (raceEyes === 'solid') p.box(x0, 4, 0, x1, 6, 0, iris);
        else p.s(hl, 6, 0, EYE_W);
    }
    if (raceEyes === 'big') {
      p.s(x0, 3, 0, iris); p.s(x1, 3, 0, iris);
      p.s(hl === x1 ? x0 : x1, 3, 0, EYE_W);
      p.s(xo, 8, 0, LASH);
    }
  }
}

/** Mouths. my is the mouth row (1 on masculine and sharp faces, 2 otherwise). */
function paintMouth(p, kind, my, male) {
  switch (kind) {
    case 'smile': p.s(6, my, 0, MOUTH); p.s(7, my - 1, 0, MOUTH); p.s(8, my, 0, MOUTH); break;
    case 'grin': p.box(6, my - 1, 0, 8, my, 0, MOUTH); p.s(7, my - 1, 0, BLUSH); break;
    case 'laugh':
      p.box(5, my - 1, 0, 9, my, 0, MOUTH);
      p.box(6, my - 1, 0, 8, my - 1, 0, BLUSH);
      p.box(6, my, 0, 8, my, 0, EYE_W);
      break;
    case 'frown': p.s(7, my, 0, MOUTH); p.s(6, my - 1, 0, MOUTH); p.s(8, my - 1, 0, MOUTH); break;
    case 'wobble': p.s(6, my - 1, 0, MOUTH); p.s(7, my, 0, MOUTH); p.s(8, my - 1, 0, MOUTH); p.s(7, my - 1, 0, MOUTH); break;
    case 'o': p.box(7, my - 1, 0, 7, my, 0, MOUTH); break;
    case 'grit': p.box(6, my - 1, 0, 8, my, 0, MOUTH); p.box(6, my, 0, 8, my, 0, EYE_W); break;
    case 'smirk': p.s(7, my, 0, MOUTH); p.s(8, my, 0, MOUTH); p.s(9, my + 1, 0, MOUTH); break;
    case 'small': p.s(7, my, 0, MOUTH); break;
    case 'chew': p.s(7, my, 0, MOUTH); p.s(6, my, 0, BLUSH); p.s(8, my, 0, BLUSH); break;
    default:
      if (male) { p.s(6, my, 0, MOUTH); p.s(7, my, 0, MOUTH); } else p.s(7, my, 0, MOUTH);
  }
}

/** Expression eyes, drawn over the same cells as the normal eyes. */
function paintExprEyes(p, a, R, kind) {
  const glow = R.eyes === 'solid' || R.eyes === 'glow';
  const iris = glow ? GLOW : EYE;
  const dk = glow ? GLOW : EYE_DK;
  const sides = [[4, 5, 3, 6, 4], [9, 10, 11, 8, 10]];
  for (let si = 0; si < 2; si++) {
    const [x0, x1, xo, xi, hl] = sides[si];
    let k = kind;
    if (kind === 'wink') k = si === 1 ? 'joy' : 'open';
    switch (k) {
      case 'closed': p.s(xo, 6, 0, LASH); p.s(x0, 5, 0, LASH); p.s(x1, 5, 0, LASH); p.s(xi, 6, 0, LASH); break;
      case 'joy': p.s(xo, 5, 0, LASH); p.s(x0, 6, 0, LASH); p.s(x1, 6, 0, LASH); p.s(xi, 5, 0, LASH); break;
      case 'shut': p.s(xo, 6, 0, LASH); p.s(x0, 5, 0, LASH); p.s(x1, 5, 0, LASH); p.s(xi, 5, 0, LASH); p.s(xo, 4, 0, LASH); break;
      case '><': {
        const ox = xo, ix = si === 0 ? x1 : x0;
        p.s(ox, 7, 0, LASH); p.s(si === 0 ? x0 : x1, 6, 0, LASH); p.s(ix, 5, 0, LASH);
        p.s(si === 0 ? x0 : x1, 4, 0, LASH); p.s(ox, 3, 0, LASH);
        break;
      }
      case 'x': {
        const ca = Math.min(xo, x0), cb = Math.max(xo, x1);
        p.s(ca, 6, 0, LASH); p.s(ca + 1, 5, 0, LASH); p.s(cb, 4, 0, LASH);
        p.s(cb, 6, 0, LASH); p.s(ca, 4, 0, LASH);
        break;
      }
      case 'wide':
        p.box(x0, 7, 0, x1, 7, 0, LASH); p.s(xo, 7, 0, LASH);
        p.box(x0, 4, 0, x1, 6, 0, EYE_W); p.box(xo, 4, 0, xo, 6, 0, EYE_W);
        p.s(si === 0 ? x0 : x1, 5, 0, dk);
        p.box(x0, 3, 0, x1, 3, 0, SKIN_SH);
        break;
      case 'narrow':
        p.box(x0, 7, 0, x1, 7, 0, SKIN); p.s(xo, 7, 0, SKIN);
        p.box(x0, 6, 0, x1, 6, 0, LASH); p.s(xi, 6, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(x0, 5, 0, dk); p.s(x1, 5, 0, dk);
        p.s(hl, 5, 0, !glow ? EYE_W : iris);
        p.s(x0, 4, 0, SKIN); p.s(x1, 4, 0, SKIN);
        break;
      case 'half':
        p.box(x0, 7, 0, x1, 7, 0, SKIN);
        p.box(x0, 6, 0, x1, 6, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(x0, 5, 0, dk); p.s(x1, 5, 0, iris);
        p.s(x0, 4, 0, iris); p.s(x1, 4, 0, iris);
        break;
      case 'sad':
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xi, 7, 0, LASH); p.s(xo, 6, 0, LASH); p.s(xo, 5, 0, LASH);
        p.s(x0, 6, 0, dk); p.s(x1, 6, 0, dk); p.s(hl, 6, 0, EYE_W);
        p.s(x0, 5, 0, iris); p.s(x1, 5, 0, iris);
        p.s(x0, 4, 0, iris); p.s(x1, 4, 0, iris);
        p.s(hl, 4, 0, EYE_W);
        break;
      case 'down':
        p.box(x0, 7, 0, x1, 7, 0, SKIN);
        p.box(x0, 6, 0, x1, 6, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(x0, 5, 0, SKIN); p.s(x1, 5, 0, SKIN);
        p.s(x0, 4, 0, dk); p.s(x1, 4, 0, iris);
        break;
      default:
        p.s(x0, 7, 0, LASH); p.s(x1, 7, 0, LASH); p.s(xo, 7, 0, LASH); p.s(xo, 6, 0, LASH);
        p.s(x0, 6, 0, dk); p.s(x1, 6, 0, dk); p.s(hl, 6, 0, EYE_W);
        p.s(x0, 5, 0, iris); p.s(x1, 5, 0, iris);
        p.s(x0, 4, 0, iris); p.s(x1, 4, 0, iris);
    }
  }
}

function paintBrows(p, style, male) {
  for (const [xo, xm, xi] of [[3, 4, 5], [11, 10, 9]]) {
    switch (style) {
      case 'bold':
        p.box(Math.min(xo, xi), 8, 0, Math.max(xo, xi), 8, 0, HAIR_DK);
        p.s(xm, 9, 0, HAIR_DK); p.s(xi, 9, 0, HAIR_DK);
        break;
      case 'angled':
        p.s(xi, 8, 0, HAIR_DK); p.s(xm, 8, 0, HAIR_DK); p.s(xo, 9, 0, HAIR_DK); p.s(xm, 9, 0, HAIR_DK);
        break;
      case 'soft':
        p.s(xm, 9, 0, HAIR_DK); p.s(xi, 9, 0, HAIR_DK); p.s(xo, 9, 0, HAIR);
        break;
      case 'worried':
        p.s(xi, 9, 0, HAIR_DK); p.s(xm, 8, 0, HAIR_DK); p.s(xo, 8, 0, HAIR_DK);
        break;
      case 'angry':
        p.s(xi, 8, 0, HAIR_DK); p.s(xm, 8, 0, HAIR_DK); p.s(xm, 9, 0, HAIR_DK); p.s(xo, 9, 0, HAIR_DK);
        p.s(xi + (xi < 7 ? 1 : -1), 8, 0, HAIR_DK);
        break;
      case 'raised':
        p.s(xi, 9, 0, HAIR_DK); p.s(xm, 9, 0, HAIR_DK); p.s(xo, 9, 0, HAIR_DK);
        break;
      default:
        p.s(xm, 9, 0, HAIR_DK); p.s(xi, 9, 0, HAIR_DK);
    }
  }
}

function paintFaceMark(p, a) {
  switch (FACE_MARKS[Math.max(0, Math.min(FACE_MARKS.length - 1, a.face_mark))]) {
    case 'freckles':
      for (const [x, y] of [[3, 4], [4, 3], [5, 4], [9, 4], [10, 3], [11, 4], [6, 4], [8, 4]]) p.s(x, y, 0, FACE_MK);
      break;
    case 'scar':
      for (const y of [9, 8, 4, 3]) p.s(10, y, 0, FACE_MK);
      p.s(11, 2, 0, FACE_MK);
      break;
    case 'war paint':
      p.box(3, 3, 0, 5, 3, 0, FACE_MK); p.box(9, 3, 0, 11, 3, 0, FACE_MK);
      p.box(7, 0, 0, 7, 1, 0, FACE_MK);
      break;
    case 'tattoo':
      p.box(2, 4, 0, 2, 7, 1, FACE_MK); p.box(12, 4, 0, 12, 7, 1, FACE_MK);
      p.s(3, 3, 0, FACE_MK); p.s(11, 3, 0, FACE_MK);
      break;
    case 'beauty mark': p.s(10, 2, 0, FACE_MK); break;
    case 'blush': p.box(3, 3, 0, 5, 3, 0, BLUSH); p.box(9, 3, 0, 11, 3, 0, BLUSH); break;
  }
}

function paintEars(p, a) {
  switch (earType(a)) {
    case 'long': {
      const f = a.feature;
      for (const sd of [[1, 0, -1, -2], [13, 14, 15, 16]]) {
        p.box(sd[0], 4, 5, sd[0], 6, 6, SKIN);
        p.box(sd[1], 5, 6, sd[1], 7, 7, SKIN);
        if (f === 1) {
          p.box(sd[2], 7, 7, sd[2], 9, 8, SKIN);
          p.box(sd[3], 9, 8, sd[3], 12, 9, SKIN);
          p.s(sd[3], 13, 9, SKIN);
        } else if (f === 2) {
          p.box(sd[2], 4, 7, sd[2], 6, 8, SKIN);
          p.box(sd[3], 3, 8, sd[3], 4, 9, SKIN);
        } else {
          p.box(sd[2], 7, 7, sd[2], 9, 8, SKIN);
          p.s(sd[2], 10, 8, SKIN);
        }
      }
      break;
    }
    case 'short':
      for (const sd of [[1, 0], [13, 14]]) {
        p.box(sd[0], 4, 5, sd[0], 6, 6, SKIN);
        p.box(sd[1], 6, 6, sd[1], 7, 7, SKIN);
        p.s(sd[1], 8, 7, SKIN_SH);
      }
      break;
    case 'small':
      for (const sd of [[1, 0], [13, 14]]) {
        p.box(sd[0], 4, 5, sd[0], 7, 6, SKIN);
        p.s(sd[1], 7, 6, SKIN);
      }
      break;
    case 'cat':
      for (const x0 of [2, 9]) {
        const outer = x0 < 7 ? x0 : x0 + 3;
        const rows = a.feature !== 2 ? 7 : 5;
        for (let k = 0; k < rows; k++) {
          const w = a.feature !== 2 ? 3 - idiv(k, 2) : 3 - idiv(k, 3);
          const y = 11 + k;
          const xa = x0 < 7 ? x0 + (3 - w) : x0;
          const xb = x0 < 7 ? x0 + 3 : x0 + w;
          p.box(xa, y, 3, xb, y, 5, k < rows - 2 ? SKIN : MARK);
          if (k >= 1 && k < rows - 2 && w > 1) p.box(xa + 1, y, 3, xb - 1, y, 3, NOSE);
        }
        p.s(outer, 11, 4, SKIN);
        if (a.feature === 1) {
          const tx = x0 < 7 ? x0 + 3 : x0;
          p.box(tx, 18, 4, tx, 19, 4, MARK);
        }
      }
      break;
    case 'none':
      break;
    default:
      p.box(1, 4, 5, 1, 6, 6, SKIN_SH);
      p.box(13, 4, 5, 13, 6, 6, SKIN_SH);
  }
}

/** Dragonborn head: a draconic skull with a snout, brow ridges, cheek frills and a crest; no hair. */
export function dragonHead(a, eyes = '') {
  const b = new B(19, 18, 22, VS);
  const p = new P(b, [2, 0, 9]);
  b.anchor = [9.5, 0, 6.5 + 8];
  p.rbox(3, 4, 0, 11, 10, 10, SKIN);
  p.rbox(4, 11, 2, 10, 11, 9, SKIN);
  p.rbox(2, 4, 3, 12, 8, 9, SKIN);
  for (let z = -7; z < 1; z++) {
    const t = -z / 7.0;
    const hw = round(lerp(3.5, 2.0, t));
    const top = round(lerp(8.0, 5.0, t));
    p.box(7 - hw, 3, z, 7 + hw, top, z, SKIN);
    p.box(7 - hw + 1, 1, z, 7 + hw - 1, 2, z, MARK2);
  }
  p.box(4, 0, -1, 10, 2, 6, MARK2);
  p.box(5, 3, -7, 9, 3, -1, MOUTH);
  p.box(5, 3, -7, 5, 3, -7, SKIN); p.box(9, 3, -7, 9, 3, -7, SKIN);
  p.s(6, 5, -7, DARK); p.s(8, 5, -7, DARK);
  for (const x of [4, 10]) { p.s(x, 2, -5, TUSK); p.s(x, 2, -3, TUSK); }
  const shut = CLOSED_EYES.includes(eyes) || eyes === 'half';
  for (const e of [[3, 4], [10, 11]]) {
    if (shut) {
      p.box(e[0], 8, -1, e[1], 8, -1, SKIN);
      p.box(e[0], 7, -1, e[1], 7, -1, DARK);
    } else {
      p.box(e[0], 7, -1, e[1], 8, -1, GLOW);
      p.s(e[0] > 7 ? e[0] : e[1], 7, -1, DARK);
    }
    p.box(e[0] - 1, 9, -2, e[1] + 1, 9, 0, SKIN);
  }
  const frill = a.feature;
  for (const [x, dx] of (frill !== 1 ? [[1, -1], [13, 1]] : [])) {
    for (let k = 0; k < 4; k++) {
      const y = 3 + k * 2;
      for (let d = 0; d < 3 + k % 2; d++) {
        p.s(x + dx * idiv(d, 2), y + idiv(d, 2), 5 + d, d >= 2 ? MARK2 : SKIN);
        if (frill === 2) for (let e = 0; e < 3; e++) p.s(x + dx * (idiv(d, 2) + 1), y + idiv(d, 2) + e, 6 + d + e, MARK2);
      }
    }
  }
  if (frill === 1) {
    for (let k = 0; k < 5; k++) for (const sx of [2, 12]) p.box(sx, 2 + k, 1 + k * 2, sx, 3 + k, 1 + k * 2, HORN);
  }
  for (let k = 0; k < 6; k++) p.box(7, 11 - k, 9 + idiv(k, 2), 7, 13 - k, 9 + idiv(k, 2), HORN);
  p.tint(2, 0, 7, 12, 13, 12, SKIN_SH);
  for (let y = 0; y < 14; y++) for (let z = -7; z < 13; z++) for (let x = 1; x < 14; x++) {
    if (p.g(x, y, z) === SKIN && (x + y + z) % 2 === 0) p.s(x, y, z, MARK);
  }
  return b;
}

// ---------------------------------------------------------------- horns and tails

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Horn centre line in head-local space: [[point, radius], ...] for both horns. */
export function hornPath(a) {
  const out = [];
  const R = raceOf(a);
  if (!R.horns && !R.dragon) return out;
  const styles = hornStyles(a.race);
  const style = styles[Math.max(0, Math.min(styles.length - 1, a.horns))];
  if (style === 'none') return out;
  for (const side of [-1.0, 1.0]) {
    const root = [7.5 + side * 3.9, 12.0, 2.6];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let pt = root;
      let r = lerp(1.6, 0.55, t);
      switch (style) {
        case 'ram': {
          const ang = t * Math.PI * 1.35;
          pt = add3(root, [side * (1.2 + 3.6 * t), 4.0 * Math.sin(ang) + 0.8, 5.0 * (1.0 - Math.cos(ang))]);
          r = lerp(2.0, 0.8, t);
          break;
        }
        case 'swept': pt = add3(root, [side * 2.0 * t, 4.0 * t + 2.5 * t * t, 9.0 * t]); r = lerp(1.7, 0.55, t); break;
        case 'straight': pt = add3(root, [side * 1.8 * t, 8.0 * t, -0.6 * t + 1.5 * t * t]); r = lerp(1.6, 0.5, t); break;
        case 'curved': pt = add3(root, [side * 1.6 * t, 1.5 * t + 6.0 * t * t * t, 8.0 * t - 1.5 * t * t * t]); r = lerp(1.8, 0.5, t); break;
        case 'antlers': pt = add3(root, [side * 2.5 * t, 6.0 * t, 3.0 * t]); r = lerp(1.2, 0.6, t); break;
        case 'long': pt = add3(root, [side * 1.0 * t, 1.0 * t + 1.5 * t * t, 13.0 * t]); r = lerp(1.8, 0.45, t); break;
        default: pt = add3(root, [side * 0.8 * t, 4.2 * t, -0.3 * t]); r = lerp(1.3, 0.5, t);
      }
      out.push([pt, r]);
    }
    if (style === 'antlers') {
      for (const k of [[0.4, 1.0], [0.75, -1.0]]) {
        const base = add3(root, [side * 2.5 * k[0], 6.0 * k[0], 3.0 * k[0]]);
        for (let i = 0; i < 5; i++) {
          const t = i / 4.0;
          out.push([add3(base, [side * 1.5 * t, 2.6 * t, k[1] * 2.2 * t]), lerp(0.8, 0.45, t)]);
        }
      }
    }
    if (style === 'crown') {
      for (const k of [[2.4, 6.0], [1.0, 9.0]]) {
        const rt = [7.5 + side * k[0], 13.5, k[1]];
        for (let i = 0; i < 5; i++) {
          const t = i / 4.0;
          out.push([add3(rt, [side * 0.5 * t, 3.4 * t, 0.8 * t]), lerp(1.1, 0.45, t)]);
        }
      }
    }
  }
  return out;
}

export function horns(a) {
  const b = new B(26, 36, 24, VS, 77);
  const o = [5, 17, 5];
  const p = new P(b, o);
  b.anchor = [7.5 + o[0], o[1], 5.5 + o[2]];
  const path = hornPath(a);
  path.forEach(([c, r], i) => {
    const tip = path.length >= 26 ? (i % 13) >= 10 : false;
    for (let y = Math.trunc(c[1] - r) - 1; y < Math.trunc(c[1] + r) + 2; y++)
      for (let z = Math.trunc(c[2] - r) - 1; z < Math.trunc(c[2] + r) + 2; z++)
        for (let x = Math.trunc(c[0] - r) - 1; x < Math.trunc(c[0] + r) + 2; x++)
          if (dist3([x + 0.5, y + 0.5, z + 0.5], c) <= r + 0.15) p.s(x, y, z, tip ? HORN_TIP : ((y + i) % 3 ? HORN : HORN_DK));
  });
  return b;
}

export function tail(a) {
  const b = new B(13, 44, 28, VS, 78);
  const o = [6, 30, 3];
  const p = new P(b, o);
  b.anchor = [o[0] + 0.5, o[1], o[2] + 0.5];
  let style = String(raceOf(a).tail ?? '');
  if (a.race === 'tiefling' && a.feature === 2) return b;
  if (a.race === 'tiefling' && a.feature === 1) style = 'whip';
  if (style === '' || style === 'false') return b;
  const n = 30;
  let last = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let c, r;
    switch (style) {
      case 'cat': c = [0, -12.0 * Math.sin(t * 1.6) + 10.0 * t * t, 1.0 + 16.0 * t]; r = lerp(1.6, 1.3, t); break;
      case 'dragon': c = [0, -15.0 * t - 4.0 * t * t, 1.0 + 15.0 * t]; r = lerp(3.6, 0.9, t); break;
      case 'whip': c = [2.0 * Math.sin(t * 4.0), -24.0 * t + 14.0 * t * t, 1.0 + 15.0 * Math.sin(t * 1.2)]; r = lerp(1.2, 0.45, t); break;
      default: c = [0, -22.0 * t + 9.0 * t * t * t, 1.0 + 12.0 * Math.sin(t * 1.4)]; r = lerp(1.4, 0.6, t);
    }
    for (let y = Math.trunc(c[1] - r) - 1; y < Math.trunc(c[1] + r) + 2; y++)
      for (let z = Math.trunc(c[2] - r) - 1; z < Math.trunc(c[2] + r) + 2; z++)
        for (let x = Math.trunc(c[0] - r) - 1; x < Math.trunc(c[0] + r) + 2; x++) {
          if (dist3([x + 0.5, y + 0.5, z + 0.5], add3(c, [0.5, 0, 0])) > r + 0.1) continue;
          let id = SKIN;
          if (style === 'cat') id = (a.marks === 0 && i % 5 < 2) || t > 0.86 ? MARK : SKIN;
          else if (style === 'dragon') {
            id = y + 0.5 < c[1] - r * 0.4 ? MARK2 : ((x + y + z) % 2 === 0 ? MARK : SKIN);
            if (y + 0.5 > c[1] + r * 0.6 && i % 3 === 0) id = HORN;
          } else id = t < 0.85 ? SKIN : SKIN_SH;
          p.s(x, y, z, id);
        }
    last = c;
  }
  if (style === 'spade' || style === 'true') {
    const tp = [Math.trunc(last[0]), Math.trunc(last[1]), Math.trunc(last[2])];
    for (const k of [[0, 1, 0], [0, 2, 0], [0, 3, 0], [-1, 1, 0], [1, 1, 0], [-1, 2, 0], [1, 2, 0], [-2, 1, 0], [2, 1, 0], [0, 4, 0]])
      p.s(tp[0] + k[0], tp[1] + k[1], tp[2] + k[2], SKIN_SH);
  }
  return b;
}

// ---------------------------------------------------------------- hair

/** Hair is its own model so it can be swapped independently of the head; head-local space. */
export function hair(a) {
  const style = HAIR_STYLES[a.hair_style];
  const b = new B(26, 36, 20, VS, 900 + a.hair_style);
  const o = [5, 17, 3];
  const p = new P(b, o);
  b.anchor = [7.5 + o[0], o[1], 5.5 + o[2]];
  if (raceOf(a).dragon) return b;
  if (style === 'bald') { hairExtras(a, b, p); return b; }
  const H = HAIR;
  p.rbox(1, 5, -1, 13, 11, 11, H);
  p.rbox(2, 12, 0, 12, 12, 10, H);
  p.rbox(3, 13, 1, 11, 13, 9, H);
  p.rbox(5, 14, 3, 9, 14, 7, H);
  p.box(2, 0, -1, 12, 7, 0, 0);
  p.box(3, 0, -1, 11, 11, -1, 0);
  p.box(2, 0, 0, 12, 11, 10, 0);
  p.box(1, 0, 1, 1, 4, 3, 0); p.box(13, 0, 1, 13, 4, 3, 0);
  const lowBrows = browsLow(a);
  let bangs = 'jagged';
  if (style === 'undercut' || style === 'mohawk') bangs = 'none';
  else if (style === 'manbun' || style === 'pixie') bangs = 'swept';
  else if (style === 'parted' || style === 'longwave' || style === 'halfup') bangs = 'part';
  else if (style === 'hime' || style === 'bob') bangs = 'blunt';
  let tips = [9, 8, 10, 8, 9, 10, 8, 9, 8];
  if (style === 'spiky' || style === 'messy' || style === 'wolf') tips = [8, 9, 8, 10, 8, 9, 8, 10, 8];
  for (let i = 0; i < 9; i++) {
    const x = 3 + i;
    let bottom = tips[(i + a.hair_style) % 9];
    if (bangs === 'none') continue;
    if (bangs === 'blunt') bottom = 8;
    else if (bangs === 'swept') bottom = 8 + idiv(i * 3, 8);
    else if (bangs === 'part') bottom = [8, 8, 9, 10, 11, 10, 9, 8, 8][i];
    if (lowBrows) bottom = Math.max(bottom, 9);
    p.box(x, bottom, -1, x, 11, -1, H);
    p.s(x, bottom, -1, bangs !== 'blunt' ? (i % 2 ? H : HAIR_DK) : HAIR_DK);
  }
  p.box(3, 12, 0, 11, 12, 0, H);
  if (bangs === 'none') {
    p.box(3, 11, -1, 11, 11, -1, 0);
    p.box(3, 12, -1, 11, 12, -1, H);
  }
  if (!['undercut', 'mohawk', 'pixie', 'manbun'].includes(style)) {
    p.box(1, 2, -1, 2, 11, 0, H);
    p.box(12, 2, -1, 13, 11, 0, H);
    p.s(2, 1, -1, H); p.s(12, 1, -1, H);
    p.box(1, 2, -1, 1, 3, 0, HAIR_DK); p.box(13, 2, -1, 13, 3, 0, HAIR_DK);
  } else {
    p.box(1, 5, 1, 1, 9, 3, HAIR_DK); p.box(13, 5, 1, 13, 9, 3, HAIR_DK);
  }
  p.rbox(2, 3, 10, 12, 4, 11, H);
  for (let x = 1; x < 14; x++) for (let z = -1; z < 12; z++) {
    if (p.g(x, 10, z) !== 0 && (((x <= 1 || x >= 13) && z >= 5) || z >= 11) && (x + z) % 3 !== 0) p.s(x, 10, z, HAIR_LT);
  }
  switch (style) {
    case 'short':
      p.box(4, 13, 2, 4, 14, 3, H); p.box(9, 13, 1, 10, 14, 2, H); p.s(7, 15, 4, H);
      break;
    case 'spiky': {
      const spikes = [[3, 3], [6, 2], [9, 3], [11, 5], [4, 7], [8, 7], [6, 9], [10, 9], [2, 6], [12, 7]];
      spikes.forEach(([sx, sz], i) => {
        const tall = 2 + i % 3;
        for (let k = 0; k < tall; k++) p.box(sx, 13 + k, sz + k, sx + (k < tall - 1 ? 1 : 0), 13 + k, sz + k, k < tall - 1 ? H : HAIR_LT);
      });
      p.box(0, 8, 4, 0, 10, 6, H); p.box(14, 8, 4, 14, 10, 6, H);
      p.s(-1, 10, 5, H); p.s(15, 10, 5, H);
      break;
    }
    case 'long':
      p.rbox(1, -12, 9, 13, 4, 12, H);
      for (let x = 1; x < 14; x++) {
        const cut = -12 + Math.trunc(Math.abs(Math.sin(x * 1.3)) * 2.5);
        p.box(x, -12, 9, x, cut, 12, 0);
        p.s(x, cut + 1, 12, HAIR_DK);
      }
      p.box(1, -3, 2, 1, 4, 8, H); p.box(13, -3, 2, 13, 4, 8, H);
      p.box(1, -4, 1, 2, 1, 1, H); p.box(12, -4, 1, 13, 1, 1, H);
      p.s(1, -5, 1, HAIR_DK); p.s(13, -5, 1, HAIR_DK);
      break;
    case 'twintails':
      for (const sd of [[-1, 0, -3, -2], [14, 15, 16, 17]]) {
        p.box(sd[0], 8, 6, sd[1], 10, 8, ACCENT);
        p.rbox(sd[2], -9, 5, sd[3], 9, 9, H);
        p.rbox(sd[0], 5, 5, sd[1], 11, 9, H);
        p.box(sd[0], 8, 5, sd[1], 9, 9, ACCENT);
        p.box(sd[2], -13, 6, sd[3], -10, 8, H);
        p.box(sd[2], -13, 6, sd[3], -12, 8, HAIR_DK);
        p.tint(sd[2], 2, 5, sd[3], 3, 9, HAIR_LT);
      }
      break;
    case 'ponytail':
      p.box(6, 9, 11, 8, 11, 12, ACCENT);
      p.rbox(5, -2, 12, 9, 12, 14, H);
      p.rbox(6, -9, 13, 8, -3, 15, H);
      p.box(7, -11, 14, 7, -10, 15, HAIR_DK);
      p.tint(5, 6, 12, 9, 7, 14, HAIR_LT);
      p.box(6, 9, 11, 8, 11, 11, ACCENT);
      break;
    case 'bob':
      p.box(1, 2, 1, 1, 9, 11, H); p.box(13, 2, 1, 13, 9, 11, H);
      p.box(0, 2, 2, 0, 7, 10, H); p.box(14, 2, 2, 14, 7, 10, H);
      p.rbox(1, 2, 10, 13, 9, 12, H);
      p.box(0, 2, 2, 0, 2, 10, HAIR_DK); p.box(14, 2, 2, 14, 2, 10, HAIR_DK);
      p.box(1, 2, 12, 13, 2, 12, HAIR_DK);
      break;
    case 'braid':
      p.rbox(1, 0, 9, 13, 6, 12, H);
      for (let y = -14; y < 3; y++) {
        const zig = (y + 20) % 2;
        p.box(6 + zig, y, 12, 7 + zig, y, 13, y % 2 === 0 ? H : HAIR_DK);
        p.s(8 - zig, y, 12, HAIR_DK);
      }
      p.box(6, -15, 12, 8, -15, 13, ACCENT);
      p.box(6, -17, 12, 8, -16, 13, H);
      break;
    case 'undercut':
      shaveSides(p, 9);
      p.rbox(3, 12, -1, 11, 14, 9, H);
      p.rbox(4, 15, -1, 10, 15, 5, H);
      for (const x of [4, 7, 10]) {
        p.box(x, 15, -1, x, 15, 5, HAIR_LT);
        p.box(x, 14, 6, x, 14, 9, HAIR_LT);
      }
      break;
    case 'manbun':
      p.rbox(5, 11, 11, 9, 14, 14, H);
      p.box(5, 11, 10, 9, 11, 10, ACCENT);
      p.tint(5, 13, 11, 9, 14, 14, HAIR_LT);
      p.box(2, 6, -1, 2, 10, -1, H); p.box(12, 6, -1, 12, 10, -1, H);
      for (let x = 3; x < 12; x++) p.s(x, 12, 0, x % 3 === 0 ? HAIR_LT : H);
      break;
    case 'mohawk':
      shaveSides(p, 12);
      p.box(1, 12, -1, 4, 15, 12, 0); p.box(10, 12, -1, 13, 15, 12, 0);
      p.box(3, 12, 1, 4, 12, 9, HAIR_DK); p.box(10, 12, 1, 11, 12, 9, HAIR_DK);
      for (const y of [10, 11]) for (let z = -1; z < 12; z++) for (const x of [1, 2, 12, 13]) {
        if (p.g(x, y, z) !== 0) p.s(x, y, z, HAIR_DK);
      }
      for (let z = -1; z < 13; z++) {
        const top = 16 - idiv(Math.abs(z - 4), 4);
        p.box(6, 11, z, 8, top, z, H);
        p.box(7, top, z, 7, top + (z % 3 === 0 ? 1 : 0), z, HAIR_LT);
      }
      break;
    case 'wolf':
      for (const t of [[3, 2], [6, 1], [9, 2], [11, 5], [4, 6], [8, 6], [6, 9], [10, 8]]) {
        p.box(t[0], 13, t[1], t[0] + 1, 14, t[1], H);
        p.s(t[0], 15, t[1] + 1, HAIR_LT);
      }
      p.rbox(2, -3, 9, 12, 4, 12, H);
      for (let x = 2; x < 13; x++) {
        const cut = -3 + Math.trunc(Math.abs(Math.sin(x * 1.9)) * 3.0);
        p.box(x, -3, 9, x, cut, 12, 0);
      }
      p.box(0, -1, 2, 1, 8, 6, H); p.box(13, -1, 2, 14, 8, 6, H);
      p.box(0, -1, 2, 0, 1, 6, 0); p.box(14, -1, 2, 14, 1, 6, 0);
      break;
    case 'parted':
      p.box(1, 0, -1, 2, 2, 1, H); p.box(12, 0, -1, 13, 2, 1, H);
      p.s(7, 12, -1, HAIR_DK); p.s(7, 13, 0, HAIR_DK);
      p.rbox(2, 1, 9, 12, 4, 12, H);
      break;
    case 'longwave':
      for (let y = -13; y < 5; y++) {
        const w = round(Math.sin(y * 0.55));
        p.box(1 + w, y, 9, 13 + w, y, 12, H);
        if (y % 4 === 0) p.box(2 + w, y, 12, 12 + w, y, 12, HAIR_LT);
      }
      for (let x = 1; x < 14; x++) {
        const cut = -13 + Math.trunc(Math.abs(Math.sin(x * 1.1)) * 2.0);
        p.box(x - 1, -13, 9, x + 1, cut, 12, 0);
      }
      for (const sd of [[1, 0], [13, 14]]) {
        for (let y = -7; y < 4; y++) {
          const w = (y + 20) % 4 < 2 ? 1 : 0;
          p.box(sd[0] < 7 ? sd[0] : sd[0] - w, y, 1, sd[0] < 7 ? sd[0] + w : sd[0], y, 3, H);
        }
        p.s(sd[0], -8, 2, HAIR_DK);
      }
      break;
    case 'sidetail':
      p.box(13, 8, 6, 14, 10, 8, ACCENT);
      p.rbox(14, -2, 4, 16, 10, 9, H);
      p.rbox(14, -9, 3, 16, -2, 7, H);
      p.box(15, -11, 4, 15, -10, 6, HAIR_DK);
      p.tint(14, 4, 4, 16, 5, 9, HAIR_LT);
      p.box(13, 8, 5, 14, 9, 9, ACCENT);
      break;
    case 'hime':
      p.box(1, 1, -1, 2, 11, 1, H);
      p.box(12, 1, -1, 13, 11, 1, H);
      p.box(1, 1, -1, 2, 1, 1, HAIR_DK); p.box(12, 1, -1, 13, 1, 1, HAIR_DK);
      p.rbox(1, -12, 9, 13, 4, 12, H);
      p.box(1, -12, 9, 13, -12, 12, HAIR_DK);
      p.box(1, -5, 3, 1, 1, 8, H); p.box(13, -5, 3, 13, 1, 8, H);
      break;
    case 'bun':
      p.rbox(5, 15, 3, 9, 17, 7, H);
      p.box(6, 18, 4, 8, 18, 6, H);
      p.box(6, 15, 4, 8, 15, 6, ACCENT);
      p.box(2, 0, -1, 2, 3, -1, H); p.box(12, 0, -1, 12, 3, -1, H);
      break;
    case 'pixie':
      p.box(1, 6, -1, 1, 11, 1, H); p.box(13, 6, -1, 13, 11, 1, H);
      p.box(3, 13, 0, 6, 13, 3, HAIR_LT);
      p.box(9, 4, 11, 11, 5, 11, 0);
      break;
    case 'halfup':
      p.rbox(1, -10, 9, 13, 4, 12, H);
      for (let x = 1; x < 14; x++) {
        const cut = -10 + Math.trunc(Math.abs(Math.sin(x * 1.3)) * 2.5);
        p.box(x, -10, 9, x, cut, 12, 0);
      }
      p.rbox(5, 9, 11, 9, 11, 13, H);
      p.box(3, 9, 13, 11, 10, 13, ACCENT);
      p.box(3, 10, 13, 4, 11, 13, ACCENT); p.box(10, 10, 13, 11, 11, 13, ACCENT);
      break;
    case 'lowbraids':
      for (const sd of [0, 13]) {
        for (let y = -9; y < 6; y++) {
          const zig = (y + 20) % 2;
          p.box(sd + zig, y, 2, sd + zig + 1, y, 3, y % 2 === 0 ? H : HAIR_DK);
        }
        p.box(sd, -10, 2, sd + 2, -10, 3, ACCENT);
        p.box(sd, -12, 2, sd + 2, -11, 3, H);
      }
      p.rbox(2, 2, 9, 12, 5, 12, H);
      break;
    case 'messy':
      for (let i = 0; i < 14; i++) {
        const x = 1 + b.rng.randi() % 13;
        const z = b.rng.randi() % 11;
        const up = 13 + b.rng.randi() % 3;
        p.box(x, 13, z, x, up, z, i % 3 ? H : HAIR_LT);
      }
      p.box(0, 7, 3, 0, 9, 8, H); p.box(14, 6, 4, 14, 9, 8, H);
      p.box(4, 1, 11, 10, 3, 12, H);
      p.s(5, 0, 12, HAIR_DK); p.s(9, 0, 12, HAIR_DK);
      break;
  }
  // leave room for the ears (coincident voxels would z-fight)
  p.box(1, 4, 5, 1, 6, 6, 0); p.box(13, 4, 5, 13, 6, 6, 0);
  switch (earType(a)) {
    case 'long':
      p.box(0, 5, 6, 0, 7, 7, 0); p.box(14, 5, 6, 14, 7, 7, 0);
      p.box(-2, 3, 7, -1, 13, 9, 0); p.box(15, 3, 7, 16, 13, 9, 0);
      break;
    case 'short':
      p.box(0, 6, 6, 0, 8, 7, 0); p.box(14, 6, 6, 14, 8, 7, 0);
      break;
    case 'small':
      p.box(1, 4, 5, 1, 7, 6, 0); p.box(13, 4, 5, 13, 7, 6, 0);
      p.s(0, 7, 6, 0); p.s(14, 7, 6, 0);
      break;
  }
  // never cover the eyes or the lower face
  p.box(3, 0, -1, 11, 6, -1, 0);
  if (style !== 'bob') p.box(3, 0, -1, 11, 2, 0, 0);
  hairExtras(a, b, p);
  return b;
}

function shaveSides(p, top) {
  for (const x of [0, 1, 13, 14]) for (let y = 3; y <= top; y++) for (let z = 0; z < 12; z++) {
    if (p.g(x, y, z) !== 0) p.s(x, y, z, 0);
  }
  p.box(1, 3, 1, 1, top, 10, HAIR_DK);
  p.box(13, 3, 1, 13, top, 10, HAIR_DK);
  for (const z of [10, 11]) for (let y = 3; y < 10; y++) for (let x = 2; x < 13; x++) {
    if (p.g(x, y, z) !== 0) p.s(x, y, z, HAIR_DK);
  }
}

/** Beards, and room carved for hats, horns and ears. */
function hairExtras(a, b, p) {
  if (a.acc.includes('veil')) p.box(-6, -18, -4, 21, 19, 17, 0);
  else if (hasHat(a)) p.box(-6, 12, -4, 21, 19, 17, 0);
  for (const [c, hr] of hornPath(a)) {
    const r = hr + 0.6;
    for (let y = Math.trunc(c[1] - r) - 1; y < Math.trunc(c[1] + r) + 2; y++)
      for (let z = Math.trunc(c[2] - r) - 1; z < Math.trunc(c[2] + r) + 2; z++)
        for (let x = Math.trunc(c[0] - r) - 1; x < Math.trunc(c[0] + r) + 2; x++)
          if (dist3([x + 0.5, y + 0.5, z + 0.5], c) <= r) p.s(x, y, z, 0);
  }
  if (earType(a) === 'cat') for (const x0 of [2, 9]) p.box(x0 - 1, 11, 2, x0 + 4, 21, 6, 0);
  if (a.race === 'gnome' && a.heritage === 'rock') {
    p.box(1, 10, -2, 13, 10, 10, LEATHER);
    p.box(2, 10, 0, 12, 10, 9, 0);
    for (const gx of [3, 8]) {
      p.box(gx, 10, -3, gx + 3, 13, -2, METAL);
      p.box(gx + 1, 11, -3, gx + 2, 12, -3, EYE_W);
      p.s(gx + 1, 12, -3, GLOW);
    }
  }
  const bs = beardStyle(a);
  if (bs <= 0) return;
  const H = HAIR;
  if (bs === 1) {
    p.box(2, 1, 0, 2, 4, 3, H); p.box(12, 1, 0, 12, 4, 3, H);
    p.box(5, -1, 0, 9, 0, 2, H);
    return;
  }
  const low = bs === 2 ? -4 : -6;
  p.box(1, 1, 1, 1, 6, 5, H); p.box(13, 1, 1, 13, 6, 5, H);
  p.rbox(2, low, -1, 12, 2, 6, H);
  p.box(4, 2, -1, 10, 3, -1, H);
  p.s(7, 3, -1, 0);
  p.box(3, 3, -1, 11, 6, 0, 0);
  p.box(1, 4, 5, 1, 6, 6, 0); p.box(13, 4, 5, 13, 6, 6, 0);
  p.box(4, 2, -1, 10, 2, -1, H);
  p.box(6, 1, -1, 8, 1, -1, HAIR_DK);
  for (let x = 2; x < 13; x++) {
    const cut = low + Math.trunc(Math.abs(Math.sin(x * 1.7)) * 2.0);
    p.box(x, low, -1, x, cut, 6, 0);
    p.s(x, cut + 1, -1, HAIR_DK);
  }
  if (bs === 3) {
    for (const bx of [5, 9]) {
      for (let y = low - 7; y <= low; y++) {
        const zig = (y + 20) % 2;
        p.box(bx - 1 + zig, y, -1, bx + zig, y, 0, y % 2 === 0 ? H : HAIR_DK);
      }
      if (a.feature !== 1) {
        p.box(bx - 1, low - 3, -2, bx + 1, low - 3, 1, GOLD);
        p.box(bx - 1, low - 8, -1, bx + 1, low - 8, 0, GOLD);
      }
    }
  }
}

// ---------------------------------------------------------------- head accessories

export function accessories(a) {
  const b = new B(30, 40, 30, VS, 81);
  const o = [8, 17, 8];
  const p = new P(b, o);
  b.anchor = [7.5 + o[0], o[1], 5.5 + o[2]];
  for (const acc of a.acc) {
    switch (String(acc)) {
      case 'hat_wide':
        p.rbox(2, 12, 0, 12, 16, 10, LEATHER);
        p.rbox(3, 17, 1, 11, 17, 9, LEATHER);
        p.box(2, 13, 0, 12, 13, 10, BELT);
        p.rbox(-2, 12, -4, 16, 12, 14, LEATHER);
        p.box(2, 12, 0, 12, 12, 10, LEATHER);
        break;
      case 'hat_feather':
        p.rbox(1, 12, -1, 13, 14, 11, MAIN);
        p.rbox(2, 15, 0, 11, 15, 9, MAIN);
        p.box(1, 12, -2, 13, 12, 11, MAIN_DK);
        for (let k = 0; k < 12; k++) {
          p.box(12 + idiv(k, 4), 14 + idiv(k, 2), 6 + idiv(k, 2), 12 + idiv(k, 4), 14 + idiv(k, 2), 7 + idiv(k, 2), k < 10 ? CLOTH_W : ACCENT);
        }
        break;
      case 'hat_straw':
        p.rbox(2, 12, 0, 12, 15, 10, GOLD);
        p.box(2, 13, 0, 12, 13, 10, BELT);
        for (let x = -2; x < 17; x++) for (let z = -4; z < 15; z++) {
          if (Math.hypot(x - 7, (z - 5) * 1.0) <= 9.5 && (x + z) % 7 !== 0) p.s(x, 12, z, GOLD);
        }
        p.box(2, 12, 0, 12, 12, 10, GOLD);
        break;
      case 'cap':
        p.rbox(1, 12, -1, 13, 14, 11, MAIN_DK);
        p.rbox(3, 15, 1, 11, 15, 9, MAIN_DK);
        p.box(3, 12, -4, 11, 12, -2, MAIN_DK);
        p.box(1, 12, -1, 13, 12, 11, TRIM);
        break;
      case 'glasses':
      case 'glasses_thick': {
        const thick = acc === 'glasses_thick';
        for (const e of [[3, 6], [8, 11]]) {
          if (!thick) {
            p.box(e[0], 8, -1, e[1], 8, -1, METAL_DK);
            const ox = e[0] < 7 ? e[0] : e[1];
            p.box(ox, 6, -1, ox, 7, -1, METAL_DK);
            continue;
          }
          p.box(e[0], 8, -1, e[1], 8, -1, METAL_DK);
          p.box(e[0], 3, -1, e[1], 3, -1, METAL_DK);
          p.box(e[0], 4, -1, e[0], 7, -1, METAL_DK);
          p.box(e[1], 4, -1, e[1], 7, -1, METAL_DK);
          p.box(e[0], 3, -2, e[1], 8, -2, 0);
          p.box(e[0], 8, -2, e[1], 8, -2, METAL_DK); p.box(e[0], 3, -2, e[1], 3, -2, METAL_DK);
        }
        p.s(7, 6, -1, METAL_DK);
        p.box(2, 6, 0, 2, 6, 4, METAL_DK); p.box(12, 6, 0, 12, 6, 4, METAL_DK);
        break;
      }
      case 'quill':
        for (let k = 0; k < 7; k++) p.s(14 + idiv(k, 3), 5 + k, 4 + idiv(k, 2), k > 1 ? CLOTH_W : DARK);
        break;
      case 'veil':
        p.rbox(0, 0, 0, 14, 13, 12, DARK);
        p.box(2, 0, -1, 12, 11, 11, 0);
        p.box(1, 1, 0, 13, 11, 1, CLOTH_W);
        p.box(2, 12, -1, 12, 12, 1, CLOTH_W);
        p.box(2, 2, 0, 12, 10, 0, 0);
        p.rbox(1, -9, 10, 13, 2, 13, DARK);
        p.box(1, -9, 13, 13, -9, 13, MAIN);
        break;
      case 'circlet':
        p.box(2, 10, -1, 12, 10, -1, GOLD);
        p.box(1, 10, 0, 1, 10, 9, GOLD); p.box(13, 10, 0, 13, 10, 9, GOLD);
        p.s(7, 11, -1, ACCENT);
        break;
    }
  }
  return b;
}

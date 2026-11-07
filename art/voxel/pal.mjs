// Palette ids and colours, ported from Voxel Realm (voxel/palette.gd for the shared ids, CharModels.palette for
// a character's own colours at ids 200+).
import { color8, colorF, darkened, lightened, clerp, cval } from './gd.mjs';
import { SKIN as SKINS, HAIR as HAIRS, EYES as EYESET, OUTFIT, getRace } from './appearance.mjs';

// material kinds and flags used by characters
export const K_SOLID = 0;
export const K_GLOW = 3;
export const F_SOLID = 1, F_OPAQUE = 2, F_VISIBLE = 4;
const S = F_SOLID | F_OPAQUE | F_VISIBLE;

// shared ids characters reach into
export const GOLD_PAL = 32;
export const LANTERN = 36;
export const RUNE = 38;
export const CRYSTAL = 59;

// character ids (CharModels)
export const SKIN = 200, SKIN_SH = 201, HAIR = 202, HAIR_DK = 203, HAIR_LT = 204, EYE = 205, EYE_W = 206,
  MAIN = 207, MAIN_DK = 208, TRIM = 209, LEATHER = 210, METAL = 211, METAL_DK = 212, BOOT = 213, BELT = 214,
  GOLD = 215, MOUTH = 216, BLUSH = 217, CLOTH_W = 218, DARK = 219, ACCENT = 220, EYE_DK = 221, LASH = 222,
  UNDER = 223, UNDER_TR = 224, TUSK = 225, HORN = 226, HORN_DK = 227, HORN_TIP = 228, MARK = 229, MARK2 = 230,
  NOSE = 231, FACE_MK = 232, TEAR = 233;
export const GLOW = CRYSTAL;
export const GLOW2 = RUNE;

/** Per id: flags, kind, emission. Only the ids characters use are filled; everything else is air-like. */
export const FLAGS = new Uint8Array(256);
export const KINDS = new Uint8Array(256);
export const EMISSION = new Float32Array(256);
for (let id = 200; id < 256; id++) FLAGS[id] = S;
for (const [id, kind, e] of [[GOLD_PAL, K_SOLID, 0], [LANTERN, K_GLOW, 2.2], [RUNE, K_GLOW, 1.6], [CRYSTAL, K_GLOW, 1.4]]) {
  FLAGS[id] = S;
  KINDS[id] = kind;
  EMISSION[id] = e;
}
export const isOpaque = id => (FLAGS[id] & F_OPAQUE) !== 0;

const BASE = { [GOLD_PAL]: color8(222, 180, 80), [LANTERN]: color8(255, 196, 110), [RUNE]: color8(110, 200, 255), [CRYSTAL]: color8(170, 120, 255) };

/** CharModels.palette(a): id -> float32 rgb. */
export function palette(a) {
  const p = new Array(256).fill(null);
  for (let id = 200; id < 256; id++) p[id] = colorF(1, 0, 1);
  for (const k in BASE) p[k] = BASE[k];
  const skin = SKINS[a.skin];
  const hair = HAIRS[a.hair_color];
  const main = OUTFIT[a.outfit_main];
  const trim = OUTFIT[a.outfit_trim];
  const eye = EYESET[a.eye_color];
  p[SKIN] = skin;
  p[SKIN_SH] = clerp(darkened(skin, 0.1), color8(200, 110, 110), 0.08);
  p[HAIR] = hair;
  p[HAIR_DK] = clerp(darkened(hair, 0.25), color8(58, 50, 92), 0.14);
  p[HAIR_LT] = clerp(lightened(hair, 0.28), color8(255, 238, 196), 0.15);
  p[EYE] = lightened(eye, 0.12);
  p[EYE_DK] = darkened(eye, 0.45);
  p[EYE_W] = colorF(0.98, 0.98, 1.0);
  p[LASH] = clerp(darkened(hair, 0.7), color8(40, 30, 36), 0.6);
  p[MAIN] = main;
  p[MAIN_DK] = clerp(darkened(main, 0.25), color8(54, 46, 86), 0.12);
  p[TRIM] = trim;
  p[LEATHER] = color8(126, 86, 56);
  p[METAL] = color8(184, 190, 202);
  p[METAL_DK] = color8(118, 124, 138);
  p[BOOT] = color8(84, 60, 46);
  p[BELT] = color8(72, 52, 40);
  p[GOLD] = color8(226, 186, 88);
  p[MOUTH] = clerp(darkened(skin, 0.38), color8(170, 70, 70), 0.3);
  p[BLUSH] = clerp(skin, color8(240, 130, 130), 0.4);
  p[CLOTH_W] = color8(222, 216, 202);
  p[DARK] = color8(56, 54, 66);
  p[ACCENT] = lightened(trim, 0.15);
  p[UNDER] = a.body === 1 ? color8(190, 204, 228) : color8(70, 74, 92);
  p[UNDER_TR] = a.body === 1 ? color8(96, 116, 166) : color8(46, 48, 60);
  p[TUSK] = color8(240, 232, 208);
  p[HORN] = color8(104, 84, 86);
  p[HORN_DK] = color8(78, 62, 66);
  p[HORN_TIP] = color8(206, 190, 168);
  const mk = getRace(a.race).marks ?? '';
  p[MARK] = mk !== 'stone' ? darkened(skin, 0.42) : darkened(skin, 0.3);
  p[MARK2] = lightened(skin, 0.35);
  p[NOSE] = color8(226, 140, 150);
  p[GLOW] = lightened(eye, 0.25);
  p[GLOW2] = color8(120, 190, 255);
  p[TEAR] = color8(170, 214, 250);
  switch (Math.max(0, Math.min(6, a.face_mark))) {
    case 1: p[FACE_MK] = clerp(darkened(skin, 0.3), color8(150, 90, 60), 0.4); break;
    case 2: p[FACE_MK] = clerp(lightened(skin, 0.25), color8(230, 170, 160), 0.3); break;
    case 3: p[FACE_MK] = cval(trim) > 0.3 ? darkened(trim, 0.1) : color8(180, 50, 46); break;
    case 4: p[FACE_MK] = color8(56, 70, 120); break;
    default: p[FACE_MK] = color8(70, 44, 40);
  }
  switch (mk) {
    case 'fur':
      if (a.marks === 3) { p[MARK] = color8(60, 52, 54); p[MARK2] = color8(222, 146, 74); }
      p[SKIN_SH] = darkened(skin, 0.15);
      break;
    case 'scales':
      p[MARK] = darkened(skin, 0.18);
      p[MARK2] = clerp(lightened(skin, 0.3), color8(236, 220, 180), 0.35);
      p[HORN] = clerp(lightened(skin, 0.25), color8(220, 206, 180), 0.5);
      p[HORN_DK] = darkened(skin, 0.2);
      p[HORN_TIP] = color8(236, 228, 210);
      break;
    case 'radiant':
      p[GLOW] = a.heritage !== 'radiance' ? color8(255, 226, 150) : color8(240, 244, 255);
      p[HAIR_LT] = clerp(lightened(hair, 0.45), color8(255, 236, 170), 0.3);
      break;
    case 'stone':
      if (a.heritage === 'frost') p[MARK2] = color8(210, 236, 250);
      break;
  }
  return p;
}

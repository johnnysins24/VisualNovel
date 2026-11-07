// Character looks, ported from Voxel Realm (char_appearance.gd, char_races.gd).
import { color8, clamp } from './gd.mjs';

export const SKIN = [[242, 212, 188], [236, 198, 166], [214, 168, 128], [176, 124, 88], [128, 86, 60], [236, 220, 210],
  // orc: green, deep green, grey-green, olive, ash
  [132, 164, 100], [96, 128, 78], [136, 150, 122], [150, 146, 92], [146, 144, 138],
  // tiefling: infernal red, abyssal violet, indigo, chthonic ash, abyssal teal
  [188, 96, 88], [150, 100, 168], [96, 102, 168], [122, 116, 126], [78, 146, 150],
  // tabaxi fur: ginger, grey, black, cream, snow, brown
  [222, 146, 74], [150, 150, 158], [58, 56, 64], [236, 214, 176], [222, 222, 228], [146, 104, 72],
  // goliath: stone, frost, storm
  [156, 152, 146], [180, 194, 208], [96, 104, 120],
  // dragonborn scales
  [174, 74, 62], [218, 172, 74], [214, 218, 226], [172, 182, 198], [72, 108, 176], [168, 122, 72], [84, 146, 84], [136, 94, 176],
].map(c => color8(...c));
export const HAIR = [[226, 222, 214], [250, 214, 140], [196, 120, 64], [120, 70, 42], [52, 40, 36], [42, 42, 54],
  [164, 68, 66], [110, 150, 210], [150, 200, 170], [190, 150, 210], [236, 160, 180], [160, 160, 170]].map(c => color8(...c));
export const EYES = [[70, 120, 180], [90, 150, 90], [120, 80, 50], [160, 60, 60], [140, 90, 180], [200, 160, 60], [60, 60, 70],
  [246, 196, 70], [214, 92, 76], [236, 236, 246]].map(c => color8(...c));
export const OUTFIT = [[70, 96, 150], [162, 66, 60], [54, 94, 66], [110, 70, 140], [230, 216, 180], [60, 60, 70],
  [200, 140, 60], [90, 130, 140], [150, 110, 80]].map(c => color8(...c));
export const HAIR_STYLES = ['short', 'spiky', 'long', 'twintails', 'ponytail', 'bob', 'braid', 'messy', 'bald',
  'undercut', 'manbun', 'mohawk', 'wolf', 'parted', 'longwave', 'sidetail', 'hime', 'bun', 'pixie', 'halfup', 'lowbraids'];
export const CLASSES = ['warrior', 'sorcerer', 'ranger', 'cleric', 'rogue', 'bard'];

const HUMAN_SKIN = [0, 1, 2, 3, 4, 5];
const ORC_SKIN = [6, 7, 8, 9, 10];
const FIEND_SKIN = [0, 1, 2, 3, 4, 11, 12, 13, 14, 15];
const FUR = [16, 17, 18, 19, 20, 21];
const STONE_SKIN = [22, 23, 24];
const SCALES = [25, 26, 27, 28, 29, 30, 31, 32];

export const RACES = {
  human: { scale: 1.0, legs: 1.0, width: 1.0, depth: 1.0, limb: 1.0, hand: 1.0, foot: 1.0, arms: 1.0, head: 1.0, ears: 'round', skins: HUMAN_SKIN },
  elf: { scale: 1.0, legs: 1.08, width: 0.92, depth: 0.94, limb: 0.9, hand: 0.95, foot: 0.95, arms: 1.04, head: 0.95, ears: 'long', jaw: -1, skins: HUMAN_SKIN, heritages: ['high', 'wood'] },
  dwarf: { scale: 0.82, legs: 0.72, width: 1.25, depth: 1.28, limb: 1.3, hand: 1.3, foot: 1.25, arms: 0.9, head: 1.18, ears: 'round', beard: 3, nose: true, jaw: 1, skins: HUMAN_SKIN, heritages: ['hill', 'mountain'] },
  halfling: { scale: 0.57, legs: 0.85, width: 1.0, depth: 1.05, limb: 1.05, hand: 1.1, foot: 1.55, arms: 0.95, head: 1.3, ears: 'small', cheeks: true, barefoot: true, skins: HUMAN_SKIN, heritages: ['lightfoot', 'stout'] },
  orc: { scale: 1.04, legs: 1.03, width: 1.15, depth: 1.12, limb: 1.2, hand: 1.2, foot: 1.1, arms: 1.05, head: 1.0, ears: 'short', tusks: true, brow: true, jaw: 1, muscle_min: 0.45, skins: ORC_SKIN },
  tiefling: { scale: 1.0, legs: 1.0, width: 1.0, depth: 1.0, limb: 1.0, hand: 1.0, foot: 1.0, arms: 1.0, head: 1.0, ears: 'short', horns: true, tail: 'spade', eyes: 'solid', skins: FIEND_SKIN, heritages: ['infernal', 'abyssal', 'chthonic'] },
  dragonborn: { scale: 1.04, legs: 1.02, width: 1.18, depth: 1.15, limb: 1.15, hand: 1.15, foot: 1.15, arms: 1.04, head: 1.05, ears: 'none', dragon: true, tail: 'dragon', marks: 'scales', skins: SCALES, heritages: ['red', 'gold', 'white', 'silver', 'blue', 'bronze', 'green', 'amethyst'] },
  tabaxi: { scale: 1.0, legs: 1.06, width: 0.95, depth: 0.95, limb: 0.93, hand: 0.95, foot: 1.0, arms: 1.02, head: 0.97, ears: 'cat', cat: true, tail: 'cat', marks: 'fur', eyes: 'slit', skins: FUR },
  goliath: { scale: 1.12, legs: 1.04, width: 1.12, depth: 1.05, limb: 1.12, hand: 1.15, foot: 1.1, arms: 1.04, head: 1.0, ears: 'round', brow: true, jaw: 1, marks: 'stone', muscle_min: 0.35, skins: STONE_SKIN, heritages: ['stone', 'frost', 'storm'] },
  aasimar: { scale: 1.0, legs: 1.02, width: 1.0, depth: 1.0, limb: 1.0, hand: 1.0, foot: 1.0, arms: 1.0, head: 1.0, ears: 'round', eyes: 'glow', marks: 'radiant', skins: HUMAN_SKIN, heritages: ['wings', 'radiance'] },
  gnome: { scale: 0.55, legs: 0.8, width: 1.0, depth: 1.0, limb: 1.0, hand: 1.05, foot: 1.2, arms: 0.95, head: 1.42, ears: 'short', nose: true, eyes: 'big', cheeks: true, skins: HUMAN_SKIN, heritages: ['forest', 'rock'] },
};
export const RACE_NAMES = ['human', 'elf', 'dwarf', 'halfling', 'orc', 'tiefling', 'dragonborn', 'tabaxi', 'goliath', 'aasimar', 'gnome'];
export const HORNS = ['ram', 'swept', 'straight', 'crown', 'curved', 'long'];
export const DRAGON_HORNS = ['swept', 'curved', 'long', 'ram', 'crown', 'antlers', 'none'];

export const getRace = id => RACES[id] ?? RACES.human;
export function hornStyles(race) {
  if (race === 'tiefling') return HORNS;
  if (race === 'dragonborn') return DRAGON_HORNS;
  return [];
}

/** A look with Voxel Realm's defaults. */
export function defaults() {
  return {
    body: 0, muscle: 0.5, heft: 0.3, bust: 0.5, hips: 0.5, shoulders: 0.5,
    face: 0, eye_shape: 0, brows: 0, face_mark: 0, feature: 0,
    height: 1.0, build: 1.0, head_size: 1.0,
    skin: 1, hair_style: 0, hair_color: 3, eye_color: 0, outfit_main: 0, outfit_trim: 4,
    cls: 'warrior', ear: 0, race: 'human', heritage: '', marks: 0, horns: 0, beard: -1,
    acc: [], outfit: {},
  };
}

/** CharAppearance.from_dict, plus `cls` taken as given (the icon bake sets villager after from_dict). */
export function fromDict(d) {
  const a = defaults();
  const int = (k, def) => Math.trunc(Number(d[k] ?? def));
  const num = (k, def) => Number(d[k] ?? def);
  a.body = clamp(int('body', 0), 0, 1);
  a.height = clamp(num('height', 1.0), 0.9, 1.1);
  a.build = clamp(num('build', 1.0), 0.92, 1.08);
  a.head_size = clamp(num('head', 1.0), 0.94, 1.06);
  a.skin = clamp(int('skin', 1), 0, SKIN.length - 1);
  a.hair_style = clamp(int('hs', 0), 0, HAIR_STYLES.length - 1);
  a.hair_color = clamp(int('hc', 3), 0, HAIR.length - 1);
  a.eye_color = clamp(int('eye', 0), 0, EYES.length - 1);
  a.outfit_main = clamp(int('om', 0), 0, OUTFIT.length - 1);
  a.outfit_trim = clamp(int('ot', 4), 0, OUTFIT.length - 1);
  a.cls = d.cls ?? 'warrior';
  a.ear = clamp(int('ear', 0), 0, 1);
  a.muscle = clamp(num('mu', 0.5), 0, 1);
  a.heft = clamp(num('he', 0.3), 0, 1);
  a.bust = clamp(num('bu', 0.5), 0, 1);
  a.race = RACES[d.race] ? d.race : 'human';
  a.horns = clamp(int('horn', 0), 0, HORNS.length - 1);
  a.beard = clamp(int('beard', -1), -1, 3);
  a.heritage = String(d.her ?? '');
  if (!(getRace(a.race).heritages ?? []).includes(a.heritage)) a.heritage = '';
  a.marks = clamp(int('mk', 0), 0, 3);
  a.hips = clamp(num('hip', 0.5), 0, 1);
  a.shoulders = clamp(num('shl', 0.5), 0, 1);
  a.face = clamp(int('face', 0), 0, 4);
  a.eye_shape = clamp(int('es', 0), 0, 4);
  a.brows = clamp(int('brow', 0), 0, 4);
  a.face_mark = clamp(int('fm', 0), 0, 6);
  a.feature = clamp(int('ft', 0), 0, 2);
  a.acc = [...(d.acc ?? [])];
  a.outfit = { ...(d.outfit ?? {}) };
  return a;
}

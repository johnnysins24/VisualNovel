// Colour ramps in the locked look's style. A new ramp copies a locked ramp's shading steps (in OKLab)
// onto a new base colour, which becomes level 3. Lightness steps shrink for dark bases so level 0
// stays lighter than the outline. Lips and blush follow a skin tone: the same lightness ratio and
// colour shift they have on the locked skin. The skin, hair and eye ramps in palette.yaml were made
// this way (Art decisions A12-A14); `node art/kit/build.mjs ramp <ramp> <hex>` makes new ones.
const hexRGB = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = c => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

/** "ffdcbc" -> [L, a, b] in OKLab */
export function oklab(hex) {
  const [r, g, b] = hexRGB(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** [L, a, b] in OKLab -> "rrggbb" */
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return rgb.map(srgb).map(v => v.toString(16).padStart(2, '0')).join('');
}

/** A ramp shaped like ref (5 colours, dark -> light) with base as level 3. */
export function rampLike(ref, base, outline) {
  const R = ref.map(oklab), B = oklab(base), out = oklab(outline)[0];
  const kC = Math.min(1.5, Math.hypot(B[1], B[2]) / Math.hypot(R[3][1], R[3][2]));
  const kL = Math.min(1, (B[0] - out) / (R[3][0] - out));
  return R.map(([L, a, b]) => fromOklab([B[0] + (L - R[3][0]) * kL, B[1] + (a - R[3][1]) * kC, B[2] + (b - R[3][2]) * kC]));
}

/** A colour that sits on skinBase the way `one` sits on the locked skin (level 3 of skinRef). */
export function follow(one, skinRef, skinBase) {
  const S = oklab(skinRef[3]), O = oklab(one), B = oklab(skinBase);
  return fromOklab([(B[0] * O[0]) / S[0], B[1] + O[1] - S[1], B[2] + O[2] - S[2]]);
}

import type { LayerDef, Palette } from './types';

// Flat colored blocks. Real pixel art replaces these after Art decisions A1 to A3.
const r = (x: number, y: number, w: number, h: number, role: string) => ({ x, y, w, h, role });

export const LAYERS: Record<string, LayerDef> = {
  body: { id: 'body', z: 10, rects: [r(24, 30, 16, 36, 'skin'), r(26, 66, 5, 22, 'skin'), r(33, 66, 5, 22, 'skin'), r(20, 32, 4, 24, 'skin'), r(40, 32, 4, 24, 'skin')] },
  head: { id: 'head', z: 20, rects: [r(20, 8, 24, 22, 'skin'), r(26, 17, 3, 3, 'eye'), r(35, 17, 3, 3, 'eye')] },
  hair_short: { id: 'hair_short', z: 30, rects: [r(19, 5, 26, 8, 'hair'), r(19, 5, 4, 16, 'hair'), r(41, 5, 4, 16, 'hair')] },
  head_cap: { id: 'head_cap', z: 40, rects: [r(18, 3, 28, 9, 'cloth'), r(16, 10, 32, 3, 'cloth_dark')] },
  clothes_basic: { id: 'clothes_basic', z: 25, rects: [r(23, 34, 18, 30, 'cloth'), r(26, 64, 5, 18, 'cloth_dark'), r(33, 64, 5, 18, 'cloth_dark')] },
  weapon_dagger: { id: 'weapon_dagger', z: 50, rects: [r(45, 44, 3, 12, 'metal'), r(44, 56, 5, 3, 'wood')] },
};

export const PALETTES: Record<string, Palette> = {
  default: { skin: '#e8b98c', eye: '#222034', hair: '#5b3a29', cloth: '#4a6fa5', cloth_dark: '#34507a', metal: '#c8d0d8', wood: '#7a5230' },
  dusk: { skin: '#c68e63', eye: '#222034', hair: '#1e1e2a', cloth: '#8a4a5a', cloth_dark: '#5e3040', metal: '#aab4c0', wood: '#5c3e22' },
};

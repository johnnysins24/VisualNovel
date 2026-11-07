import { expect, it } from 'vitest';
import { rasterize } from '../src/sprites/compose';
import { LAYERS, PALETTES } from '../src/sprites/placeholder';
import { CANVAS } from '../src/sprites/types';

const px = (b: Uint8ClampedArray, x: number, y: number) => Array.from(b.slice((y * CANVAS.w + x) * 4, (y * CANVAS.w + x) * 4 + 4));

it('draws higher z layers on top', () => {
  const buf = rasterize([LAYERS.body!, LAYERS.head!, LAYERS.hair_short!], PALETTES.default!);
  expect(px(buf, 25, 6)).toEqual([0x5b, 0x3a, 0x29, 255]); // hair over head
});

it('recolors by palette without changing layer data', () => {
  const layers = [LAYERS.body!, LAYERS.head!];
  const a = rasterize(layers, PALETTES.default!);
  const b = rasterize(layers, PALETTES.dusk!);
  expect(px(a, 30, 40)).not.toEqual(px(b, 30, 40));
  expect(px(a, 0, 0)).toEqual([0, 0, 0, 0]);
});

it('fails loudly on a missing palette role', () => {
  expect(() => rasterize([LAYERS.body!], { skin: '#fff' })).not.toThrow();
  expect(() => rasterize([LAYERS.head!], { skin: '#fff' })).toThrow(/eye/);
});

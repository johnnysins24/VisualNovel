import { expect, it } from 'vitest';
import { loadMap, buildMap, paintMap } from '../art/kit/map.mjs';

const TAGS = ['arvel_village', 'ventras', 'hordun', 'ileth', 'ashland']; // every location_tag the content uses

it('world map: builds the same picture every time, with every place, name and location tag on it', () => {
  const M = loadMap(), a = buildMap(M), b = buildMap(M);
  expect(Buffer.from(a.mat.buffer).equals(Buffer.from(b.mat.buffer))).toBe(true);
  expect(Buffer.from(a.lvl.buffer).equals(Buffer.from(b.lvl.buffer))).toBe(true);
  expect(a.mat.every(m => m >= 0)).toBe(true); // nothing left unpainted

  const ids = M.places.map(p => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  const tags = new Set(M.places.map(p => p.tag).filter(Boolean));
  for (const t of TAGS) expect(tags, `no place stands for ${t}`).toContain(t);

  // every place is inside the picture and, ships and boats aside, on land; every name is on the map
  for (const p of M.places) {
    const [x, y] = p.at;
    expect(x >= 0 && y >= 0 && x < a.W && y < a.H, `${p.id} is off the map`).toBe(true);
    if (p.sprite !== 'ship' && p.sprite !== 'boat') expect(a.land[y * a.W + x], `${p.id} is in the sea`).toBe(1);
  }
  for (const l of a.labels) expect(l.x >= 0 && l.y >= 0 && l.x <= a.W && l.y <= a.H, `${l.th} is off the map`).toBe(true);
  expect(a.labels.filter(l => l.cls !== 'region' && l.cls !== 'sea' && l.cls !== 'river').length).toBeGreaterThan(50);

  for (const t of ['day', 'dusk', 'night']) expect(paintMap(M, a, t).rgba.length).toBe(a.W * a.H * 4);
}, 30_000);

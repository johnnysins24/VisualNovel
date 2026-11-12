// Node side of the sprite kit: reads the YAML from disk. Everything else lives in core.mjs, which the
// game also runs in the browser.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { makeKit } from './core.mjs';

export * from './core.mjs';

export const ART = decodeURIComponent(new URL('../', import.meta.url).pathname);

export const readYaml = rel => YAML.parse(readFileSync(join(ART, rel), 'utf8'));

/** Palette, bodies, every piece under art/pieces (id = path without .yaml, e.g. "hair/m/short") and the data files. */
export function loadKit() {
  const pieces = {};
  const walk = dir => {
    for (const f of readdirSync(join(ART, dir)).sort()) {
      const rel = `${dir}/${f}`;
      if (statSync(join(ART, rel)).isDirectory()) walk(rel);
      else if (f.endsWith('.yaml')) pieces[rel.slice('pieces/'.length, -'.yaml'.length)] = readYaml(rel);
    }
  };
  walk('pieces');
  const data = Object.fromEntries(['npcs', 'races', 'hair', 'outfits', 'items'].map(n => [n, readYaml(`${n}.yaml`)]));
  return makeKit({ palette: readYaml('palette.yaml'), bodies: readYaml('bodies.yaml'), pieces, ...data });
}

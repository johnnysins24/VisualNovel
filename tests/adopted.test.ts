import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { adoptPalette } from '../art/kit/adopt.mjs';
import { decodePNG } from '../art/kit/png.mjs';
import { CREDITS } from '../src/ui/credits';

type Entry = { from: string };
const list = YAML.parse(readFileSync('art/adopted.yaml', 'utf8')) as Record<string, Entry>;
const itemIds = new Set(
  readdirSync('content/items').flatMap((f) => ((YAML.parse(readFileSync(join('content/items', f), 'utf8')) ?? []) as { id: string }[]).map((i) => i.id)),
);
const creditsMd = readFileSync('CREDITS.md', 'utf8');

describe('adopted icons (art/adopted.yaml)', () => {
  it('every entry is a real item with its source and built icon present', () => {
    for (const [id, e] of Object.entries(list)) {
      expect(itemIds.has(id), `${id} is not an item`).toBe(true);
      expect(existsSync(join('art/thirdparty', e.from)), e.from).toBe(true);
      expect(existsSync(join('art/adopted', `${id}.png`)), `run node art/kit/adopt.mjs for ${id}`).toBe(true);
    }
  });

  it('every pack used is credited, and every game-icons.net icon names its author', () => {
    const packs = new Set(CREDITS.map((c) => c.pack));
    for (const e of Object.values(list)) {
      const pack = e.from.split('/')[0]!.replace(/-supplemental$/, '');
      expect(packs.has(pack), `${pack} missing from src/ui/credits.ts`).toBe(true);
      expect(creditsMd).toContain(`art/thirdparty/${e.from.split('/')[0]}/`);
      if (pack === 'game-icons') {
        const [, author, file] = e.from.split('/');
        const name = file!.replace(/\.svg$/, '');
        expect(creditsMd, `${name} by ${author} missing from CREDITS.md`).toMatch(new RegExp(`\\| ${name} \\| ${author}`, 'i'));
      }
    }
  });

  it('built icons use only our palette and outline, no half-transparent pixels', () => {
    const pal = adoptPalette();
    const ok = new Set([...pal.colours.map((c) => c.h), pal.outline]);
    for (const id of Object.keys(list)) {
      const img = decodePNG(readFileSync(join('art/adopted', `${id}.png`)));
      for (let i = 0; i < img.rgba.length; i += 4) {
        const a = img.rgba[i + 3]!;
        expect([0, 255]).toContain(a);
        if (!a) continue;
        const hex = [0, 1, 2].map((k) => img.rgba[i + k]!.toString(16).padStart(2, '0')).join('');
        expect(ok.has(hex), `${id}: ${hex}`).toBe(true);
      }
    }
  });
});

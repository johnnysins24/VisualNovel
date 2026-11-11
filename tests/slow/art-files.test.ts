// ไฟล์ภาพที่อยู่ใน repo (art/ และ public/): ภาพวาดทุกภาพ ศัตรู ไอคอนของ ไอคอนสิ่งติดตัว และเครดิตของชุดฟรี
// ช้าเพราะอ่านและสร้างภาพจริงทุกไฟล์ จึงอยู่ในชุดเต็ม (npm test) ไม่อยู่ในชุดเร็ว (npm run check) ต้องรันเมื่อแก้ไฟล์ใน art/
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { decodePNG } from '../../art/kit/png.mjs';
import { EMPTY, bounds, exportImage, flatten, fromYaml, levelOf, makePalette, newDrawing, run, toYaml, type Img } from '../../src/studio/core';
import { CREDITS } from '../../src/ui/credits';
import { DIRS, GEAR_MAT, TRAIT_KINDS, fromSilhouette, gearIcons, gearTable, importSvg, importTile, kindOfRef, listDrawings, listSources, palette, pathOf, peopleFoes, previewImage, readDrawing, sourcePath, staleFiles, traitTable } from '../../scripts/studio-lib';

const pal = makePalette(YAML.parse(readFileSync('art/palette.yaml', 'utf8')), YAML.parse(readFileSync('art/scenes/palette.yaml', 'utf8')));

describe('drawing room: files in the repo (scripts/studio-lib.ts)', () => {
  it('only takes drawing names and source paths that stay inside their folders', () => {
    expect(pathOf('foes/ash_hound')).toMatch(/art\/foes\/ash_hound\.yaml$/);
    for (const bad of ['../x', 'foes/../x', 'foes/Ash', 'pieces/x', 'foes/a/b', '/etc/passwd', 'foes/a.yaml', '']) expect(() => pathOf(bad), bad).toThrow();
    expect(kindOfRef('wear/sword')).toBe('piece');
    expect(Object.values(DIRS).sort()).toEqual(['foes', 'icons', 'props', 'wear']);
    expect(sourcePath('dungeon-crawl/monster/animals/hell_hound_new.png')).toMatch(/thirdparty/);
    expect(sourcePath('style-lock/bare.png')).toMatch(/docs\/ref\/style-lock/);
    for (const bad of ['../palette.yaml', 'dungeon-crawl/../../palette.yaml', 'dungeon-crawl/LICENSE.txt', 'style-lock/../../../package.json', '/etc/hostname.png', 'nope/x.png']) expect(() => sourcePath(bad), bad).toThrow();
    expect(listSources('').dirs).toContain('dungeon-crawl');
    expect(listSources('style-lock').files).toContain('bare.png');
    expect(() => listSources('..')).toThrow();
    expect(() => listSources('dungeon-crawl/../..')).toThrow();
  });

  it('imports a pack tile as a drawing that remembers where it came from', () => {
    const doc = importTile('dungeon-crawl/monster/animals/wolf.png');
    expect(doc.kind).toBe('foe');
    expect(doc.meta.from).toBe('dungeon-crawl/monster/animals/wolf.png');
    expect(fromYaml(toYaml(doc)).meta.from).toBe(doc.meta.from);
    const big = importTile('dungeon-crawl/monster/animals/wolf.png', { big: true });
    expect(big.w).toBeGreaterThan(doc.w * 1.6);
    expect(() => importTile('style-lock/bare.png')).toThrow(/อ้างอิง/);
  });

  it('imports one cell of an icon sheet', () => {
    const doc = importTile('shikashi/icons.png', { kind: 'icon', cell: [32, 160, 32, 32] });
    expect(doc.kind).toBe('icon');
    expect(doc.meta.cell).toBe('32,160,32,32');
    expect(doc.w).toBeLessThanOrEqual(34);
    expect(doc.h).toBeLessThanOrEqual(34);
    expect(bounds(doc)).not.toBeNull();
    expect(fromYaml(toYaml(doc)).meta.cell).toBe('32,160,32,32');
    for (const bad of [[0, 0, 32], [500, 0, 32, 32], [0, 860, 32, 32], [0, 0, 0, 32], [-1, 0, 32, 32], [0.5, 0, 32, 32]]) expect(() => importTile('shikashi/icons.png', { cell: bad }), String(bad)).toThrow(/ช่อง/);
  });

  it('turns a one-colour silhouette into one material lit from the upper left', () => {
    // สี่เหลี่ยมทึบ 6 x 6 กลางผืน 8 x 8 (พิกเซลจางกว่าครึ่งไม่นับ)
    const img: Img = { w: 8, h: 8, rgba: new Uint8ClampedArray(8 * 8 * 4) };
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) img.rgba[(y * 8 + x) * 4 + 3] = 255;
    img.rgba[3] = 90;
    const doc = fromSilhouette(img, { ramp: 'metal_brass' });
    expect(doc.kind).toBe('icon');
    expect(doc.mats).toEqual(['ink', GEAR_MAT]);
    expect(doc.ramps[GEAR_MAT]).toBe('metal_brass');
    expect(doc.outline).toBe(true);
    const px = flatten(doc), at = (x: number, y: number) => px[y * 8 + x]!;
    expect(at(0, 0)).toBe(EMPTY);
    expect(levelOf(at(1, 3)), 'left edge is lit').toBe(4);
    expect(levelOf(at(3, 1)), 'top edge is lit').toBe(4);
    expect(levelOf(at(6, 4)), 'right edge is dark').toBe(0);
    expect(levelOf(at(4, 6)), 'bottom edge is dark').toBe(0);
    expect(levelOf(at(3, 3))).toBeGreaterThanOrEqual(1);
    expect(levelOf(at(3, 3))).toBeLessThanOrEqual(3);
    const out = exportImage(doc, pal);
    expect([out.w, out.h], 'the outline goes around the shape').toEqual([8, 8]);
    expect(() => fromSilhouette(img, { ramp: 'nope' })).toThrow(/ramp/);
    expect(() => fromSilhouette(img, { mat: 'ink' })).toThrow(/วัสดุ/);
  });

  it('refuses vector icons outside the packs before any browser starts', async () => {
    for (const bad of ['../x.svg', 'game-icons/../../x.svg', '/etc/x.svg', 'game-icons/lorc/nope.svg', 'game-icons/lorc/owl.png']) await expect(importSvg(bad), bad).rejects.toThrow(/เวกเตอร์/);
    await expect(importSvg('game-icons/lorc/owl.svg', { size: 4 })).rejects.toThrow(/ขนาด/);
  });

  const refs = listDrawings();

  it('every drawing in art/ loads, uses real ramps and has its game files built', () => {
    expect(refs).toContain('foes/ash_hound');
    for (const ref of refs) expect(() => readDrawing(ref), ref).not.toThrow();
    expect(staleFiles(), 'run npm run draw -- build').toEqual([]);
  });

  it('every foe has a standing pose and a strike pose, and its game picture is our palette only', () => {
    const ok = new Set([palette().outline, ...Object.values(palette().ramps).flat()]);
    const index = JSON.parse(readFileSync('public/foes/index.json', 'utf8')) as Record<string, { w: number; h: number; frames: string[] }>;
    for (const ref of refs.filter((r) => r.startsWith('foes/'))) {
      const id = ref.split('/')[1]!, doc = readDrawing(ref);
      expect(doc.frames.map((f) => f.name), ref).toEqual(['idle', 'strike']);
      const img = decodePNG(readFileSync(`public/foes/${id}.png`)), info = index[id]!;
      expect([img.w, img.h], ref).toEqual([info.w * info.frames.length, info.h]);
      expect(info.h, `${ref} is taller than the stage`).toBeLessThanOrEqual(104);
      for (let i = 0; i < img.rgba.length; i += 4) {
        const a = img.rgba[i + 3]!;
        expect([0, 255]).toContain(a);
        if (a) expect(ok.has([0, 1, 2].map((k) => img.rgba[i + k]!.toString(16).padStart(2, '0')).join('')), ref).toBe(true);
      }
    }
  });

  it('builds the human-shaped foes from the character pieces, two poses each', () => {
    const ok = new Set([palette().outline, ...Object.values(palette().ramps).flat()]);
    const index = JSON.parse(readFileSync('public/foes/index.json', 'utf8')) as Record<string, { w: number; h: number; frames: string[]; kit?: boolean }>;
    const people = peopleFoes();
    expect(people.map((p) => p.id)).toEqual(expect.arrayContaining(['ash_soldier', 'glass_one', 'extra_shadow', 'nameless_ghost', 'bandit', 'witch_hunter', 'mercenary', 'ash_cultist', 'star_listener']));
    for (const p of people) {
      expect(refs, p.id).not.toContain(`foes/${p.id}`); // ไม่ซ้ำกับภาพที่วาด
      expect(index[p.id], p.id).toEqual({ w: p.w, h: p.h, frames: ['idle', 'strike'], lift: 0, kit: true });
      expect(p.h, `${p.id} is taller than the stage`).toBeLessThanOrEqual(104);
      const [idle, strike] = p.frames as [Img, Img];
      expect([idle.w, idle.h, strike.w, strike.h], p.id).toEqual([p.w, p.h, p.w, p.h]);
      expect(Buffer.from(idle.rgba).equals(Buffer.from(strike.rgba)), `${p.id}: strike is the same picture as idle`).toBe(false);
      for (const f of p.frames) for (let i = 0; i < f.rgba.length; i += 4) {
        if (f.rgba[i + 3]) expect(ok.has([0, 1, 2].map((k) => f.rgba[i + k]!.toString(16).padStart(2, '0')).join('')), p.id).toBe(true);
      }
    }
  });

  it('the first roster of foes is complete, and a strike pose never equals the standing pose', () => {
    const index = JSON.parse(readFileSync('public/foes/index.json', 'utf8')) as Record<string, { w: number; h: number; frames: string[]; lift: number }>;
    const roster = [
      'ash_hound', 'coal_ghost', 'chimney_imp', 'walking_smoke', 'ash_soldier', // จอมมาร
      'hum_moth', 'float_eye', 'great_eye', 'glass_walker', 'sky_spawn', 'sky_jelly', 'salt_crab', 'star_lump', 'fallen_star', 'glass_one', 'extra_shadow', // ดาว
      'mad_sentry', 'house_servitor', 'nameless_ghost', // จักรกล และคำสาปของหิน
      'old_wood', 'fire_cub', 'walking_water', 'waking_stone', 'night_scrap', 'stray_bird', 'earth_calf', // ลูกหลานของเจ้าเดิม
      'wolf', 'bear', 'boar', 'snake', 'mine_rat', 'bat', // สัตว์ป่า
      'bandit', 'witch_hunter', 'mercenary', 'ash_cultist', 'star_listener', // คน
    ];
    expect(Object.keys(index).sort()).toEqual([...roster].sort());
    for (const id of roster) {
      const info = index[id]!, img = decodePNG(readFileSync(`public/foes/${id}.png`));
      expect(info.frames, id).toEqual(['idle', 'strike']);
      let differs = false;
      for (let y = 0; y < info.h && !differs; y++) for (let x = 0; x < info.w; x++) {
        const a = (y * img.w + x) * 4, b = a + info.w * 4;
        if (img.rgba[a] !== img.rgba[b] || img.rgba[a + 1] !== img.rgba[b + 1] || img.rgba[a + 2] !== img.rgba[b + 2] || img.rgba[a + 3] !== img.rgba[b + 3]) { differs = true; break; }
      }
      expect(differs, `${id}: strike is the same picture as idle`).toBe(true);
      expect(info.lift, id).toBeGreaterThanOrEqual(0);
      expect(info.h + info.lift, `${id} leaves the stage`).toBeLessThanOrEqual(104);
    }
  });

  it('every drawing that started from a free pack names a credited pack, and every game-icons.net icon its author', () => {
    const packs = new Set(CREDITS.map((c) => c.pack)), creditsMd = readFileSync('CREDITS.md', 'utf8');
    const inGame = CREDITS.find((c) => c.pack === 'game-icons')!.by.toLowerCase();
    for (const ref of refs) {
      const from = readDrawing(ref).meta.from;
      if (from === undefined) continue;
      const dir = String(from).split('/')[0]!;
      expect(packs.has(dir.replace(/-supplemental$/, '')), `${ref}: ${dir} missing from src/ui/credits.ts`).toBe(true);
      expect(creditsMd, ref).toContain(`art/thirdparty/${dir}/`);
      if (dir !== 'game-icons') continue;
      const [, author, file] = String(from).split('/'), name = file!.replace(/\.svg$/, ''), who = author!.replace(/-/g, ' ');
      expect(creditsMd, `${name} by ${author} missing from CREDITS.md`).toMatch(new RegExp(`\\| ${name} \\| ${who} \\|`, 'i'));
      expect(inGame, `${who} missing from the in-game credit`).toContain(who);
    }
  });

  const paletteOnly = (file: string, what: string) => {
    const ok = new Set([palette().outline, ...Object.values(palette().ramps).flat()]), img = decodePNG(readFileSync(file));
    for (let i = 0; i < img.rgba.length; i += 4) {
      const a = img.rgba[i + 3]!;
      expect([0, 255], what).toContain(a);
      if (a) expect(ok.has([0, 1, 2].map((k) => img.rgba[i + k]!.toString(16).padStart(2, '0')).join('')), what).toBe(true);
    }
    return img;
  };
  const icons = JSON.parse(readFileSync('public/icons/index.json', 'utf8')) as Record<string, { w: number; h: number; frames: string[]; from?: string }>;

  it('gear: 36 patterns, each drawn once and built in the six materials', () => {
    const gear = gearTable(), mats = Object.keys(gear.materials);
    expect(mats).toEqual(['brass', 'black_iron', 'ileth_wood', 'star_silver', 'demon_coal', 'cold_iron']);
    expect(new Set(Object.values(gear.materials).map((m) => m.ramp)).size, 'two materials must not share a ramp').toBe(6);
    expect(Object.keys(gear.patterns)).toHaveLength(36);
    const slots = new Set(Object.values(gear.patterns).map((pt) => pt.slot));
    expect([...slots].sort(), 'every slot of the game has a pattern').toEqual(['accessory', 'body', 'cloak', 'feet', 'hands', 'head', 'legs', 'offhand', 'weapon']);
    expect(refs.filter((r) => r.startsWith('icons/gear_')).map((r) => r.slice(11)).sort()).toEqual(Object.keys(gear.patterns).sort());
    for (const pt of Object.keys(gear.patterns)) {
      const id = `gear_${pt}`, doc = readDrawing(`icons/${id}`), info = icons[id]!;
      expect(doc.mats, id).toContain(GEAR_MAT);
      expect(doc.meta.from, `${id} must start from a pack picture`).toBeTruthy();
      expect(info.frames, id).toEqual(mats);
      expect(Math.max(info.w, info.h), `${id} is too big for an icon`).toBeLessThanOrEqual(38);
      const img = paletteOnly(`public/icons/${id}.png`, id);
      expect([img.w, img.h], id).toEqual([info.w * 6, info.h]);
      // วัสดุต่างกันต้องได้ภาพต่างกัน และรูปร่างต้องเหมือนกันทุกช่อง
      const cell = (n: number) => { const o: number[] = []; for (let y = 0; y < info.h; y++) for (let x = 0; x < info.w; x++) o.push(...img.rgba.subarray((y * img.w + n * info.w + x) * 4, (y * img.w + n * info.w + x) * 4 + 4)); return o; };
      const cells = mats.map((_, n) => cell(n));
      expect(new Set(cells.map((c) => c.join())).size, `${id}: two materials look the same`).toBe(6);
      const shape = (c: number[]) => c.filter((_, i) => i % 4 === 3).join('');
      expect(new Set(cells.map(shape)).size, `${id}: the shape changes with the material`).toBe(1);
    }
    const two = newDrawing('icon', 4, 4);
    expect(() => gearIcons(two, gear)).toThrow(new RegExp(GEAR_MAT));
  });

  it('traits: the first 60, one icon each, in four kinds', () => {
    const traits = traitTable(), ids = Object.keys(traits);
    expect(ids).toHaveLength(60);
    const count = Object.fromEntries(TRAIT_KINDS.map((k) => [k, ids.filter((id) => traits[id]!.kind === k).length]));
    expect(count).toEqual({ boon: 21, curse: 15, trait: 14, wound: 10 });
    expect(new Set(Object.values(traits).map((t) => t.name)).size, 'two traits share a name').toBe(60);
    expect(refs.filter((r) => r.startsWith('icons/trait_')).map((r) => r.slice(12)).sort()).toEqual([...ids].sort());
    const seen = new Map<string, string>();
    for (const id of ids) {
      const key = `trait_${id}`, doc = readDrawing(`icons/${key}`), info = icons[key]!;
      expect(doc.meta.from, `${key} must start from a pack picture`).toBeTruthy();
      expect(info.frames, key).toHaveLength(1);
      expect(Math.max(info.w, info.h), `${key} is too big for an icon`).toBeLessThanOrEqual(36);
      const img = paletteOnly(`public/icons/${key}.png`, key), sig = `${img.w}x${img.h}:${img.rgba.join()}`;
      expect(seen.get(sig), `${key} looks exactly like another trait`).toBeUndefined();
      seen.set(sig, key);
    }
  });

  it('makes a check picture with a coordinate grid', () => {
    const doc = readDrawing('foes/ash_hound'), img = previewImage(doc, { zoom: 4 });
    expect(img.w).toBeGreaterThan(doc.w * 4 * 2); // สองเฟรมเรียงกัน
    expect(img.h).toBeGreaterThan(doc.h * 4 + 112 * 3); // ตารางขยาย + ฉากขนาดจริงคูณสาม
  });
});

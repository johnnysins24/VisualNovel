// ห้องวาด (src/studio/core.ts) และตัวนำเข้าภาพจากชุดฟรี (art/kit/pixels.mjs, art/kit/png.mjs)
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { adoptPalette, adoptTile, dropShadow, scale2x, trim } from '../art/kit/adopt.mjs';
import { decodePNG, encodePNG } from '../art/kit/png.mjs';
import { loadKit, buildPiece, compose } from '../art/kit/kit.mjs';
import {
  EMPTY, HELP, bounds, cloneStudio, code, exportFrames, exportImage, flatten, fromImage, fromYaml, layerOf, levelOf, makePalette, matOf, newDrawing, newStudio, pieceSpec,
  render, run, runScript, strays, toPieceSpec, toYaml, type Img, type Studio,
} from '../src/studio/core';
import { CREDITS } from '../src/ui/credits';
import {
  DIRS, GEAR_MAT, TRAIT_KINDS, fromSilhouette, gearIcons, gearTable, importSvg, importTile, kindOfRef, listDrawings, listSources, palette, pathOf, peopleFoes, previewImage,
  readDrawing, sourcePath, staleFiles, traitTable,
} from '../scripts/studio-lib';

const pal = makePalette(YAML.parse(readFileSync('art/palette.yaml', 'utf8')), YAML.parse(readFileSync('art/scenes/palette.yaml', 'utf8')));

/** ภาพของชั้นปัจจุบันเป็นข้อความ: . ว่าง, # ink, เลข = ระดับแสงของวัสดุแรก, ตัวอักษร = วัสดุถัดไป */
function ascii(st: Studio, px = layerOf(st).px): string {
  const rows: string[] = [];
  for (let y = 0; y < st.doc.h; y++) {
    let row = '';
    for (let x = 0; x < st.doc.w; x++) {
      const c = px[y * st.doc.w + x]!;
      row += c === EMPTY ? '.' : matOf(c) === 0 ? '#' : matOf(c) === 1 ? String(levelOf(c)) : String.fromCharCode(96 + matOf(c));
    }
    rows.push(row);
  }
  return rows.join('\n');
}
function studio(w = 8, h = 6): Studio {
  const st = newStudio(newDrawing('foe', w, h));
  runScript(st, 'mat hide scene.dark_stone\nmat ember metal_demoncoal\nuse hide 2', pal);
  return st;
}

describe('PNG reader', () => {
  const dir = 'art/thirdparty/dungeon-crawl';
  const header = (p: string) => { const b = readFileSync(p); return { depth: b[24], type: b[25], interlace: b[28] }; };

  it('reads palette PNGs (about half of the monster tiles)', () => {
    const p = `${dir}/monster/animals/hell_hound_new.png`;
    expect(header(p).type).toBe(3);
    const img = decodePNG(readFileSync(p));
    expect([img.w, img.h]).toEqual([32, 32]);
    const alphas = new Set<number>();
    for (let i = 3; i < img.rgba.length; i += 4) alphas.add(img.rgba[i]!);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]); // โปร่งจาก tRNS และทึบ
  });

  it('reads interlaced PNGs', () => {
    const p = `${dir}/dungeon/doors/closed_door.png`;
    expect(header(p).interlace).toBe(1);
    const img = decodePNG(readFileSync(p));
    expect([img.w, img.h]).toEqual([32, 32]);
    // ประตูปิดเต็มช่อง: พิกเซลกลางภาพต้องทึบ
    expect(img.rgba[(16 * 32 + 16) * 4 + 3]).toBe(255);
  });

  it('reads low bit depths and grey tiles', () => {
    const types = new Set<string>();
    for (const rel of ['monster/animals/bat.png', 'item/misc/misc_box.png', 'dungeon/floor/grass/grass_0_old.png', 'monster/undead/shadow_new.png']) {
      try { const h = header(`${dir}/${rel}`); decodePNG(readFileSync(`${dir}/${rel}`)); types.add(`${h.type}/${h.depth}`); } catch { /* ไฟล์ตัวอย่างบางตัวอาจไม่มีในชุด */ }
    }
    expect(types.size).toBeGreaterThan(0);
  });

  it('what it writes reads back the same', () => {
    const img = decodePNG(readFileSync(`${dir}/monster/animals/hell_hound_new.png`));
    expect(decodePNG(Buffer.from(encodePNG(img))).rgba).toEqual(img.rgba);
  });
});

describe('tile import (art/kit/pixels.mjs)', () => {
  const B = [0, 0, 0, 255], R = [200, 40, 40, 255], _ = [0, 0, 0, 0];
  const image = (rows: number[][][]): Img => ({ w: rows[0]!.length, h: rows.length, rgba: Uint8ClampedArray.from(rows.flat(2)) });
  const alpha = (img: Img) => Array.from({ length: img.h }, (_r, y) => Array.from({ length: img.w }, (_c, x) => (img.rgba[(y * img.w + x) * 4 + 3] ? 1 : 0)).join('')).join('\n');

  it('clears the flat ground shadow but keeps the black rim that touches colour', () => {
    const img = image([
      [_, B, B, B, _, _],
      [_, B, R, B, _, _],
      [_, B, B, B, B, B], // เงาพื้นยื่นออกไปทางขวา
      [_, _, B, B, B, B],
    ]);
    // ขอบดำที่เหลือคือพิกเซลที่ติดสีทางตรง มุมทแยงหายไป (เส้นขอบของเกมก็ไม่มีมุมทแยง)
    expect(alpha(dropShadow(img))).toBe(['001000', '011100', '001000', '000000'].join('\n'));
    expect(alpha(img)).toBe(['011100', '011100', '011111', '001111'].join('\n')); // ไม่แก้ภาพต้นทาง
  });

  it('doubles a tile without inventing colours', () => {
    const img = decodePNG(readFileSync('art/thirdparty/dungeon-crawl/monster/animals/hell_hound_new.png'));
    const big = scale2x(img);
    expect([big.w, big.h]).toEqual([64, 64]);
    const colours = (im: Img) => { const s = new Set<number>(); for (let i = 0; i < im.rgba.length; i += 4) s.add((im.rgba[i]! << 16) | (im.rgba[i + 1]! << 8) | im.rgba[i + 2]!); return s; };
    const src = colours(img);
    for (const c of colours(big)) expect(src.has(c)).toBe(true);
  });

  it('an adopted tile uses only our palette, our outline and no half-transparent pixels', () => {
    const ap = adoptPalette(), ok = new Set([...ap.colours.map((c) => c.h), ap.outline]);
    for (const big of [false, true]) {
      const out = adoptTile(decodePNG(readFileSync('art/thirdparty/dungeon-crawl/monster/animals/hell_hound_new.png')), ap, { big });
      expect(out.w).toBeGreaterThan(big ? 40 : 20);
      for (let i = 0; i < out.rgba.length; i += 4) {
        expect([0, 255]).toContain(out.rgba[i + 3]);
        if (out.rgba[i + 3]) expect(ok.has([0, 1, 2].map((k) => out.rgba[i + k]!.toString(16).padStart(2, '0')).join(''))).toBe(true);
      }
      expect(trim(out).w).toBe(out.w); // ตัดขอบว่างแล้ว
    }
  });
});

describe('drawing room: commands', () => {
  it('draws points, lines, boxes, ellipses and polygons with the brush', () => {
    const st = studio();
    runScript(st, 'pencil 0,0 7,5\nline 1,1 4,4\nrect hide@4 5,0 7,2');
    expect(ascii(st)).toBe(['2....444', '.2...4.4', '..2..444', '...2....', '....2...', '.......2'].join('\n'));
    const e = studio(7, 5);
    run(e, 'ellipse 0,0 6,4 fill');
    expect(ascii(e)).toBe(['..222..', '.22222.', '2222222', '.22222.', '..222..'].join('\n'));
    run(e, 'layer clear');
    run(e, 'ellipse 0,0 6,4');
    expect(ascii(e)).toBe(['..222..', '.2...2.', '2.....2', '.2...2.', '..222..'].join('\n'));
    const p = studio(6, 5);
    run(p, 'poly 0,4 2,0 5,4 fill');
    expect(ascii(p).split('\n').map((r) => r.replace(/[^2]/g, '').length)).toEqual([1, 2, 4, 4, 6]);
  });

  it('fills a closed region and stops at its border', () => {
    const st = studio();
    runScript(st, 'rect 1,1 5,4\nfill ember@3 3,2');
    expect(ascii(st)).toBe(['........', '.22222..', '.2bbb2..', '.2bbb2..', '.22222..', '........'].join('\n'));
    run(st, 'fill ink 0,0');
    expect(ascii(st).split('\n')[0]).toBe('########');
    expect(ascii(st).split('\n')[2]).toBe('#2bbb2##');
  });

  it('erases, stamps a block of letters, and replaces a colour', () => {
    const st = studio();
    runScript(st, '# หมายเหตุทั้งบรรทัด\nkey a hide@1 # หมายเหตุท้ายบรรทัด\nkey b ember@4\nstamp 1,1 aab/a#b/.xa');
    expect(ascii(st)).toBe(['........', '.11b....', '.1#b....', '...1....', '........', '........'].join('\n'));
    runScript(st, 'erase 1,1 2,1\nreplace hide ember\nreplace ember@4 ink');
    expect(ascii(st)).toBe(['........', '...#....', '.b##....', '...b....', '........', '........'].join('\n'));
    expect(levelOf(layerOf(st).px[2 * 8 + 1]!)).toBe(1); // เปลี่ยนวัสดุ ระดับแสงเดิม
  });

  it('lightens and darkens by steps, never past the ends of the ramp', () => {
    const st = studio(4, 2);
    runScript(st, 'rect 0,0 3,1 fill\nshade +1 0,0 1,1\nshade -5 3,0 3,1\nshade-at +9 2,0');
    expect(ascii(st)).toBe(['3340', '3320'].join('\n'));
    run(st, 'pencil ink 0,0');
    run(st, 'shade +1');
    expect(ascii(st)).toBe(['#441', '4431'].join('\n')); // ink ไม่มีระดับ
  });

  it('shades a blob from the upper left: lit side lighter than the far side, all levels in range', () => {
    const st = studio(16, 12);
    runScript(st, 'ellipse 1,1 14,10 fill\nautoshade hide');
    const px = layerOf(st).px, lv = (x: number, y: number) => levelOf(px[y * 16 + x]!);
    expect(lv(3, 2)).toBeGreaterThan(lv(12, 9));
    expect(lv(7, 5)).toBe(2); // กลางก้อนอยู่ที่ระดับกลาง
    for (const c of px) if (c >= 0) expect(levelOf(c)).toBeLessThanOrEqual(4);
  });

  it('a selection limits every tool, and moves or flips with its pixels', () => {
    const st = studio();
    runScript(st, 'select 2,1 4,3\nrect 0,0 7,5 fill');
    expect(ascii(st)).toBe(['........', '..222...', '..222...', '..222...', '........', '........'].join('\n'));
    runScript(st, 'pencil ember@0 2,1\nmove 3,2');
    expect(ascii(st)).toBe(['........', '........', '........', '.....b22', '.....222', '.....222'].join('\n'));
    expect(st.sel).toEqual({ x0: 5, y0: 3, x1: 7, y1: 5 });
    run(st, 'flip h');
    expect(ascii(st).split('\n')[3]).toBe('.....22b');
    runScript(st, 'select none\nflip v');
    expect(ascii(st).split('\n')[2]).toBe('.....22b');
  });

  it('leans a shape: the bottom row stays, the top row moves the whole distance', () => {
    const st = studio(8, 5);
    runScript(st, 'rect 4,0 5,4 fill\nlean -4');
    expect(ascii(st)).toBe(['22......', '.22.....', '..22....', '...22...', '....22..'].join('\n'));
    // ในกรอบเลือก: เอนเฉพาะส่วนที่เลือก ส่วนที่เหลืออยู่กับที่
    const b = studio(8, 4);
    runScript(b, 'rect 2,0 3,3 fill\nselect 0,0 7,1\nlean 2');
    expect(ascii(b)).toBe(['....22..', '..22....', '..22....', '..22....'].join('\n'));
  });

  it('merges several materials into one by lightness: darkest colour to level 0, lightest to level 4', () => {
    const st = newStudio(newDrawing('icon', 6, 1));
    // ใบดาบที่นำเข้ามักแตกเป็นหลาย ramp: เทาเข้มสองขั้น เทากลาง ขาวสองขั้น
    runScript(st, 'mat a scene.dark_stone\nmat b scene.stone\nmat c scene.snow\nmat grip leather_brown', pal);
    runScript(st, 'pencil a@0 0,0\npencil a@4 1,0\npencil b@2 2,0\npencil c@1 3,0\npencil c@4 4,0\npencil grip@2 5,0', pal);
    const before = [0, 1, 2, 3, 4].map((x) => render(st.doc, pal).rgba[x * 4]!);
    expect([...before].sort((p, q) => p - q), 'the test colours must already run dark to light').toEqual(before);
    run(st, 'mat main metal_iron', pal);
    run(st, 'replace a,b,c main tone', pal);
    const row = [...layerOf(st).px], main = st.doc.mats.indexOf('main');
    expect(row.slice(0, 5).every((c) => matOf(c) === main)).toBe(true);
    const levels = row.slice(0, 5).map(levelOf);
    expect(levels[0]).toBe(0);
    expect(levels[4]).toBe(4);
    expect([...levels].sort((p, q) => p - q), 'order of lightness is kept').toEqual(levels);
    expect(st.doc.mats[matOf(row[5]!)], 'materials not named stay').toBe('grip');
    // สีเดียวทั้งกลุ่มได้ระดับกลาง และคำสั่งที่ผิดรูปไม่เปลี่ยนอะไร
    const one = newStudio(newDrawing('icon', 2, 1));
    runScript(one, 'mat a scene.stone\npencil a@3 0,0 1,0\nmat main metal_brass\nreplace a main tone', pal);
    expect([...layerOf(one).px].map(levelOf)).toEqual([2, 2]);
    expect(() => run(st, 'replace main@2 grip tone', pal)).toThrow(/tone/);
    expect(() => run(st, 'replace main grip@1 tone', pal)).toThrow(/tone/);
    expect(() => run(st, 'replace main grip shade', pal)).toThrow(/replace/);
  });

  it('tidy drops the materials no pixel uses and leaves the picture as it was', () => {
    const st = studio(4, 2);
    runScript(st, 'mat spare wood\nmat glow scene.fire\npencil hide@1 0,0\npencil glow@3 1,0\npencil ink 2,0\nlayer add top\npencil glow@4 3,1\nkey g glow@2', pal);
    const before = render(st.doc, pal);
    expect(run(st, 'tidy', pal)).toMatch(/ember spare/);
    expect(st.doc.mats).toEqual(['ink', 'hide', 'glow']);
    expect(Object.keys(st.doc.ramps).sort()).toEqual(['glow', 'hide']);
    expect([...render(st.doc, pal).rgba]).toEqual([...before.rgba]);
    expect(() => run(st, 'stamp 0,0 g', pal), 'stamp letters are cleared, their codes moved').toThrow(/key/);
    expect(run(st, 'tidy', pal)).toMatch(/ไม่มี/);
    run(st, 'undo', pal); // ย้อน tidy รอบที่ไม่ได้ทำอะไร
    run(st, 'undo', pal);
    expect(st.doc.mats).toContain('spare');
    expect([...render(st.doc, pal).rgba]).toEqual([...before.rgba]);
  });

  it('mirrors one half onto the other, on a column or between two', () => {
    const a = studio(7, 1);
    runScript(a, 'pencil 0,0 2,0\npencil ember@1 3,0\nmirror 3');
    expect(ascii(a)).toBe('2.2b2.2');
    const b = studio(6, 1);
    runScript(b, 'pencil 5,0\npencil ember@1 3,0\nmirror 2.5 right');
    expect(ascii(b)).toBe('2.bb.2');
  });

  it('resizes and trims the canvas around what is drawn', () => {
    const st = studio();
    runScript(st, 'rect 3,2 5,3 fill\ntrim');
    expect([st.doc.w, st.doc.h]).toEqual([5, 4]);
    expect(ascii(st)).toBe(['.....', '.222.', '.222.', '.....'].join('\n'));
    run(st, 'resize 7 4 2 0');
    expect(ascii(st).split('\n')[1]).toBe('...222.');
    expect(bounds(st.doc)).toEqual({ x0: 3, y0: 1, x1: 5, y1: 2 });
  });

  it('keeps layers and frames apart', () => {
    const st = studio(4, 2);
    runScript(st, 'rect 0,0 3,1 fill\nlayer add glow\npencil ember@4 1,0\nframe add strike from idle\nlayer select main\nerase 0,0 3,0');
    expect(st.doc.frames.map((f) => f.name)).toEqual(['idle', 'strike']);
    expect(ascii(st, flatten(st.doc, 0))).toBe(['2b22', '2222'].join('\n'));
    expect(ascii(st, flatten(st.doc, 1))).toBe(['.b..', '2222'].join('\n'));
    runScript(st, 'layer hide glow');
    expect(ascii(st, flatten(st.doc, 1))).toBe(['....', '2222'].join('\n'));
    runScript(st, 'layer show glow\nlayer select glow\nlayer merge');
    expect(st.doc.frames[1]!.layers.map((l) => l.name)).toEqual(['main']);
    expect(ascii(st)).toBe(['.b..', '2222'].join('\n'));
    expect(() => run(st, 'layer delete')).toThrow(/อย่างน้อยหนึ่งชั้น/);
  });

  it('undo and redo restore the picture exactly', () => {
    const st = studio();
    run(st, 'rect 0,0 7,5 fill');
    const full = ascii(st);
    run(st, 'ellipse ember@4 1,1 6,4 fill');
    const both = ascii(st);
    run(st, 'undo');
    expect(ascii(st)).toBe(full);
    run(st, 'redo');
    expect(ascii(st)).toBe(both);
    runScript(st, 'undo\nundo');
    expect(bounds(st.doc)).toBeNull();
    expect(run(st, 'undo')).toBe(''); // ย้อนคำสั่ง use ของตอนตั้งต้นไม่ได้ เพราะไม่ได้เปลี่ยนภาพ จึงไปถึง mat
  });

  it('a bad command changes nothing and names what is wrong', () => {
    const st = studio();
    run(st, 'rect 1,1 3,3 fill');
    const before = ascii(st), undo = st.undo.length, log = st.log.length;
    expect(() => run(st, 'line 1,1')).toThrow(/line x0,y0 x1,y1/);
    expect(() => run(st, 'pencil stone 1,1')).toThrow(/ไม่มีวัสดุ "stone"/);
    expect(() => run(st, 'wobble 3')).toThrow(/ไม่รู้จักคำสั่ง "wobble"/);
    expect(() => run(st, 'mat fur no_such_ramp', pal)).toThrow(/ไม่มี ramp/);
    expect(() => runScript(st, 'pencil 0,0\nlevel 9')).toThrow(/บรรทัด 2/);
    expect(ascii(st)).toBe(`2${before.slice(1)}`); // บรรทัดแรกของสคริปต์ผ่านไปแล้ว บรรทัดที่ผิดไม่ทำอะไร
    expect(st.undo.length).toBe(undo + 1);
    expect(st.log.length).toBe(log + 1);
  });

  it('replaying the command log gives the same picture', () => {
    const st = studio(12, 10);
    runScript(st, 'ellipse 1,1 10,8 fill\nautoshade\nlayer add eye\npencil ember@4 4,4\nundo\npencil ember@3 5,4\nselect 0,0 5,9\nmove 1,0\nframe add strike from idle\nshade +1');
    const again = newStudio(newDrawing('foe', 12, 10));
    runScript(again, st.log.join('\n'), pal);
    expect(toYaml(again.doc)).toBe(toYaml(st.doc));
  });
});

describe('drawing room: files and pictures', () => {
  const drawn = () => {
    const st = studio(10, 8);
    runScript(st, 'ellipse 1,1 8,6 fill\nautoshade\nlayer add eye\npencil ember@4 3,3\npencil ink 6,3\nframe add strike from idle\nlayer hide eye\nmeta name หมาเถ้า\nmeta feet 7');
    return st;
  };

  it('saves to YAML and reads back the same drawing', () => {
    const st = drawn(), text = toYaml(st.doc), back = fromYaml(text);
    expect(toYaml(back)).toBe(text);
    expect(back.frames.map((f) => f.layers.map((l) => [l.name, l.hidden]))).toEqual([[['main', false], ['eye', false]], [['main', false], ['eye', true]]]);
    expect(back.meta).toEqual({ name: 'หมาเถ้า', feet: 7 });
    expect(Array.from(flatten(back, 0))).toEqual(Array.from(flatten(st.doc, 0)));
    // ไฟล์อ่านด้วยตาได้: ตารางตัวอักษรอยู่ใต้ ascii เป็นบล็อก
    expect(text).toMatch(/ramps: \{ hide: scene\.dark_stone, ember: metal_demoncoal \}/);
    expect(text).toMatch(/ascii: \|\n {8}[.a-z#]+\n/);
  });

  it('refuses broken files', () => {
    const text = toYaml(drawn().doc);
    expect(() => fromYaml(text.replace('kind: foe', 'kind: dragon'))).toThrow(/ชนิดภาพ/);
    expect(() => fromYaml(text.replace('at: [ 1, 1 ]', 'at: [ 9, 1 ]').replace('at: [1, 1]', 'at: [9, 1]'))).toThrow(/ล้นขอบภาพ/);
    expect(() => fromYaml(text.replace(/legend: \{[^}]*\}/, 'legend: {}'))).toThrow(/legend/);
    expect(() => fromYaml('')).toThrow();
  });

  it('colours pixels from the ramps and outlines the silhouette', () => {
    const st = studio(3, 3);
    run(st, 'pencil hide@4 1,1');
    const img = render(st.doc, pal), hex = (x: number, y: number) => (img.rgba[(y * 3 + x) * 4 + 3] ? [0, 1, 2].map((k) => img.rgba[(y * 3 + x) * 4 + k]!.toString(16).padStart(2, '0')).join('') : null);
    expect(hex(1, 1)).toBe(pal.ramps['scene.dark_stone']![4]);
    expect([hex(1, 0), hex(0, 1), hex(2, 1), hex(1, 2)]).toEqual(Array(4).fill(pal.outline));
    expect(hex(0, 0)).toBeNull(); // เส้นขอบไม่กินมุมทแยง
    run(st, 'outline off');
    expect(render(st.doc, pal).rgba.filter((_v, i) => i % 4 === 3 && _v > 0).length).toBe(1);
  });

  it('exports with room for the outline and no empty border', () => {
    const st = studio(4, 4);
    run(st, 'rect 0,0 3,3 fill');
    const out = exportImage(st.doc, pal);
    expect([out.w, out.h]).toEqual([6, 6]); // 4 + เส้นขอบข้างละ 1
    run(st, 'erase-rect 0,0 3,3');
    expect([exportImage(st.doc, pal).w, exportImage(st.doc, pal).h]).toEqual([1, 1]);
  });

  it('a drawn piece goes on a character through the sprite kit', () => {
    const st = newStudio(newDrawing('piece', 64, 96));
    runScript(st, 'mat metal metal_brass\nmat leather leather_brown\nuse metal 4\nrect 26,30 36,33 fill\npencil leather@1 31,31', pal);
    const spec = toPieceSpec(st.doc, { z: 70 });
    expect(spec.shapes).toHaveLength(1);
    expect(spec.shapes[0]!.at).toEqual([-5, 30]);
    const kit = loadKit();
    kit.pieces['studio/test'] = spec;
    const img = compose(kit, [buildPiece(kit, 'body', 'm'), buildPiece(kit, 'studio/test', 'm')]);
    const hex = (x: number, y: number) => [0, 1, 2].map((k) => img.rgba[(y * 64 + x) * 4 + k]!.toString(16).padStart(2, '0')).join('');
    expect(hex(27, 30)).toBe(pal.ramps.metal_brass![4]);
    expect(hex(31, 31)).toBe(pal.ramps.leather_brown![1]);
    run(st, 'pencil ink 0,0');
    expect(() => toPieceSpec(st.doc)).toThrow(/ink/);
  });

  it('turns an adopted tile into materials and levels, with few enough materials to recolour', () => {
    const ap = adoptPalette();
    const tile = adoptTile(decodePNG(readFileSync('art/thirdparty/dungeon-crawl/monster/animals/hell_hound_new.png')), ap);
    const doc = fromImage(tile, pal, { maxMats: 4 });
    expect(doc.mats.length).toBeLessThanOrEqual(5); // ink + 4
    expect(doc.outline).toBe(false);
    const back = render(doc, pal);
    let same = 0, filled = 0;
    for (let p = 0; p < tile.w * tile.h; p++) {
      expect(back.rgba[p * 4 + 3]).toBe(tile.rgba[p * 4 + 3]); // รูปร่างเดิมทุกพิกเซล
      if (!tile.rgba[p * 4 + 3]) continue;
      filled++;
      if ([0, 1, 2].every((k) => back.rgba[p * 4 + k] === tile.rgba[p * 4 + k])) same++;
    }
    expect(same / filled).toBeGreaterThan(0.6); // สีส่วนใหญ่คงเดิม ที่เหลือย้ายไปสีใกล้เคียงใน ramp ที่เลือก
    expect(toYaml(fromYaml(toYaml(doc)))).toBe(toYaml(doc));
    const all = fromImage(tile, pal, { maxMats: 99 });
    expect(Array.from(render(all, pal).rgba)).toEqual(Array.from(tile.rgba)); // ไม่จำกัดวัสดุ = ภาพเดิมทุกสี
    expect(code(0, 0)).toBe(0);
  });
});

describe('drawing room: locks, symmetry, strays', () => {
  it('a locked layer cannot be changed until it is unlocked, and the lock is saved', () => {
    const st = studio(4, 4);
    run(st, 'pencil 1,1');
    run(st, 'layer lock');
    for (const line of ['pencil 2,2', 'fill 0,0', 'move 1,0', 'flip h', 'layer clear', 'erase 1,1']) expect(() => run(st, line), line).toThrow(/ล็อก/);
    expect(fromYaml(toYaml(st.doc)).frames[0]!.layers[0]!.locked).toBe(true);
    run(st, 'layer add top');
    run(st, 'pencil 0,0');
    expect(() => run(st, 'layer merge')).toThrow(/ล็อก/);
    run(st, 'layer unlock main');
    run(st, 'layer merge');
    expect(ascii(st)).toBe('2...\n.2..\n....\n....');
  });

  it('symmetry draws the other side too, around a column or between two columns', () => {
    const st = studio(6, 3);
    run(st, 'sym 2.5');
    run(st, 'stroke 0,0 1,1');
    expect(ascii(st)).toBe('2....2\n.2..2.\n......');
    // ถังสีเทอีกฝั่งด้วย: กำแพงตรงกลางแบ่งผืนเป็นสองห้อง เทห้องซ้ายแล้วห้องขวาเต็มตาม
    const wall = studio(7, 1);
    runScript(wall, 'sym 3\npencil 3,0\nfill hide@4 0,0');
    expect(ascii(wall)).toBe('4442444');
    run(st, 'sym 2');
    run(st, 'erase 0,0');
    expect(ascii(st).split('\n')[0]).toBe('.....2'); // คู่ของ 0 รอบคอลัมน์ 2 คือ 4 ซึ่งว่างอยู่แล้ว
    run(st, 'sym off');
    run(st, 'pencil 0,0');
    expect(ascii(st).split('\n')[0]).toBe('2....2');
    expect(() => run(st, 'sym 1.3')).toThrow();
    expect(st.undo.length).toBe(5); // วัสดุสองอย่าง เส้น ลบ แต้ม: sym เปลี่ยนแค่วิธีวาด ไม่ลงประวัติย้อนกลับ
  });

  it('points out lone pixels', () => {
    const st = studio(5, 3);
    runScript(st, 'rect 0,0 1,1 fill\npencil hide@4 3,1\npencil ember@3 0,0');
    expect(strays(st.doc)).toEqual([[0, 0], [3, 1]]);
  });

  it('shade-at counts a pixel once however often the stroke crosses it', () => {
    const st = studio(3, 1);
    run(st, 'rect hide@1 0,0 2,0 fill');
    run(st, 'shade-at +1 0,0 2,0 0,0');
    expect(ascii(st)).toBe('222');
  });

  it('a copy of the studio is independent of the original', () => {
    const st = studio(2, 1);
    run(st, 'pencil 0,0');
    const copy = cloneStudio(st);
    run(copy, 'pencil 1,0');
    expect(ascii(st)).toBe('2.');
    expect(ascii(copy)).toBe('22');
    expect([st.undo.length, copy.undo.length]).toEqual([3, 4]); // studio() ตั้งวัสดุไว้สองคำสั่งก่อนแล้ว
  });

  it('every frame is exported with the same box, so a second pose keeps its place', () => {
    const st = studio(8, 4);
    runScript(st, 'outline off\nrect 2,1 3,2 fill\nframe add strike\nrect 0,1 1,2 fill');
    const ex = exportFrames(st.doc, pal);
    expect([ex.w, ex.h, ex.frames.length]).toEqual([4, 2, 2]);
    const cols = (im: Img) => [0, 1, 2, 3].map((x) => (im.rgba[x * 4 + 3] ? 'o' : '.')).join('');
    expect([cols(ex.frames[0]!), cols(ex.frames[1]!)]).toEqual(['..oo', 'oo..']);
  });

  it('a piece can be placed by a body landmark so it follows every body', () => {
    const st = newStudio(newDrawing('piece', 64, 96));
    runScript(st, 'mat metal metal_iron\nmeta col hand\nmeta row hand\nline metal@3 21,60 21,76', pal);
    const kit = loadKit(), m = kit.bodies.m!, f = kit.bodies.f!;
    const spec = pieceSpec(st.doc, { marks: m.marks, cols: m.cols as Record<string, number> });
    expect(spec.shapes[0]!.at).toEqual(['hand+0', 'hand-16']); // มือของร่าง m อยู่คอลัมน์ 31 - 10 แถว 76
    kit.pieces['studio/blade'] = spec;
    const top = (body: string) => {
      const img = compose(kit, [buildPiece(kit, 'studio/blade', body)]);
      for (let p = 0; p < img.w * img.h; p++) if (img.rgba[p * 4 + 3]) return [p % img.w, (p / img.w) | 0];
      return null;
    };
    // ร่างหญิงมือชิดตัวกว่าหนึ่งคอลัมน์ ชิ้นจึงขยับตาม (พิกเซลบนสุดคือเส้นขอบเหนือปลายดาบ คอลัมน์เดียวกับมือ)
    expect(top('m')![0]).toBe(31 + (m.cols as Record<string, number>).hand!);
    expect(top('f')![0]).toBe(31 + (f.cols as Record<string, number>).hand!);
    expect((m.cols as Record<string, number>).hand).not.toBe((f.cols as Record<string, number>).hand);
    st.doc.meta.row = 'elbow';
    expect(() => pieceSpec(st.doc, { marks: m.marks, cols: m.cols as Record<string, number> })).toThrow(/elbow/);
  });

  it('the command guide names every command and nothing else', () => {
    const st = studio(8, 8);
    const words = new Set(HELP.flatMap(([syntax]) => syntax.split(' / ').map((s) => s.split(' ')[0]!)));
    for (const w of words) {
      // คำสั่งที่มีอยู่จริงไม่ตอบว่า "ไม่รู้จักคำสั่ง" (อาจบ่นเรื่องอื่นเพราะไม่ได้ใส่ค่า)
      let msg = '';
      try { run(st, w); } catch (e) { msg = (e as Error).message; }
      expect(msg, w).not.toMatch(/ไม่รู้จักคำสั่ง/);
    }
    expect(() => run(st, 'explode')).toThrow(/ไม่รู้จักคำสั่ง/);
  });
});

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

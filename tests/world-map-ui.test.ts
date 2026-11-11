import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  MAX_ZOOM,
  MINOR_FROM,
  REGIONS_UNTIL,
  centerOf,
  centerOn,
  clampView,
  fitView,
  layoutLabels,
  pinFor,
  zoomAt,
  zoomOf,
  type Frame,
  type MapData,
} from '../src/ui/mapLayout';

const DATA = JSON.parse(readFileSync('public/map/labels.json', 'utf8')) as MapData;

/** ทุกค่าของ key นี้ในไฟล์เนื้อเรื่อง (ทั้งเงื่อนไขและผลของตัวเลือก) */
function collect(node: unknown, key: string, out: { value: unknown; parent: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) for (const n of node) collect(n, key, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (key in o) out.push({ value: o[key], parent: o });
    for (const v of Object.values(o)) collect(v, key, out);
  }
  return out;
}
const EVENTS = readdirSync('content/events')
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => parse(readFileSync(join('content/events', f), 'utf8')) as unknown);

describe('world map: where the "you are here" pin stands', () => {
  it('every location tag the story uses has exactly one pin on the map', () => {
    const tags = new Set(EVENTS.flatMap((e) => collect(e, 'location_tag')).map((x) => String(x.value)));
    expect(tags.size).toBeGreaterThanOrEqual(5);
    for (const t of tags) expect(DATA.labels.filter((l) => l.tag === t && l.pin).map((l) => l.id), `pins for ${t}`).toHaveLength(1);
  });

  it('every birth origin has one home on the map, in the land the birth puts the child', () => {
    const birth = parse(readFileSync('content/events/00_birth.yaml', 'utf8')) as unknown;
    const born = new Map<string, string>(); // origin flag → location_tag
    for (const { value, parent } of collect(birth, 'location_tag')) {
      for (const flag of (parent.flags as string[] | undefined) ?? []) if (flag.startsWith('origin_')) born.set(flag, String(value));
    }
    expect(born.size).toBeGreaterThanOrEqual(8);
    for (const [flag, tag] of born) {
      const homes = DATA.labels.filter((l) => l.home?.includes(flag));
      expect(homes.map((l) => l.id), `home of ${flag}`).toHaveLength(1);
      expect(homes[0]!.tag, `${flag} is born in ${tag}`).toBe(tag);
    }
  });

  const life = (locationTag: string, homeTag: string | null, flags: string[]) => ({ locationTag, homeTag, flags });
  const at = (l: ReturnType<typeof life>) => pinFor(l, DATA.labels)?.id ?? null;

  it('stands on the home village while the player is home, on the land itself once they move', () => {
    expect(at(life('arvel_village', 'arvel_village', ['origin_farm', 'race_human']))).toBe('ban_ngao_sao');
    expect(at(life('arvel_village', 'arvel_village', ['origin_marked_foundling']))).toBe('isel_temple');
    expect(at(life('arvel_village', 'arvel_village', ['origin_marked_kept']))).toBe('ban_rongsi_bon');
    expect(at(life('ventras', 'ventras', ['origin_refinery']))).toBe('ventras_refineries');
    expect(at(life('ventras', 'ventras', ['origin_marked_hidden']))).toBe('ventras');
    expect(at(life('hordun', 'hordun', ['origin_dwarf_clan']))).toBe('tundar');
    expect(at(life('ileth', 'ileth', ['origin_elf_bough']))).toBe('ban_king_lom');
    expect(at(life('ashland', 'ashland', ['origin_ashland']))).toBe('ban_ya_ngoen');
    // moved away: the main place of where they are now
    expect(at(life('ventras', 'arvel_village', ['origin_farm']))).toBe('ventras');
    expect(at(life('arvel_village', 'ventras', ['origin_refinery']))).toBe('ban_ngao_sao');
    expect(at(life('ashland', 'arvel_village', ['origin_marked_foundling']))).toBe('ban_ya_ngoen');
    // before birth (the starting tag) or a land the map does not know: no pin
    expect(at(life('village', null, []))).toBeNull();
    expect(at(life('arvel_village', null, []))).toBe('ban_ngao_sao');
  });

  it('stands on the town once the player lives in one, even back in the home region', () => {
    const inCity = (city: string, locationTag: string, homeTag: string, flags: string[] = []) => pinFor({ locationTag, homeTag, flags, city }, DATA.labels)?.id ?? null;
    expect(inCity('market_town', 'arvel_village', 'arvel_village', ['origin_farm'])).toBe('market_town');
    expect(inCity('foothill_market', 'hordun', 'hordun', ['origin_dwarf_clan'])).toBe('foothill_market');
    expect(inCity('star_hall', 'ileth', 'arvel_village')).toBe('star_tower');
    expect(inCity('kardin', 'kardin', 'ventras')).toBe('kardin');
    // เมืองหลักของถิ่น: คนที่เกิดในเมืองยังอยู่ที่ย่านบ้านเกิด
    expect(inCity('ventras', 'ventras', 'ventras', ['origin_refinery'])).toBe('ventras_refineries');
    expect(inCity('tundar', 'hordun', 'arvel_village')).toBe('tundar');
  });
});

describe('world map: zoom and pan', () => {
  const f: Frame = { cw: 360, ch: 225, W: DATA.width, H: DATA.height };
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

  it('starts on the whole land, and never shows past its edges', () => {
    const v = fitView(f);
    close(v.k, 360 / 640);
    close(v.x, 0);
    close(v.y, 0);
    close(zoomOf(v, f), 1);
    // too far out, too far in, dragged off the edge
    close(clampView({ k: 0.1, x: 50, y: 50 }, f).k, v.k);
    close(zoomOf(clampView({ k: 99, x: 0, y: 0 }, f), f), MAX_ZOOM);
    const off = clampView({ k: v.k * 2, x: 400, y: -9999 }, f);
    close(off.x, 0);
    close(off.y, f.ch - f.H * off.k);
  });

  it('keeps the spot under the finger in place while zooming, and centres on a place', () => {
    const v = centerOn(320, 200, 2, f);
    const z = zoomAt(v, 1.6, 100, 80, f);
    close((100 - v.x) / v.k, (100 - z.x) / z.k);
    close((80 - v.y) / v.k, (80 - z.y) / z.k);
    const [mx, my] = centerOf(centerOn(300, 280, 3, f), f);
    close(mx, 300);
    close(my, 280);
  });
});

describe('world map: names', () => {
  const measure = (text: string) => [...text].length * 6.5;
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  for (const [cw, ch] of [
    [360, 225],
    [688, 430],
  ] as const) {
    it(`never overlap and stay inside a ${cw} px map, at every zoom`, () => {
      const f: Frame = { cw, ch, W: DATA.width, H: DATA.height };
      for (const zoom of [1, 1.6, 2.56, 4, MAX_ZOOM]) {
        for (const [mx, my] of [
          [320, 200],
          [300, 280],
          [100, 200],
          [540, 200],
        ] as const) {
          const v = centerOn(mx, my, zoom, f);
          const buttons = { x: cw - 122, y: ch - 42, w: 114, h: 34 }; // the zoom buttons in the corner
          const placed = layoutLabels(DATA, v, f, measure, { pinId: 'ban_ngao_sao', avoid: [buttons] });
          for (const [i, p] of placed.entries()) {
            expect(p.box.x >= 0 && p.box.y >= 0 && p.box.x + p.box.w <= cw && p.box.y + p.box.h <= ch, `${p.label.th} spills out`).toBe(true);
            if (!p.pin) expect(overlap(p.box, buttons), `${p.label.th} under the buttons`).toBe(false);
            for (const q of placed.slice(i + 1)) expect(overlap(p.box, q.box), `${p.label.th} / ${q.label.th} at zoom ${zoom}`).toBe(false);
          }
          const z = zoomOf(v, f);
          if (z < MINOR_FROM) expect(placed.some((p) => p.style === 'minor')).toBe(false);
          if (z >= REGIONS_UNTIL) expect(placed.some((p) => p.style === 'region' || p.style === 'sea')).toBe(false);
        }
      }
    });
  }

  it('always shows the pin and the picked place, and more names as you zoom in', () => {
    const f: Frame = { cw: 360, ch: 225, W: DATA.width, H: DATA.height };
    const whole = layoutLabels(DATA, fitView(f), f, measure, { pinId: 'tundar', selId: 'fort_3' });
    expect(whole.find((p) => p.label.id === 'tundar')?.pin).toBe(true);
    expect(whole.find((p) => p.label.id === 'fort_3')?.sel).toBe(true);
    expect(whole.some((p) => p.label.id === 'arvel')).toBe(true); // the kingdom's name on the whole map
    const near = layoutLabels(DATA, centerOn(330, 300, 4, f), f, measure, { pinId: 'ban_ngao_sao' });
    const around = (p: (typeof near)[number]) => Math.abs(p.label.x - 330) < 60 && Math.abs(p.label.y - 300) < 40;
    expect(near.filter(around).length).toBeGreaterThan(whole.filter(around).length);
  });
});

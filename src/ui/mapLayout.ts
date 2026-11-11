/**
 * แผนที่โลกในเกม (แท็บโลกและแผนที่เล็กบน HUD): ภาพกับชื่อมาจาก public/map ที่ art/kit/map.mjs วาด
 * ไฟล์นี้มีแต่การคำนวณ ไม่แตะ DOM จึง test ได้ (tests/world-map-ui.test.ts) ส่วนที่วาดอยู่ใน WorldMap.tsx
 */

import { CITIES } from '../engine/balance';
import { isCity } from '../engine/cities';

export type Anchor = 'start' | 'middle' | 'end';

/** ชื่อหนึ่งชื่อใน public/map/labels.json พิกัดเป็นพิกเซลของภาพแผนที่ */
export interface MapLabel {
  id: string;
  th: string;
  /** region · sea · river สำหรับชื่อแผ่นดินกับน้ำ ที่เหลือคือชนิดของที่ (capital, village, fort ...) */
  cls: string;
  x: number;
  y: number;
  anchor?: Anchor;
  minor?: boolean;
  angle?: number;
  note?: string;
  region?: string;
  /** location_tag ของเกมที่ที่นี้เป็นตัวแทน */
  tag?: string;
  /** ตัวสถานที่ (ชื่ออาจวางห่างออกไป) */
  at?: [number, number];
  /** ที่ปักหมุด "อยู่ที่นี่" ของ tag นี้ */
  pin?: boolean;
  /** flag ชาติกำเนิดของเด็กที่เกิดที่นี่ */
  home?: string[];
}

export interface MapData {
  width: number;
  height: number;
  labels: MapLabel[];
  /** กรอบเสาฟ้า [x0, y0, x1, y1] ชื่อไม่ทับเสา */
  obstacles?: [number, number, number, number][];
}

export const REGION_TH: Record<string, string> = { arvel: 'อาร์เวล', ileth: 'ป่าไอเลธ', hordun: 'ฮอร์ดุน', ashland: 'แดนเถ้า' };

/**
 * หมุดอยู่ตรงไหน: ตอนอยู่ถิ่นเกิด หมุดลงที่บ้านเกิดตามชาติกำเนิด (บ้านเงาเสา วิหารอีเซล ย่านโรงกลั่น ...)
 * ไปอยู่ถิ่นอื่น หมุดลงที่หลักของถิ่นนั้น ถิ่นที่แผนที่ไม่รู้จัก (เช่นก่อนเกิด) ไม่มีหมุด
 * ย้ายเข้าเมือง (life.city) หมุดลงที่เมืองนั้นบนแผนที่ (CITIES[เมือง].map)
 */
export function pinFor(
  l: { locationTag: string; homeTag: string | null; flags: readonly string[]; city?: string | null },
  labels: readonly MapLabel[],
): MapLabel | null {
  const tag = l.locationTag;
  // อยู่ในเมือง: หมุดลงที่เมืองนั้น (คนที่เกิดในเมืองหลักของถิ่นยังลงที่ย่านบ้านเกิดตามชาติกำเนิด)
  const city = isCity(l.city) ? CITIES[l.city] : null;
  const town = city ? (labels.find((p) => p.id === city.map) ?? null) : null;
  if (town && !city!.main) return town;
  if (l.homeTag === tag) {
    const home = labels.find((p) => p.tag === tag && p.home?.some((f) => l.flags.includes(f)));
    if (home) return home;
  }
  return town ?? labels.find((p) => p.tag === tag && p.pin) ?? null;
}

// ---------- มุมมอง: จุดบนจอ = จุดบนแผนที่ × k + (x, y) ----------

export interface View {
  k: number;
  x: number;
  y: number;
}
/** กรอบบนจอ cw × ch กับภาพแผนที่ W × H */
export interface Frame {
  cw: number;
  ch: number;
  W: number;
  H: number;
}

/** ซูมได้ลึกสุดกี่เท่าของตอนเห็นทั้งแผ่น */
export const MAX_ZOOM = 6;

/** k ที่ภาพทั้งแผ่นเต็มกรอบพอดี ไม่มีขอบว่าง */
export const fitScale = (f: Frame) => Math.max(f.cw / f.W, f.ch / f.H);

/** ซูมกี่เท่าของตอนเห็นทั้งแผ่น */
export const zoomOf = (v: View, f: Frame) => v.k / fitScale(f);

/** ไม่ให้ซูมเกินช่วง และไม่ให้เลื่อนจนเห็นขอบนอกภาพ */
export function clampView(v: View, f: Frame): View {
  const k0 = fitScale(f);
  const k = Math.min(Math.max(v.k, k0), k0 * MAX_ZOOM);
  return {
    k,
    x: Math.min(0, Math.max(f.cw - f.W * k, v.x)),
    y: Math.min(0, Math.max(f.ch - f.H * k, v.y)),
  };
}

/** ให้จุด (mx, my) บนแผนที่อยู่กลางกรอบ ที่ซูม zoom เท่า */
export function centerOn(mx: number, my: number, zoom: number, f: Frame): View {
  const k = fitScale(f) * zoom;
  return clampView({ k, x: f.cw / 2 - mx * k, y: f.ch / 2 - my * k }, f);
}

/** เห็นทั้งแผ่น */
export const fitView = (f: Frame): View => centerOn(f.W / 2, f.H / 2, 1, f);

/** ซูมรอบจุด (px, py) บนจอ จุดใต้นิ้วหรือใต้เมาส์อยู่ที่เดิม */
export function zoomAt(v: View, factor: number, px: number, py: number, f: Frame): View {
  const k0 = fitScale(f);
  const k = Math.min(Math.max(v.k * factor, k0), k0 * MAX_ZOOM);
  const mx = (px - v.x) / v.k;
  const my = (py - v.y) / v.k;
  return clampView({ k, x: px - mx * k, y: py - my * k }, f);
}

/** จุดบนแผนที่ที่อยู่กลางกรอบตอนนี้ */
export const centerOf = (v: View, f: Frame): [number, number] => [(f.cw / 2 - v.x) / v.k, (f.ch / 2 - v.y) / v.k];

// ---------- ชื่อบนแผนที่ ----------

export type LabelStyle = 'region' | 'sea' | 'river' | 'capital' | 'city' | 'pillar' | 'town' | 'name' | 'minor';

export function styleOf(l: MapLabel): LabelStyle {
  switch (l.cls) {
    case 'region':
    case 'sea':
    case 'river':
    case 'capital':
    case 'city':
    case 'pillar':
    case 'town':
      return l.cls;
    default:
      return l.minor ? 'minor' : 'name';
  }
}

/** ฟอนต์ของชื่อแต่ละแบบ (px บนจอ เท่ากันทุกระดับซูม) สีอยู่ใน styles.css (.lbl) */
export const LABEL_FONT: Record<LabelStyle, { font: string; size: number; spacing: number }> = {
  region: { font: "600 15px 'Noto Serif Thai', Georgia, serif", size: 15, spacing: 0.08 },
  sea: { font: "500 13px 'Noto Serif Thai', Georgia, serif", size: 13, spacing: 0.4 },
  river: { font: "500 10.5px Anuphan, system-ui, sans-serif", size: 10.5, spacing: 0.16 },
  capital: { font: "600 15px 'Noto Serif Thai', Georgia, serif", size: 15, spacing: 0 },
  city: { font: "600 13.5px 'Noto Serif Thai', Georgia, serif", size: 13.5, spacing: 0 },
  pillar: { font: "600 12px 'Noto Serif Thai', Georgia, serif", size: 12, spacing: 0 },
  town: { font: '600 12px Anuphan, system-ui, sans-serif', size: 12, spacing: 0 },
  name: { font: '500 11.5px Anuphan, system-ui, sans-serif', size: 11.5, spacing: 0 },
  minor: { font: '500 10.5px Anuphan, system-ui, sans-serif', size: 10.5, spacing: 0 },
};

/** ชื่อที่ได้ที่สำคัญกว่าก่อน (เหมือนโปสเตอร์ art/kit/map-poster.mjs) */
const ORDER: Record<LabelStyle, number> = { region: 0, sea: 1, capital: 2, city: 3, pillar: 4, town: 5, river: 6, name: 7, minor: 9 };
const RANK: Record<string, number> = { capital: 0, city: 1, pillar: 2, town: 3, temple: 4, village: 5, station: 6, pass: 6, fort: 7, landmark: 7, camp: 8, pit: 8 };

/** ชื่อตัวเล็กขึ้นเมื่อซูมถึงเท่านี้ ชื่อแผ่นดินกับทะเลหายเมื่อซูมถึงเท่านี้ */
export const MINOR_FROM = 2.2;
export const REGIONS_UNTIL = 3;
/** ป้ายของที่อยู่และที่ที่เลือกเป็นแคปซูล กว้างกว่าตัวอักษรเท่านี้ทั้งสองข้าง */
export const PILL_PAD = 6;
/** ชื่อแผ่นดินกับน้ำที่ล้นขอบภาพไม่เกินเท่านี้ (px) ขยับเข้ามาได้ */
const NUDGE = 14;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Placed {
  label: MapLabel;
  style: LabelStyle;
  /** จุดวางบนจอ (กลางแนวตั้งของตัวอักษร) */
  x: number;
  y: number;
  anchor: Anchor;
  angle: number;
  width: number;
  box: Box;
  pin: boolean;
  sel: boolean;
}

/** กรอบรอบรูปหมุด (ปลายหมุดอยู่ที่ตัวสถานที่) */
export const pinBox = (px: number, py: number): Box => ({ x: px - 9, y: py - 25, w: 18, h: 26 });

/**
 * วางชื่อบนจอ: สำคัญก่อนได้ที่ก่อน ชื่อไม่ทับกัน ไม่ทับเสาฟ้าและหมุด ไม่ล้นกรอบ ชื่อที่ไม่มีที่ก็ไม่แสดง
 * (ซูมเข้าแล้วจะมีที่มากขึ้น) ชื่อของที่อยู่และที่ที่เลือกแสดงเสมอ
 */
export function layoutLabels(
  data: MapData,
  v: View,
  f: Frame,
  measure: (text: string, s: LabelStyle) => number,
  o: { pinId?: string | null; selId?: string | null; avoid?: readonly Box[] } = {},
): Placed[] {
  const zoom = zoomOf(v, f);
  const S = (mx: number, my: number): [number, number] => [mx * v.k + v.x, my * v.k + v.y];
  // ชื่อสถานที่ไม่ทับเสาฟ้าและหมุด ชื่อแผ่นดินกับน้ำไม่ทับหมุด แต่พาดผ่านเสาได้ (ชื่อแคว้นยาวกว่าช่องระหว่างเสา)
  const marks: Box[] = [...(o.avoid ?? [])]; // ปุ่มบนแผนที่ก็ไม่ให้ชื่อมุดอยู่ข้างใต้
  const pinLabel = o.pinId ? data.labels.find((l) => l.id === o.pinId) : undefined;
  if (pinLabel?.at) marks.push(pinBox(...S(pinLabel.at[0], pinLabel.at[1])));
  const taken: Box[] = (data.obstacles ?? []).map(([x0, y0, x1, y1]) => {
    const [a, b] = S(x0, y0);
    const [c, d] = S(x1, y1);
    return { x: a, y: b, w: c - a, h: d - b };
  });
  taken.push(...marks);

  const pad = 2;
  const edge = 3;
  const hits = (b: Box, list: readonly Box[]) =>
    list.some((q) => b.x < q.x + q.w + pad && b.x + b.w + pad > q.x && b.y < q.y + q.h + pad && b.y + b.h + pad > q.y);
  const inside = (b: Box) => b.x >= edge && b.y >= edge && b.x + b.w <= f.cw - edge && b.y + b.h <= f.ch - edge;

  const rank = (l: MapLabel) => {
    if (l.id === o.pinId) return -2;
    if (l.id === o.selId) return -1;
    return ORDER[styleOf(l)] * 100 + (RANK[l.cls] ?? 7);
  };
  const order = data.labels
    .map((l, i) => ({ l, r: rank(l), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((e) => e.l);

  const placed: Placed[] = [];
  const boxes: Box[] = [];
  for (const l of order) {
    const style = styleOf(l);
    const pin = l.id === o.pinId;
    const sel = l.id === o.selId && !pin;
    if (!pin && !sel) {
      if (style === 'minor' && zoom < MINOR_FROM) continue;
      if ((style === 'region' || style === 'sea') && zoom >= REGIONS_UNTIL) continue;
    }
    const F = LABEL_FONT[style];
    const textW = measure(l.th, style);
    const padX = pin || sel ? PILL_PAD : 0;
    const w = textW + padX * 2;
    const h = F.size * (pin || sel ? 1.6 : 1.35);
    const angle = pin || sel ? 0 : (l.angle ?? 0);
    const boxAt = (anchor: Anchor, x: number, y: number): Box => {
      const x0 = (anchor === 'start' ? x : anchor === 'end' ? x - textW : x - textW / 2) - padX;
      if (!angle) return { x: x0, y: y - h / 2, w, h };
      // ชื่อเอียง (แม่น้ำ ทะเล): กรอบรอบสี่เหลี่ยมที่หมุนรอบจุดวาง
      const r = (angle * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      const corners: [number, number][] = [
        [x0 - x, -h / 2],
        [x0 - x + w, -h / 2],
        [x0 - x, h / 2],
        [x0 - x + w, h / 2],
      ];
      const xs = corners.map(([dx, dy]) => x + dx * c - dy * s);
      const ys = corners.map(([dx, dy]) => y + dx * s + dy * c);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };

    const [dx, dy] = S(l.x, l.y);
    const tries: [Anchor, number, number][] = [[l.anchor ?? 'middle', dx, dy]];
    if (l.at && !l.angle) {
      // ที่วางสำรอง: ขวา ซ้าย ใต้ และเหนือตัวสถานที่ (รูปเล็กกว้างราว 10 สูงราว 6 พิกเซลแผนที่ หมุดกว้าง 18 สูง 25 px)
      const [ax, ay] = S(l.at[0], l.at[1]);
      const side = Math.max(8, 5 * v.k) + (pin ? 10 : 0) + padX;
      const mid = ay - Math.min(3 * v.k, 10);
      const top = pin ? 27 : Math.max(10, 6 * v.k) + 3;
      const below: [Anchor, number, number] = ['middle', ax, ay + 4 + h / 2];
      if (pin) tries.unshift(below); // ป้ายของที่อยู่ห้อยใต้ปลายหมุด
      else tries.push(below);
      tries.push(['start', ax + side, mid], ['end', ax - side, mid], ['middle', ax, ay - top - h / 2]);
    }
    const fixed = style === 'region' || style === 'sea' || style === 'river';
    const blocked = fixed ? marks : taken;
    let spot: [Anchor, number, number, Box] | null = null;
    for (const [anchor, x0, y0] of tries) {
      let [x, y, b] = [x0, y0, boxAt(anchor, x0, y0)];
      if (fixed && !inside(b)) {
        // ชื่อทะเลริมขอบภาพ: ขยับเข้ามาในกรอบได้นิดหน่อย
        const nx = Math.max(edge - b.x, 0) - Math.max(b.x + b.w - (f.cw - edge), 0);
        const ny = Math.max(edge - b.y, 0) - Math.max(b.y + b.h - (f.ch - edge), 0);
        if (Math.abs(nx) <= NUDGE && Math.abs(ny) <= NUDGE) [x, y, b] = [x + nx, y + ny, { ...b, x: b.x + nx, y: b.y + ny }];
      }
      if (inside(b) && !hits(b, blocked) && !hits(b, boxes)) {
        spot = [anchor, x, y, b];
        break;
      }
    }
    if (!spot && (pin || sel)) {
      // ชื่อที่ต้องเห็นเสมอ: เอาที่แรกที่อยู่ในกรอบ ทับอะไรก็ได้
      for (const [anchor, x, y] of tries) {
        const b = boxAt(anchor, x, y);
        if (inside(b)) {
          spot = [anchor, x, y, b];
          break;
        }
      }
    }
    if (!spot) continue;
    const [anchor, x, y, box] = spot;
    boxes.push(box);
    placed.push({ label: l, style, x, y, anchor, angle, width: textW, box, pin, sel });
  }
  return placed;
}

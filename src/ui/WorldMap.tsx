import { computed, signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { worldYear } from '../engine/state';
import { currentEvent, game, life, tab } from '../store';
import { Icon } from './icons';
import { timeOf } from './scenes';
import {
  LABEL_FONT,
  MAX_ZOOM,
  REGION_TH,
  centerOf,
  centerOn,
  clampView,
  fitScale,
  fitView,
  layoutLabels,
  pinFor,
  zoomAt,
  zoomOf,
  type Box,
  type Frame,
  type LabelStyle,
  type MapData,
  type MapLabel,
  type Placed,
  type View,
} from './mapLayout';

/**
 * แผนที่โลก: ภาพพิกเซลจาก public/map (art/kit/map.mjs) ชื่อเป็นตัวอักษรวางทับ จึงคมทุกระดับซูม
 * แท็บโลก: ลากเลื่อน ถ่างสองนิ้ว ล้อเมาส์ ปุ่มบวกลบ แตะชื่อเพื่ออ่านเรื่องย่อของที่นั้น
 * HUD (เดสก์ท็อป): ภาพเล็กซูมรอบที่อยู่ แตะแล้วเปิดแท็บโลก
 */

/** ขนาดภาพ public/map/world_*.png ใช้ก่อน labels.json มาถึง */
const MAP_W = 640;
const MAP_H = 400;
/** แผนที่เล็กบน HUD ซูมกี่เท่า ปุ่มไปที่อยู่ซูมอย่างน้อยกี่เท่า */
const MINI_ZOOM = 3;
const HOME_ZOOM = 3;
const STEP = 1.6;
/** แถวปุ่มมุมขวาล่าง (ตรงกับ .map-tools ใน styles.css) ชื่อบนแผนที่หลบที่ตรงนี้ */
const TOOL = 34;
const TOOL_GAP = 6;
const TOOL_EDGE = 8;
const toolsBox = (f: Frame, n: number): Box => {
  const w = n * TOOL + (n - 1) * TOOL_GAP;
  return { x: f.cw - TOOL_EDGE - w, y: f.ch - TOOL_EDGE - TOOL, w, h: TOOL };
};

export const mapData = signal<MapData | null>(null);
let loading = false;
function loadMapData() {
  if (mapData.value || loading || typeof fetch === 'undefined') return;
  loading = true;
  fetch('map/labels.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: MapData | null) => {
      if (j?.labels) mapData.value = j;
    })
    .catch(() => {
      /* ไม่มีชื่อก็ยังเห็นภาพ */
    })
    .finally(() => {
      loading = false;
    });
  // ภาพทั้งสามช่วงเวลา: เปลี่ยนเวลาแล้วไม่กะพริบ
  for (const t of ['day', 'dusk', 'night']) new Image().src = `map/world_${t}.png`;
}

/** ช่วงเวลาเดียวกับภาพฉาก (scenes.ts) แผนที่ตอนค่ำและกลางคืนมีไฟตามเมือง */
export const mapTime = computed(() => {
  const l = life.value;
  const ev = currentEvent.value ?? game.events.find((e) => e.id === l.log[l.log.length - 1]?.eventId) ?? null;
  return timeOf(ev?.id ?? l.locationTag);
});

// ---------- วัดความกว้างชื่อด้วยฟอนต์จริง (ฟอนต์มาช้าก็วัดใหม่) ----------
const fontTick = signal(0);
const widths = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;
const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => {
    widths.clear();
    fontTick.value++;
  });
}
function measure(text: string, s: LabelStyle): number {
  const key = `${s}|${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  const F = LABEL_FONT[s];
  let w = text.length * F.size * 0.5;
  if (ctx) {
    ctx.font = F.font;
    w = ctx.measureText(text).width;
  }
  const n = graphemes ? [...graphemes.segment(text)].length : text.length;
  w += F.spacing * F.size * n;
  widths.set(key, w);
  return w;
}

/** ขนาดด้านในของกล่อง (ซ่อนอยู่ = null) */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ cw: number; ch: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      setSize((p) => (!cw || !ch ? null : p && p.cw === cw && p.ch === ch ? p : { cw, ch }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

const toScreen = (v: View, [mx, my]: [number, number]): [number, number] => [mx * v.k + v.x, my * v.k + v.y];
const mapStyle = (v: View) => ({ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` });

function PinMark({ at: [x, y] }: { at: [number, number] }) {
  return (
    <g class="map-pin" transform={`translate(${x} ${y})`}>
      <ellipse class="pulse" rx="9" ry="4.5" />
      <path d="M0 0C-1.6-4.6-7.5-8.6-7.5-14.6a7.5 7.5 0 1 1 15 0C7.5-8.6 1.6-4.6 0 0Z" />
      <circle class="dot" cy="-14.6" r="2.8" />
    </g>
  );
}

function SelMark({ at: [x, y] }: { at: [number, number] }) {
  return (
    <g class="map-sel" transform={`translate(${x} ${y - 3})`}>
      <circle class="out" r="7.5" />
      <circle r="7.5" />
    </g>
  );
}

function Label({ p, onPick }: { p: Placed; onPick: (id: string) => void }) {
  const F = LABEL_FONT[p.style];
  const pill = p.pin || p.sel;
  const pick = p.label.at ? () => onPick(p.label.id) : undefined;
  return (
    <g
      class={`lbl ${p.style}${p.pin ? ' pin' : ''}${p.sel ? ' sel' : ''}`}
      transform={p.angle ? `rotate(${p.angle} ${p.x} ${p.y})` : undefined}
      role={pick ? 'button' : undefined}
      tabindex={pick ? 0 : undefined}
      aria-label={pick ? p.label.th : undefined}
      onClick={pick}
      onKeyDown={
        pick
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              pick();
            }
          : undefined
      }
    >
      {pill ? (
        <rect x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} rx={p.box.h / 2} />
      ) : (
        pick && <rect class="hit" x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} />
      )}
      <text x={p.x} y={p.y} text-anchor={p.anchor} style={{ font: F.font, letterSpacing: F.spacing ? `${F.spacing}em` : undefined }}>
        {p.label.th}
      </text>
    </g>
  );
}

function PlaceCard({ place, here, onHome, year }: { place: MapLabel | null; here: boolean; onHome?: () => void; year: number }) {
  if (!place) return <p class="map-hint muted">แตะชื่อบนแผนที่เพื่ออ่านเรื่องของที่นั้น</p>;
  const region = place.region ? REGION_TH[place.region] : null;
  return (
    <div class={`place-card${here ? ' here' : ''}`} aria-live="polite">
      <div class="pc-head">
        <Icon name="place" />
        <b>{place.th}</b>
        <span class="muted">
          {region}
          {here && (
            <>
              {region && ' · '}ปี <span class="num">{year}</span>
            </>
          )}
        </span>
        {onHome && (
          <button class="pc-home" onClick={onHome}>
            <Icon name="locate" />
            ที่อยู่ตอนนี้
          </button>
        )}
      </div>
      {place.note && <p>{place.note}</p>}
      {here && <p class="map-hint muted">แตะชื่อบนแผนที่เพื่ออ่านเรื่องของที่นั้น</p>}
    </div>
  );
}

/** แผนที่เต็มในแท็บโลก */
function BigMap({ here }: { here: string }) {
  const data = mapData.value;
  const l = life.value;
  const pin = data ? pinFor({ locationTag: here, homeTag: l.homeTag, flags: l.flags }, data.labels) : null;
  const time = mapTime.value;
  const tick = fontTick.value;
  const ref = useRef<HTMLDivElement>(null);
  const size = useBoxSize(ref);
  const W = data?.width ?? MAP_W;
  const H = data?.height ?? MAP_H;
  const f = useMemo<Frame | null>(() => (size ? { cw: size.cw, ch: size.ch, W, H } : null), [size, W, H]);
  const [view, setView] = useState<View | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ค่าล่าสุดสำหรับตัวจัดการเหตุการณ์ (ไม่รอ render)
  const now = useRef<{ v: View | null; f: Frame | null }>({ v: null, f: null });
  now.current.f = f;
  const put = (v: View) => {
    now.current.v = v;
    setView(v);
  };
  const anim = useRef(0);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // ครั้งแรกเห็นทั้งแผ่น กล่องเปลี่ยนขนาดแล้วกลางภาพกับระดับซูมอยู่ที่เดิม
  const lastF = useRef<Frame | null>(null);
  useLayoutEffect(() => {
    if (!f) return;
    const prev = lastF.current;
    const v = now.current.v;
    lastF.current = f;
    if (!v || !prev) put(fitView(f));
    else {
      const [mx, my] = centerOf(v, prev);
      put(centerOn(mx, my, zoomOf(v, prev), f));
    }
  }, [f]);

  /** เลื่อนไปมุมมองใหม่แบบนุ่มๆ (ปิดการเคลื่อนไหวไว้ก็กระโดดไปเลย) */
  const go = (to: View) => {
    cancelAnimationFrame(anim.current);
    const { v: from, f: fr } = now.current;
    if (!from || !fr || matchMedia('(prefers-reduced-motion: reduce)').matches) return put(to);
    const [ax, ay] = centerOf(from, fr);
    const [bx, by] = centerOf(to, fr);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 260);
      const e = 1 - (1 - p) ** 3;
      const k = from.k * (to.k / from.k) ** e;
      const mx = ax + (bx - ax) * e;
      const my = ay + (by - ay) * e;
      put(p < 1 ? clampView({ k, x: fr.cw / 2 - mx * k, y: fr.ch / 2 - my * k }, fr) : to);
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const zoomBy = (factor: number) => {
    const { v, f: fr } = now.current;
    if (v && fr) go(zoomAt(v, factor, fr.cw / 2, fr.ch / 2, fr));
  };
  const toPin = () => {
    const { v, f: fr } = now.current;
    setSelId(null);
    if (v && fr && pin?.at) go(centerOn(pin.at[0], pin.at[1], Math.max(HOME_ZOOM, zoomOf(v, fr)), fr));
  };

  // ---------- ลาก ถ่างสองนิ้ว ล้อเมาส์ ดับเบิลคลิก แป้นพิมพ์ ----------
  const points = useRef(new Map<number, [number, number]>());
  const gesture = useRef<{ v0: View; p0: [number, number]; d0: number; m0: [number, number] } | null>(null);
  const moved = useRef(false);
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left - el.clientLeft, e.clientY - r.top - el.clientTop];
  };
  const begin = () => {
    const v = now.current.v;
    const [a, b] = [...points.current.values()];
    if (!v || !a) return void (gesture.current = null);
    if (!b) gesture.current = { v0: v, p0: a, d0: 1, m0: a };
    else gesture.current = { v0: v, p0: a, d0: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  };
  const capture = () => {
    if (moved.current) return;
    moved.current = true;
    setDragging(true);
    for (const id of points.current.keys()) {
      try {
        ref.current?.setPointerCapture(id);
      } catch {
        /* นิ้วนั้นยกไปแล้ว */
      }
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(anim.current);
    if (!points.current.size) moved.current = false;
    points.current.set(e.pointerId, local(e));
    begin();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!points.current.has(e.pointerId)) return;
    points.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const fr = now.current.f;
    if (!g || !fr) return;
    const [a, b] = [...points.current.values()];
    if (!a) return;
    if (!b) {
      const dx = a[0] - g.p0[0];
      const dy = a[1] - g.p0[1];
      if (!moved.current && Math.hypot(dx, dy) < 6) return; // แตะเฉยๆ ให้เป็นการคลิกชื่อ
      capture();
      put(clampView({ k: g.v0.k, x: g.v0.x + dx, y: g.v0.y + dy }, fr));
      return;
    }
    capture();
    const k0 = fitScale(fr);
    const k = Math.min(Math.max(g.v0.k * (Math.hypot(b[0] - a[0], b[1] - a[1]) / g.d0), k0), k0 * MAX_ZOOM);
    // จุดบนแผนที่ที่อยู่กลางสองนิ้วตอนเริ่ม ตามกลางสองนิ้วไป
    const mx = (g.m0[0] - g.v0.x) / g.v0.k;
    const my = (g.m0[1] - g.v0.y) / g.v0.k;
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    put(clampView({ k, x: cx - mx * k, y: cy - my * k }, fr));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!points.current.delete(e.pointerId)) return;
    if (points.current.size) return begin(); // ยกนิ้วหนึ่งหลังถ่าง: นิ้วที่เหลือลากต่อจากตรงนี้
    gesture.current = null;
    setDragging(false);
    // คลิกที่ตามหลังการลากไม่นับเป็นการเลือกชื่อ จากนั้นแตะหรือกด Enter เลือกได้ตามปกติ
    if (moved.current) setTimeout(() => (moved.current = false), 0);
  };
  const onWheel = (e: WheelEvent) => {
    const { v, f: fr } = now.current;
    if (!v || !fr) return;
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
    if (factor < 1 && zoomOf(v, fr) <= 1.001) return; // เห็นทั้งแผ่นแล้ว ปล่อยให้หน้าเลื่อนต่อ
    e.preventDefault();
    cancelAnimationFrame(anim.current);
    const [x, y] = local(e);
    put(zoomAt(v, factor, x, y, fr));
  };
  const onDblClick = (e: MouseEvent) => {
    const { v, f: fr } = now.current;
    if (!v || !fr) return;
    const [x, y] = local(e);
    go(zoomAt(v, 2, x, y, fr));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const { v, f: fr } = now.current;
    if (e.target !== ref.current || !v || !fr) return;
    const s = 60;
    const keys: Record<string, () => View> = {
      ArrowLeft: () => clampView({ ...v, x: v.x + s }, fr),
      ArrowRight: () => clampView({ ...v, x: v.x - s }, fr),
      ArrowUp: () => clampView({ ...v, y: v.y + s }, fr),
      ArrowDown: () => clampView({ ...v, y: v.y - s }, fr),
      '+': () => zoomAt(v, STEP, fr.cw / 2, fr.ch / 2, fr),
      '=': () => zoomAt(v, STEP, fr.cw / 2, fr.ch / 2, fr),
      '-': () => zoomAt(v, 1 / STEP, fr.cw / 2, fr.ch / 2, fr),
      '0': () => fitView(fr),
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    go(next());
  };
  const pick = (id: string) => {
    if (moved.current) return;
    setSelId((s) => (s === id ? null : id));
  };

  const sel = selId && data ? (data.labels.find((x) => x.id === selId) ?? null) : null;
  const placed = useMemo(
    () => (data && f && view ? layoutLabels(data, view, f, measure, { pinId: pin?.id, selId: sel?.id, avoid: [toolsBox(f, pin ? 3 : 2)] }) : []),
    [data, f, view, pin?.id, sel?.id, tick],
  );
  const zoom = view && f ? zoomOf(view, f) : 1;
  const shown = sel ?? pin;
  const atHome = !!shown && shown.id === pin?.id;

  return (
    <div class="world-map">
      <div
        ref={ref}
        class={`map big${dragging ? ' dragging' : ''}`}
        style={{ touchAction: zoom > 1.001 ? 'none' : 'pan-y' }}
        tabIndex={0}
        role="group"
        aria-roledescription="แผนที่"
        aria-label="แผนที่แผ่นดินเจ็ดเสา ลากเพื่อเลื่อน ถ่างนิ้วหรือหมุนล้อเพื่อซูม"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDblClick={onDblClick}
        onKeyDown={onKeyDown}
      >
        {view && <img class="map-img" src={`map/world_${time}.png`} width={W} height={H} alt="" draggable={false} style={mapStyle(view)} />}
        {view && f && (
          <svg class="map-labels" width={f.cw} height={f.ch} viewBox={`0 0 ${f.cw} ${f.ch}`}>
            {sel?.at && !atHome && <SelMark at={toScreen(view, sel.at)} />}
            {pin?.at && <PinMark at={toScreen(view, pin.at)} />}
            {placed.map((p) => (
              <Label key={p.label.id} p={p} onPick={pick} />
            ))}
          </svg>
        )}
        <div class="map-tools" onPointerDown={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()}>
          <button class="icon-btn" aria-label="ซูมเข้า" disabled={zoom >= MAX_ZOOM - 0.001} onClick={() => zoomBy(STEP)}>
            <Icon name="plus" />
          </button>
          <button class="icon-btn" aria-label="ซูมออก" disabled={zoom <= 1.001} onClick={() => zoomBy(1 / STEP)}>
            <Icon name="minus" />
          </button>
          {pin && (
            <button class="icon-btn" aria-label="ไปที่อยู่ตอนนี้" onClick={toPin}>
              <Icon name="locate" />
            </button>
          )}
        </div>
      </div>
      <PlaceCard place={shown} here={atHome} onHome={pin && !atHome ? toPin : undefined} year={worldYear(l)} />
    </div>
  );
}

/** แผนที่เล็กบน HUD: ซูมรอบที่อยู่ แตะแล้วเปิดแท็บโลก */
function MiniMap({ here }: { here: string }) {
  const data = mapData.value;
  const l = life.value;
  const pin = data ? pinFor({ locationTag: here, homeTag: l.homeTag, flags: l.flags }, data.labels) : null;
  const time = mapTime.value;
  const ref = useRef<HTMLButtonElement>(null);
  const size = useBoxSize(ref);
  const W = data?.width ?? MAP_W;
  const H = data?.height ?? MAP_H;
  const f: Frame | null = size ? { cw: size.cw, ch: size.ch, W, H } : null;
  const view = f ? (pin?.at ? centerOn(pin.at[0], pin.at[1], MINI_ZOOM, f) : fitView(f)) : null;
  return (
    <button ref={ref} type="button" class="map small" onClick={() => (tab.value = 'world')} aria-label={`แผนที่${pin ? ` · ${pin.th}` : ''} · เปิดแผนที่โลก`}>
      {view && <img class="map-img" src={`map/world_${time}.png`} width={W} height={H} alt="" draggable={false} style={mapStyle(view)} />}
      {view && f && pin?.at && (
        <svg class="map-labels" width={f.cw} height={f.ch} viewBox={`0 0 ${f.cw} ${f.ch}`} aria-hidden="true">
          <PinMark at={toScreen(view, pin.at)} />
        </svg>
      )}
      {pin && (
        <span class="map-here">
          <Icon name="place" />
          {pin.th}
        </span>
      )}
    </button>
  );
}

/** แผนที่โลก: เต็มในแท็บโลก หรือเล็ก (small) บน HUD */
export function WorldMap({ here, small }: { here: string; small?: boolean }) {
  useEffect(loadMapData, []);
  return small ? <MiniMap here={here} /> : <BigMap here={here} />;
}

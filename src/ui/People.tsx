import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Bond, KinRole } from '../engine/schema';
import type { LifeState, Person } from '../engine/state';
import { CLOSENESS_CAP } from '../engine/engine';
import { personBorn, personYears } from '../engine/people';
import { life } from '../store';
import { Icon, PATHS, type IconName } from './icons';
import type { Look } from '../../art/kit/core.mjs';
import { personLook } from '../sprites/looks';
import { faceUrl } from '../sprites/render';
import { currentPlayerLook } from './SpriteView';

/** หน้าของคนในวงกลม (ภาพ pixel จากชุด sprite) ตัดขอบเป็นวงกลม */
function Face({ look, x, y, r, id }: { look: Look; x: number; y: number; r: number; id: string }) {
  const clip = `face-${id}`;
  return (
    <>
      <clipPath id={clip}><circle cx={x} cy={y} r={r - 1} /></clipPath>
      <image class="face" href={faceUrl(look)} x={x - r} y={y - r} width={r * 2} height={r * 2} clip-path={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
    </>
  );
}

const KIN_TH: Record<KinRole, (g?: 'm' | 'f') => string> = {
  father: () => 'พ่อ',
  mother: () => 'แม่',
  grandfather_paternal: () => 'ปู่',
  grandmother_paternal: () => 'ย่า',
  grandfather_maternal: () => 'ตา',
  grandmother_maternal: () => 'ยาย',
  sibling_older: (g) => (g === 'f' ? 'พี่สาว' : g === 'm' ? 'พี่ชาย' : 'พี่'),
  sibling_younger: (g) => (g === 'f' ? 'น้องสาว' : g === 'm' ? 'น้องชาย' : 'น้อง'),
  spouse: (g) => (g === 'f' ? 'ภรรยา' : g === 'm' ? 'สามี' : 'คู่ครอง'),
  child: (g) => (g === 'f' ? 'ลูกสาว' : g === 'm' ? 'ลูกชาย' : 'ลูก'),
  grandchild: (g) => (g === 'f' ? 'หลานสาว' : g === 'm' ? 'หลานชาย' : 'หลาน'),
};
export const kinLabel = (p: Person) => (p.kin ? KIN_TH[p.kin](p.gender) : '');

export const BOND_TH: Record<Bond, string> = { kin: 'ญาติ', friend: 'เพื่อน', mentor: 'อาจารย์', love: 'รัก', rival: 'ศัตรู', pupil: 'ศิษย์' };
// ศิษย์ใช้ไอคอนและสีเดียวกับอาจารย์ (ความสัมพันธ์เดียวกัน มองจากอีกฝั่ง)
const BOND_ICON: Record<Bond, IconName> = { kin: 'kin', friend: 'friend', mentor: 'mentor', love: 'love', rival: 'rival', pupil: 'mentor' };

/* ---------------- ผังครอบครัว ---------------- */

interface Slot { x: number; y: number; p: Person | 'me'; small?: boolean }
const GAP = 84;
/** ระยะห่างของหลานในแถวล่างสุด แคบกว่าแถวอื่น (วงเล็กลงและบอกแค่ "หลาน" กับอายุ) ครอบครัวที่มีหลานห้าหกคนจึงยังพอดีจอมือถือ */
const GRAND_GAP = 66;
const ROW = 96;
const R = 19;
/** ระยะจากแถวบนลงถึงเส้นแยกพี่น้อง ต้องพ้นชื่อและบทบาทใต้วงกลม */
const BAR = 66;
/** ผังย่อลงได้มากสุดเท่านี้ก่อนจะยอมให้เลื่อนทางข้าง (ชื่อใต้วงกลมยังอ่านออก) */
const MIN_SCALE = 0.75;

/** อักษรแรกของชื่อ ข้ามสระหน้า (เ แ โ ใ ไ) */
export const initial = (name: string) => name.replace(/^[เแโใไ]/, '').charAt(0);

/** แบบของหลานในผังที่กำลังให้เลือก อ่านจาก ?gk= ในที่อยู่หน้า (ก = row แถวใต้พ่อแม่, ข = badge เลขที่มุมวงของลูก, ค = none ไม่อยู่ในผัง) */
const grandVariant = (): 'row' | 'badge' | 'none' => {
  const v = new URLSearchParams(globalThis.location?.search ?? '').get('gk');
  return v === 'badge' || v === 'none' ? v : 'row';
};
/** หลานที่เป็นลูกของคนนี้ */
const grandkidsOf = (l: LifeState, p: Person) => (l.people ?? []).filter((g) => g.kin === 'grandchild' && g.parent === p.id);

function familyLayout(l: LifeState) {
  const ppl = l.people ?? [];
  const by = (k: KinRole) => ppl.filter((p) => p.kin === k).sort((a, b) => a.metAge - b.metAge);
  const one = (k: KinRole) => by(k)[0];
  const older = by('sibling_older');
  const younger = by('sibling_younger');
  const spouse = one('spouse');
  const kids = by('child');

  // แถวพี่น้อง: พี่ ... น้อง ... ตัวเรา คู่ครอง (ลูกอยู่ใต้ตัวเรากับคู่ครอง)
  const row2: (Person | 'me')[] = [...older, ...younger, 'me'];
  if (spouse) row2.push(spouse);
  const grand = [one('grandfather_paternal'), one('grandmother_paternal'), one('grandfather_maternal'), one('grandmother_maternal')];
  const hasGrand = grand.some(Boolean);
  const hasParents = !!(one('father') || one('mother'));

  const widest = Math.max(row2.length, kids.length, hasGrand ? 4 : 2, 3);
  const width = widest * GAP + 40;
  const slots: Slot[] = [];
  const lines: string[] = [];
  const hearts: { x: number; y: number }[] = [];
  let y = 40;

  const sibCount = row2.length - (spouse ? 1 : 0);
  const sibStart = width / 2 - ((row2.length - 1) * GAP) / 2;
  const sibCentre = sibStart + ((sibCount - 1) * GAP) / 2;
  const fx = sibCentre - GAP;
  const mx = sibCentre + GAP;

  if (hasGrand) {
    const gx = [fx - GAP / 2, fx + GAP / 2 - 12, mx - GAP / 2 + 12, mx + GAP / 2];
    for (const [a, b, c] of [[0, 1, fx], [2, 3, mx]] as const) {
      // มีคนเดียวในคู่: วางตรงเหนือพ่อหรือแม่ เส้นจะได้ลงตรง
      if (!(grand[a] && grand[b])) gx[grand[a] ? a : b] = c;
      if (grand[a] && grand[b]) lines.push(`M${gx[a]! + R} ${y}H${gx[b]! - R}`);
      if (hasParents && (grand[a] || grand[b])) {
        const top = grand[a] && grand[b] ? y : y + R + 34;
        lines.push(`M${c} ${top}V${y + ROW - R}`);
      }
    }
    grand.forEach((g, i) => g && slots.push({ x: gx[i]!, y, p: g }));
    y += ROW;
  }
  if (hasParents) {
    const f = one('father');
    const m = one('mother');
    if (f) slots.push({ x: fx, y, p: f });
    if (m) slots.push({ x: mx, y, p: m });
    if (f && m) {
      lines.push(`M${fx + R} ${y}H${mx - R}`);
      hearts.push({ x: sibCentre, y });
    }
    lines.push(`M${sibCentre} ${y}V${y + BAR}`);
    y += ROW;
  }
  row2.forEach((p, i) => slots.push({ x: sibStart + i * GAP, y, p }));
  if (hasParents && sibCount > 0) {
    const a = sibStart;
    const b = sibStart + (sibCount - 1) * GAP;
    lines.push(`M${a} ${y - ROW + BAR}H${b}`);
    for (let i = 0; i < sibCount; i++) lines.push(`M${sibStart + i * GAP} ${y - ROW + BAR}V${y - R - 2}`);
  }
  const meX = sibStart + (sibCount - 1) * GAP;
  if (spouse) {
    lines.push(`M${meX + R} ${y}H${meX + GAP - R}`);
    hearts.push({ x: meX + GAP / 2, y });
  }
  if (kids.length) {
    // หลานอยู่ใต้ลูกคนที่เป็นพ่อหรือแม่ ลูกแต่ละคนจึงกินที่กว้างเท่าจำนวนหลานใต้ตัว (หลานที่หาพ่อแม่ไม่เจออยู่ใต้ลูกคนแรก)
    const grandkids = grandVariant() === 'row' ? by('grandchild') : [];
    const under = kids.map((k, i) => grandkids.filter((g) => g.parent === k.id || (i === 0 && !kids.some((x) => x.id === g.parent))));
    const span = under.map((u) => Math.max(GAP, u.length * GRAND_GAP));
    const cx = spouse ? meX + GAP / 2 : meX;
    const ky = y + ROW;
    let edge = cx - span.reduce((a, b) => a + b, 0) / 2;
    const kx = span.map((w) => {
      const x = edge + w / 2;
      edge += w;
      return x;
    });
    lines.push(`M${cx} ${y}V${y + BAR}`);
    if (kids.length > 1) lines.push(`M${kx[0]} ${y + BAR}H${kx[kx.length - 1]}`);
    kids.forEach((k, i) => {
      slots.push({ x: kx[i]!, y: ky, p: k });
      lines.push(`M${kx[i]} ${y + BAR}V${ky - R - 2}`);
    });
    y = ky;
    if (grandkids.length) {
      const gy = ky + ROW;
      under.forEach((u, i) => {
        if (!u.length) return;
        const gs = kx[i]! - ((u.length - 1) * GRAND_GAP) / 2;
        lines.push(`M${kx[i]} ${ky + R + 34}V${ky + BAR}`);
        if (u.length > 1) lines.push(`M${gs} ${ky + BAR}H${gs + (u.length - 1) * GRAND_GAP}`);
        u.forEach((g, j) => {
          slots.push({ x: gs + j * GRAND_GAP, y: gy, p: g, small: true });
          lines.push(`M${gs + j * GRAND_GAP} ${ky + BAR}V${gy - R + 1}`);
        });
      });
      y = gy;
    }
  }
  // กรอบของผังวัดจากตำแหน่งจริงของทุกคน (ลูกหลายคนอาจยื่นเลยแถวพี่น้องไปทางขวา) เผื่อครึ่งช่องสองข้างให้ชื่อใต้วงกลม
  const xs = slots.map((s) => s.x);
  const left = Math.min(...xs) - GAP / 2 - 6;
  const right = Math.max(...xs) + GAP / 2 + 6;
  return { slots, lines, hearts, left, width: right - left, height: y + 58 };
}

function PersonNode({ s, l, on, onPick }: { s: Slot; l: LifeState; on: boolean; onPick: (p: Person | 'me') => void }) {
  const me = s.p === 'me';
  const p = me ? null : (s.p as Person);
  const name = me ? l.name : p!.name;
  // เลขหลังบทบาทคืออายุ คนที่จากไปแล้วคืออายุตอนเสีย
  // หลานในแถวล่างบอกสั้นว่า "หลาน" ชื่อเต็มของบทบาท (หลานสาว หลานชาย) อยู่ในการ์ดกับคำอ่านของปุ่ม
  const sub = me ? 'คุณ' : `${s.small ? 'หลาน' : kinLabel(p!)} · ${personYears(p!, l)}`;
  const r = me ? R + 4 : s.small ? R - 3 : R;
  const dead = p && !p.alive;
  const said = me ? 'คุณ' : `${kinLabel(p!)} ${dead ? 'เสียชีวิตตอนอายุ' : 'อายุ'} ${personYears(p!, l)}`;
  return (
    <g class={`node ${me ? 'me' : ''} ${dead ? 'dead' : ''} ${on ? 'on' : ''}`} tabIndex={0} role="button" aria-label={`${name} ${said}`} aria-pressed={on} onClick={() => onPick(s.p)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(s.p)}>
      <circle cx={s.x} cy={s.y} r={r} />
      <Face look={me ? currentPlayerLook() : personLook(p!, l)} x={s.x} y={s.y} r={r} id={`t-${me ? 'me' : p!.id}`} />
      {dead && <path class="cross" d={`M${s.x + r - 4} ${s.y - r - 8}v12M${s.x + r - 8} ${s.y - r - 4}h8`} />}
      {p && grandVariant() === 'badge' && grandkidsOf(l, p).length > 0 && (
        <g class="gk-badge" aria-label={`หลาน ${grandkidsOf(l, p).length} คน`}>
          <circle cx={s.x + R - 2} cy={s.y + R - 5} r={9} />
          <text x={s.x + R - 2} y={s.y + R - 1.5}>{grandkidsOf(l, p).length}</text>
        </g>
      )}
      <text x={s.x} y={s.y + r + 17} class="nm">{name}</text>
      <text x={s.x} y={s.y + r + 31} class="sub">{sub}</text>
    </g>
  );
}

export function FamilyTree() {
  const l = life.value;
  const [pickedId, setPicked] = useState<string | null>(null);
  const { slots, lines, hearts, left, width, height } = familyLayout(l);
  // จำคนที่เลือกด้วย id การ์ดจึงอ่านอายุและความสนิทล่าสุดเสมอ
  const picked = (l.people ?? []).find((p) => p.id === pickedId) ?? null;
  const pick = (p: Person | 'me') => setPicked(p === 'me' || p.id === pickedId ? null : p.id);
  // ครอบครัวที่กว้างกว่าจอ: เปิดมาให้ตัวเราอยู่กลางกรอบ ไม่ใช่ขอบซ้ายของผัง
  const wrap = useRef<HTMLDivElement>(null);
  const meX = slots.find((s) => s.p === 'me')?.x ?? left;
  useLayoutEffect(() => {
    const el = wrap.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = ((meX - left) / width) * el.scrollWidth - el.clientWidth / 2;
  }, [l.seed, width]);
  return (
    <div class="sec">
      <div class="chart-wrap" ref={wrap}>
        {/* ผังย่อให้พอดีจอ แต่ไม่ย่อเกิน MIN_SCALE ครอบครัวที่กว้างกว่านั้นเลื่อนดูทางข้างได้ */}
        <svg class="chart family" viewBox={`${left} 0 ${width} ${height}`} style={{ minWidth: `${Math.round(width * MIN_SCALE)}px` }} role="group" aria-label="ผังครอบครัว">
          {lines.map((d, i) => <path key={i} class="link" d={d} />)}
          {hearts.map((h, i) => <path key={`h${i}`} class="heart-dot" transform={`translate(${h.x - 7} ${h.y - 8}) scale(.6)`} d={PATHS.love} />)}
          {slots.map((s, i) => <PersonNode key={i} s={s} l={l} on={s.p !== 'me' && s.p.id === pickedId} onPick={pick} />)}
        </svg>
      </div>
      <p class="legend">
        <span><Icon name="love" class="love" />คู่ครอง</span>
        <span><Icon name="dead" />เสียชีวิต</span>
        <span><Icon name="age" />อายุ</span>
      </p>
      {picked && <PersonCard p={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** ความสนิทเป็นหัวใจห้าดวง (ความสนิท 1 ถึง 5) ความสนิทติดลบไม่มีหัวใจ บอกเป็นเลขสีของคู่แค้น */
function Closeness({ n }: { n: number }) {
  if (n < 0) return <span class="bond-rival" title="ความสนิท"><Icon name="rival" label="ความสนิท" /><span class="num">{n}</span></span>;
  return (
    <span class="hearts" role="img" aria-label={`ความสนิท ${n} จาก ${CLOSENESS_CAP}`} title={`ความสนิท ${n} จาก ${CLOSENESS_CAP}`}>
      {Array.from({ length: CLOSENESS_CAP }, (_, i) => <Icon key={i} name="heart" class={i < n ? '' : 'off'} />)}
    </span>
  );
}

/** การ์ดของคนที่แตะในผัง: หน้า ชื่อ บทบาท ปีเกิด (ถึงปีที่จากไป) อายุ และความสนิทเป็นหัวใจ */
function PersonCard({ p, onClose }: { p: Person; onClose: () => void }) {
  const l = life.value;
  const born = personBorn(p, l);
  const died = !p.alive && p.diedAge !== undefined ? l.birthYear + p.diedAge : null;
  return (
    <div class="person-card kin-card" role="group" aria-label={p.name}>
      <img class={`avatar face ${p.alive ? '' : 'gone'}`} src={faceUrl(personLook(p, l))} alt="" />
      <div>
        <b>{p.name}</b> <span class="muted">{kinLabel(p) || (p.bond ? BOND_TH[p.bond] : '')}</span>
        <p class="muted">
          <span title={died === null ? 'ปีเกิด' : 'ปีเกิดถึงปีที่จากไป'}>
            <Icon name="year" label={died === null ? 'ปีเกิด' : 'ปีเกิดถึงปีที่จากไป'} /><span class="num">{died === null ? born : `${born}–${died}`}</span>
          </span>
          <span title={p.alive ? 'อายุ' : 'อายุตอนเสีย'}>
            <Icon name={p.alive ? 'age' : 'dead'} label={p.alive ? 'อายุ' : 'อายุตอนเสีย'} /><span class="num">{personYears(p, l)}</span>
          </span>
          <Closeness n={p.closeness} />
        </p>
        {grandVariant() === 'badge' && grandkidsOf(l, p).length > 0 && (
          <p class="muted gk-list">
            <Icon name="kin" label="หลาน" />
            {grandkidsOf(l, p).map((g) => <span key={g.id}>{g.name} <span class="num">{personYears(g, l)}</span></span>)}
          </p>
        )}
      </div>
      <button class="icon-btn" onClick={onClose} aria-label="ปิด"><Icon name="close" /></button>
    </div>
  );
}

/* ---------------- ผังความสัมพันธ์ ---------------- */

export function RelationMap() {
  const l = life.value;
  const [picked, setPicked] = useState<Person | null>(null);
  const ppl = (l.people ?? []).filter((p) => p.bond);
  const W = 360;
  const H = 360;
  const C = { x: W / 2, y: H / 2 };
  if (!ppl.length) return <p class="muted">ยังไม่มีใครผูกพันกับ {l.name}</p>;
  const sorted = [...ppl].sort((a, b) => Math.abs(b.closeness) - Math.abs(a.closeness));
  const nodes = sorted.map((p, i) => {
    const a = -Math.PI / 2 + (i / sorted.length) * Math.PI * 2;
    // สนิทมากอยู่ใกล้ศูนย์กลาง
    const r = 150 - (Math.abs(p.closeness) / CLOSENESS_CAP) * 50;
    return { p, x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r };
  });
  return (
    <div class="sec">
      <div class="chart-wrap">
        <svg class="chart relmap" viewBox={`0 0 ${W} ${H + 20}`} role="group" aria-label="ผังความสัมพันธ์">
          {nodes.map(({ p, x, y }) => (
            <line key={`e${p.id}`} class={`edge ${p.bond} ${p.alive ? '' : 'dead'}`} x1={C.x} y1={C.y} x2={x} y2={y}
              style={{ strokeWidth: 1.5 + Math.abs(p.closeness) * 0.9 }} />
          ))}
          {nodes.map(({ p, x, y }) => {
            const mx = (C.x + x) / 2;
            const my = (C.y + y) / 2;
            return (
              <g key={`b${p.id}`} class={`badge ${p.bond}`} transform={`translate(${mx - 11} ${my - 11})`}>
                <circle cx="11" cy="11" r="11" />
                <path transform="translate(4 4) scale(.58)" d={PATHS[BOND_ICON[p.bond!]]} />
              </g>
            );
          })}
          {nodes.map(({ p, x, y }) => (
            <g key={p.id} class={`node ${p.alive ? '' : 'dead'}`} tabIndex={0} role="button" aria-label={`${p.name} ${BOND_TH[p.bond!]}`}
              onClick={() => setPicked(p)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPicked(p)}>
              <circle cx={x} cy={y} r={17} />
              <Face look={personLook(p, l)} x={x} y={y} r={17} id={`r-${p.id}`} />
              <text x={x} y={y + 33} class="nm">{p.name}</text>
            </g>
          ))}
          <g class="node me">
            <circle cx={C.x} cy={C.y} r={24} />
            <Face look={currentPlayerLook()} x={C.x} y={C.y} r={24} id="r-me" />
          </g>
        </svg>
      </div>
      <p class="legend">
        {(Object.keys(BOND_TH) as Bond[]).map((b) => (
          <span key={b} class={`bond-${b}`}><Icon name={BOND_ICON[b]} />{BOND_TH[b]}</span>
        ))}
      </p>
      <p class="muted small">เส้นหนาและอยู่ใกล้คือสนิทมาก ศัตรูเป็นเส้นประ</p>
      {picked && <PersonCard p={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

export function PeoplePage() {
  const [view, setView] = useState<'family' | 'web'>('family');
  return (
    <div class="panel-page">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'family'} onClick={() => setView('family')}><Icon name="tree" />ครอบครัว</button>
        <button role="tab" aria-selected={view === 'web'} onClick={() => setView('web')}><Icon name="web" />ความสัมพันธ์</button>
      </div>
      {view === 'family' ? <FamilyTree /> : <RelationMap />}
    </div>
  );
}

/** รายชื่อสั้นสำหรับคอลัมน์ขวาบนเดสก์ท็อป */
export function CloseList() {
  const l = life.value;
  const ppl = (l.people ?? []).filter((p) => p.alive && p.bond).sort((a, b) => b.closeness - a.closeness).slice(0, 6);
  return (
    <section class="sec">
      <h3><Icon name="web" />คนใกล้ตัว</h3>
      {ppl.length === 0 && <p class="muted">ยังไม่รู้จักใคร</p>}
      <ul class="people">
        {ppl.map((p) => (
          <li key={p.id}>
            <img class="avatar face" src={faceUrl(personLook(p, l))} alt="" />
            {p.name}
            <small class={`bond-${p.bond}`}><Icon name={BOND_ICON[p.bond!]} label={BOND_TH[p.bond!]} /></small>
          </li>
        ))}
      </ul>
    </section>
  );
}

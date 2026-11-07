import { useState } from 'preact/hooks';
import type { Bond, KinRole } from '../engine/schema';
import type { LifeState, Person } from '../engine/state';
import { CLOSENESS_CAP } from '../engine/engine';
import { life } from '../store';
import { Icon, PATHS, type IconName } from './icons';

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
};
export const kinLabel = (p: Person) => (p.kin ? KIN_TH[p.kin](p.gender) : '');

export const BOND_TH: Record<Bond, string> = { kin: 'ญาติ', friend: 'เพื่อน', mentor: 'อาจารย์', love: 'รัก', rival: 'ศัตรู' };
const BOND_ICON: Record<Bond, IconName> = { kin: 'kin', friend: 'friend', mentor: 'mentor', love: 'love', rival: 'rival' };

/* ---------------- ผังครอบครัว ---------------- */

interface Slot { x: number; y: number; p: Person | 'me' }
const GAP = 84;
const ROW = 96;
const R = 19;
/** ระยะจากแถวบนลงถึงเส้นแยกพี่น้อง ต้องพ้นชื่อและบทบาทใต้วงกลม */
const BAR = 66;

/** อักษรแรกของชื่อ ข้ามสระหน้า (เ แ โ ใ ไ) */
export const initial = (name: string) => name.replace(/^[เแโใไ]/, '').charAt(0);

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
    const cx = spouse ? meX + GAP / 2 : meX;
    const ky = y + ROW;
    const ks = cx - ((kids.length - 1) * GAP) / 2;
    lines.push(`M${cx} ${y}V${y + BAR}`);
    if (kids.length > 1) lines.push(`M${ks} ${y + BAR}H${ks + (kids.length - 1) * GAP}`);
    kids.forEach((k, i) => {
      slots.push({ x: ks + i * GAP, y: ky, p: k });
      lines.push(`M${ks + i * GAP} ${y + BAR}V${ky - R - 2}`);
    });
    y = ky;
  }
  // เลื่อนทุกอย่างให้ไม่ติดขอบซ้าย
  const minX = Math.min(...slots.map((s) => s.x)) - GAP / 2;
  const shift = minX < 0 ? -minX : 0;
  return { slots, lines, hearts, width: width + shift * 2, height: y + 50, shift };
}

function PersonNode({ s, l, onPick }: { s: Slot; l: LifeState; onPick: (p: Person | 'me') => void }) {
  const me = s.p === 'me';
  const p = me ? null : (s.p as Person);
  const name = me ? l.name : p!.name;
  const sub = me ? 'คุณ' : kinLabel(p!);
  const dead = p && !p.alive;
  return (
    <g class={`node ${me ? 'me' : ''} ${dead ? 'dead' : ''}`} tabIndex={0} role="button" aria-label={`${name} ${sub}`} onClick={() => onPick(s.p)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(s.p)}>
      <circle cx={s.x} cy={s.y} r={me ? R + 4 : R} />
      <text x={s.x} y={s.y + 5} class="initial">{initial(name)}</text>
      {dead && <path class="cross" d={`M${s.x + R - 4} ${s.y - R - 8}v12M${s.x + R - 8} ${s.y - R - 4}h8`} />}
      <text x={s.x} y={s.y + R + 17} class="nm">{name}</text>
      <text x={s.x} y={s.y + R + 31} class="sub">{sub}</text>
    </g>
  );
}

export function FamilyTree() {
  const l = life.value;
  const [picked, setPicked] = useState<Person | 'me' | null>(null);
  const { slots, lines, hearts, width, height, shift } = familyLayout(l);
  return (
    <div class="sec">
      <div class="chart-wrap">
        <svg class="chart family" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${Math.min(width, 900)}px` }} role="group" aria-label="ผังครอบครัว">
          <g transform={`translate(${shift} 0)`}>
            {lines.map((d, i) => <path key={i} class="link" d={d} />)}
            {hearts.map((h, i) => <path key={`h${i}`} class="heart-dot" transform={`translate(${h.x - 7} ${h.y - 8}) scale(.6)`} d={PATHS.love} />)}
            {slots.map((s, i) => <PersonNode key={i} s={s} l={l} onPick={setPicked} />)}
          </g>
        </svg>
      </div>
      <p class="legend">
        <span><Icon name="love" class="love" />คู่ครอง</span>
        <span><Icon name="dead" />เสียชีวิต</span>
      </p>
      {picked && <PersonCard p={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function PersonCard({ p, onClose }: { p: Person | 'me'; onClose: () => void }) {
  if (p === 'me') return null;
  return (
    <div class="person-card" role="dialog" aria-label={p.name}>
      <div>
        <b>{p.name}</b> <span class="muted">{kinLabel(p) || (p.bond ? BOND_TH[p.bond] : '')}</span>
        <p class="muted">
          รู้จักตอนอายุ <span class="num">{p.metAge}</span>
          {!p.alive && p.diedAge !== undefined && <> · เสียชีวิตเมื่อคุณอายุ <span class="num">{p.diedAge}</span></>}
          {p.bond && <> · ความสนิท <span class="num">{p.closeness > 0 ? '+' : ''}{p.closeness}</span></>}
        </p>
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
              <text x={x} y={y + 5} class="initial">{initial(p.name)}</text>
              <text x={x} y={y + 33} class="nm">{p.name}</text>
            </g>
          ))}
          <g class="node me">
            <circle cx={C.x} cy={C.y} r={24} />
            <text x={C.x} y={C.y + 6} class="initial">{initial(l.name)}</text>
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
            <span class="avatar">{initial(p.name)}</span>
            {p.name}
            <small class={`bond-${p.bond}`}><Icon name={BOND_ICON[p.bond!]} label={BOND_TH[p.bond!]} /></small>
          </li>
        ))}
      </ul>
    </section>
  );
}

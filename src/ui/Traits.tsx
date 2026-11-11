import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import type { Trait } from '../engine/schema';
import type { LifeState } from '../engine/state';
import { traitLines, traitStep } from '../engine/traits';
import { game, life, tab } from '../store';
import { Icon, type IconName } from './icons';

export type TraitKind = Trait['kind'];
export const KIND_TH: Record<TraitKind, string> = { boon: 'พร', curse: 'คำสาป', trait: 'ลักษณะ', wound: 'แผล' };
export const KIND_ICON: Record<TraitKind, IconName> = { boon: 'kboon', curse: 'kcurse', trait: 'ktrait', wound: 'kwound' };
const KIND_ORDER: TraitKind[] = ['boon', 'curse', 'trait', 'wound'];

/** ป้ายที่เปิดการ์ดอยู่ในแท็บตัวละคร (แตะป้ายเล็กในคอลัมน์ซ้ายบนเดสก์ท็อปก็เปิดที่นี่) */
export const openTrait = signal<string | null>(null);

const iconUrl = (id: string) => `icons/trait_${id}.png`;

type Holder = Pick<LifeState, 'traits' | 'traitSteps'>;

/** สิ่งติดตัวของชีวิตนี้ เรียงตามชนิด: พร คำสาป ลักษณะ แผล (ในชนิดเดียวกันเรียงตามลำดับที่ได้มา) */
export function heldSorted(l: Holder): Trait[] {
  const held = l.traits.map((id) => game.traits.get(id)).filter((t): t is Trait => !!t);
  return KIND_ORDER.flatMap((k) => held.filter((t) => t.kind === k));
}

/** จุดบอกขั้นของสิ่งติดตัวที่ลุกลามได้ */
export function Steps({ at, of }: { at: number; of: number }) {
  return (
    <span class="steps" role="img" aria-label={`ขั้น ${at} จาก ${of}`} title={`ขั้น ${at} จาก ${of}`}>
      {Array.from({ length: of }, (_, i) => <i key={i} class={i < at ? 'on' : ''} />)}
    </span>
  );
}

/** ป้ายสั้นในบรรทัด (บันทึก ตัวเลือก บรรทัดทอย): สัญลักษณ์ชนิด + ชื่อ */
export function TraitChip({ id, l, children, lost }: { id: string; l: Holder; children?: preact.ComponentChildren; lost?: boolean }) {
  const t = game.traits.get(id);
  if (!t) return null;
  return (
    <span class={`kchip k-${t.kind} ${lost ? 'lost' : ''}`}>
      <Icon name={KIND_ICON[t.kind]} label={lost ? `${KIND_TH[t.kind]}ที่หายไป` : KIND_TH[t.kind]} />
      {traitLines(l, t).name}
      {children}
    </span>
  );
}

function Tile({ t, l, on, onPick }: { t: Trait; l: Holder; on: boolean; onPick: (id: string) => void }) {
  const name = traitLines(l, t).name;
  return (
    <button class={`trait k-${t.kind} ${on ? 'on' : ''}`} title={name} aria-label={`${KIND_TH[t.kind]} ${name}`} aria-pressed={on} onClick={() => onPick(t.id)}>
      <img src={iconUrl(t.id)} alt="" />
      {t.steps && <Steps at={traitStep(l, t)} of={t.steps.length} />}
    </button>
  );
}

/** อายุที่ได้สิ่งติดตัวนี้มา (จากบันทึกชีวิต) ไม่พบ = ติดตัวมาตั้งแต่ก่อนมีบันทึก */
function gainedAge(l: LifeState, id: string): number | null {
  const e = l.log.find((x) => x.changes?.traits?.includes(id));
  return e ? e.age : null;
}

function Card({ t, l, onClose }: { t: Trait; l: LifeState; onClose: () => void }) {
  const lines = traitLines(l, t);
  const age = gainedAge(l, t.id);
  // ที่มา: พรกับคำสาปบอกผู้ให้ ลักษณะกับแผลบอกว่าได้มาอย่างไร
  const origin = t.kind === 'trait' || t.kind === 'wound' ? t.how : t.source && t.source !== t.name ? t.source : '';
  return (
    <div class={`trait-card k-${t.kind}`} role="group" aria-label={lines.name}>
      <span class="art"><img src={iconUrl(t.id)} alt="" /></span>
      <div class="tc-head">
        <b>{lines.name}</b>
        <span class="tc-kind">
          <span class="k">{KIND_TH[t.kind]}</span>
          {t.steps && <><Steps at={traitStep(l, t)} of={t.steps.length} /><span>ขั้น <span class="num">{traitStep(l, t)}/{t.steps.length}</span></span></>}
        </span>
      </div>
      <button class="icon-btn" onClick={onClose} aria-label="ปิด"><Icon name="close" /></button>
      <div class="tc-body">
        {lines.gives.map((x, i) => <p key={`g${i}`} class="plus"><Icon name="plus" label="ได้" /><span>{x}</span></p>)}
        {lines.costs.map((x, i) => <p key={`c${i}`} class="minus"><Icon name="minus" label="เสีย" /><span>{x}</span></p>)}
        {t.breaks && <p class="note"><Icon name="lock" /><span>หมดเมื่อ{t.breaks}</span></p>}
        {t.live_with && <p class="note"><Icon name="key" /><span>ทางอยู่กับมัน: {t.live_with}</span></p>}
        <p class="note">
          <Icon name={t.hidden ? 'eyeoff' : 'eye'} />
          <span>
            {t.hidden ? 'คนอื่นมองไม่เห็น' : 'คนอื่นมองเห็น'}
            {origin ? ` · ${origin}` : ''}
            {age !== null && <> · อายุ <span class="num">{age}</span></>}
          </span>
        </p>
      </div>
    </div>
  );
}

/** แถวป้ายสิ่งติดตัว (ช่องไอคอน) small = ขนาดเล็กสำหรับคอลัมน์ซ้ายและหน้าชีวประวัติ */
export function TraitRow({ l, small, open, onPick }: { l: Holder; small?: boolean; open?: string | null; onPick: (id: string) => void }) {
  return (
    <div class={`trait-row ${small ? 'small' : ''}`}>
      {heldSorted(l).map((t) => <Tile key={t.id} t={t} l={l} on={open === t.id} onPick={onPick} />)}
    </div>
  );
}

function Legend({ kinds }: { kinds: TraitKind[] }) {
  return (
    <p class="kind-legend">
      {KIND_ORDER.filter((k) => kinds.includes(k)).map((k) => <span key={k} class={`k-${k}`}><i />{KIND_TH[k]}</span>)}
    </p>
  );
}

function Head({ n }: { n: number }) {
  return <h3><Icon name="ktrait" />สิ่งติดตัว <span class="num">{n}</span></h3>;
}

/** หัวข้อสิ่งติดตัวในแท็บตัวละคร: แตะป้ายแล้วการ์ดเปิดใต้แถว */
export function TraitsSection() {
  const l = life.value;
  const held = heldSorted(l);
  const open = held.find((t) => t.id === openTrait.value) ?? null;
  const pick = (id: string) => (openTrait.value = openTrait.value === id ? null : id);
  return (
    <section class="sec traits" aria-label="สิ่งติดตัว">
      <Head n={held.length} />
      {held.length === 0 ? <p class="muted">ยังไม่มีอะไรติดตัว</p> : (
        <>
          <TraitRow l={l} open={open?.id ?? null} onPick={pick} />
          <Legend kinds={held.map((t) => t.kind)} />
          {open && <Card t={open} l={l} onClose={() => (openTrait.value = null)} />}
        </>
      )}
    </section>
  );
}

/** แถวป้ายเล็กในคอลัมน์ซ้ายบนเดสก์ท็อป: แตะแล้วไปเปิดการ์ดในแท็บตัวละคร ไม่มีอะไรติดตัวก็ไม่ขึ้นหัวข้อ */
export function TraitsStrip() {
  const l = life.value;
  if (!heldSorted(l).length) return null;
  const pick = (id: string) => {
    openTrait.value = id;
    tab.value = 'character';
  };
  return (
    <section class="sec traits" aria-label="สิ่งติดตัว">
      <Head n={heldSorted(l).length} />
      <TraitRow l={l} small onPick={pick} />
    </section>
  );
}

/** สิ่งติดตัวในหน้าชีวประวัติ: แตะดูการ์ดได้ในหน้านั้นเอง */
export function TraitsOfLife({ l }: { l: LifeState }) {
  const [open, setOpen] = useState<string | null>(null);
  const held = heldSorted(l);
  if (!held.length) return null;
  const t = held.find((x) => x.id === open);
  return (
    <section class="sec traits" aria-label="สิ่งติดตัว">
      <Head n={held.length} />
      <TraitRow l={l} open={open} onPick={(id) => setOpen(open === id ? null : id)} />
      {t && <Card t={t} l={l} onClose={() => setOpen(null)} />}
    </section>
  );
}

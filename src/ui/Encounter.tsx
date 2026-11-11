/**
 * แผงการปะทะ (แบบ ก ที่ Phupha เลือก 11 พ.ย. 2026): สถานะอยู่บนเวที หัวแผ่นตัวเลือกบอกจังหวะกับท่าของอาชีพ
 * วิธีรับมือแต่ละข้อบอกค่าพลัง ความยาก โอกาส และเหตุที่ได้แต้มเพิ่ม ผลของแต่ละจังหวะอยู่ในบันทึกเหมือนเหตุการณ์อื่น
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ENCOUNTER, ENCOUNTER_END_TH, FOE_TAG_TH, MATERIALS, MOVE_TH, STAT_TH, TECHNIQUES, TECHNIQUE_HELP, type FoeSide, type FoeTag, type MoveKind, type TechniqueKind } from '../engine/balance';
import { foeOf, moveOdds, openMoves, techniqueOf, type FoeView, type TechniqueView } from '../engine/encounter';
import { fightSupplies, supplyAid } from '../engine/gear';
import { maxHp } from '../engine/items';
import type { FoeDef, GameEvent } from '../engine/schema';
import { paragraphs, render } from '../engine/text';
import type { BeatRecord, EncounterState, LifeState, LogEntry } from '../engine/state';
import { chooseMove, currentEvent, foeStruck, game, life, sheetCollapsed, supplyArmed, techArmed } from '../store';
import { Icon, STAT_ICON, type IconName } from './icons';
import { justRead } from './reading';
import { TraitChip } from './Traits';
import { ItemIcon, brief } from './Gear';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const pctClass = (p: number) => (p >= 0.7 ? 'good' : p >= 0.4 ? 'mid' : 'bad');

/** ขนาดหนึ่งเฟรมของภาพศัตรู (public/foes/index.json จากห้องวาด) เฟรมเรียงซ้ายไปขวา: ยืน แล้วเข้าตี */
interface FoeArt { w: number; h: number; frames: string[]; lift: number }
const foeArt = signal<Record<string, FoeArt>>({});
fetch('foes/index.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((j: Record<string, FoeArt> | null) => {
    if (j) foeArt.value = j;
  })
  .catch(() => {
    /* ไม่มีภาพ ศัตรูก็ยังมีชื่อกับสถานะบนเวที */
  });

const SIDE_ICON: Record<FoeSide, IconName> = { demon: 'horns', star: 'starside', machine: 'gear', nature: 'ktrait', human: 'character' };
const SIDE_TH: Record<FoeSide, string> = { demon: 'ฝ่ายจอมมาร', star: 'ฝ่ายดาว', machine: 'จักรกล', nature: 'ธรรมชาติและเจ้าเดิม', human: 'คน' };
/** สัญลักษณ์ของจุดอ่อน: ป้ายของวิธี หรือชนิดของวิธี */
const MATCH_ICON: Record<string, IconName> = {
  fire: 'flame', light: 'sun', water: 'drop', smoke: 'cloud', noise: 'bell', bait: 'bag', name: 'quill',
  pierce: 'weapon', blunt: 'weapon', edge: 'weapon', ranged: 'arrow',
  attack: 'STR', quick: 'DEX', guard: 'CON', read: 'eye', talk: 'CHA', item: 'bag',
};
const matchTh = (x: string) => FOE_TAG_TH[x as FoeTag] ?? MOVE_TH[x as MoveKind] ?? x;
const weakIcon = (foe: FoeDef): IconName => MATCH_ICON[foe.weak[0] ?? ''] ?? 'target';
const weakTh = (foe: FoeDef) => `จุดอ่อน: ${foe.weak.map(matchTh).join(' ')}`;
const techTh = (kind: TechniqueKind) => Object.values(TECHNIQUES).find((t) => t.kind === kind)?.th ?? '';
const WHY_TH: Record<NonNullable<TechniqueView['why']>, string> = {
  used: 'ใช้ไปแล้วในการปะทะนี้',
  late: 'ใช้ได้เฉพาะจังหวะแรก',
  drifted: 'ตอนนี้ห่างจากเทพเกินไป',
  away: 'ตอนนี้ไม่ได้อยู่ในถิ่นเกิด',
  cold_iron: 'สวมเหล็กเย็นอยู่ ร่ายเวทและขอพรไม่ได้',
};

/** การปะทะที่กำลังเดินอยู่ (ไม่มี = ไม่ได้อยู่ในการปะทะ) */
export function encounterNow(): { ev: GameEvent; foe: FoeView; st: EncounterState } | null {
  const ev = currentEvent.value;
  const st = life.value.encounter;
  if (!ev?.encounter || !st || !life.value.alive) return null;
  const foe = foeOf(game, ev);
  return foe ? { ev, foe, st } : null;
}

function Pips({ on, total }: { on: number; total: number }) {
  return (
    <span class="pips" role="img" aria-label={`แรงใจ ${on} จาก ${total}`} title={`แรงใจ ${on} จาก ${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} class={`pip ${i < on ? 'on' : ''}`} />)}
    </span>
  );
}

function Threat({ n }: { n: number }) {
  return (
    <span class="threat" role="img" aria-label={`ระดับภัย ${n} จาก 5`} title={`ระดับภัย ${n} จาก 5`}>
      {Array.from({ length: 5 }, (_, i) => <i key={i} class={i < n ? 'on' : ''} />)}
    </span>
  );
}

/** จุดบอกจังหวะ: เขียว = สำเร็จ แดง = พลาด วงหนา = จังหวะนี้ */
function BeatDots({ records, total, now }: { records: BeatRecord[]; total?: number; now?: number }) {
  const n = total ?? records.length;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r = records[i];
        return <i key={i} class={`beat ${r ? (r.success ? 'won' : 'lost') : i === now ? 'now' : ''}`} />;
      })}
    </>
  );
}

/** ป้ายสถานะบนเวที: พลังชีวิตของเรามุมซ้าย ศัตรูมุมขวา (ชื่อ ระดับภัย แรงใจ และจุดอ่อนถ้ารู้แล้ว) */
export function EncounterChips({ foe, st }: { foe: FoeView; st: EncounterState }) {
  const l = life.value;
  const cap = Math.max(1, maxHp(l, game.items));
  return (
    <>
      <span class="enc-chip me" title="พลังชีวิต">
        <Icon name="heart" label="พลังชีวิต" />
        <span class="hpbar"><i style={{ width: `${Math.max(0, Math.min(100, (l.hp / cap) * 100))}%` }} /></span>
        <b class="num">{l.hp}/{cap}</b>
      </span>
      <span class="enc-chip foe">
        <Icon name={SIDE_ICON[foe.def.side]} label={SIDE_TH[foe.def.side]} class="side-icon" />
        <span class="foe-name">{foe.name}</span>
        <Threat n={foe.threat} />
        <Pips on={st.morale} total={foe.morale} />
        {st.weakKnown && <span class="weak" title={weakTh(foe.def)}><Icon name={weakIcon(foe.def)} label={weakTh(foe.def)} /></span>}
      </span>
    </>
  );
}

/** ศัตรูบนเวที ยืนขวาของตัวละคร หันหน้าเข้าหา เปลี่ยนเป็นท่าเข้าตีครู่หนึ่งเมื่อจังหวะล่าสุดพลาด */
export function FoeSprite({ foe }: { foe: FoeView }) {
  const art = foeArt.value[foe.def.id];
  const [strike, setStrike] = useState(false);
  const hit = foeStruck.value;
  const seen = useRef(hit);
  useEffect(() => {
    if (hit === seen.current) return;
    seen.current = hit;
    setStrike(true);
    const t = setTimeout(() => setStrike(false), 900);
    return () => clearTimeout(t);
  }, [hit]);
  if (!art) return null;
  const last = Math.max(1, art.frames.length - 1);
  const frame = strike ? Math.max(0, art.frames.indexOf('strike')) : 0;
  return (
    <div
      class="sprite foe"
      role="img"
      aria-label={foe.name}
      style={{
        backgroundImage: `url(foes/${foe.def.id}.png)`,
        backgroundSize: `${art.frames.length * 100}% 100%`,
        backgroundPosition: `${(frame / last) * 100}% 0`,
        aspectRatio: `${art.w} / ${art.h}`,
        '--fh': art.h,
        '--lift': art.lift,
      }}
    />
  );
}

/** สิ่งที่คนในโลกเล่าต่อกันเรื่องจุดอ่อน ขึ้นในบันทึกตรงที่ตัวละครรู้ */
function Lore({ foe }: { foe: FoeDef }) {
  return <p class="lore"><Icon name={weakIcon(foe)} label={weakTh(foe)} />{foe.lore}</p>;
}

function BeatChanges({ r }: { r: BeatRecord }) {
  if (!r.damage && !r.pips && !r.blocked && !r.healed) return null;
  return (
    <p class="changes">
      {r.healed ? <span class="good"><Icon name="heart" label="พลังชีวิต" /><span class="num">+{r.healed}</span></span> : null}
      {r.pips ? <span class="good"><i class="pip on" role="img" aria-label="แรงใจของศัตรู" /><span class="num">-{r.pips}</span></span> : null}
      {r.damage ? <span class="bad"><Icon name="heart" label="พลังชีวิต" /><span class="num">-{r.damage}</span></span> : null}
      {r.blocked && <span class="good"><Icon name="CON" />{r.blocked === 'ward' ? 'พรรับไว้' : 'โล่รับไว้'}</span>}
    </p>
  );
}

/** หนึ่งจังหวะที่เดินไปแล้ว: สัญญาณของศัตรู วิธีที่เลือก ผลทอย ข้อความผล (limit = จำนวนย่อหน้าที่เปิดแล้ว) และสิ่งที่เปลี่ยน */
function Beat({ tell, label, r, l, cast, limit, lore }: { tell: string[]; label: string | null; r: BeatRecord; l: LifeState; cast: Record<string, string>; limit?: number; lore?: FoeDef | null }) {
  const text = r.text ? paragraphs(render(r.text, l, cast)) : [];
  const shown = text.slice(0, limit ?? Infinity);
  const done = shown.length >= text.length;
  const used = r.supply ? game.items.get(r.supply) : undefined;
  return (
    <>
      {tell.map((p, i) => <p key={`t${i}`}>{p}</p>)}
      {label && <p class="picked"><Icon name="flag" />{label}</p>}
      {used && <p class="picked used"><ItemIcon item={used} /><span>{used.use?.text ? render(used.use.text, l, cast) : used.name}</span></p>}
      <p class={`roll ${r.success ? 'good' : 'bad'}`}>
        <Icon name="d20" label="ทอยเต๋า" />
        <span class="num">{r.d20} {signed(r.mod)}</span>
        {r.traits?.map((b) => (
          <TraitChip key={b.id} id={b.id} l={l}><span class="num">{signed(b.amount)}</span></TraitChip>
        ))}
        <span class="num">/ DC {r.dc}</span>
        {r.success ? 'สำเร็จ' : 'พลาด'}
        {r.rerolled && <span class="what">ทอยใหม่</span>}
        {r.tech && <span class="what"><Icon name="role" />{techTh(r.tech)}</span>}
      </p>
      {shown.map((p, i) => <p key={`r${i}`} class="aftermath">{p}</p>)}
      {done && <BeatChanges r={r} />}
      {done && lore && <Lore foe={lore} />}
    </>
  );
}

const tellOf = (ev: GameEvent | undefined, i: number, l: LifeState, cast: Record<string, string>) => {
  const t = ev?.encounter?.beats[i]?.text;
  return t ? paragraphs(render(t, l, cast)) : [];
};
const labelOf = (ev: GameEvent | undefined, i: number, r: BeatRecord, l: LifeState, cast: Record<string, string>) => {
  const m = ev?.encounter?.beats[i]?.moves.find((x) => x.id === r.moveId);
  return m ? render(m.label, l, cast) : null;
};

/**
 * การปะทะที่กำลังเดินอยู่ในบันทึก count = จำนวนย่อหน้าใหม่ที่เปิดแล้ว (ดู reading.ts)
 * ของใหม่ตอนเริ่มคือข้อความของเหตุการณ์กับสัญญาณแรก กลางการปะทะคือผลของจังหวะล่าสุดกับสัญญาณถัดไป
 */
export function EncounterNow({ count, more }: { count: number; more: boolean }) {
  const now = encounterNow();
  if (!now) return null;
  const { ev, foe, st } = now;
  const l = life.value;
  const cast = l.cast ?? {};
  const mid = st.records.length > 0;
  const intro = paragraphs(render(ev.text, l));
  const lead = mid ? paragraphs(render(st.records.at(-1)!.text ?? '', l)).length : intro.length;
  const introShown = mid ? intro : intro.slice(0, count);
  const tell = tellOf(ev, st.beat, l, cast).slice(0, Math.max(0, count - lead));
  const just = (last: boolean) => (last && more ? 'just' : '');
  return (
    <article class="entry current">
      {introShown.map((p, i) => <p key={`i${i}`} class={just(!mid && !tell.length && i === introShown.length - 1)}>{p}</p>)}
      {st.knew && introShown.length === intro.length && <Lore foe={foe.def} />}
      {st.records.map((r, i) => (
        <Beat
          key={i}
          tell={tellOf(ev, i, l, cast)}
          label={labelOf(ev, i, r, l, cast)}
          r={r}
          l={l}
          cast={cast}
          limit={i === st.records.length - 1 ? count : undefined}
          lore={st.learned === i ? foe.def : null}
        />
      ))}
      {tell.map((p, i) => <p key={`n${i}`} class={just(i === tell.length - 1)}>{p}</p>)}
    </article>
  );
}

/** ย่อหน้าผลของจังหวะสุดท้ายของการปะทะที่จบแล้ว นับเป็นของใหม่ก่อนข้อความปิด */
export const lastBeatText = (e: LogEntry, l: LifeState): string[] => {
  const t = e.encounter?.records.at(-1)?.text;
  return t ? paragraphs(render(t, l, e.cast ?? {})) : [];
};

/** จังหวะทั้งหมดของการปะทะที่จบแล้ว ต่อด้วยบรรทัดผล (ขึ้นเมื่อผลของจังหวะสุดท้ายเปิดครบ) */
export function EncounterBeats({ e, limit }: { e: LogEntry; limit: number }) {
  const log = e.encounter;
  if (!log) return null;
  const l = life.value;
  const cast = e.cast ?? {};
  const ev = game.events.find((x) => x.id === e.eventId);
  const foe = game.foes.get(log.foe) ?? null;
  const n = log.records.length;
  return (
    <>
      {log.knew && foe && <Lore foe={foe} />}
      {log.records.map((r, i) => (
        <Beat key={i} tell={tellOf(ev, i, l, cast)} label={labelOf(ev, i, r, l, cast)} r={r} l={l} cast={cast} limit={i === n - 1 ? limit : undefined} lore={log.learned === i ? foe : null} />
      ))}
      {limit >= lastBeatText(e, l).length && (
        <p class="outcome">
          <Icon name="rival" />
          {ENCOUNTER_END_TH[log.end]}
          <span class="beats"><BeatDots records={log.records} /></span>
        </p>
      )}
    </>
  );
}

/** แผ่นวิธีรับมือ: หัวแผ่นบอกจังหวะกับท่าของอาชีพ แต่ละวิธีบอกเหตุที่ได้แต้มเพิ่ม ค่าพลัง ความยาก และโอกาส */
export function EncounterSheet() {
  const now = encounterNow();
  const [hint, setHint] = useState(false);
  if (!now) return null;
  const { ev, st } = now;
  const l = life.value;
  const moves = openMoves(game, l, ev);
  if (sheetCollapsed.value) {
    return (
      <div class="sheet collapsed">
        <button class="sheet-open" onClick={() => (sheetCollapsed.value = false)}>
          <Icon name="rival" />รับมือ <span class="num">{moves.length}</span> ทาง
        </button>
      </div>
    );
  }
  const tk = techniqueOf(l, game);
  const armed = techArmed.value && tk.armable && tk.ready;
  const bonus = tk.kind === 'spell' ? ENCOUNTER.weak : tk.kind === 'sense' || tk.kind === 'song' || tk.kind === 'at_hand' ? (Object.values(TECHNIQUES).find((t) => t.kind === tk.kind)?.amount ?? 0) : 0;
  const total = ev.encounter!.beats.length;
  // ของใช้แล้วหมดที่หยิบไว้: ใช้กับวิธีรับมือถัดไป หนึ่งจังหวะหนึ่งชิ้น และหมดไปเมื่อมันช่วยวิธีที่เลือกเท่านั้น
  const supplies = fightSupplies(game, l);
  const held = supplies.find((x) => x.item.id === supplyArmed.value)?.item;
  return (
    <div class="sheet enc" role="group" aria-label="วิธีรับมือ">
      <div class="sheet-head enc-head">
        <span class="beats" role="img" aria-label={`จังหวะ ${st.beat + 1} จาก ${total}`} title={`จังหวะ ${st.beat + 1} จาก ${total}`}>
          <Icon name="rival" />
          <BeatDots records={st.records} total={total} now={st.beat} />
        </span>
        <button
          class={`tech ${tk.ready ? '' : 'spent'}`}
          aria-pressed={tk.armable && tk.ready ? armed : undefined}
          aria-label={`ท่าของอาชีพ ${tk.th}`}
          onClick={() => (tk.armable && tk.ready ? (techArmed.value = !armed) : setHint(!hint))}
        >
          <Icon name="role" />{tk.th}{bonus > 0 && <span class="num">+{bonus}</span>}
        </button>
        <button class="later" onClick={() => (sheetCollapsed.value = true)}>
          <Icon name="chevron" />พักไว้
        </button>
      </div>
      {(armed || hint) && <p class="tech-hint">{TECHNIQUE_HELP[tk.kind]}{tk.why ? ` (${WHY_TH[tk.why]})` : ''}</p>}
      {supplies.length > 0 && (
        <div class="sup-row" role="group" aria-label="ของใช้แล้วหมด">
          <Icon name="bag" label="ของใช้แล้วหมด" />
          {supplies.map(({ item, count }) => (
            <button
              key={item.id}
              class={`itile small r-${item.rarity}`}
              title={item.name}
              aria-label={`${item.name} มี ${count}`}
              aria-pressed={held?.id === item.id}
              onClick={() => (supplyArmed.value = held?.id === item.id ? null : item.id)}
            >
              <ItemIcon item={item} />
              <span class="count num">{count}</span>
            </button>
          ))}
        </div>
      )}
      {held && <p class="tech-hint">{held.name}: {brief(held).join(' · ')} หมดไปเมื่อช่วยวิธีที่เลือกเท่านั้น</p>}
      {moves.map((m, i) => {
        const o = moveOdds(game, l, ev, m, armed, held?.id);
        const part = (k: (typeof o.parts)[number]['kind']) => o.parts.find((p) => p.kind === k);
        const ally = m.ally ? (l.people ?? []).find((p) => p.id === l.cast?.[m.ally!]) : null;
        const foe = now.foe.def;
        const tech = part('tech');
        const edge = part('edge');
        const edgeItem = edge?.by ? game.items.get(edge.by) : undefined;
        const heavy = part('heavy');
        const aid = part('supply') ? supplyAid(game, l, foe, m, held?.id, ENCOUNTER.weak) : null;
        const tagged = m.kind === 'flee' || o.parts.length > 0 || o.traits.length > 0;
        return (
          <button key={m.id} class={`choice ${m.kind === 'flee' ? 'flee' : ''}`} onClick={() => !justRead() && chooseMove(m.id)}>
            <span class="label two">
              <span class="l1"><kbd class="num">{i + 1}</kbd>{render(m.label, l)}</span>
              {tagged && (
                <span class="tags">
                  {m.kind === 'flee' && <span class="tag">หนี</span>}
                  {part('tell') && <span class="tag tell"><Icon name="eye" />รับจังหวะ <span class="num">{signed(part('tell')!.amount)}</span></span>}
                  {part('weak') && <span class="tag weakness"><Icon name={weakIcon(foe)} />จุดอ่อน <span class="num">{signed(part('weak')!.amount)}</span></span>}
                  {part('strong') && <span class="tag strong"><Icon name="CON" />จุดแข็ง <span class="num">{signed(part('strong')!.amount)}</span></span>}
                  {part('ally') && <span class="tag ally"><Icon name="friend" />{ally?.name ?? 'มีคนช่วย'} <span class="num">{signed(part('ally')!.amount)}</span></span>}
                  {tech && <span class="tag tell"><Icon name="role" />{tk.th}{tech.amount ? <> <span class="num">{signed(tech.amount)}</span></> : null}</span>}
                  {edge && edgeItem && <span class="tag ally"><ItemIcon item={edgeItem} />{edgeItem.material ? MATERIALS[edgeItem.material].th : edgeItem.name} <span class="num">{signed(edge.amount)}</span></span>}
                  {heavy && <span class="tag strong"><Icon name="body" />เกราะหนัก <span class="num">{signed(heavy.amount)}</span></span>}
                  {aid && (
                    <span class="tag supply">
                      <ItemIcon item={aid.item} />
                      {part('supply')!.amount ? <span class="num">{signed(part('supply')!.amount)}</span> : null}
                      {aid.heal ? <><Icon name="heart" label="ฟื้นพลังชีวิต" /><span class="num">+{aid.heal}</span></> : null}
                    </span>
                  )}
                  {o.traits.map((b) => <TraitChip key={b.id} id={b.id} l={l}><span class="num">{signed(b.amount)}</span></TraitChip>)}
                </span>
              )}
            </span>
            <span class="check" title={`${STAT_TH[o.stat]} DC ${o.dc}`}>
              <Icon name={STAT_ICON[o.stat]} label={STAT_TH[o.stat]} />
              <span class="num dc">{o.dc}</span>
              <span class={`pct num ${pctClass(o.chance)}`}>{Math.round(o.chance * 100)}%</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

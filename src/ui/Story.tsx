import { useEffect, useRef, useState } from 'preact/hooks';
import { checkChance, choiceLock, traitBlock } from '../engine/engine';
import { CLASSES, STAT_TH, type ClassId } from '../engine/balance';
import { STATS, type Stat } from '../engine/schema';
import { paragraphs, render } from '../engine/text';
import { traitCheckBonuses } from '../engine/traits';
import { worldYear, type LifeChanges, type LogEntry, type YearEnd } from '../engine/state';
import { openMoves } from '../engine/encounter';
import { choose, chooseMove, currentEvent, endReasonOf, game, lastEntry, life, sheetCollapsed } from '../store';
import { EncounterBeats, EncounterNow, EncounterSheet, lastBeatText } from './Encounter';
import { Ending, bioOpen } from './Endings';
import { Icon, STAT_ICON } from './icons';
import { signed } from './Hud';
import { Steps, TraitChip } from './Traits';
import { ItemChip } from './Gear';
import { CooledChips, EventTag, OrgChanges, RefuseTag } from './Orgs';
import { CityChanges, CityYearChips } from './City';
import { autoSpeed, autoplay, cycleSpeed, fresh, justRead, revealAll, revealNext, revealing, scrolledBack, shownCount, tapNext } from './reading';

/** อายุที่เปิดค้างไว้ อายุเก่ากว่านี้พับเป็นก้อนเดียว */
const OPEN_AGES = 2;

/** สิ่งติดตัวที่เพิ่งได้ ขยับขั้น หรือหายไป แสดงเป็นป้ายสีตามชนิดต่อท้ายเหตุการณ์ */
function TraitChanges({ c }: { c: LifeChanges }) {
  return (
    <>
      {c.traits?.map((id) => <TraitChip key={id} id={id} l={{ traits: [id], traitSteps: {} }} />)}
      {Object.entries(c.steps ?? {}).map(([id, step]) => {
        const of = game.traits.get(id)?.steps?.length;
        return (
          <TraitChip key={`s-${id}`} id={id} l={{ traits: [id], traitSteps: { [id]: step } }}>
            {of ? <Steps at={step} of={of} /> : null}
          </TraitChip>
        );
      })}
      {c.lostTraits?.map((id) => <TraitChip key={`x-${id}`} id={id} l={{ traits: [id], traitSteps: {} }} lost />)}
    </>
  );
}

function Changes({ c }: { c: LifeChanges }) {
  return (
    <p class="changes">
      {c.classId && (
        <span class="good"><Icon name="role" label="อาชีพ" />{CLASSES[c.classId as ClassId]?.th ?? c.classId}</span>
      )}
      <TraitChanges c={c} />
      {STATS.filter((s) => c.stats?.[s]).map((s) => (
        <span key={s} class={c.stats![s]! > 0 ? 'good' : 'bad'}>
          <Icon name={STAT_ICON[s]} label={STAT_TH[s]} /><span class="num">{signed(c.stats![s]!)}</span>
        </span>
      ))}
      {c.hp ? <span class={c.hp > 0 ? 'good' : 'bad'}><Icon name="heart" label="พลังชีวิต" /><span class="num">{signed(c.hp)}</span></span> : null}
      {c.maxHp ? <span class={c.maxHp > 0 ? 'good' : 'bad'}><Icon name="heart" label="พลังชีวิตสูงสุด" />สูงสุด <span class="num">{signed(c.maxHp)}</span></span> : null}
      {c.gold ? <span class={c.gold > 0 ? 'gold' : 'bad'}><Icon name="coin" label="ทอง" /><span class="num">{signed(c.gold)}</span></span> : null}
      {c.items?.map((id) => <ItemChip key={id} id={id} />)}
      <OrgChanges c={c} />
      <CityChanges c={c} />
    </p>
  );
}

/** เช็คฤดูหนาวของปีนี้ ใช้บรรทัดทอยแบบเดียวกับเช็คของตัวเลือก */
function WinterRoll({ w }: { w: NonNullable<YearEnd['winter']> }) {
  return (
    <p class={`roll ${w.success ? 'good' : 'bad'}`}>
      <Icon name="d20" label="ทอยเต๋า" />
      <span class="what">ฤดูหนาว</span>
      <Icon name="CON" label={STAT_TH.CON} />
      <span class="num">{w.d20} {signed(w.mod)} / DC {w.dc}</span>
      {w.success ? 'ผ่าน' : 'พลาด'}
    </p>
  );
}

/** สิ่งที่ร่างกายเสียไปตอนสิ้นปี: พลังชีวิตสูงสุดจากฤดูหนาว และค่าที่โรยตามวัย */
function YearChanges({ y }: { y: YearEnd }) {
  const lost = y.winter?.lost ?? 0;
  const down = new Map<Stat, number>();
  for (const s of y.decline ?? []) down.set(s, (down.get(s) ?? 0) + 1);
  const marks = y.marks ?? [];
  if (!lost && !down.size && !marks.length && !y.cooled?.length && !y.rent && !y.income && !y.eased) return null;
  return (
    <p class="changes">
      {marks.map((id, i) => <TraitChip key={`${id}-${i}`} id={id} l={life.value} />)}
      {lost > 0 && <span class="bad"><Icon name="heart" label="พลังชีวิตสูงสุด" />สูงสุด <span class="num">-{lost}</span></span>}
      {[...down].map(([s, n]) => (
        <span key={s} class="bad"><Icon name={STAT_ICON[s]} label={STAT_TH[s]} /><span class="num">-{n}</span></span>
      ))}
      <CooledChips y={y} />
      <CityYearChips y={y} />
    </p>
  );
}

function Entry({ e, old, limit }: { e: LogEntry; old: boolean; limit?: number }) {
  const l = life.value;
  const ev = game.events.find((x) => x.id === e.eventId);
  const choice = ev?.choices.find((c) => c.id === e.choiceId);
  // ชื่อของตัวแสดงเติมจากคนที่เล่นบทนั้นในเหตุการณ์นี้ ไม่ใช่ของเหตุการณ์ปัจจุบัน
  const cast = e.cast ?? {};
  const span = e.span ?? 1;
  // ลำดับที่ผู้อ่านเห็น: ผลของตัวเลือก สิ่งที่เปลี่ยน แล้วจึงสิ่งที่เกิดตอนสิ้นปี (เช็คฤดูหนาว ประโยคของปี สิ่งที่ร่างกายเสีย)
  // การปะทะ: ผลของจังหวะสุดท้าย (lead ย่อหน้า) เปิดก่อนข้อความปิด
  const lead = lastBeatText(e, l).length;
  const told = e.text ? paragraphs(render(e.text, l, cast, span)) : [];
  const yearLines = e.year?.lines ?? [];
  const shown = limit ?? Infinity;
  const after = Math.max(0, shown - lead);
  const toldDone = after >= told.length;
  const allDone = after >= told.length + yearLines.length;
  return (
    <article class={`entry ${old ? 'old' : ''}`}>
      {ev && <EventTag ev={ev} />}
      {ev && paragraphs(render(ev.text, l, cast, span)).map((p, i) => <p key={i}>{p}</p>)}
      {choice && <p class="picked"><Icon name="flag" />{render(choice.label, l, cast, span)}</p>}
      {e.roll && (
        <p class={`roll ${e.roll.success ? 'good' : 'bad'}`}>
          <Icon name="d20" label="ทอยเต๋า" />
          <span class="num">{e.roll.d20} {signed(e.roll.mod)}</span>
          {e.roll.traits?.map((b) => (
            <TraitChip key={b.id} id={b.id} l={l}><span class="num">{signed(b.amount)}</span></TraitChip>
          ))}
          <span class="num">/ DC {e.roll.dc}</span>
          {e.roll.success ? 'สำเร็จ' : 'พลาด'}
        </p>
      )}
      {e.encounter && <EncounterBeats e={e} limit={shown} />}
      {told.slice(0, after).map((p, i) => <p key={`a${i}`} class="aftermath">{p}</p>)}
      {e.changes && toldDone && <Changes c={e.changes} />}
      {e.year?.winter && (yearLines.length ? after > told.length : toldDone) && <WinterRoll w={e.year.winter} />}
      {yearLines.slice(0, Math.max(0, after - told.length)).map((p, i) => <p key={`y${i}`} class="aftermath">{p}</p>)}
      {e.year && allDone && <YearChanges y={e.year} />}
    </article>
  );
}

/** หัวอายุของกลุ่มเหตุการณ์ เหตุการณ์ที่เล่าหลายปีรวบเดียวบอกเป็นช่วง เช่น 41–44 */
function AgeHead({ age, year, span = 1 }: { age: number; year: number; span?: number }) {
  const to = (n: number) => (span > 1 ? `${n}–${n + span - 1}` : `${n}`);
  return (
    <h2 class="age-head">
      <Icon name="age" label="อายุ" /><b class="num">{to(age)}</b><span class="num">{to(year)}</span>
    </h2>
  );
}

function onScroll(e: Event) {
  const el = e.currentTarget as HTMLElement;
  const back = el.scrollHeight - el.scrollTop - el.clientHeight > 160;
  if (back !== scrolledBack.value) scrolledBack.value = back;
}

/**
 * หมุนจอแล้วอ่านต่อที่เดิม: จำย่อหน้าบนสุดที่เห็นอยู่ พอขนาดจอเปลี่ยนเลื่อนกลับไปที่ย่อหน้านั้น
 * ถ้าอยู่ท้ายสุดอยู่แล้วก็ปล่อยให้ติดท้ายเหมือนเดิม
 */
function useKeepPlace(box: { current: HTMLDivElement | null }) {
  useEffect(() => {
    let anchor: { el: Element; top: number } | null = null;
    let atEnd = true;
    const remember = () => {
      const el = box.current;
      if (!el) return;
      atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      const top = el.getBoundingClientRect().top;
      const first = [...el.querySelectorAll('p, h2')].find((p) => p.getBoundingClientRect().bottom > top);
      anchor = first ? { el: first, top: first.getBoundingClientRect().top - top } : null;
    };
    const restore = () => {
      const el = box.current;
      if (!el) return;
      if (atEnd) el.scrollTop = el.scrollHeight;
      else if (anchor && el.contains(anchor.el)) el.scrollTop += anchor.el.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.top;
    };
    const el = box.current;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => requestAnimationFrame(restore));
    };
    el?.addEventListener('scroll', remember, { passive: true });
    addEventListener('resize', onResize);
    remember();
    return () => {
      el?.removeEventListener('scroll', remember);
      removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
}

/** บันทึกชีวิตแยกตามอายุ เหตุการณ์ปัจจุบันอยู่ท้ายสุด */
export function StoryLog() {
  const l = life.value;
  const ev = currentEvent.value;
  const [showOld, setShowOld] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useKeepPlace(box);

  const ages: number[] = [];
  for (const e of l.log) if (!ages.includes(e.age)) ages.push(e.age);
  if (ev && !ages.includes(l.age)) ages.push(l.age);
  const folded = showOld ? [] : ages.slice(0, Math.max(0, ages.length - OPEN_AGES));
  const open = ages.filter((a) => !folded.includes(a));
  const year = (age: number) => l.birthYear + age;

  const shown = shownCount.value;
  const { after, now } = fresh.value;
  const isFresh = (e: LogEntry) => e === lastEntry.value && l.log[l.log.length - 1] === e;
  const nowCount = Math.max(0, shown - after.length);
  const nowShown = now.slice(0, nowCount);
  const more = revealing.value;
  // การปะทะที่กำลังเดิน: จังหวะที่ผ่านไปแล้วอยู่ในบันทึกเสมอ แม้ย่อหน้าใหม่ยังไม่เปิด
  const fighting = !!ev?.encounter && !!l.encounter;

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: shown === Infinity ? 'auto' : 'smooth' });
  }, [l.log.length, ev?.id, shown]);

  // แตะที่ไหนก็ได้ในบันทึกเพื่ออ่านย่อหน้าต่อไป (ยกเว้นปุ่ม)
  const onTap = (e: MouseEvent) => {
    if (more && !(e.target as HTMLElement).closest('button')) revealNext();
  };

  return (
    <div ref={box} class={`log ${more ? 'reading' : ''}`} aria-live="polite" onClick={onTap} onScroll={onScroll}>
      {folded.length > 0 && (
        <button class="fold" onClick={() => setShowOld(true)}>
          <Icon name="chevron" />
          <span class="num">{folded[0]}–{folded[folded.length - 1]}</span>
          · {l.log.filter((e) => folded.includes(e.age)).length} เหตุการณ์
        </button>
      )}
      {open.map((age) => (
        <section key={age} class="age-group">
          <AgeHead age={age} year={year(age)} span={Math.max(1, ...l.log.filter((e) => e.age === age).map((e) => e.span ?? 1))} />
          {l.log.filter((e) => e.age === age).map((e, i) => (
            <Entry key={`${e.eventId}-${i}`} e={e} old={!!ev || l.log.indexOf(e) < l.log.length - 1} limit={isFresh(e) && shown !== Infinity ? shown : undefined} />
          ))}
          {ev && age === l.age && fighting && (nowCount > 0 || l.encounter!.records.length > 0) && <EncounterNow count={nowCount} more={more} />}
          {ev && age === l.age && !fighting && nowShown.length > 0 && (
            <article class="entry current">
              <EventTag ev={ev} />
              {nowShown.map((p, i) => <p key={i} class={i === nowShown.length - 1 && more ? 'just' : ''}>{p}</p>)}
            </article>
          )}
        </section>
      ))}
      {more && (
        <button class="read-on" onClick={revealNext} aria-label="อ่านต่อ">
          <Icon name="chevron" />
        </button>
      )}
      {!l.alive && !more && (endReasonOf(l) === 'death' ? (
        <p class="end-mark"><span class="num">{l.birthYear}</span><Icon name="dead" label="ถึง" /><span class="num">{worldYear(l)}</span></p>
      ) : <Ending />)}
      <div ref={end} />
    </div>
  );
}

const pctClass = (p: number) => (p >= 0.7 ? 'good' : p >= 0.4 ? 'mid' : 'bad');

/** สิ่งที่กดได้ตอนนี้ เรียงตามที่แสดง ใช้กับปุ่มลัด 1–9: ตัวเลือกของเหตุการณ์ หรือวิธีรับมือของจังหวะปัจจุบันในการปะทะ */
export function hotkeyActions(): (() => void)[] {
  const ev = currentEvent.value;
  const l = life.value;
  if (!ev || !l.alive || revealing.value || sheetCollapsed.value) return [];
  if (ev.encounter) return l.encounter ? openMoves(game, l, ev).map((m) => () => chooseMove(m.id)) : [];
  return ev.choices.filter((c) => choiceLock(game, l, c, ev) === null).map((c) => () => choose(c.id));
}

/** ป้ายสิ่งติดตัวใต้ตัวเลือก: อะไรช่วยหรือถ่วงการทอยนี้ และตัวเลือกนี้เปิดได้เพราะอะไรติดตัวอยู่ */
function ChoiceTags({ c }: { c: NonNullable<ReturnType<typeof currentEvent.peek>>['choices'][number] }) {
  const l = life.value;
  const bonus = c.check ? traitCheckBonuses(l, game.traits, c.check.stat, c.check.foe) : [];
  const opened = c.requires?.trait && !bonus.some((b) => b.id === c.requires!.trait) ? c.requires.trait : null;
  if (!bonus.length && !opened) return null;
  return (
    <span class="tags">
      {opened && <TraitChip id={opened} l={l} />}
      {bonus.map((b) => <TraitChip key={b.id} id={b.id} l={l}><span class="num">{signed(b.amount)}</span></TraitChip>)}
    </span>
  );
}

/** แผ่นปิดท้ายชีวิต: ฉากตายเล่นจบแล้ว เหลือปุ่มเดียวพาไปหน้าชีวประวัติ */
function Farewell() {
  const l = life.value;
  return (
    <div class="sheet farewell" role="group" aria-label="จบชีวิต">
      <p class="muted">ชีวิตของ{l.name}จบลงที่อายุ <span class="num">{l.age}</span></p>
      <button class="primary" onClick={() => (bioOpen.value = true)}>
        <Icon name="book" />อ่านชีวประวัติ
      </button>
    </div>
  );
}

/**
 * แผ่นตัวเลือกด้านล่าง: บอก stat, DC และ % ก่อนกดเสมอ ตัวที่ติดแค่ stat หรือติดเพราะสิ่งติดตัว โชว์เป็นล็อกพร้อมเหตุผล
 * ตัวเลือกที่สิ่งติดตัวมีผลกับการทอย มีป้ายบอกใต้ข้อความ
 */
export function ChoiceSheet() {
  const l = life.value;
  const ev = currentEvent.value;
  if (revealing.value) return <ReadBar />;
  if (!l.alive) return endReasonOf(l) === 'death' ? <Farewell /> : null;
  if (!ev) return null;
  if (ev.encounter) return <EncounterSheet />;
  const rows = ev.choices
    .map((c) => ({ c, lock: choiceLock(game, l, c, ev), blocked: traitBlock(game, l, c, ev) }))
    .filter((r) => r.lock !== 'hidden' || r.blocked.length > 0);
  if (sheetCollapsed.value) {
    return (
      <div class="sheet collapsed">
        <button class="sheet-open" onClick={() => (sheetCollapsed.value = false)}>
          <Icon name="flag" />ตัดสินใจ <span class="num">{rows.filter((r) => !r.lock).length}</span> ทาง
        </button>
      </div>
    );
  }
  let n = 0;
  return (
    <div class="sheet" role="group" aria-label="ตัวเลือก">
      <div class="sheet-head">
        <Icon name="flag" />
        <button class="later" onClick={() => (sheetCollapsed.value = true)}>
          <Icon name="chevron" />พักไว้
        </button>
      </div>
      {rows.map(({ c, lock, blocked }) => {
        if (lock) {
          const need = lock === 'hidden' ? [] : (lock as { stat: keyof typeof STAT_TH; min: number }[]);
          return (
            <button key={c.id} class="choice locked" disabled>
              <span class="label">{render(c.label, l)}</span>
              <span class="check">
                <Icon name="lock" label="ล็อก" />
                {blocked.map((id) => <TraitChip key={id} id={id} l={l} />)}
                {need.map((x) => (
                  <span key={x.stat} class="need"><Icon name={STAT_ICON[x.stat]} label={STAT_TH[x.stat]} /><span class="num">{x.min}</span></span>
                ))}
              </span>
            </button>
          );
        }
        n += 1;
        const p = c.check ? checkChance(game, l, c.check) : null;
        return (
          <button key={c.id} class="choice" onClick={() => !justRead() && choose(c.id)}>
            <span class="label two">
              <span class="l1"><kbd class="num">{n}</kbd>{render(c.label, l)}</span>
              <ChoiceTags c={c} />
              {c.refuse && <RefuseTag />}
            </span>
            {c.check && p !== null && (
              <span class="check" title={`${STAT_TH[c.check.stat]} DC ${c.check.dc}`}>
                <Icon name={STAT_ICON[c.check.stat]} label={STAT_TH[c.check.stat]} />
                <span class="num dc">{c.check.dc}</span>
                <span class={`pct num ${pctClass(p)}`}>{Math.round(p * 100)}%</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** แถบระหว่างอ่าน: เล่นอัตโนมัติ ความเร็ว ข้ามไปตัวเลือก และอ่านต่อ */
function ReadBar() {
  const on = autoplay.value;
  return (
    <div class="sheet readbar" role="group" aria-label="การอ่าน">
      <button class={`icon-btn ${on ? 'on' : ''}`} onClick={() => (autoplay.value = !on)} aria-pressed={on} aria-label={on ? 'หยุดเล่นอัตโนมัติ' : 'เล่นอัตโนมัติ'}>
        <Icon name={on ? 'pause' : 'play'} />
      </button>
      <button class="speed num" onClick={cycleSpeed} aria-label={`ความเร็ว ${autoSpeed.value} เท่า`}>{autoSpeed.value}x</button>
      <button class="icon-btn" onClick={revealAll} aria-label="ข้ามไปตัวเลือก">
        <Icon name="skip" />
      </button>
      <button class="primary next" onClick={tapNext}>
        <Icon name="next" />อ่านต่อ
      </button>
    </div>
  );
}

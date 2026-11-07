import { useEffect, useRef, useState } from 'preact/hooks';
import { checkChance, choiceLock } from '../engine/engine';
import { CLASSES, STAT_TH, type ClassId } from '../engine/balance';
import { STATS } from '../engine/schema';
import { paragraphs, render } from '../engine/text';
import type { LifeChanges, LogEntry } from '../engine/state';
import { choose, currentEvent, game, life, sheetCollapsed } from '../store';
import { Ending } from './Endings';
import { Icon, STAT_ICON } from './icons';
import { signed } from './Hud';

/** อายุที่เปิดค้างไว้ อายุเก่ากว่านี้พับเป็นก้อนเดียว */
const OPEN_AGES = 2;

function Changes({ c }: { c: LifeChanges }) {
  return (
    <p class="changes">
      {c.classId && (
        <span class="good"><Icon name="role" label="อาชีพ" />{CLASSES[c.classId as ClassId]?.th ?? c.classId}</span>
      )}
      {STATS.filter((s) => c.stats?.[s]).map((s) => (
        <span key={s} class={c.stats![s]! > 0 ? 'good' : 'bad'}>
          <Icon name={STAT_ICON[s]} label={STAT_TH[s]} /><span class="num">{signed(c.stats![s]!)}</span>
        </span>
      ))}
      {c.hp ? <span class={c.hp > 0 ? 'good' : 'bad'}><Icon name="heart" label="พลังชีวิต" /><span class="num">{signed(c.hp)}</span></span> : null}
      {c.gold ? <span class={c.gold > 0 ? 'gold' : 'bad'}><Icon name="coin" label="ทอง" /><span class="num">{signed(c.gold)}</span></span> : null}
      {c.items?.map((id) => (
        <span key={id} class="gold"><Icon name="bag" label="ได้ของ" />{game.items.get(id)?.name ?? id}</span>
      ))}
    </p>
  );
}

function Entry({ e, old }: { e: LogEntry; old: boolean }) {
  const l = life.value;
  const ev = game.events.find((x) => x.id === e.eventId);
  const choice = ev?.choices.find((c) => c.id === e.choiceId);
  return (
    <article class={`entry ${old ? 'old' : ''}`}>
      {ev && paragraphs(render(ev.text, l)).map((p, i) => <p key={i}>{p}</p>)}
      {choice && <p class="picked"><Icon name="flag" />{render(choice.label, l)}</p>}
      {e.roll && (
        <p class={`roll ${e.roll.success ? 'good' : 'bad'}`}>
          <Icon name="d20" label="ทอยเต๋า" />
          <span class="num">{e.roll.d20} {signed(e.roll.mod)} / DC {e.roll.dc}</span>
          {e.roll.success ? 'สำเร็จ' : 'พลาด'}
        </p>
      )}
      {e.text && paragraphs(render(e.text, l)).map((p, i) => <p key={`a${i}`} class="aftermath">{p}</p>)}
      {e.changes && <Changes c={e.changes} />}
    </article>
  );
}

function AgeHead({ age, year }: { age: number; year: number }) {
  return (
    <h2 class="age-head">
      <Icon name="age" label="อายุ" /><b class="num">{age}</b><span class="num">{year}</span>
    </h2>
  );
}

/** บันทึกชีวิตแยกตามอายุ เหตุการณ์ปัจจุบันอยู่ท้ายสุด */
export function StoryLog() {
  const l = life.value;
  const ev = currentEvent.value;
  const [showOld, setShowOld] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ages: number[] = [];
  for (const e of l.log) if (!ages.includes(e.age)) ages.push(e.age);
  if (ev && !ages.includes(l.age)) ages.push(l.age);
  const folded = showOld ? [] : ages.slice(0, Math.max(0, ages.length - OPEN_AGES));
  const shown = ages.filter((a) => !folded.includes(a));
  const year = (age: number) => l.birthYear + age;

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [l.log.length, ev?.id]);

  return (
    <div class="log" aria-live="polite">
      {folded.length > 0 && (
        <button class="fold" onClick={() => setShowOld(true)}>
          <Icon name="chevron" />
          <span class="num">{folded[0]}–{folded[folded.length - 1]}</span>
          · {l.log.filter((e) => folded.includes(e.age)).length} เหตุการณ์
        </button>
      )}
      {shown.map((age) => (
        <section key={age} class="age-group">
          <AgeHead age={age} year={year(age)} />
          {l.log.filter((e) => e.age === age).map((e, i) => (
            <Entry key={`${e.eventId}-${i}`} e={e} old={!!ev || l.log.indexOf(e) < l.log.length - 1} />
          ))}
          {ev && age === l.age && (
            <article class="entry current">
              {paragraphs(render(ev.text, l)).map((p, i) => <p key={i}>{p}</p>)}
            </article>
          )}
        </section>
      ))}
      {!l.alive && <Ending />}
      <div ref={end} />
    </div>
  );
}

const pctClass = (p: number) => (p >= 0.7 ? 'good' : p >= 0.4 ? 'mid' : 'bad');

/** ตัวเลือกที่กดได้ เรียงตามที่แสดง ใช้กับปุ่มลัด 1–9 */
export function playableChoices() {
  const ev = currentEvent.value;
  if (!ev || !life.value.alive) return [];
  return ev.choices.filter((c) => choiceLock(life.value, c) === null);
}

/** แผ่นตัวเลือกด้านล่าง: บอก stat, DC และ % ก่อนกดเสมอ ตัวที่ติดแค่ stat โชว์เป็นล็อกพร้อมเหตุผล */
export function ChoiceSheet() {
  const l = life.value;
  const ev = currentEvent.value;
  if (!ev || !l.alive) return null;
  const rows = ev.choices
    .map((c) => ({ c, lock: choiceLock(l, c) }))
    .filter((r) => r.lock !== 'hidden');
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
      {rows.map(({ c, lock }) => {
        if (lock) {
          const need = lock as { stat: keyof typeof STAT_TH; min: number }[];
          return (
            <button key={c.id} class="choice locked" disabled>
              <span class="label">{render(c.label, l)}</span>
              <span class="check">
                <Icon name="lock" label="ล็อก" />
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
          <button key={c.id} class="choice" onClick={() => choose(c.id)}>
            <span class="label"><kbd class="num">{n}</kbd>{render(c.label, l)}</span>
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

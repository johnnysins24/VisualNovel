import { choiceAvailable } from '../engine/engine';
import { STAT_TH } from '../engine/balance';
import { render } from '../engine/text';
import { paragraphs } from '../engine/text';
import { choose, currentEvent, lastEntry, life, startLife } from '../store';

export function Story() {
  const l = life.value;
  const ev = currentEvent.value;
  const last = lastEntry.value;
  return (
    <section class="story" aria-live="polite">
      {last?.roll && (
        <p class={`roll ${last.roll.success ? 'ok' : 'bad'}`}>
          d20 {last.roll.d20} {last.roll.mod >= 0 ? '+' : ''}{last.roll.mod} เทียบ DC {last.roll.dc} · {last.roll.success ? 'สำเร็จ' : 'ล้มเหลว'}
        </p>
      )}
      {last?.text && paragraphs(render(last.text, l)).map((p, i) => <p key={i} class="text aftermath">{p}</p>)}
      {!l.alive ? (
        <div class="ending">
          <p>ชีวิตของ {l.name} จบลงที่อายุ {l.age}</p>
          <button onClick={() => startLife()}>เริ่มชีวิตใหม่</button>
        </div>
      ) : ev ? (
        <>
          {paragraphs(render(ev.text, l)).map((p, i) => <p key={i} class="text">{p}</p>)}
          <div class="choices">
            {ev.choices.filter((c) => choiceAvailable(l, c)).map((c) => (
              <button key={c.id} onClick={() => choose(c.id)}>
                {render(c.label, l)}
                {c.check && <small> ({STAT_TH[c.check.stat]} DC {c.check.dc})</small>}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

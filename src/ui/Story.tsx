import { choiceAvailable } from '../engine/engine';
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
          {last.text ? ` — ${last.text}` : ''}
        </p>
      )}
      {!l.alive ? (
        <div class="ending">
          <p>ชีวิตของ {l.name} จบลงที่อายุ {l.age}</p>
          <button onClick={() => startLife()}>เริ่มชีวิตใหม่</button>
        </div>
      ) : ev ? (
        <>
          <p class="text">{ev.text}</p>
          <div class="choices">
            {ev.choices.filter((c) => choiceAvailable(l, c)).map((c) => (
              <button key={c.id} onClick={() => choose(c.id)}>
                {c.label}
                {c.check && <small> ({c.check.stat} DC {c.check.dc})</small>}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

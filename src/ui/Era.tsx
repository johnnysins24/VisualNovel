import { useState } from 'preact/hooks';
import { ERAS, STORY_END_YEAR, eraOf } from '../engine/balance';
import { worldYear, type LifeState } from '../engine/state';
import { life } from '../store';
import { Icon } from './icons';

/** เหตุการณ์ของโลกที่ชีวิตนี้ได้อยู่เห็น: ป้ายบนเส้นชีวิตของเหตุการณ์ที่รหัสมี .world_ (แบบเดียวกับจุดสีน้ำเงินในหน้าชีวประวัติ) */
export function worldMarks(l: LifeState): { year: number; text: string }[] {
  return l.log.filter((e) => e.mark && e.eventId.includes('.world_')).map((e) => ({ year: l.birthYear + e.age, text: e.mark! }));
}

/** แบบของแถบยุคที่กำลังให้เลือก อ่านจาก ?era= ในที่อยู่หน้า (ก = bar, ข = list, ค = chip) */
const variant = (): 'bar' | 'list' | 'chip' => {
  const v = new URLSearchParams(globalThis.location?.search ?? '').get('era');
  return v === 'list' || v === 'chip' ? v : 'bar';
};

/**
 * แถบยุคในแท็บโลก: ตอนนี้โลกอยู่ยุคไหน ปีอะไร และชีวิตนี้เห็นเหตุการณ์ของโลกมาแล้วกี่ครั้ง
 * แถบเริ่มที่ปีเกิดและจบที่ปีสุดท้ายของเนื้อเรื่อง ยุคที่ยังมาไม่ถึงไม่บอกชื่อ
 */
export function EraSection() {
  const l = life.value;
  const now = worldYear(l);
  const era = eraOf(now);
  const marks = worldMarks(l);
  const last = marks[marks.length - 1];
  const kind = variant();
  const [open, setOpen] = useState(false);
  if (kind === 'chip') {
    return (
      <section class="sec era-sec">
        <p class="era-chip"><Icon name="year" /><b>{era.th}</b><span class="num">ปี {now}</span>{marks.length > 0 && <span class="muted">เห็นเหตุการณ์ของโลกมาแล้ว {marks.length} ครั้ง</span>}</p>
      </section>
    );
  }
  const from = Math.min(l.birthYear, now), to = STORY_END_YEAR, span = Math.max(1, to - from);
  const at = (y: number) => `${((Math.min(Math.max(y, from), to) - from) / span) * 100}%`;
  const segs = ERAS.filter((e) => e.to >= from).map((e) => ({ ...e, a: Math.max(e.from, from), b: e.to, reached: now >= e.from }));
  const shown = kind === 'list' ? (open ? marks : marks.slice(-3)) : [];
  return (
    <section class="sec era-sec">
      <h3><Icon name="year" />ยุค</h3>
      <div class="eracard">
        <p class="era-head"><b>{era.th}</b><span class="num muted">ปี {now}</span></p>
        <div class="era-line" role="img" aria-label={`${era.th} ปี ${now} เห็นเหตุการณ์ของโลกมาแล้ว ${marks.length} ครั้ง`}>
          <div class="era-bar" style={{ gridTemplateColumns: segs.map((s) => `${s.b - s.a + 1}fr`).join(' ') }}>
            {segs.map((s) => <i key={s.id} class={s.reached ? (s.id === era.id ? 'now' : 'past') : 'ahead'} />)}
            <u style={{ width: at(now) }} />
            {marks.map((m, i) => <b key={i} style={{ left: at(m.year) }} />)}
            <em style={{ left: at(now) }} />
          </div>
          <div class="era-names" style={{ gridTemplateColumns: segs.map((s) => `${s.b - s.a + 1}fr`).join(' ') }}>
            {segs.map((s) => <span key={s.id} class={s.id === era.id ? 'on' : ''}>{s.reached ? s.th : ''}</span>)}
          </div>
        </div>
        {kind === 'bar' && last && <p class="era-last muted"><span class="num">{last.year}</span>{last.text}</p>}
        {kind === 'bar' && !last && <p class="era-last muted">ยังไม่ได้อยู่เห็นเหตุการณ์ใหญ่ของโลก</p>}
        {kind === 'list' && (
          <>
            {marks.length === 0 && <p class="era-last muted">ยังไม่ได้อยู่เห็นเหตุการณ์ใหญ่ของโลก</p>}
            <ul class="era-marks">
              {shown.map((m, i) => <li key={i}><span class="num">{m.year}</span><i /><span>{m.text}</span></li>)}
            </ul>
            {marks.length > 3 && (
              <button type="button" class="era-more" onClick={() => setOpen(!open)} aria-expanded={open}>
                {open ? 'ย่อ' : `ดูทั้งหมด ${marks.length} เหตุการณ์`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

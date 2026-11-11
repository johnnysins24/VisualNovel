import { useEffect, useRef, useState } from 'preact/hooks';
import { CLASSES, GODS, STAT_TH, type ClassId, type GodId } from '../engine/balance';
import { humanAge, worldYear } from '../engine/state';
import { bigRoll, endReasonOf, life, resumeLife, startLife } from '../store';
import { Icon, STAT_ICON } from './icons';
import { PLACE_TH, signed } from './Hud';

/** อายุที่ใช้เป็นสเกลของแถบ "เขียนเสร็จถึงอายุเท่าไร" (มนุษย์) */
const SCALE_AGES = [0, 18, 40, 60, 70];

/** หน้าจบชีวิต (ตายจริง) */
function Biography() {
  const l = life.value;
  const cls = l.classId ? CLASSES[l.classId as ClassId]?.th : null;
  const god = l.god ? GODS[l.god as GodId]?.th : null;
  const place = PLACE_TH[l.homeTag ?? l.locationTag];
  const known = (l.people ?? []).length;
  return (
    <section class="end-card" aria-label="ชีวประวัติ">
      <span class="eyebrow">ชีวประวัติ</span>
      <h2 class="end-title">{l.name}{l.surname ? ` ${l.surname}` : ''}</h2>
      {cls && place && <p class="muted">{cls}จาก{place}</p>}
      <p class="end-facts">
        <span><Icon name="year" label="ปี" /><span class="num">{l.birthYear}–{worldYear(l)}</span></span>
        <span><Icon name="age" label="อายุ" /><span class="num">{l.age}</span></span>
        {cls && <span><Icon name="role" label="อาชีพ" />{cls}</span>}
        {god && <span><Icon name="sun" label="ศรัทธา" />{god}</span>}
        <span><Icon name="people" label="คนที่รู้จัก" /><span class="num">{known}</span></span>
      </p>
      <p>ชีวิตของ {l.name} จบลงที่อายุ <span class="num">{l.age}</span> หลังผ่านมา <span class="num">{l.log.length}</span> เหตุการณ์</p>
      <button class="primary" onClick={() => startLife()}>
        <Icon name="reborn" />เกิดใหม่
      </button>
    </section>
  );
}

/** หน้าเรื่องยังมีต่อ: เนื้อเรื่องที่เขียนไว้หมดก่อนตัวละครตาย เซฟยังเล่นต่อได้ */
function ToBeContinued() {
  const l = life.value;
  const [tried, setTried] = useState(false);
  const max = SCALE_AGES[SCALE_AGES.length - 1]!;
  return (
    <section class="end-card" aria-label="เรื่องยังมีต่อ">
      <span class="eyebrow"><Icon name="quill" />ยังเขียนไม่ถึง</span>
      <h2 class="end-title">เรื่องของ{l.name}ยังไม่จบ</h2>
      <p class="end-facts">
        <span><Icon name="age" label="อายุ" /><span class="num">{l.age}</span></span>
        <span><Icon name="year" label="ปี" /><span class="num">{worldYear(l)}</span></span>
      </p>
      <div class="progress" role="img" aria-label={`เนื้อเรื่องเขียนเสร็จถึงอายุ ${l.age}`}>
        {/* มาตรวัดเป็นอายุเทียบมนุษย์ เอลฟ์กับคนแคระที่อายุจริงมากกว่าจึงอยู่ตำแหน่งเดียวกับมนุษย์ที่อ่านมาถึงหน้าเดียวกัน */}
        <div class="bar"><i style={{ width: `${Math.min(100, (humanAge(l) / max) * 100)}%` }} /></div>
        <div class="ticks">{SCALE_AGES.map((a) => <span key={a} class="num">{a === max ? `${a}+` : a}</span>)}</div>
      </div>
      <p>ชีวิตนี้มาถึงหน้าสุดท้ายที่เขียนเสร็จแล้ว {l.name} ยังไม่ตาย เซฟจะรออยู่ตรงนี้ พอบทต่อไปออก เปิดเกมแล้วเล่นต่อได้ทันที</p>
      {tried && <p class="muted">ยังไม่มีบทใหม่ ลองใหม่หลังเกมอัปเดต</p>}
      <div class="row-buttons">
        <button class="primary" onClick={() => setTried(!resumeLife())}>
          <Icon name="next" />ลองเล่นต่อ
        </button>
        <button onClick={() => startLife()}>
          <Icon name="reborn" />เริ่มชีวิตใหม่
        </button>
      </div>
    </section>
  );
}

export function Ending() {
  const r = endReasonOf(life.value);
  if (!r) return null;
  return r === 'death' ? <Biography /> : <ToBeContinued />;
}

/** กล่องทอยเต๋ากลางจอ ใช้กับเช็คสำคัญ (major หรือมี foe) เช็คทั่วไปเป็นบรรทัดเล็กในบันทึก */
export function RollDialog() {
  const r = bigRoll.value;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!r) return;
    btn.current?.focus();
    if (navigator.vibrate) navigator.vibrate(30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bigRoll.value = null;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [r]);
  if (!r?.entry.roll) return null;
  const { d20, mod, dc, success } = r.entry.roll;
  return (
    <div class="overlay" onClick={() => (bigRoll.value = null)}>
      <div class="roll-dialog" role="dialog" aria-modal="true" aria-label="ผลทอยเต๋า" onClick={(e) => e.stopPropagation()}>
        <span class="check"><Icon name={STAT_ICON[r.stat]} label={STAT_TH[r.stat]} /><span class="num">DC {dc}</span></span>
        <svg class="die" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 1.5l9.2 5.3v10.4L12 22.5l-9.2-5.3V6.8z" />
          <text x="12" y="14.6">{d20}</text>
        </svg>
        <p class="num roll-sum">{d20} {signed(mod)} = {d20 + mod}</p>
        <p class={`roll-result ${success ? 'good' : 'bad'}`}>{success ? 'สำเร็จ' : 'พลาด'}</p>
        <button ref={btn} class="primary" onClick={() => (bigRoll.value = null)} aria-label="อ่านต่อ">
          <Icon name="next" />
        </button>
      </div>
    </div>
  );
}

import { effect, signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CLASSES, STAT_TH, type ClassId } from '../engine/balance';
import { effectiveStats } from '../engine/items';
import { personYears } from '../engine/people';
import { STATS } from '../engine/schema';
import { humanAge, lastRealAge, worldYear, type LifeState } from '../engine/state';
import { personLook, playerLook } from '../sprites/looks';
import { faceUrl, portraitUrl } from '../sprites/render';
import { bigRoll, endReasonOf, game, life, resumeLife, startLife } from '../store';
import { Icon, STAT_ICON } from './icons';
import { PLACE_TH, signed } from './Hud';
import { BOND_TH, kinLabel } from './People';
import { TraitsOfLife } from './Traits';
import { ItemIcon } from './Gear';

/** อายุที่ใช้เป็นสเกลของแถบ "เขียนเสร็จถึงอายุเท่าไร" (มนุษย์) */
const SCALE_AGES = [0, 18, 40, 60, 70];

/** หน้าชีวประวัติเปิดอยู่ไหม (เปิดจากแผ่นปิดท้ายชีวิต ปิดเองเมื่อเริ่มชีวิตใหม่) */
export const bioOpen = signal(false);
effect(() => {
  if (life.value.alive) bioOpen.value = false;
});

/** วัยของชีวิตบนเส้นชีวิต เป็นอายุเทียบมนุษย์: เด็ก วัยรุ่น ผู้ใหญ่ วัยกลาง วัยชรา บั้นปลาย */
const STAGE_FROM = [0, 12, 18, 41, 61, 81];
/** อายุจริงปีแรกที่นับเป็นอายุเทียบมนุษย์ h ของเผ่านั้น */
const realAgeAt = (h: number, race: string | null) => (h <= 0 ? 0 : lastRealAge(h - 1, race) + 1);
const KIN_ORDER = ['spouse', 'child', 'grandchild', 'sibling_older', 'sibling_younger', 'mother', 'father'];

/** เส้นชีวิต: แถบแบ่งตามวัย จุดคือเหตุการณ์ที่ติดป้ายไว้ จุดสีน้ำเงินคือเหตุการณ์ของโลกที่ชีวิตนี้ได้อยู่เห็น */
function LifeLine({ l }: { l: LifeState }) {
  const end = Math.max(1, l.age);
  const cuts = STAGE_FROM.map((h) => realAgeAt(h, l.raceApplied)).filter((a) => a < end);
  const segs = cuts.map((a, i) => (cuts[i + 1] ?? end) - a);
  // ป้ายอายุที่ชิดปลายเส้นเกินไปซ้อนกับอายุตอนตาย ตัดออก
  const ticks = [...cuts.filter((a) => a === 0 || (end - a) / end > 0.07), end];
  const marks = l.log.filter((e) => e.mark).map((e) => ({ age: e.age, text: e.mark!, world: e.eventId.includes('.world_') }));
  return (
    <section class="sec" aria-label="เส้นชีวิต">
      <h3><Icon name="age" />เส้นชีวิต</h3>
      <div class="lifeline" role="img" aria-label={`เส้นชีวิต ${end} ปี ${marks.length} เหตุการณ์สำคัญ`}>
        <div class="ll-bar" style={{ gridTemplateColumns: segs.map((n) => `${n}fr`).join(' ') }}>
          {segs.map((_, i) => <i key={i} />)}
          {marks.map((m, i) => <b key={i} class={m.world ? 'world' : ''} style={{ left: `${(Math.min(m.age, end) / end) * 100}%` }} />)}
        </div>
        <div class="ll-ticks">
          {ticks.map((a) => <span key={a} class="num" style={{ left: `${(a / end) * 100}%` }}>{a}</span>)}
        </div>
      </div>
      {marks.length > 0 && (
        <ul class="marks">
          {marks.map((m, i) => (
            <li key={i} class={m.world ? 'world' : ''}><span class="num">{m.age}</span><i /><span>{m.text}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** หน้าชีวประวัติ: ภาพสุดท้าย เส้นชีวิต ตัวเลขทั้งชีวิต สิ่งติดตัว คนข้างหลัง และของที่ทิ้งไว้ */
export function BiographyPage() {
  const l = life.value;
  const cls = l.classId ? CLASSES[l.classId as ClassId]?.th : null;
  const place = PLACE_TH[l.homeTag ?? l.locationTag];
  const portrait = portraitUrl(playerLook(l, game.items, 'neutral'));
  const eff = effectiveStats(l, game.items);
  const rolls = l.log.filter((e) => e.roll);
  const left = (l.people ?? [])
    .filter((p) => p.alive && (p.kin || (p.bond && p.bond !== 'rival' && p.closeness > 0)))
    .sort((a, b) => {
      const ka = a.kin ? KIN_ORDER.indexOf(a.kin) : -1;
      const kb = b.kin ? KIN_ORDER.indexOf(b.kin) : -1;
      const ra = ka < 0 ? KIN_ORDER.length : ka;
      const rb = kb < 0 ? KIN_ORDER.length : kb;
      return ra - rb || b.closeness - a.closeness || a.metAge - b.metAge;
    })
    .slice(0, 8);
  const things = l.inventory.map((id) => game.items.get(id)).filter((it): it is NonNullable<typeof it> => !!it);
  const from = cls && place ? `${cls}จาก${place}` : place ? `คนจาก${place}` : cls;
  return (
    <article class="bio" aria-label="ชีวประวัติ">
      <header class="bio-hero">
        <span class="eyebrow">ชีวประวัติ</span>
        <div class="bio-portrait">
          {portrait.url && <img src={portrait.url} width={portrait.w * 2} height={portrait.h * 2} alt={`ภาพของ${l.name}`} />}
        </div>
        <h2>{l.name}{l.surname ? ` ${l.surname}` : ''}</h2>
        {from && <p class="muted">{from}</p>}
        <p class="bio-years">
          <Icon name="year" label="ปี" /><span class="num">{l.birthYear}–{worldYear(l)}</span>
          <Icon name="age" label="อายุ" /><span class="num">{l.age}</span>
        </p>
        {l.epitaph && <p class="bio-last">{l.epitaph}</p>}
      </header>

      <LifeLine l={l} />

      <section class="sec" aria-label="ทั้งชีวิต">
        <h3><Icon name="book" />ทั้งชีวิต</h3>
        <ul class="bio-facts">
          <li><Icon name="book" /><b class="num">{l.log.length}</b>เหตุการณ์</li>
          <li><Icon name="d20" /><b class="num">{rolls.filter((e) => e.roll!.success).length}/{rolls.length}</b>ทอยผ่าน</li>
          <li><Icon name="people" /><b class="num">{(l.people ?? []).length}</b>คนที่รู้จัก</li>
          <li><Icon name="coin" /><b class="num">{l.gold}</b>ทองที่เหลือ</li>
        </ul>
        <ul class="bio-stats">
          {STATS.map((s) => <li key={s}><Icon name={STAT_ICON[s]} label={STAT_TH[s]} /><b class="num">{eff[s]}</b></li>)}
        </ul>
      </section>

      <TraitsOfLife l={l} />

      {left.length > 0 && (
        <section class="sec" aria-label="คนข้างหลัง">
          <h3><Icon name="people" />คนข้างหลัง</h3>
          <ul class="bio-people">
            {left.map((p) => (
              <li key={p.id}>
                <img class="avatar face" src={faceUrl(personLook(p, l))} alt="" />
                <span>{p.name}<small>{kinLabel(p) || (p.bond ? BOND_TH[p.bond] : '')} · <span class="num">{personYears(p, l)}</span></small></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {things.length > 0 && (
        <section class="sec" aria-label="ของที่ทิ้งไว้">
          <h3><Icon name="bag" />ของที่ทิ้งไว้</h3>
          <ul class="heir">
            {things.map((it) => (
              <li key={it.id}>
                <span class={`slot on r-${it.rarity}`}><ItemIcon item={it} /></span>
                {it.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div class="row-buttons">
        <button class="primary" onClick={() => startLife()}>
          <Icon name="reborn" />เกิดใหม่
        </button>
        <button onClick={() => (bioOpen.value = false)}>
          <Icon name="book" />อ่านบันทึกชีวิต
        </button>
      </div>
    </article>
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

/** ท้ายบันทึกของชีวิตที่หยุดเพราะเนื้อเรื่องหมด (ชีวิตที่ตายจริงปิดท้ายด้วยแผ่นปิดท้ายชีวิตและหน้าชีวประวัติ) */
export function Ending() {
  return endReasonOf(life.value) === 'content_end' ? <ToBeContinued /> : null;
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

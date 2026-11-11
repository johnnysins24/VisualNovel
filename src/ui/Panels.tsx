import { useState } from 'preact/hooks';
import { SLOTS, STATS, type Slot } from '../engine/schema';
import { effectiveStats } from '../engine/items';
import { modifier } from '../engine/state';
import { GODS, REPUTATION_CAP, STAT_TH, type FactionId, type GodId } from '../engine/balance';
import { alignmentCell } from '../engine/rules';
import { worldYear } from '../engine/state';
import { equip, exportLife, game, importLife, life, meta, startLife, tab } from '../store';
import { Icon, STAT_ICON } from './icons';
import { SpriteView } from './SpriteView';
import { piecesOfItem } from '../sprites/looks';
import { itemIconUrl } from '../sprites/render';
import { WorldMap } from './WorldMap';
import { signed } from './Hud';
import { setTheme, theme, type ThemeChoice } from './theme';
import { SPEEDS, autoSpeed, revealMode, setRevealMode, setSpeed } from './reading';
import { CREDITS } from './credits';
import { TraitsSection } from './Traits';

const FACTION_TH: Record<FactionId, string> = {
  crown: 'ราชสำนักอาร์เวล',
  lamp_church: 'ศาสนจักรตะเกียง',
  belek_bank: 'ธนาคารเบเลค',
  royal_institute: 'สถาบันเวทหลวง',
  distillers: 'สมาคมโรงกลั่น',
  dwarf_council: 'สภาตระกูลคนแคระ',
  star_hall: 'หอนับดาว',
  wardens: 'ภาคีผู้เฝ้าผนึก',
  dock_rats: 'หนูท่า',
  ash_cult: 'ลัทธิเถ้า',
  star_listeners: 'ผู้ฟังดาว',
};

export function StatGrid() {
  const eff = effectiveStats(life.value, game.items);
  return (
    <ul class="stat-grid">
      {STATS.map((s) => (
        <li key={s}>
          <Icon name={STAT_ICON[s]} />
          <span>{STAT_TH[s]}</span>
          <b class="num">{eff[s]}</b>
          <small class="num">{signed(modifier(eff[s]))}</small>
        </li>
      ))}
    </ul>
  );
}

export function Equipment() {
  const l = life.value;
  return (
    <section class="sec" aria-label="กระเป๋า">
      <h3><Icon name="bag" />กระเป๋า <span class="num">{l.inventory.length}</span></h3>
      {l.inventory.length === 0 && <p class="muted">ยังไม่มีของ</p>}
      <ul class="items">
        {l.inventory.map((id) => {
          const it = game.items.get(id);
          if (!it) return null;
          const on = l.equipped[it.slot] === id;
          return (
            <li key={id}>
              <button class={`item ${on ? 'on' : ''}`} onClick={() => equip(id)} aria-pressed={on} title={it.passive?.description}>
                {it.name}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SLOT_TH: Record<Slot, string> = {
  head: 'หัว', body: 'ตัว', hands: 'มือ', legs: 'ขา', feet: 'เท้า',
  weapon: 'อาวุธ', offhand: 'มือรอง', cloak: 'ผ้าคลุม', accessory: 'เครื่องประดับ',
};
const LEFT: Slot[] = ['head', 'body', 'hands', 'legs', 'feet'];
const RIGHT: Slot[] = ['weapon', 'offhand', 'cloak', 'accessory'];

function SlotBox({ slot }: { slot: Slot }) {
  const l = life.value;
  const id = l.equipped[slot];
  const it = id ? game.items.get(id) : undefined;
  const label = `${SLOT_TH[slot]}: ${it?.name ?? 'ว่าง'}`;
  // ของที่มีภาพในชุด sprite ขึ้นรูปของชิ้นนั้นแทนไอคอนช่อง (Phupha เลือก 10 พ.ย. 2026) แตะ/ชี้ดูชื่อ
  const icon = it ? itemIconUrl(piecesOfItem(it.id, game.items)) : null;
  const [shown, setShown] = useState(false);
  return (
    <div class={`slot ${it ? 'on' : 'empty'}`} title={it?.passive?.description ? `${label} · ${it.passive.description}` : label} aria-label={label} role="img"
      onClick={() => it && setShown(!shown)} onMouseLeave={() => setShown(false)}>
      {icon ? <img class="slot-art" src={icon} alt="" /> : <Icon name={slot} />}
      {shown && it && <span class="slot-name">{it.name}</span>}
    </div>
  );
}

/** ช่องสวมใส่ 9 ช่อง (ซ้าย 5 ขวา 4 รอบตัวละคร หรือเรียงแถวบนเดสก์ท็อป) */
export function SlotGrid({ doll }: { doll?: boolean }) {
  if (!doll) {
    return <div class="slot-row">{SLOTS.map((s) => <SlotBox key={s} slot={s} />)}</div>;
  }
  return (
    <div class="doll">
      <div class="slots">{LEFT.map((s) => <SlotBox key={s} slot={s} />)}</div>
      <SpriteView />
      <div class="slots right">{RIGHT.map((s) => <SlotBox key={s} slot={s} />)}</div>
    </div>
  );
}

export function CharacterPanel() {
  const l = life.value;
  return (
    <div class="panel-page">
      <SlotGrid doll />
      <TraitsSection />
      <section class="sec">
        <h3>ค่าสถานะ</h3>
        <StatGrid />
      </section>
      {l.god && (
        <section class="sec">
          <h3>ศรัทธา</h3>
          <p>{GODS[l.god as GodId]?.th ?? l.god}</p>
        </section>
      )}
      <Equipment />
    </div>
  );
}

export function WorldPanel() {
  const l = life.value;
  const reps = Object.entries(l.reputation).filter(([, v]) => v) as [FactionId, number][];
  return (
    <div class="panel-page">
      <section class="sec">
        <h3><Icon name="world" />แผนที่</h3>
        <WorldMap here={l.locationTag} />
      </section>
      <section class="sec">
        <h3><Icon name="flag" />ชื่อเสียง</h3>
        {reps.length === 0 && <p class="muted">ยังไม่มีใครรู้จักชื่อนี้</p>}
        <ul class="reps">
          {reps.map(([f, v]) => (
            <li key={f}>
              <span>{FACTION_TH[f] ?? f}</span>
              <span class="meter" aria-label={`${v}`}>
                <i class={v < 0 ? 'neg' : ''} style={{ left: `${50 + Math.min(0, v) * (50 / REPUTATION_CAP)}%`, width: `${Math.abs(v) * (50 / REPUTATION_CAP)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** แผนที่โลกอยู่ใน WorldMap.tsx (ภาพพิกเซลจาก public/map) ส่งต่อชื่อเดิมให้ App ใช้ได้เหมือนเดิม */
export { WorldMap };

const THEMES: { id: ThemeChoice; th: string }[] = [
  { id: 'auto', th: 'ตามเครื่อง' },
  { id: 'light', th: 'สว่าง' },
  { id: 'dark', th: 'มืด' },
];

export function MorePanel() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div class="panel-page">
      <section class="sec">
        <h3>ตั้งค่า</h3>
        <div class="setting">
          <span><Icon name="sun" />ธีม</span>
          <span class="pills" role="radiogroup" aria-label="ธีม">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={theme.value === t.id} onClick={() => setTheme(t.id)}>{t.th}</button>
            ))}
          </span>
        </div>
        <div class="setting">
          <span><Icon name="book" />การอ่าน</span>
          <span class="pills" role="radiogroup" aria-label="การอ่าน">
            <button role="radio" aria-checked={revealMode.value === 'step'} onClick={() => setRevealMode('step')}>ทีละย่อหน้า</button>
            <button role="radio" aria-checked={revealMode.value === 'all'} onClick={() => setRevealMode('all')}>ทั้งหมด</button>
          </span>
        </div>
        <div class="setting">
          <span><Icon name="play" />ความเร็วอัตโนมัติ</span>
          <span class="pills" role="radiogroup" aria-label="ความเร็วอัตโนมัติ">
            {SPEEDS.map((n) => (
              <button key={n} role="radio" class="num" aria-checked={autoSpeed.value === n} onClick={() => setSpeed(n)}>{n}x</button>
            ))}
          </span>
        </div>
      </section>
      <section class="sec">
        <h3><Icon name="save" />เซฟ</h3>
        <div class="row-buttons">
          <button onClick={() => { setCode(exportLife()); setMsg('คัดลอกรหัสด้านล่างเก็บไว้'); }}>ส่งออกรหัสเซฟ</button>
          <button
            onClick={() => {
              try {
                importLife(code.trim());
                setMsg('โหลดเซฟแล้ว');
                tab.value = 'story';
              } catch {
                setMsg('รหัสไม่ถูกต้อง ลองวางใหม่ทั้งก้อน');
              }
            }}
            disabled={!code.trim()}
          >
            นำเข้ารหัสเซฟ
          </button>
        </div>
        <textarea id="save-code" rows={3} value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} placeholder="วางรหัสเซฟที่นี่" aria-label="รหัสเซฟ" />
        {msg && <p class="muted">{msg}</p>}
      </section>
      <details class="sec credits">
        <summary><h3><Icon name="book" />เครดิต</h3></summary>
        <ul>
          {CREDITS.map((c) => (
            <li key={c.what}>
              <a href={c.url} target="_blank" rel="noopener noreferrer">{c.what}</a>
              <span class="muted"> · {c.by} · <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">{c.licence}</a></span>
            </li>
          ))}
        </ul>
      </details>
      <section class="sec">
        <button class="primary" onClick={() => { startLife(); tab.value = 'story'; }}>
          <Icon name="reborn" />เริ่มชีวิตใหม่
        </button>
      </section>
    </div>
  );
}

/** แผงสำหรับทดสอบ เปิดด้วย ?debug ผู้เล่นปกติไม่เห็นค่าลับเหล่านี้ */
export function DebugPanel() {
  const l = life.value;
  return (
    <section class="debug" aria-label="debug">
      <pre>{JSON.stringify(
        { year: worldYear(l), world: l.world, align: l.alignment, cell: alignmentCell(l), rep: l.reputation, meta: meta.value, flags: l.flags, traits: l.traits, parents: l.parents },
        null,
        1,
      )}</pre>
    </section>
  );
}

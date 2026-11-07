import { useState } from 'preact/hooks';
import { STATS } from '../engine/schema';
import { effectiveStats } from '../engine/items';
import { modifier } from '../engine/state';
import { GODS, REPUTATION_CAP, STAT_TH, type FactionId, type GodId } from '../engine/balance';
import { alignmentCell } from '../engine/rules';
import { worldYear } from '../engine/state';
import { equip, exportLife, game, importLife, life, meta, startLife, tab } from '../store';
import { Icon, STAT_ICON } from './icons';
import { PLACE_TH, signed } from './Hud';
import { setTheme, theme, type ThemeChoice } from './theme';

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

export function CharacterPanel() {
  const l = life.value;
  return (
    <div class="panel-page">
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

export function PeoplePanel() {
  const l = life.value;
  return (
    <div class="panel-page">
      <section class="sec">
        <h3><Icon name="people" />ครอบครัว</h3>
        {l.parents ? (
          <ul class="people">
            <li><span class="avatar">{l.parents.father[0]}</span>{l.parents.father}<small>พ่อ</small></li>
            <li><span class="avatar">{l.parents.mother[0]}</span>{l.parents.mother}<small>แม่</small></li>
          </ul>
        ) : (
          <p class="muted">ยังไม่รู้จักใคร</p>
        )}
      </section>
    </div>
  );
}

export function WorldPanel() {
  const l = life.value;
  const reps = Object.entries(l.reputation).filter(([, v]) => v) as [FactionId, number][];
  return (
    <div class="panel-page">
      <section class="sec">
        <h3><Icon name="place" />ที่อยู่</h3>
        <p>{PLACE_TH[l.locationTag] ?? 'ยังไม่รู้'} · ปี <span class="num">{worldYear(l)}</span></p>
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

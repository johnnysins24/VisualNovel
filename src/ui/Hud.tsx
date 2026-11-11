import { useEffect, useRef, useState } from 'preact/hooks';
import { STATS, type Stat } from '../engine/schema';
import { effectiveStats, maxHp } from '../engine/items';
import { modifier, worldYear } from '../engine/state';
import { CLASSES, STAT_TH, type ClassId } from '../engine/balance';
import { currentEvent, endReasonOf, game, life, tab, type Tab } from '../store';
import { Icon, STAT_ICON, type IconName } from './icons';
import { SpriteView } from './SpriteView';
import { resolvedTheme, theme, toggleTheme } from './theme';
import { sceneImage } from './scenes';
import { namedInText, namedLook, namedName } from '../sprites/looks';

/** ชื่อไทยของ location_tag (ตามคัมภีร์โลก) */
export const PLACE_TH: Record<string, string> = {
  arvel_village: 'หมู่บ้านในอาร์เวล',
  ventras: 'เวนทราส',
  hordun: 'ฮอร์ดุน',
  ileth: 'ป่าไอเลธ',
  ashland: 'แดนเถ้า',
};

export const NAV: { id: Tab; th: string; icon: IconName }[] = [
  { id: 'story', th: 'เรื่องราว', icon: 'story' },
  { id: 'character', th: 'ตัวละคร', icon: 'character' },
  { id: 'people', th: 'ผู้คน', icon: 'people' },
  { id: 'world', th: 'โลก', icon: 'world' },
  { id: 'more', th: 'เพิ่มเติม', icon: 'more' },
];

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function ThemeButton() {
  theme.value; // subscribe
  const dark = resolvedTheme() === 'dark';
  return (
    <button class="icon-btn" onClick={toggleTheme} aria-label={dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export function Vitals() {
  const l = life.value;
  return (
    <>
      <span class="vital hp" title="พลังชีวิต">
        <Icon name="heart" label="พลังชีวิต" />
        <b class="num">{l.hp}/{maxHp(l, game.items)}</b>
      </span>
      <span class="vital gold" title="ทอง">
        <Icon name="coin" label="ทอง" />
        <b class="num">{l.gold}</b>
      </span>
    </>
  );
}

export function TopBar() {
  const l = life.value;
  const cls = l.classId ? CLASSES[l.classId as ClassId]?.th : null;
  const place = PLACE_TH[l.locationTag];
  return (
    <header class="top">
      <div class="who">
        <h1 class="name">{l.name}{l.surname ? ` ${l.surname}` : ''}</h1>
        <p class="meta">
          <span title="อายุ"><Icon name="age" label="อายุ" /><b class="num">{l.age}</b></span>
          <span title="ปี"><Icon name="year" label="ปี" /><b class="num">{worldYear(l)}</b></span>
          {place && <span class="shrink" title={place}><Icon name="place" label="ถิ่น" /><span class="t">{place}</span></span>}
          {cls && <span><Icon name="role" label="อาชีพ" />{cls}</span>}
        </p>
      </div>
      <nav class="top-tabs" aria-label="เมนูหลัก">
        {NAV.map((n) => (
          <button key={n.id} aria-current={tab.value === n.id} onClick={() => (tab.value = n.id)}>
            <Icon name={n.icon} />{n.th}
          </button>
        ))}
      </nav>
      <Vitals />
      <ThemeButton />
    </header>
  );
}

/** NPC ที่มีชื่อซึ่งเหตุการณ์ตอนนี้เอ่ยถึง ยืนข้างตัวผู้เล่นในฉาก */
function sceneNpc(text: string) {
  const id = namedInText(text);
  const look = id ? namedLook(id) : null;
  return id && look ? { id, look, name: namedName(id) } : null;
}

export function Scene() {
  const place = PLACE_TH[life.value.locationTag];
  const img = sceneImage.value;
  const npc = sceneNpc(currentEvent.value?.text ?? '');
  // ชีวิตจบแล้ว: ห้องยังอยู่ แต่ไม่มีใครยืนอยู่ในนั้น
  const ended = endReasonOf(life.value) === 'death';
  return (
    <div class={`scene ${img ? `has-img ${img.time}` : ''} ${ended ? 'ended' : ''}`} style={img ? { backgroundImage: `url(${img.url})`, '--stand': img.stand } : undefined}>
      {!img && <div class="hill" />}
      {!img && <div class="hill back" />}
      <div class="actors">
        <SpriteView />
        {npc && <SpriteView look={npc.look} label={npc.name} class="npc" />}
      </div>
      {place && <span class="scene-place"><Icon name="place" />{place}</span>}
    </div>
  );
}

/** แถว stat แบบสัญลักษณ์ ค่าที่เพิ่งเปลี่ยนจะขึ้นสีและเด้งเบาๆ 2.5 วินาที */
export function StatRow() {
  const eff = effectiveStats(life.value, game.items);
  const prev = useRef(eff);
  const [moved, setMoved] = useState<Partial<Record<Stat, 'up' | 'down'>>>({});
  const key = STATS.map((s) => eff[s]).join(',');
  useEffect(() => {
    const m: Partial<Record<Stat, 'up' | 'down'>> = {};
    for (const s of STATS) if (eff[s] !== prev.current[s]) m[s] = eff[s] > prev.current[s] ? 'up' : 'down';
    prev.current = eff;
    if (!Object.keys(m).length) return;
    setMoved(m);
    const t = setTimeout(() => setMoved({}), 2500);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <ul class="stats" aria-label="ค่าสถานะ">
      {STATS.map((s) => (
        <li key={s} class={moved[s] ?? ''} title={`${STAT_TH[s]} ${signed(modifier(eff[s]))}`}>
          <Icon name={STAT_ICON[s]} label={STAT_TH[s]} />
          <b class="num">{eff[s]}</b>
        </li>
      ))}
    </ul>
  );
}

export function BottomNav() {
  return (
    <nav class="bottom-nav" aria-label="เมนูหลัก">
      {NAV.map((n) => (
        <button key={n.id} aria-current={tab.value === n.id} aria-label={n.th} onClick={() => (tab.value = n.id)}>
          <Icon name={n.icon} />
          <span>{n.th}</span>
        </button>
      ))}
    </nav>
  );
}

export { ThemeButton, signed };

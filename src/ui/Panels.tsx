import { STATS } from '../engine/schema';
import { effectiveStats, maxHp } from '../engine/items';
import { modifier } from '../engine/state';
import { CLASSES, GODS, STAT_TH, type ClassId, type GodId } from '../engine/balance';
import { equip, game, life, meta } from '../store';
import { alignmentCell } from '../engine/rules';
import { worldYear } from '../engine/state';

export function StatsPanel() {
  const l = life.value;
  const eff = effectiveStats(l, game.items);
  return (
    <section class="panel stats" aria-label="ค่าสถานะ">
      <h2>{l.name} · อายุ {l.age}</h2>
      {(l.classId || l.god) && (
        <p class="muted">
          {l.classId && CLASSES[l.classId as ClassId]?.th}
          {l.classId && l.god && ' · '}
          {l.god && `ผู้นับถือ${GODS[l.god as GodId]?.th ?? ''}`}
        </p>
      )}
      <p class="hp">HP {l.hp}/{maxHp(l, game.items)} · ทอง {l.gold}</p>
      <ul>
        {STATS.map((s) => (
          <li key={s}>
            <b>{STAT_TH[s]}</b> {eff[s]} <small>({modifier(eff[s]) >= 0 ? '+' : ''}{modifier(eff[s])})</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EquipmentPanel() {
  const l = life.value;
  return (
    <section class="panel equipment" aria-label="อุปกรณ์">
      <h2>กระเป๋า</h2>
      {l.inventory.length === 0 && <p class="muted">ยังไม่มีของ</p>}
      <ul>
        {l.inventory.map((id) => {
          const it = game.items.get(id);
          if (!it) return null;
          const on = l.equipped[it.slot] === id;
          return (
            <li key={id}>
              <button class={on ? 'on' : ''} onClick={() => equip(id)} aria-pressed={on}>
                {it.name}
              </button>
              {it.passive && <small class="muted"> {it.passive.description}</small>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** แผงสำหรับทดสอบ เปิดด้วย ?debug ผู้เล่นปกติไม่เห็นค่าลับเหล่านี้ */
export function DebugPanel() {
  const l = life.value;
  return (
    <section class="panel debug" aria-label="debug">
      <h2>debug</h2>
      <pre>{JSON.stringify(
        { year: worldYear(l), world: l.world, align: l.alignment, cell: alignmentCell(l), rep: l.reputation, meta: meta.value, flags: l.flags, traits: l.traits, parents: l.parents },
        null,
        1,
      )}</pre>
    </section>
  );
}

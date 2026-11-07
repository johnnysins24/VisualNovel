import { STATS } from '../engine/schema';
import { effectiveStats, maxHp } from '../engine/items';
import { modifier } from '../engine/state';
import { equip, game, life } from '../store';

export function StatsPanel() {
  const l = life.value;
  const eff = effectiveStats(l, game.items);
  return (
    <section class="panel stats" aria-label="ค่าสถานะ">
      <h2>{l.name} · อายุ {l.age}</h2>
      <p class="hp">HP {l.hp}/{maxHp(l, game.items)} · ทอง {l.gold}</p>
      <ul>
        {STATS.map((s) => (
          <li key={s}>
            <b>{s}</b> {eff[s]} <small>({modifier(eff[s]) >= 0 ? '+' : ''}{modifier(eff[s])})</small>
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

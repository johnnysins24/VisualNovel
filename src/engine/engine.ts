import type { Choice, Content, Effects, GameEvent } from './schema';
import { STATS } from './schema';
import { Rng } from './rng';
import type { LifeState, LogEntry } from './state';
import { modifier } from './state';
import type { ItemIndex } from './items';
import { activePassives, effectiveStats, maxHp } from './items';

export interface Game {
  events: GameEvent[];
  items: ItemIndex;
}

export function makeGame(content: Content): Game {
  return { events: content.events, items: new Map(content.items.map((i) => [i.id, i])) };
}

export function eligible(life: LifeState, ev: GameEvent): boolean {
  const w = ev.when;
  if (ev.once && life.seen.includes(ev.id)) return false;
  if (w.age && (life.age < w.age[0] || life.age > w.age[1])) return false;
  if (w.location_tag && w.location_tag !== life.locationTag) return false;
  if (w.flags?.some((f) => !life.flags.includes(f))) return false;
  if (w.not_flags?.some((f) => life.flags.includes(f))) return false;
  if (w.trait && !life.traits.includes(w.trait)) return false;
  return true;
}

/** Weighted pick of the next event. Returns the new rng state alongside. */
export function pickEvent(game: Game, life: LifeState): { event: GameEvent | null; life: LifeState } {
  const pool = game.events.filter((e) => eligible(life, e));
  if (pool.length === 0) return { event: null, life };
  const rng = Rng.fromState(life.rngState);
  const total = pool.reduce((n, e) => n + e.weight, 0);
  let r = rng.next() * total;
  let chosen = pool[pool.length - 1]!;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) {
      chosen = e;
      break;
    }
  }
  return { event: chosen, life: { ...life, rngState: rng.state, currentEventId: chosen.id } };
}

export function choiceAvailable(life: LifeState, choice: Choice): boolean {
  const r = choice.requires;
  if (!r) return true;
  if (r.trait && !life.traits.includes(r.trait)) return false;
  if (r.flag && !life.flags.includes(r.flag)) return false;
  if (r.item && !life.inventory.includes(r.item)) return false;
  for (const [s, min] of Object.entries(r.min_stat ?? {})) {
    if (life.stats[s as keyof typeof life.stats] < (min ?? 0)) return false;
  }
  return true;
}

export function applyEffects(game: Game, life: LifeState, fx: Effects | undefined): LifeState {
  if (!fx) return life;
  const next: LifeState = {
    ...life,
    stats: { ...life.stats },
    flags: [...life.flags],
    traits: [...life.traits],
    inventory: [...life.inventory],
  };
  for (const s of STATS) next.stats[s] += fx.stats?.[s] ?? 0;
  next.gold += fx.gold ?? 0;
  for (const f of fx.flags ?? []) if (!next.flags.includes(f)) next.flags.push(f);
  next.flags = next.flags.filter((f) => !fx.clear_flags?.includes(f));
  for (const t of fx.traits ?? []) if (!next.traits.includes(t)) next.traits.push(t);
  for (const i of fx.items ?? []) if (!next.inventory.includes(i)) next.inventory.push(i);
  if (fx.location_tag) next.locationTag = fx.location_tag;
  const cap = maxHp(next, game.items);
  next.hp = Math.min(cap, next.hp + (fx.hp ?? 0));
  if (fx.die || next.hp <= 0) {
    next.hp = Math.max(0, next.hp);
    next.alive = false;
  }
  return next;
}

export interface ChoiceResult {
  life: LifeState;
  entry: LogEntry;
}

/** Resolve a choice: optional d20 check, apply effects, mark event seen, advance age. */
export function resolveChoice(game: Game, life: LifeState, eventId: string, choiceId: string): ChoiceResult {
  const ev = game.events.find((e) => e.id === eventId);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !choice) throw new Error(`ไม่พบตัวเลือก ${eventId}/${choiceId}`);
  if (!choiceAvailable(life, choice)) throw new Error(`ตัวเลือก ${choiceId} ยังใช้ไม่ได้`);

  const rng = Rng.fromState(life.rngState);
  let next = applyEffects(game, life, choice.effects);
  const entry: LogEntry = { age: life.age, eventId, choiceId };

  if (choice.check) {
    const stats = effectiveStats(life, game.items);
    const passives = activePassives(life, game.items);
    let mod = modifier(stats[choice.check.stat]);
    for (const p of passives) if (p.kind === 'check_bonus' && p.stat === choice.check.stat) mod += p.amount;
    let d20 = rng.d20();
    if (d20 + mod < choice.check.dc && passives.some((p) => p.kind === 'reroll_failed_check')) {
      d20 = Math.max(d20, rng.d20());
    }
    // natural 20 always succeeds, natural 1 always fails (SRD convention)
    const success = d20 === 20 || (d20 !== 1 && d20 + mod >= choice.check.dc);
    entry.roll = { d20, mod, dc: choice.check.dc, success };
    const outcome = success ? choice.success : choice.failure;
    next = applyEffects(game, next, outcome?.effects);
    entry.text = outcome?.text;
  }

  next = {
    ...next,
    rngState: rng.state,
    seen: next.seen.includes(ev.id) ? next.seen : [...next.seen, ev.id],
    age: next.age + 1,
    currentEventId: null,
    log: [...next.log, entry],
  };
  return { life: next, entry };
}

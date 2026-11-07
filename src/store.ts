import { computed, signal } from '@preact/signals';
import content from './generated/content.json';
import { ContentSchema } from './engine/schema';
import { makeGame, pickEvent, resolveChoice, type Game } from './engine/engine';
import { newLife, type LifeState, type LogEntry } from './engine/state';
import { newSeed } from './engine/rng';
import { equip as equipItem } from './engine/items';
import { exportCode, importCode, loadSlot, saveSlot } from './engine/save';

export const game: Game = makeGame(ContentSchema.parse(content));

export const life = signal<LifeState>(newLife(newSeed()));
export const slot = signal(0);
export const lastEntry = signal<LogEntry | null>(null);
export const menuOpen = signal(false);

export const currentEvent = computed(() => game.events.find((e) => e.id === life.value.currentEventId) ?? null);

function persist() {
  saveSlot(slot.value, life.value).catch(() => {});
}

function advance() {
  if (!life.value.alive) return;
  const { event, life: next } = pickEvent(game, life.value);
  life.value = event ? next : { ...next, alive: false };
}

export function startLife(seed = newSeed()) {
  lastEntry.value = null;
  life.value = newLife(seed);
  advance();
  persist();
}

export function choose(choiceId: string) {
  const id = life.value.currentEventId;
  if (!id) return;
  const res = resolveChoice(game, life.value, id, choiceId);
  life.value = res.life;
  lastEntry.value = res.entry;
  advance();
  persist();
}

export function equip(itemId: string) {
  const item = game.items.get(itemId);
  if (item) {
    life.value = equipItem(life.value, item);
    persist();
  }
}

export async function loadFromSlot(n: number) {
  const saved = await loadSlot(n);
  slot.value = n;
  if (saved) life.value = saved;
  else startLife();
}

export const exportLife = () => exportCode(life.value);
export function importLife(code: string) {
  life.value = importCode(code);
  persist();
}

export async function boot() {
  try {
    const saved = await loadSlot(slot.value);
    if (saved) {
      life.value = saved;
      return;
    }
  } catch {
    /* IndexedDB unavailable: play without saves */
  }
  startLife();
}

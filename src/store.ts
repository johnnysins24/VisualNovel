import { computed, signal } from '@preact/signals';
import content from './generated/content.json';
import { ContentSchema } from './engine/schema';
import { makeGame, pickEvent, resolveChoice, type Game } from './engine/engine';
import { newLife, type LifeState, type LogEntry } from './engine/state';
import { newSeed } from './engine/rng';
import { equip as equipItem } from './engine/items';
import { exportCode, importCode, loadMeta, loadSlot, saveMeta, saveSlot } from './engine/save';
import { commitLife, newMeta, type Meta } from './engine/meta';

export const game: Game = makeGame(ContentSchema.parse(content));

export const meta = signal<Meta>(newMeta());
export const life = signal<LifeState>(newLife(newSeed()));
export const slot = signal(0);
export const lastEntry = signal<LogEntry | null>(null);
export type Tab = 'story' | 'character' | 'people' | 'world' | 'more';
export const tab = signal<Tab>('story');
/** ผู้เล่นกด "พักไว้" ย่อแผ่นตัวเลือกลง เวลาในเกมไม่เดินจนกว่าจะเลือก */
export const sheetCollapsed = signal(false);

export const currentEvent = computed(() => game.events.find((e) => e.id === life.value.currentEventId) ?? null);

function persist() {
  saveSlot(slot.value, life.value).catch(() => {});
}

/** ชีวิตจบแล้วบันทึกชื่อเสียงลง meta ครั้งเดียว */
function finishIfDead() {
  if (life.value.alive || life.value.flags.includes('life_committed')) return;
  life.value = { ...life.value, flags: [...life.value.flags, 'life_committed'] };
  meta.value = commitLife(meta.value, life.value);
  saveMeta(meta.value).catch(() => {});
}

function advance() {
  if (life.value.alive) {
    const { event, life: next } = pickEvent(game, life.value);
    life.value = event ? next : { ...next, alive: false };
  }
  finishIfDead();
}

export function startLife(seed = newSeed()) {
  lastEntry.value = null;
  life.value = newLife(seed, meta.value);
  advance();
  persist();
}

export function choose(choiceId: string) {
  const id = life.value.currentEventId;
  if (!id) return;
  const res = resolveChoice(game, life.value, id, choiceId);
  life.value = res.life;
  lastEntry.value = res.entry;
  sheetCollapsed.value = false;
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
    meta.value = await loadMeta();
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

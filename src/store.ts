import { computed, signal } from '@preact/signals';
import content from './generated/content.json';
import { ContentSchema } from './engine/schema';
import { makeGame, pickEvent, repairLife, resolveChoice, type Game } from './engine/engine';
import { resolveMove } from './engine/encounter';
import { newLife, type EndReason, type LifeState, type LogEntry } from './engine/state';
import type { Stat } from './engine/schema';
import { newSeed } from './engine/rng';
import { equip as equipItem, unequip as unequipItem } from './engine/items';
import { buy, sell, useSupply } from './engine/gear';
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
/** ผลทอยของเช็คสำคัญที่ยังไม่ปิด (กล่องเต๋ากลางจอ U4) */
export const bigRoll = signal<{ entry: LogEntry; stat: Stat } | null>(null);

/** ผู้เล่นแตะเตรียมท่าของอาชีพไว้สำหรับวิธีรับมือถัดไป (เฉพาะท่าที่ต้องเตรียม) */
export const techArmed = signal(false);
/** ของใช้แล้วหมดที่ผู้เล่นแตะหยิบไว้ใช้กับวิธีรับมือถัดไป (จังหวะละชิ้น) */
export const supplyArmed = signal<string | null>(null);
/** นับครั้งที่ศัตรูทำร้ายตัวละครได้ ภาพศัตรูบนเวทีใช้เปลี่ยนเป็นท่าเข้าตีครู่หนึ่ง */
export const foeStruck = signal(0);

/**
 * การแสดงทีละย่อหน้า (U3): จำนวนย่อหน้า "ใหม่" ที่เปิดแล้วหลังการเลือกครั้งล่าสุด
 * null = แสดงทั้งหมด (เช่นเพิ่งโหลดเซฟ) ย่อหน้าใหม่คือผลของตัวเลือกกับเหตุการณ์ถัดไป
 */
export const revealed = signal<number | null>(null);

export const currentEvent = computed(() => game.events.find((e) => e.id === life.value.currentEventId) ?? null);

function persist() {
  saveSlot(slot.value, life.value).catch(() => {});
}

/** ชีวิตจบแล้วบันทึกชื่อเสียงลง meta ครั้งเดียว */
function finishIfDead() {
  // เรื่องหมดก่อนตายยังไม่นับว่าจบชีวิต ชื่อเสียงจะติดไปชีวิตหน้าเมื่อตายจริงเท่านั้น
  if (endReasonOf(life.value) !== 'death' || life.value.flags.includes('life_committed')) return;
  life.value = { ...life.value, flags: [...life.value.flags, 'life_committed'] };
  meta.value = commitLife(meta.value, life.value);
  saveMeta(meta.value).catch(() => {});
}

function advance() {
  if (life.value.alive) {
    const { event, life: next } = pickEvent(game, life.value);
    // ไม่มีเหตุการณ์ให้ออก: เรื่องที่เขียนไว้หมด (คนที่กำลังจะตายมีฉากตายเสมอ ถ้าไม่มี resolveChoice จบชีวิตไปแล้ว)
    life.value = event ? next : repairLife(game, next);
  }
  finishIfDead();
}

export function startLife(seed = newSeed()) {
  lastEntry.value = null;
  revealed.value = 1;
  life.value = newLife(seed, meta.value);
  advance();
  persist();
}

export function choose(choiceId: string) {
  const id = life.value.currentEventId;
  if (!id) return;
  const ev = game.events.find((e) => e.id === id);
  const check = ev?.choices.find((c) => c.id === choiceId)?.check;
  const res = resolveChoice(game, life.value, id, choiceId);
  bigRoll.value = res.entry.roll && check && (check.major || check.foe) ? { entry: res.entry, stat: check.stat } : null;
  life.value = res.life;
  lastEntry.value = res.entry;
  sheetCollapsed.value = false;
  revealed.value = 1;
  advance();
  persist();
}

/** เลือกวิธีรับมือในจังหวะปัจจุบันของการปะทะ ยังไม่จบ = อยู่ในเหตุการณ์เดิม จังหวะถัดไป · จบ = ปิดเหตุการณ์เหมือนตัวเลือกปกติ */
export function chooseMove(moveId: string) {
  if (!life.value.encounter) return;
  const res = resolveMove(game, life.value, moveId, techArmed.value, supplyArmed.value ?? undefined);
  techArmed.value = false;
  supplyArmed.value = null;
  bigRoll.value = null;
  if (!res.record.success && res.record.damage) foeStruck.value += 1;
  life.value = res.life;
  sheetCollapsed.value = false;
  revealed.value = 1;
  if (res.done) {
    lastEntry.value = res.entry ?? null;
    advance();
  }
  persist();
}

/**
 * ชีวิตที่หยุดเพราะเนื้อเรื่องหมด: ลองหาเหตุการณ์ใหม่อีกครั้ง (เช่นหลังเนื้อเรื่องชุดใหม่ออก)
 * คืน true ถ้าเล่นต่อได้
 */
export function resumeLife(): boolean {
  const l = life.value;
  if (l.alive || endReasonOf(l) !== 'content_end') return false;
  const { event, life: next } = pickEvent(game, { ...l, alive: true, endReason: null });
  if (!event) return false;
  life.value = next;
  persist();
  return true;
}

/** เซฟเก่าไม่มี endReason: ถ้ายังมี HP แปลว่าเรื่องหมด ไม่ใช่ตาย */
export const endReasonOf = (l: LifeState): EndReason | null => (l.alive ? null : (l.endReason ?? (l.hp > 0 ? 'content_end' : 'death')));

/** สวมของจากกระเป๋าลงช่องของมัน คืน false ถ้าสวมไม่ได้ (กลางการปะทะ หรือร่างกายยังพึ่งของที่สวมอยู่ในช่องนั้น) */
export function equip(itemId: string): boolean {
  const item = game.items.get(itemId);
  const next = item ? equipItem(life.value, item, game.items) : life.value;
  if (next === life.value) return false;
  life.value = next;
  persist();
  return true;
}

/** ถอดของออกจากช่อง (ของยังอยู่ในกระเป๋า) คืน false ถ้าถอดไม่ได้เพราะร่างกายยังพึ่งของชิ้นนั้นอยู่ */
export function unequip(itemId: string): boolean {
  const next = unequipItem(life.value, itemId, game.items);
  if (next === life.value) return false;
  life.value = next;
  persist();
  return true;
}

/** ซื้อของจากแผงของร้านในถิ่นนี้ คืน true ถ้าซื้อได้ */
export function buyItem(shopId: string, itemId: string): boolean {
  const next = buy(game, life.value, shopId, itemId);
  if (next === life.value) return false;
  life.value = next;
  persist();
  return true;
}

/** ขายของให้ร้านในถิ่นนี้ คืน true ถ้าขายได้ */
export function sellItem(itemId: string): boolean {
  const next = sell(game, life.value, itemId);
  if (next === life.value) return false;
  life.value = next;
  persist();
  return true;
}

/** ใช้ของใช้แล้วหมดนอกการปะทะ (ยา ผ้าพันแผล) คืนพลังชีวิตที่ฟื้น 0 = ใช้ไม่ได้ */
export function useItem(itemId: string): number {
  const res = useSupply(game, life.value, itemId);
  if (!res) return 0;
  life.value = res.life;
  persist();
  return res.healed;
}

/**
 * รับชีวิตที่โหลดมา (เซฟ ช่องอื่น หรือรหัสนำเข้า) มาเป็นชีวิตปัจจุบัน เนื้อหาอาจเปลี่ยนไปหลังเซฟ จึงซ่อมก่อนเสมอ:
 * เหตุการณ์ที่ค้างอยู่หายไปแล้วให้หยิบใหม่ และชีวิตที่เคยหยุดเพราะเรื่องหมดให้ลองเล่นต่อ
 */
function adopt(saved: LifeState) {
  lastEntry.value = null;
  revealed.value = null;
  bigRoll.value = null;
  techArmed.value = false;
  supplyArmed.value = null;
  sheetCollapsed.value = false;
  const fixed = repairLife(game, saved);
  life.value = fixed;
  if (!resumeLife() && fixed !== saved) persist();
}

export async function loadFromSlot(n: number) {
  const saved = await loadSlot(n);
  slot.value = n;
  if (saved) adopt(saved);
  else startLife();
}

export const exportLife = () => exportCode(life.value);
export function importLife(code: string) {
  adopt(importCode(code));
  persist();
}

export async function boot() {
  try {
    meta.value = await loadMeta();
    const saved = await loadSlot(slot.value);
    if (saved) {
      adopt(saved);
      return;
    }
  } catch {
    /* IndexedDB unavailable: play without saves */
  }
  startLife();
}

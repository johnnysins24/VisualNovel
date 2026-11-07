import type { Slot, Stat } from './schema';
import { STATS } from './schema';

export interface LifeState {
  version: 1;
  seed: number;
  rngState: number;
  name: string;
  age: number;
  hp: number;
  baseMaxHp: number;
  gold: number;
  stats: Record<Stat, number>;
  flags: string[];
  traits: string[];
  inventory: string[];
  equipped: Partial<Record<Slot, string>>;
  locationTag: string;
  seen: string[];
  log: LogEntry[];
  alive: boolean;
  currentEventId: string | null;
}

export interface LogEntry {
  age: number;
  eventId: string;
  choiceId: string;
  roll?: { d20: number; mod: number; dc: number; success: boolean };
  text?: string;
}

export function newLife(seed: number, name = 'ผู้เดินทาง'): LifeState {
  const stats = Object.fromEntries(STATS.map((s) => [s, 10])) as Record<Stat, number>;
  return {
    version: 1,
    seed,
    rngState: seed,
    name,
    age: 0,
    hp: 10,
    baseMaxHp: 10,
    gold: 0,
    stats,
    flags: [],
    traits: [],
    inventory: [],
    equipped: {},
    locationTag: 'village',
    seen: [],
    log: [],
    alive: true,
    currentEventId: null,
  };
}

export const modifier = (score: number) => Math.floor((score - 10) / 2);

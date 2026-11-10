import type { Kit, Look } from './core.mjs';
export const UNDER: Record<string, string[]>;
export function rng(seed: string | number): () => number;
export function npcLook(kit: Kit, groupKey: string, seed: string | number, opts?: { body?: string; race?: string; god?: string; face?: string }, data?: Record<string, unknown>): Look & { race: string; god: string | null };

// Types for the game (src/sprites). The kit itself is plain JS; see core.mjs for what each does.
export const W: number;
export const H: number;
export interface Kit {
  pal: { choices: Record<string, Record<string, Record<string, string>>>; [k: string]: unknown };
  pieces: Record<string, { body?: string | string[]; ages?: string | string[]; [k: string]: unknown }>;
  bodies: Record<string, { like?: string; marks: Record<string, number>; [k: string]: unknown }>;
  data: Record<string, any>;
  [k: string]: unknown;
}
export interface Look {
  body: string;
  pieces?: string[];
  face?: string;
  choices?: Record<string, string>;
  colors?: Record<string, string>;
}
export function makeKit(src: { palette: unknown; bodies: unknown; pieces: Record<string, unknown>; [k: string]: unknown }): Kit;
export function fitsBody(spec: unknown, bodyKey: string, kit: Kit): boolean;
export function renderLook(kit: Kit, look: Look): { w: number; h: number; rgba: Uint8ClampedArray };

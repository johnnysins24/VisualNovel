// Types for the test suite (the kit itself is plain JS run by Node).
import type { AdoptPal } from './pixels.mjs';
export * from './pixels.mjs';
export function adoptPalette(): AdoptPal;
/** Draw one-colour SVGs at their sizes in one headless Chromium; { path: picture }. */
export function rasterSvgs(jobs: { path: string; size: number }[]): Promise<Record<string, import('./pixels.mjs').Img>>;

// Types for the contact-sheet helpers; see sheet.mjs.
import type { Img } from './pixels.mjs';
export const PEARL: number[];
export { crop } from './pixels.mjs';
export function sheet(rows: (Img | null)[][], opts?: { scale?: number | number[]; gap?: number; margin?: number }): Img;
export function savePNG(path: string, img: Img): void;

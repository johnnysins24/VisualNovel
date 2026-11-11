// Types for the game and the test suite (the kit itself is plain JS).
export type Img = { w: number; h: number; rgba: Uint8ClampedArray };
export type AdoptPal = { outline: string; colours: { h: string; rgb: number[]; lab: number[] }[] };
export function hexRGB(h: string): number[];
export function toHex(r: number, g: number, b: number): string;
export function paletteOf(sprite: { ramps: Record<string, unknown[]>; outline: unknown }, scene: { materials: Record<string, { ramp?: unknown[] }> }): AdoptPal;
export function adoptPixels(img: Img, pal: AdoptPal): Img;
export function addOutline(img: Img, outline: number[]): void;
export function dropShadow(img: Img): Img;
export function scale2x(img: Img): Img;
export function crop(img: Img, box: { x: number; y: number; w: number; h: number }): Img;
export function trim(img: Img): Img;
export function pad(img: Img, n?: number): Img;
export function flip(img: Img): Img;
export function blit(onto: Img, im: Img, x0: number, y0: number): Img;
export function adoptTile(img: Img, pal: AdoptPal, opts?: { big?: boolean; shadow?: boolean }): Img;

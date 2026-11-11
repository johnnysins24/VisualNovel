// Types for the test suite (the kit itself is plain JS run by Node).
export function decodePNG(buf: Uint8Array): { w: number; h: number; rgba: Uint8ClampedArray };
export function encodePNG(img: { w: number; h: number; rgba: Uint8ClampedArray }): Uint8Array;

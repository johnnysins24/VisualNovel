// Types for the game and the test suite (the kit itself is plain JS).
export function oklab(hex: string): number[];
export function fromOklab(lab: number[]): string;
export function rampLike(ref: string[], base: string, outline: string): string[];
export function follow(one: string, skinRef: string[], skinBase: string): string;

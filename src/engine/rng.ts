/** mulberry32: small, fast, seedable. One seed per life makes runs replayable. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  get state(): number {
    return this.s;
  }
  static fromState(state: number): Rng {
    return new Rng(state);
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  d20(): number {
    return this.int(1, 20);
  }
}

export function newSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

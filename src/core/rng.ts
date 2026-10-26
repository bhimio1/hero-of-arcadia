// Seeded PRNG (mulberry32). The generator state is a single uint32 stored in GameState,
// so a game can be replayed exactly from its seed and action log.

export function hashSeed(seed: number | string): number {
  // FNV-1a over the string form gives a well-mixed uint32 from any seed.
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Advances the state and returns [float in [0, 1), next state]. */
export function nextFloat(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Small mutable wrapper for code that draws several numbers in a row. */
export class Rng {
  constructor(public state: number) {}

  float(): number {
    const [v, s] = nextFloat(this.state);
    this.state = s;
    return v;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

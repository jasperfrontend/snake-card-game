// Seeded, deterministic PRNG. The engine must never touch Math.random so that
// games are reproducible and the statistical tests are stable.

export type Rng = () => number; // returns a float in [0, 1)

/** mulberry32 — small, fast, good enough for a card game. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** In-place Fisher–Yates shuffle driven by the given rng. Returns the array. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick a uniformly random element from a non-empty array. */
export function pick<T>(arr: T[], rng: Rng): T {
  return arr[randInt(rng, arr.length)];
}

/**
 * Seeded deterministic RNG (GDD: "Randomness only via a seeded Rng").
 *
 * Pure and immutable, like the rest of core: `next(state)` never mutates its
 * input, it returns a new state plus the drawn value - same pattern as
 * `core/time`'s `consumeFrame` and `core/encounter`'s `tick`. Same seed always
 * produces the same sequence, which is required for:
 * - deterministic tests / headless balance simulation (`npm run sim`),
 * - "vrátenie v čase" (M17): branching a fresh, independent seed for a new
 *   timeline after a rewind, without disturbing the parent stream.
 *
 * Algorithm: mulberry32 (small, fast, good enough distribution for a game;
 * not cryptographically secure, which is fine here).
 */

export interface RngState {
  readonly seed: number;
}

export interface RngDraw<T> {
  readonly value: T;
  readonly state: RngState;
}

/**
 * Creates an Rng from a seed. A number is used as-is (truncated to a 32-bit
 * integer); a string is hashed to one (so e.g. a player id or save id can seed
 * a stream directly).
 */
export function createRng(seed: number | string): RngState {
  return { seed: typeof seed === 'string' ? hashStringTo32Bits(seed) : seed | 0 };
}

/** Draws the next value in [0, 1) and returns the advanced state. */
export function next(state: RngState): RngDraw<number> {
  // mulberry32 step.
  const seed = (state.seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: { seed } };
}

/** Draws a whole number in [min, max) (max exclusive). Requires min < max. */
export function nextInt(state: RngState, min: number, max: number): RngDraw<number> {
  if (min >= max) {
    throw new Error(`nextInt: min (${min}) must be less than max (${max})`);
  }
  const draw = next(state);
  return { value: min + Math.floor(draw.value * (max - min)), state: draw.state };
}

/** Draws true with the given probability (0..1). */
export function nextBool(state: RngState, probability = 0.5): RngDraw<boolean> {
  const draw = next(state);
  return { value: draw.value < probability, state: draw.state };
}

/**
 * Derives a new, independent Rng stream from `state` and a `label`
 * (e.g. `"loot:worker_ant"`). Deterministic: the same state + label always
 * branches to the same new seed. Drawing from the branch never advances or
 * otherwise affects `state` itself - `state` is only read, never mutated.
 */
export function branch(state: RngState, label: string): RngState {
  return createRng(hashStringTo32Bits(`${state.seed}:${label}`));
}

/** xmur3: deterministically hashes a string to a 32-bit integer seed. */
function hashStringTo32Bits(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Fixed-step simulation clock.
 *
 * The game simulation always advances in steps of TICK_MS (GDD 5: combat runs
 * in 100 ms steps, independent of FPS). The renderer passes in the real frame
 * delta; this module tells it how many simulation steps to run.
 */

/** Length of one simulation step in milliseconds (GDD 5). */
export const TICK_MS = 100;

/** Default cap so a long frame (e.g. after a hiccup) cannot freeze the game. */
export const DEFAULT_MAX_STEPS_PER_FRAME = 10;

export interface FrameSteps {
  /** Number of simulation steps to run this frame. */
  readonly steps: number;
  /** Leftover time to carry into the next frame (always < TICK_MS). */
  readonly accumulatorMs: number;
}

/**
 * Adds a frame's delta to the accumulator and returns how many whole steps to run.
 * If more than `maxSteps` are due, the extra time is dropped (not simulated).
 */
export function consumeFrame(
  accumulatorMs: number,
  frameDeltaMs: number,
  maxSteps: number = DEFAULT_MAX_STEPS_PER_FRAME,
): FrameSteps {
  const total = accumulatorMs + Math.max(0, frameDeltaMs);
  const due = Math.floor(total / TICK_MS);
  if (due > maxSteps) {
    return { steps: maxSteps, accumulatorMs: 0 };
  }
  return { steps: due, accumulatorMs: total - due * TICK_MS };
}

/**
 * Converts a design value in seconds (max. 1 decimal place, GDD 5) to whole
 * milliseconds. Throws if the value is negative, not finite, or has more than
 * 1 decimal place, so bad data is caught early.
 */
export function secondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid duration: ${seconds} s (must be a finite number >= 0)`);
  }
  const tenths = Math.round(seconds * 10);
  if (Math.abs(tenths - seconds * 10) > 1e-9) {
    throw new Error(`Invalid duration: ${seconds} s (max. 1 decimal place allowed)`);
  }
  return tenths * 100;
}

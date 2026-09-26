/**
 * Real-world clock (GDD 17.3, ROADMAP: "clock/ čas, maxSeenTime, denné resety").
 *
 * Separate from `core/time` (the 100 ms simulation step): this module is
 * about *wall-clock* timestamps - when the save was last closed, daily
 * resets (quests, login reward), and the "maxSeenTime" guard against a
 * player winding their device clock back to fake more offline progress.
 *
 * `now()` is the only place that touches `Date.now()`, so game logic stays
 * pure and testable (tests pass in fixed timestamps instead).
 */

/** Current real-world time in whole milliseconds since epoch (UTC). */
export function now(): number {
  return Date.now();
}

/**
 * Guards against clock manipulation (GDD 17.3): given the highest timestamp
 * ever observed and a freshly read one, returns the effective "now" (never
 * earlier than what was already seen) and the new maxSeenTime to persist.
 *
 * If the device clock was wound back, `effectiveNowMs` stays at
 * `maxSeenTimeMs` (no elapsed time is granted) instead of going backwards.
 */
export function guardAgainstClockRewind(
  maxSeenTimeMs: number,
  observedNowMs: number,
): { readonly effectiveNowMs: number; readonly maxSeenTimeMs: number } {
  const effectiveNowMs = Math.max(maxSeenTimeMs, observedNowMs);
  return { effectiveNowMs, maxSeenTimeMs: effectiveNowMs };
}

/**
 * Whole days elapsed between two UTC timestamps, using UTC calendar days
 * (not a rolling 24 h window) - so "denné resety" (daily quests, login
 * reward) flip at UTC midnight regardless of session length or time zone.
 */
export function utcDaysBetween(fromMs: number, toMs: number): number {
  const fromDay = Math.floor(fromMs / MS_PER_DAY);
  const toDay = Math.floor(toMs / MS_PER_DAY);
  return toDay - fromDay;
}

/** True if `fromMs` and `toMs` fall on different UTC calendar days. */
export function isNewUtcDay(fromMs: number, toMs: number): boolean {
  return utcDaysBetween(fromMs, toMs) !== 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

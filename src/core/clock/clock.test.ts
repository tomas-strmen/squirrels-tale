import { describe, expect, it } from 'vitest';
import { guardAgainstClockRewind, isNewUtcDay, now, utcDaysBetween } from './clock';

describe('now', () => {
  it('returns the current time in milliseconds', () => {
    const before = Date.now();
    const value = now();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe('guardAgainstClockRewind', () => {
  it('accepts a later timestamp as-is', () => {
    const result = guardAgainstClockRewind(1000, 5000);
    expect(result).toEqual({ effectiveNowMs: 5000, maxSeenTimeMs: 5000 });
  });

  it('clamps a rewound clock to the max seen time (no time granted)', () => {
    const result = guardAgainstClockRewind(5000, 1000);
    expect(result).toEqual({ effectiveNowMs: 5000, maxSeenTimeMs: 5000 });
  });

  it('is stable when the same timestamp is observed again', () => {
    const result = guardAgainstClockRewind(5000, 5000);
    expect(result).toEqual({ effectiveNowMs: 5000, maxSeenTimeMs: 5000 });
  });
});

describe('utcDaysBetween / isNewUtcDay', () => {
  const day1_morning = Date.UTC(2026, 0, 1, 8, 0, 0);
  const day1_evening = Date.UTC(2026, 0, 1, 23, 59, 0);
  const day2_morning = Date.UTC(2026, 0, 2, 0, 30, 0);
  const day3 = Date.UTC(2026, 0, 3, 12, 0, 0);

  it('is 0 within the same UTC calendar day, no matter the time of day', () => {
    expect(utcDaysBetween(day1_morning, day1_evening)).toBe(0);
    expect(isNewUtcDay(day1_morning, day1_evening)).toBe(false);
  });

  it('is 1 across a UTC midnight boundary, even if less than 24h apart', () => {
    expect(utcDaysBetween(day1_evening, day2_morning)).toBe(1);
    expect(isNewUtcDay(day1_evening, day2_morning)).toBe(true);
  });

  it('counts multiple whole days', () => {
    expect(utcDaysBetween(day1_morning, day3)).toBe(2);
  });

  it('is negative when going backwards', () => {
    expect(utcDaysBetween(day3, day1_morning)).toBe(-2);
  });
});

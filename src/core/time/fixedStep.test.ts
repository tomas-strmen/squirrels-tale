import { describe, expect, it } from 'vitest';
import { consumeFrame, secondsToMs, TICK_MS } from './fixedStep';

describe('consumeFrame', () => {
  it('uses a 100 ms tick', () => {
    expect(TICK_MS).toBe(100);
  });

  it('returns whole steps and keeps the remainder', () => {
    expect(consumeFrame(0, 250)).toEqual({ steps: 2, accumulatorMs: 50 });
  });

  it('carries the remainder into the next frame', () => {
    const first = consumeFrame(0, 60);
    expect(first).toEqual({ steps: 0, accumulatorMs: 60 });
    const second = consumeFrame(first.accumulatorMs, 60);
    expect(second).toEqual({ steps: 1, accumulatorMs: 20 });
  });

  it('gives the same total steps no matter how frames are split', () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 600; i++) {
      const r = consumeFrame(acc, 1000 / 60);
      acc = r.accumulatorMs;
      steps += r.steps;
    }
    // 600 frames at 60 FPS = 10 s = 100 steps (allowing float rounding).
    expect(steps).toBeGreaterThanOrEqual(99);
    expect(steps).toBeLessThanOrEqual(100);
  });

  it('caps the number of steps and drops the excess time', () => {
    expect(consumeFrame(0, 5000, 10)).toEqual({ steps: 10, accumulatorMs: 0 });
  });

  it('ignores negative deltas', () => {
    expect(consumeFrame(30, -500)).toEqual({ steps: 0, accumulatorMs: 30 });
  });
});

describe('secondsToMs', () => {
  it('converts design seconds to whole milliseconds', () => {
    expect(secondsToMs(1.0)).toBe(1000);
    expect(secondsToMs(2.5)).toBe(2500);
    expect(secondsToMs(0.1)).toBe(100);
    expect(secondsToMs(0)).toBe(0);
  });

  it('rejects more than 1 decimal place', () => {
    expect(() => secondsToMs(0.05)).toThrow(/1 decimal/);
    expect(() => secondsToMs(1.25)).toThrow(/1 decimal/);
  });

  it('rejects negative or non-finite values', () => {
    expect(() => secondsToMs(-1)).toThrow();
    expect(() => secondsToMs(Number.NaN)).toThrow();
    expect(() => secondsToMs(Number.POSITIVE_INFINITY)).toThrow();
  });
});

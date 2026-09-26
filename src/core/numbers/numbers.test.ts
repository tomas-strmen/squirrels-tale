import { describe, expect, it } from 'vitest';
import { formatHundredths, fromHundredths, toHundredths } from './numbers';

describe('toHundredths', () => {
  it('converts design values to whole hundredths', () => {
    expect(toHundredths(5.0)).toBe(500);
    expect(toHundredths(5.3)).toBe(530);
    expect(toHundredths(0.2)).toBe(20);
    expect(toHundredths(0)).toBe(0);
  });

  it('rejects more than 1 decimal place', () => {
    expect(() => toHundredths(5.25)).toThrow(/1 decimal/);
    expect(() => toHundredths(0.05)).toThrow(/1 decimal/);
  });

  it('rejects non-finite values', () => {
    expect(() => toHundredths(Number.NaN)).toThrow();
    expect(() => toHundredths(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('allows negative values (e.g. armor reduction math elsewhere)', () => {
    expect(toHundredths(-1.5)).toBe(-150);
  });
});

describe('fromHundredths', () => {
  it('is the inverse of toHundredths', () => {
    expect(fromHundredths(530)).toBeCloseTo(5.3);
    expect(fromHundredths(0)).toBe(0);
  });
});

describe('formatHundredths', () => {
  it('formats whole hundredths with 1 decimal place', () => {
    expect(formatHundredths(500)).toBe('5.0');
    expect(formatHundredths(530)).toBe('5.3');
  });

  it('rounds DOWN to 0.1 for display (GDD 5, v1.7)', () => {
    expect(formatHundredths(534)).toBe('5.3');
    expect(formatHundredths(536)).toBe('5.3');
    expect(formatHundredths(499)).toBe('4.9');
    expect(formatHundredths(25)).toBe('0.2');
    expect(formatHundredths(9)).toBe('0.0');
  });
});

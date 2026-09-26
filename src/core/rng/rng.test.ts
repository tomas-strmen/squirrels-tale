import { describe, expect, it } from 'vitest';
import { branch, createRng, next, nextBool, nextInt } from './rng';

describe('createRng', () => {
  it('accepts a number seed', () => {
    expect(createRng(42)).toEqual({ seed: 42 });
  });

  it('hashes a string seed to a number deterministically', () => {
    const a = createRng('save-1');
    const b = createRng('save-1');
    expect(a).toEqual(b);
    expect(typeof a.seed).toBe('number');
  });

  it('different string seeds hash differently', () => {
    expect(createRng('save-1')).not.toEqual(createRng('save-2'));
  });
});

describe('next', () => {
  it('is deterministic: same seed gives the same sequence', () => {
    const seqA = collect(createRng(1234), 20);
    const seqB = collect(createRng(1234), 20);
    expect(seqA).toEqual(seqB);
  });

  it('different seeds give different sequences', () => {
    const seqA = collect(createRng(1), 5);
    const seqB = collect(createRng(2), 5);
    expect(seqA).not.toEqual(seqB);
  });

  it('every value is in [0, 1)', () => {
    for (const value of collect(createRng(7), 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not modify the state passed in', () => {
    const state = createRng(99);
    const copy = structuredClone(state);
    next(state);
    expect(state).toEqual(copy);
  });

  it('has a roughly uniform distribution over many draws', () => {
    const values = collect(createRng(555), 5000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('nextInt', () => {
  it('stays within [min, max)', () => {
    let state = createRng(3);
    for (let i = 0; i < 500; i++) {
      const draw = nextInt(state, 5, 10);
      expect(draw.value).toBeGreaterThanOrEqual(5);
      expect(draw.value).toBeLessThan(10);
      expect(Number.isInteger(draw.value)).toBe(true);
      state = draw.state;
    }
  });

  it('rejects min >= max', () => {
    expect(() => nextInt(createRng(1), 5, 5)).toThrow();
    expect(() => nextInt(createRng(1), 5, 1)).toThrow();
  });
});

describe('nextBool', () => {
  it('defaults to ~50/50', () => {
    let state = createRng(11);
    let trueCount = 0;
    const draws = 2000;
    for (let i = 0; i < draws; i++) {
      const draw = nextBool(state);
      if (draw.value) trueCount++;
      state = draw.state;
    }
    expect(trueCount / draws).toBeGreaterThan(0.4);
    expect(trueCount / draws).toBeLessThan(0.6);
  });

  it('respects a given probability', () => {
    let state = createRng(22);
    let trueCount = 0;
    const draws = 2000;
    for (let i = 0; i < draws; i++) {
      const draw = nextBool(state, 0.9);
      if (draw.value) trueCount++;
      state = draw.state;
    }
    expect(trueCount / draws).toBeGreaterThan(0.85);
  });
});

describe('branch', () => {
  it('is deterministic: same state + label branches to the same stream', () => {
    const state = createRng(42);
    expect(branch(state, 'loot:worker_ant')).toEqual(branch(state, 'loot:worker_ant'));
  });

  it('different labels branch to different streams', () => {
    const state = createRng(42);
    expect(branch(state, 'loot:worker_ant')).not.toEqual(branch(state, 'loot:moth'));
  });

  it('does not advance or otherwise change the parent state', () => {
    const state = createRng(42);
    const copy = structuredClone(state);
    branch(state, 'anything');
    expect(state).toEqual(copy);
  });

  it('a branched stream is independent from the parent stream', () => {
    const state = createRng(42);
    const branched = branch(state, 'loot');
    const parentSeq = collect(state, 10);
    const branchedSeq = collect(branched, 10);
    expect(branchedSeq).not.toEqual(parentSeq);
  });
});

function collect(state: import('./rng').RngState, count: number): number[] {
  const values: number[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const draw = next(s);
    values.push(draw.value);
    s = draw.state;
  }
  return values;
}

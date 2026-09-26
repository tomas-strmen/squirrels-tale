import { describe, expect, it } from 'vitest';
import { createRng, type RngState } from '../rng/rng';
import {
  createCombatRules,
  createFighterStats,
  damageReduction,
  finalDamage,
  hitChancePct,
  resolveAttack,
  type FighterStats,
} from './combat';

const rules = createCombatRules({
  minHitPct: 5,
  maxHitPct: 98,
  armorConstant: 10.0,
  maxDamageReductionPct: 75,
  minDamage: 0.1,
});

const squirrel = createFighterStats({
  maxHp: 5.0,
  damageMin: 0.3,
  damageMax: 0.4,
  hitPct: 85,
  armor: 0,
  dodgePct: 0,
});

const ant = createFighterStats({
  maxHp: 1.2,
  damageMin: 0.2,
  damageMax: 0.3,
  hitPct: 65,
  armor: 0,
  dodgePct: 0,
});

function withStats(base: FighterStats, patch: Partial<FighterStats>): FighterStats {
  return { ...base, ...patch };
}

describe('createCombatRules / createFighterStats', () => {
  it('converts design values to hundredths, keeps percentages', () => {
    expect(rules).toEqual({
      minHitPct: 5,
      maxHitPct: 98,
      armorConstant: 1000,
      maxDamageReductionPct: 75,
      minDamage: 10,
    });
    expect(squirrel).toEqual({
      maxHp: 500,
      damageMin: 30,
      damageMax: 40,
      hitPct: 85,
      armor: 0,
      dodgePct: 0,
    });
  });

  it('rejects bad stats', () => {
    const antInput = { maxHp: 1.2, damageMin: 0.2, damageMax: 0.3, hitPct: 65, armor: 0, dodgePct: 0 };
    expect(() => createFighterStats({ ...antInput, maxHp: 0 })).toThrow();
    expect(() => createFighterStats({ ...antInput, damageMin: 0.5, damageMax: 0.3 })).toThrow();
    expect(() => createFighterStats({ ...antInput, maxHp: 1.25 })).toThrow(/1 decimal/);
  });
});

describe('hitChancePct (GDD 7.2)', () => {
  it('is attacker hit minus defender dodge', () => {
    expect(hitChancePct(squirrel, ant, rules)).toBe(85);
    expect(hitChancePct(squirrel, withStats(ant, { dodgePct: 15 }), rules)).toBe(70);
  });

  it('is clamped to 5..98 %', () => {
    expect(hitChancePct(withStats(squirrel, { hitPct: 100 }), ant, rules)).toBe(98);
    expect(hitChancePct(withStats(squirrel, { hitPct: 10 }), withStats(ant, { dodgePct: 40 }), rules)).toBe(5);
  });
});

describe('damageReduction (GDD 7.2)', () => {
  it('is 0 without armor', () => {
    expect(damageReduction(0, rules)).toBe(0);
  });

  it('is armor / (armor + 10)', () => {
    expect(damageReduction(1000, rules)).toBeCloseTo(0.5); // armor 10.0
    expect(damageReduction(100, rules)).toBeCloseTo(1 / 11); // armor 1.0
  });

  it('is capped at 75 %', () => {
    expect(damageReduction(1_000_000, rules)).toBe(0.75);
  });
});

describe('finalDamage (GDD 5 + 7.2)', () => {
  it('keeps raw damage without armor', () => {
    expect(finalDamage(30, 0, rules)).toBe(30);
  });

  it('rounds the reduced damage to 0.1', () => {
    // 0.3 × (1 − 1/11) = 0.2727… → 0.3
    expect(finalDamage(30, 100, rules)).toBe(30);
    // 0.4 × (1 − 0.5) = 0.2
    expect(finalDamage(40, 1000, rules)).toBe(20);
  });

  it('never goes below 0.1 on a hit', () => {
    // 0.1 × (1 − 0.75) = 0.025 → 0.0 → min 0.1
    expect(finalDamage(10, 1_000_000, rules)).toBe(10);
  });
});

describe('resolveAttack', () => {
  function many(attacker: FighterStats, defender: FighterStats, count: number, seed = 1) {
    let rng: RngState = createRng(seed);
    const results = [];
    for (let i = 0; i < count; i++) {
      const r = resolveAttack(attacker, defender, rules, rng);
      results.push(r.result);
      rng = r.rng;
    }
    return results;
  }

  it('is deterministic with the same seed', () => {
    expect(many(squirrel, ant, 50, 7)).toEqual(many(squirrel, ant, 50, 7));
  });

  it('does not modify the rng passed in', () => {
    const rng = createRng(3);
    const copy = structuredClone(rng);
    resolveAttack(squirrel, ant, rules, rng);
    expect(rng).toEqual(copy);
  });

  it('a miss deals no damage', () => {
    const misses = many(squirrel, ant, 500).filter((r) => !r.hit);
    expect(misses.length).toBeGreaterThan(0);
    for (const m of misses) expect(m.damage).toBe(0);
  });

  it('hits about 85 % of the time', () => {
    const results = many(squirrel, ant, 5000);
    const rate = results.filter((r) => r.hit).length / results.length;
    expect(rate).toBeGreaterThan(0.82);
    expect(rate).toBeLessThan(0.88);
  });

  it('hit damage is 0.3 or 0.4 (steps of 0.1, both ends included)', () => {
    const damages = new Set(many(squirrel, ant, 2000).filter((r) => r.hit).map((r) => r.damage));
    expect([...damages].sort()).toEqual([30, 40]);
  });

  it('never hits more often than 98 % or less than 5 %', () => {
    const sure = many(withStats(squirrel, { hitPct: 100 }), ant, 5000);
    const sureRate = sure.filter((r) => r.hit).length / sure.length;
    expect(sureRate).toBeLessThan(1);
    const hopeless = many(withStats(squirrel, { hitPct: 0 }), ant, 5000);
    const hopelessRate = hopeless.filter((r) => r.hit).length / hopeless.length;
    expect(hopelessRate).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addLevelBonus,
  createProgression,
  cumulativeLevelBonuses,
  gainXp,
  levelUpDelta,
  xpToNextLevel,
  xpToNextLevelHundredths,
} from './progression';

describe('xpToNextLevel (GDD 6.2)', () => {
  it('matches the values from the GDD', () => {
    expect(xpToNextLevel(1)).toBe(10);
    expect(xpToNextLevel(2)).toBe(14);
    expect(xpToNextLevel(3)).toBe(20);
    expect(xpToNextLevel(5)).toBe(38);
    expect(xpToNextLevel(10)).toBe(207);
    expect(xpToNextLevel(15)).toBe(1111);
    expect(xpToNextLevel(20)).toBe(5976);
  });

  it('has an hundredths variant', () => {
    expect(xpToNextLevelHundredths(1)).toBe(1000);
  });
});

describe('cumulativeLevelBonuses', () => {
  it('is 0 at level 1', () => {
    expect(cumulativeLevelBonuses(1)).toEqual({ hpBonus: 0, maxDamageBonus: 0, minDamageBonus: 0 });
  });

  it('adds +1.0 HP (100 hundredths) per level', () => {
    expect(cumulativeLevelBonuses(2).hpBonus).toBe(100);
    expect(cumulativeLevelBonuses(6).hpBonus).toBe(500);
  });

  it('adds +0.1 max damage every 2nd level', () => {
    expect(cumulativeLevelBonuses(1).maxDamageBonus).toBe(0);
    expect(cumulativeLevelBonuses(2).maxDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(3).maxDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(4).maxDamageBonus).toBe(20);
    expect(cumulativeLevelBonuses(10).maxDamageBonus).toBe(50);
  });

  it('adds +0.1 min damage every 5th level', () => {
    expect(cumulativeLevelBonuses(4).minDamageBonus).toBe(0);
    expect(cumulativeLevelBonuses(5).minDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(9).minDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(10).minDamageBonus).toBe(20);
  });
});

describe('levelUpDelta', () => {
  it('always grants +1.0 HP', () => {
    expect(levelUpDelta(2).hpBonus).toBe(100);
    expect(levelUpDelta(7).hpBonus).toBe(100);
  });

  it('grants +0.1 max damage only on even levels', () => {
    expect(levelUpDelta(2).maxDamageBonus).toBe(10);
    expect(levelUpDelta(3).maxDamageBonus).toBe(0);
    expect(levelUpDelta(4).maxDamageBonus).toBe(10);
  });

  it('grants +0.1 min damage only on multiples of 5', () => {
    expect(levelUpDelta(5).minDamageBonus).toBe(10);
    expect(levelUpDelta(10).minDamageBonus).toBe(10);
    expect(levelUpDelta(6).minDamageBonus).toBe(0);
  });

  it('sums up to the cumulative total across all levels', () => {
    let sum = { hpBonus: 0, maxDamageBonus: 0, minDamageBonus: 0 };
    for (let lvl = 2; lvl <= 20; lvl++) {
      const d = levelUpDelta(lvl);
      sum = {
        hpBonus: sum.hpBonus + d.hpBonus,
        maxDamageBonus: sum.maxDamageBonus + d.maxDamageBonus,
        minDamageBonus: sum.minDamageBonus + d.minDamageBonus,
      };
    }
    expect(sum).toEqual(cumulativeLevelBonuses(20));
  });
});

describe('gainXp', () => {
  it('accumulates XP without leveling up if not enough', () => {
    const r = gainXp(createProgression(), 500); // 5.0 XP of 10 needed
    expect(r.state).toEqual({ level: 1, xp: 500 });
    expect(r.levelsGained).toEqual([]);
  });

  it('levels up exactly at the threshold, carrying over no leftover', () => {
    const r = gainXp(createProgression(), 1000); // exactly 10.0 XP
    expect(r.state).toEqual({ level: 2, xp: 0 });
    expect(r.levelsGained).toEqual([2]);
  });

  it('carries over leftover XP into the new level', () => {
    const r = gainXp(createProgression(), 1200); // 12.0 of 10 needed -> Lv2 with 2.0 leftover
    expect(r.state).toEqual({ level: 2, xp: 200 });
    expect(r.levelsGained).toEqual([2]);
  });

  it('can level up multiple times from one big gain', () => {
    // Lv1 needs 10, Lv2 needs 14 -> 25.0 XP takes us to level 3 with 1.0 left.
    const r = gainXp(createProgression(), 2500);
    expect(r.state).toEqual({ level: 3, xp: 100 });
    expect(r.levelsGained).toEqual([2, 3]);
  });

  it('does not modify the state passed in', () => {
    const state = createProgression();
    const copy = structuredClone(state);
    gainXp(state, 999);
    expect(state).toEqual(copy);
  });
});

describe('addLevelBonus', () => {
  it('adds a hundredths bonus to a design value', () => {
    expect(addLevelBonus(5.0, 100)).toBeCloseTo(6.0);
    expect(addLevelBonus(0.3, 10)).toBeCloseTo(0.4);
  });

  it('stays a clean decimal after repeated additions', () => {
    let value = 5.0;
    for (let i = 0; i < 10; i++) value = addLevelBonus(value, 100);
    expect(value).toBeCloseTo(15.0);
    expect(Math.round(value * 10)).toBe(150);
  });
});

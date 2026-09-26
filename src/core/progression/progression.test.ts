import { describe, expect, it } from 'vitest';
import {
  addLevelBonus,
  applyDeathXpLoss,
  attackIntervalMsAtLevel,
  createProgression,
  cumulativeLevelBonuses,
  gainXp,
  levelUpDelta,
  regenAmountHundredths,
  xpToNextLevel,
  xpToNextLevelHundredths,
} from './progression';

describe('xpToNextLevel (GDD 6.2)', () => {
  it('matches the values from the GDD (v1.7, exponent 1.3)', () => {
    expect(xpToNextLevel(1)).toBe(10);
    expect(xpToNextLevel(2)).toBe(13);
    expect(xpToNextLevel(3)).toBe(17);
    expect(xpToNextLevel(5)).toBe(29);
    expect(xpToNextLevel(10)).toBe(106);
    expect(xpToNextLevel(15)).toBe(394);
    expect(xpToNextLevel(20)).toBe(1462);
    expect(xpToNextLevel(25)).toBe(5428);
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

  it('adds +0.1 max damage every level', () => {
    expect(cumulativeLevelBonuses(1).maxDamageBonus).toBe(0);
    expect(cumulativeLevelBonuses(2).maxDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(3).maxDamageBonus).toBe(20);
    expect(cumulativeLevelBonuses(4).maxDamageBonus).toBe(30);
    expect(cumulativeLevelBonuses(10).maxDamageBonus).toBe(90);
  });

  it('adds +0.1 min damage every 2nd level', () => {
    expect(cumulativeLevelBonuses(1).minDamageBonus).toBe(0);
    expect(cumulativeLevelBonuses(2).minDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(3).minDamageBonus).toBe(10);
    expect(cumulativeLevelBonuses(4).minDamageBonus).toBe(20);
    expect(cumulativeLevelBonuses(10).minDamageBonus).toBe(50);
  });
});

describe('levelUpDelta', () => {
  it('always grants +1.0 HP', () => {
    expect(levelUpDelta(2).hpBonus).toBe(100);
    expect(levelUpDelta(7).hpBonus).toBe(100);
  });

  it('grants +0.1 max damage on every level', () => {
    expect(levelUpDelta(2).maxDamageBonus).toBe(10);
    expect(levelUpDelta(3).maxDamageBonus).toBe(10);
    expect(levelUpDelta(4).maxDamageBonus).toBe(10);
  });

  it('grants +0.1 min damage only on even levels', () => {
    expect(levelUpDelta(2).minDamageBonus).toBe(10);
    expect(levelUpDelta(10).minDamageBonus).toBe(10);
    expect(levelUpDelta(5).minDamageBonus).toBe(0);
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
    // Lv1 needs 10, Lv2 needs 13 -> 25.0 XP takes us to level 3 with 2.0 left.
    const r = gainXp(createProgression(), 2500);
    expect(r.state).toEqual({ level: 3, xp: 200 });
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

describe('attackIntervalMsAtLevel (GDD 6.1 v1.7: x1.01 per level, compounding)', () => {
  it('is the base interval at level 1', () => {
    expect(attackIntervalMsAtLevel(4000, 1, 1, 500)).toBe(4000);
  });

  it('gets 1 % faster per level, compounding', () => {
    expect(attackIntervalMsAtLevel(4000, 2, 1, 500)).toBe(Math.round(4000 / 1.01));
    // Lv10: x1.01^9 ~ +9.4 % speed.
    expect(attackIntervalMsAtLevel(4000, 10, 1, 500)).toBe(3657);
  });

  it('never goes below the minimum interval', () => {
    expect(attackIntervalMsAtLevel(600, 100, 1, 500)).toBe(500);
  });
});

describe('regenAmountHundredths (GDD 6.1: base + growth %/level, compounding)', () => {
  it('is the base amount at level 1', () => {
    expect(regenAmountHundredths(0.1, 1, 3)).toBe(10);
  });

  it('grows by growthPctPerLevel % per level, compounding', () => {
    expect(regenAmountHundredths(0.1, 2, 3)).toBe(Math.round(10 * 1.03));
    expect(regenAmountHundredths(0.1, 11, 3)).toBe(Math.round(10 * 1.03 ** 10));
  });
});

describe('applyDeathXpLoss (GDD 6.3)', () => {
  it('subtracts a percentage of the current progress, keeps the level', () => {
    const state = { level: 3, xp: 1000 };
    expect(applyDeathXpLoss(state, 10)).toEqual({ level: 3, xp: 900 });
  });

  it('does nothing at 0 XP progress', () => {
    expect(applyDeathXpLoss({ level: 2, xp: 0 }, 10)).toEqual({ level: 2, xp: 0 });
  });

  it('never goes negative', () => {
    expect(applyDeathXpLoss({ level: 1, xp: 5 }, 100).xp).toBe(0);
  });
});

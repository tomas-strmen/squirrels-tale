import { describe, expect, it } from 'vitest';
import { EMPTY_WALLET } from '../currency/currency';
import { createFoodConfig, FOOD_IDS, nextAutoFood } from './food';

describe('createFoodConfig / nextAutoFood (GDD 7.4)', () => {
  const cfg = createFoodConfig({ berryHeal: 0.3, seedHeal: 0.5, nutHeal: 1.0, eatCooldownS: 3.0, autoEatBelowPct: 40, autoFoodUnlockS: 60.0 });

  it('converts heals to hundredths and timers to ms', () => {
    expect(cfg.healHundredths).toEqual({ berries: 30, seeds: 50, nuts: 100 });
    expect(cfg.eatCooldownMs).toBe(3000);
    expect(cfg.autoFoodUnlockMs).toBe(60000);
    expect(cfg.autoOrder).toEqual(FOOD_IDS);
  });

  it('picks the first food in the order that the wallet has', () => {
    expect(nextAutoFood({ ...EMPTY_WALLET, seeds: 2, nuts: 5 }, cfg.autoOrder)).toBe('seeds');
    expect(nextAutoFood({ ...EMPTY_WALLET, berries: 1, nuts: 5 }, cfg.autoOrder)).toBe('berries');
    expect(nextAutoFood({ ...EMPTY_WALLET, pebbles: 9 }, cfg.autoOrder)).toBeNull();
  });
});

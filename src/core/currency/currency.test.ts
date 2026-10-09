import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng';
import type { EnemyLootTable } from '../loot/loot';
import { addToWallet, EMPTY_WALLET, rollCurrencyDrops } from './currency';

const table = (currencies: EnemyLootTable['currencies'], minLevel = 1, maxLevel = 1): EnemyLootTable => ({
  minLevel,
  maxLevel,
  items: [],
  rarities: [],
  currencies,
});
const entry = (currencyId: 'pebbles' | 'seeds' | 'nuts', pct: number, amountMin = 1, amountMax = 1, pctMax = pct) => ({
  currencyId,
  pctBpAtMin: pct * 100,
  pctBpAtMax: pctMax * 100,
  amountMin,
  amountMax,
});

describe('rollCurrencyDrops (GDD 11.1 v2.5)', () => {
  it('a currency not in the table never drops', () => {
    const t = table([entry('pebbles', 100)]);
    for (let seed = 1; seed <= 50; seed++) {
      const { drops } = rollCurrencyDrops(t, 1, createRng(seed));
      expect(drops.map((d) => d.currencyId)).toEqual(['pebbles']);
    }
  });

  it('100 % always drops, 0 % never, amount stays within its range', () => {
    const always = table([entry('seeds', 100, 2, 4)]);
    const never = table([entry('seeds', 0, 2, 4)]);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const a = rollCurrencyDrops(always, 1, createRng(seed)).drops;
      expect(a).toHaveLength(1);
      expect(a[0]?.amount).toBeGreaterThanOrEqual(2);
      expect(a[0]?.amount).toBeLessThanOrEqual(4);
      seen.add(a[0]?.amount ?? 0);
      expect(rollCurrencyDrops(never, 1, createRng(seed)).drops).toEqual([]);
    }
    expect(seen).toEqual(new Set([2, 3, 4]));
  });

  it('chance is interpolated over the enemy level range', () => {
    const t = table([entry('nuts', 0, 1, 1, 100)], 1, 5);
    const hits = (level: number) =>
      Array.from({ length: 400 }, (_, i) => rollCurrencyDrops(t, level, createRng(i + 1)).drops.length).reduce((a, b) => a + b, 0);
    expect(hits(1)).toBe(0);
    expect(hits(5)).toBe(400);
    const mid = hits(3);
    expect(mid).toBeGreaterThan(120);
    expect(mid).toBeLessThan(280);
  });

  it('is deterministic for the same seed', () => {
    const t = table([entry('pebbles', 50, 1, 3), entry('seeds', 50, 1, 3)]);
    expect(rollCurrencyDrops(t, 1, createRng(7))).toEqual(rollCurrencyDrops(t, 1, createRng(7)));
  });
});

describe('addToWallet', () => {
  it('adds each drop to its currency without touching the original', () => {
    const w = addToWallet(EMPTY_WALLET, [
      { currencyId: 'pebbles', amount: 2 },
      { currencyId: 'pebbles', amount: 1 },
      { currencyId: 'nuts', amount: 1 },
    ]);
    expect(w).toEqual({ pebbles: 3, seeds: 0, nuts: 1, berries: 0 });
    expect(EMPTY_WALLET).toEqual({ pebbles: 0, seeds: 0, nuts: 0, berries: 0 });
  });

  it('returns the same wallet when nothing dropped', () => {
    expect(addToWallet(EMPTY_WALLET, [])).toBe(EMPTY_WALLET);
  });
});

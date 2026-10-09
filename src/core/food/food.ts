/**
 * Food (GDD 7.4): which currencies can be eaten and how much they heal, plus the
 * numbers of the eat cooldown and auto-food. Pure; the wallet and the HP live in
 * `core/encounter`, which calls these helpers.
 *
 * Berries, Seeds and Nuts are wallet counters (core/currency) - eating one spends
 * one piece. Berries only exist as food; Seeds and Nuts are also money.
 */
import type { CurrencyId } from '../content/schemas';
import { toHundredths } from '../numbers/numbers';
import { secondsToMs } from '../time/fixedStep';
import type { Wallet } from '../currency/currency';

export const FOOD_IDS = ['berries', 'seeds', 'nuts'] as const satisfies readonly CurrencyId[];
export type FoodId = (typeof FOOD_IDS)[number];

/** Design values from data/balance.json `food`. */
export interface FoodConfigInput {
  readonly berryHeal: number;
  readonly seedHeal: number;
  readonly nutHeal: number;
  readonly eatCooldownS: number;
  readonly autoEatBelowPct: number;
  readonly autoFoodUnlockS: number;
}

export interface FoodConfig {
  /** HP healed by one piece (hundredths). */
  readonly healHundredths: Readonly<Record<FoodId, number>>;
  /** Shared cooldown after eating, manual or auto (ms). */
  readonly eatCooldownMs: number;
  /** Auto-food eats when HP is below this % of max HP. */
  readonly autoEatBelowPct: number;
  /** How long one "watch an ad" unlocks auto-food (ms). */
  readonly autoFoodUnlockMs: number;
  /** Which food auto-food tries first (GDD 7.4: berries -> seeds -> nuts). */
  readonly autoOrder: readonly FoodId[];
}

export function createFoodConfig(input: FoodConfigInput): FoodConfig {
  const eatCooldownMs = secondsToMs(input.eatCooldownS);
  const autoFoodUnlockMs = secondsToMs(input.autoFoodUnlockS);
  if (eatCooldownMs < 0 || autoFoodUnlockMs < 1) throw new Error('Food timers must be positive');
  return {
    healHundredths: {
      berries: toHundredths(input.berryHeal),
      seeds: toHundredths(input.seedHeal),
      nuts: toHundredths(input.nutHeal),
    },
    eatCooldownMs,
    autoEatBelowPct: input.autoEatBelowPct,
    autoFoodUnlockMs,
    autoOrder: FOOD_IDS,
  };
}

/** The first food in `order` the wallet has at least one piece of, or null. */
export function nextAutoFood(wallet: Wallet, order: readonly FoodId[]): FoodId | null {
  return order.find((id) => wallet[id] > 0) ?? null;
}

/**
 * Currencies (GDD 11.1 v2.5): the wallet and the per-kill currency drop.
 *
 * Which currencies an enemy drops, how likely and how many is its own table
 * (`data/enemies.json` `loot.currencies`) - one that isn't listed never drops
 * from that enemy. Like item drops, each listed currency is rolled
 * independently per kill, with the chance interpolated over the enemy's own
 * `minLevel`/`maxLevel`. Pure: the caller passes (and gets back) the seeded Rng.
 */
import { CURRENCY_IDS, type CurrencyId } from '../content/schemas';
import { interpolate, type EnemyLootTable } from '../loot/loot';
import { nextInt, type RngState } from '../rng/rng';

export { CURRENCY_IDS, type CurrencyId };

export type Wallet = Readonly<Record<CurrencyId, number>>;

export const EMPTY_WALLET: Wallet = { pebbles: 0, seeds: 0, nuts: 0, berries: 0 };

export interface CurrencyDrop {
  readonly currencyId: CurrencyId;
  readonly amount: number;
}

/** Rolls the currencies one kill drops, at the killed enemy's `enemyLevel`. */
export function rollCurrencyDrops(
  table: EnemyLootTable,
  enemyLevel: number,
  rng: RngState,
): { readonly drops: readonly CurrencyDrop[]; readonly rng: RngState } {
  let r = rng;
  const drops: CurrencyDrop[] = [];
  for (const entry of table.currencies) {
    const pctBp = Math.round(
      interpolate(entry.pctBpAtMin, entry.pctBpAtMax, enemyLevel, table.minLevel, table.maxLevel),
    );
    const chance = nextInt(r, 0, 10000);
    r = chance.state;
    if (chance.value >= pctBp) continue;
    let amount = entry.amountMin;
    if (entry.amountMax > entry.amountMin) {
      const roll = nextInt(r, entry.amountMin, entry.amountMax + 1);
      r = roll.state;
      amount = roll.value;
    }
    drops.push({ currencyId: entry.currencyId, amount });
  }
  return { drops, rng: r };
}

/** Wallet with `drops` added; the same wallet object if there is nothing to add. */
export function addToWallet(wallet: Wallet, drops: readonly CurrencyDrop[]): Wallet {
  if (drops.length === 0) return wallet;
  const next: Record<CurrencyId, number> = { ...wallet };
  for (const d of drops) next[d.currencyId] += d.amount;
  return next;
}

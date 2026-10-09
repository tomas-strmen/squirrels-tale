# core/currency

Currencies (GDD 11.1 v2.5): Shiny Pebbles, Seeds, Nuts (Time Needles come with M17).
Pure TypeScript, no Phaser.

Which currencies an enemy drops, with what chance and how many is **its own table**
in `data/enemies.json` (`loot.currencies`), next to its item drops - so one enemy can
drop only seeds, another pebbles and nuts, another nothing. The chance is interpolated
over the enemy's own `minLevel`/`maxLevel` exactly like item drops; when a currency
drops, `amountMin`..`amountMax` pieces fall. Each listed currency is rolled independently.

## Public API
- `Wallet`, `EMPTY_WALLET`, `CURRENCY_IDS`, `CurrencyId` - the three counters.
- `rollCurrencyDrops(table, enemyLevel, rng)` - `{ drops, rng }` for one kill (own Rng stream
  in `core/encounter`, so currency never changes item drops or the fight).
- `addToWallet(wallet, drops)` - new wallet (the same object if nothing dropped).

## Not yet
Spending (merchant M10, blacksmith M16), the `currencyFindPct` gear stat, Time Needles.

## Depends on
`core/loot` (`EnemyLootTable`, `interpolate`), `core/content/schemas` (ids), `core/rng`.

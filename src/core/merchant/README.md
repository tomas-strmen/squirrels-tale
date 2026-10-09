# core/merchant

The merchant – Magpie (GDD 11.2, M10). Pure TypeScript, no Phaser. Numbers in `data/balance.json`
`merchant` and `data/rarities.json` (`buyPct`, `sellPct`).

- Item value `V(t) = round(5 × 1.5^(t−1))` by item tier. She sells at `V × buyPct` (Common 100 %,
  Uncommon 300 %; `buyPct: null` = never in stock) and buys back at `V × sellPct` (Common 20 % …
  Legendary 1000 %), at least `minSellPrice`. Paid in the slot's currency: weapons pebbles, armor
  seeds, jewellery nuts (`currencyBySlot`).
- Daily stock (`dailyStock`: 4 Common + 1 Uncommon): random base items with tier ≤ the highest
  unlocked tile tier, rolled once per UTC day from the merchant's own Rng stream (`state.merchant`,
  saved since save v3), so it's the same all day and survives reloads. Bought items leave the stock.
- She opens when `unlockTile` (T2, her home) is unlocked – quest Q2 takes over in M13.
- Only unlocked bag items can be sold (a lock protects, GDD 10). Upgrade bonus (+20 % per +1) comes with M16.

## Public API
- `itemValue(tier, config)`, `buyPrice(item, loot, config)`, `sellPrice(item, loot, config)` → `{ currencyId, amount }`.
- `rollStock(merchant, loot, config, day, maxTier, nextUid)`, `refreshStock(state, loot, config, day, maxTier)`
  (new stock only on a new day), `dayIndex(timeMs)`.
- `buyItem(state, loot, config, uid)` → `{ state, result: 'bought' | 'notEnough' | 'bagFull' | 'gone' }`.
- `sellItem(state, loot, config, uid)` → state (unchanged if locked / not in the bag).

## Depends on
`core/encounter` (state type), `core/inventory`, `core/loot` (`generateItemFromBase`), `core/rng`, `core/content` (types).

# core/food

Food (GDD 7.4, M7.2). Pure TypeScript, no Phaser.

Berries, Seeds and Nuts are wallet counters (`core/currency`); eating spends one piece and
heals a fixed amount (`data/balance.json` `food`). This module holds the food ids, the numbers
(`createFoodConfig`) and `nextAutoFood`; the HP, wallet and timers live in `core/encounter`
(`eatFood`, `unlockAutoFood`, `tick`) because eating changes the fight state.

Rules: shared cooldown after any meal; no eating at full HP, without that food or in the
hideout; auto-food (below `autoEatBelowPct` of max HP, order berries -> seeds -> nuts) works only
while unlocked by a (mock) ad for `autoFoodUnlockS`, counted in simulation time.

## Public API
- `FOOD_IDS`, `FoodId`, `createFoodConfig(input)`, `nextAutoFood(wallet, order)`.

## Depends on
`core/currency` (`Wallet`), `core/numbers`, `core/time`.

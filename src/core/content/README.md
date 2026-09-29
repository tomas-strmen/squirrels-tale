# core/content

Zod schemas for `data/*.json`. Invalid data fails a test with a clear message
instead of crashing somewhere unrelated later. A new enemy/item is a new
record in the JSON, never new code here.

## Public API
- `idSchema` – snake_case id (`worker_ant`).
- `designSecondsSchema` – a design duration in seconds (GDD 5: max. 1 decimal place, >= 0).
- `enemySchema` / `enemiesSchema` (+ `Enemy` type), `balanceSchema` (+ `Balance` type) –
  schemas for `data/enemies.json` and `data/balance.json` (enemy includes `xp`, its own
  anchor `baseLevel` (GDD 6.2/8.3/8.4), and its own `loot` drop table/rarity weights, see below).
- `enemyLootSchema` (+ `enemyDropItemSchema`/`enemyRarityWeightSchema`, `EnemyLoot` type, v2.4) –
  an enemy's own drop table (item id + % at its `minLevel`/`maxLevel`) and rarity weights
  (rarity id + weight at `minLevel`/`maxLevel`), GDD 9.3/9.6. `raritySchema` (`data/rarities.json`)
  now only holds metadata (color, stat multiplier, affix count, dice range, MF scaling, quest
  lock) - no more `weight`/`minTileTier`, those moved into each enemy's own table.
- `tileSchema` / `tilesSchema` (+ `TileData` type, M6.2) – schema for `data/tiles.json`: which
  enemies can spawn on a tile, their rolled level range, kills needed on the *previous* tile in
  the array to unlock it (array order = map order, first tile always unlocked), and an optional
  `unlockLevel` (GDD 8.2, e.g. a future T4: 30 kills + Lv 5).
- `designValueSchema`, `percentSchema` – HP/damage/armor (max. 1 decimal) and whole percentages.
- `parseEnemies(data)`, `parseBalance(data)`, `parseTiles(data)` – parse + throw a readable
  `ZodError` if the data is invalid.
- `toEncounterConfigInput(balance, tile, enemies)` (`encounterInput.ts`) – maps validated data
  (a tile and the enemies it references) to the input of `createEncounterConfig`, used by the
  game and the content tests.

## Depends on
- `zod`; `core/encounter` (types only).

# core/loot

Item drops and generation (GDD 9.2, 9.3, 9.5, 9.6). Pure: takes the seeded Rng
and returns the advanced one. Values are internal hundredths (percentages too:
3 % -> 300), rolled in 0.01 steps (GDD 9.3 v2.0).

v2.4 (M6.2 follow-up): each enemy owns its own drop table and rarity weights
(`core/content` `enemyLootSchema`), both interpolated between the enemy's own
`minLevel`/`maxLevel` (independent of which tile it's fought on, `core/encounter`).
Every drop-table entry rolls independently, so one kill can drop zero, one or
several items - there is no single "does anything drop" gate or shared
tile-wide item pool anymore.

## Public API
- `createLootConfig({ items, rarities, affixes, balance })` – from validated data
  (`data/items.json`, `rarities.json`, `affixes.json`, `balance.json` `loot`; no more
  `dropChancePct` - that's per-enemy now).
- `createEnemyLootTable(enemyLootData)` – resolves one enemy's raw `loot` (from
  `data/enemies.json`) to internal units; lives on its `EncounterEnemyDef` (`core/encounter`).
- `createLootState()` – `{ pityCounters: {}, nextUid: 1 }`.
- `rollKillDrop(state, config, rng, ctx, enemyLoot, enemyLevel)` – once per kill: rolls every
  entry in `enemyLoot.items` independently (chance interpolated by `enemyLevel`); each dropped
  **base** item then rolls its own rarity from `enemyLoot.rarities` (also interpolated); a
  **unique**/**set** item is its own entry and always drops at its fixed rarity - no roll, no
  fallback. Pity (GDD 9.6 v2.2) still forces at least one item of the pity rarity once its
  counter is full, even if the tables above rolled nothing. Returns `items` (an array, not a
  single nullable item).
- `rarityWeights(config, enemyLoot, level, ctx, pityOnly?)` / `rollRarity(...)` – the enemy's own
  weights at `level`, Magic Find (linear for Uncommon/Rare, diminishing `MF×100/(MF+100)` for
  Unique/Set/Legendary), Common = remainder (min 0). Weights stay plain numbers (like the old
  global ones), not hundredths.
- `generateItemFromBase(config, rng, ctx, item, rarity, uid)` – one instance of a specific,
  already-chosen `item` at a specific, already-chosen `rarity`: stats × rarity multiplier,
  weapon damage range × multiplier, affixes. Doesn't pick the item or the rarity itself anymore
  (that's `rollKillDrop`'s job) - callers that already know both (e.g. tests) can call it directly.
- `rollAffixes(config, rng, ctx, tier, count)` – distinct, unlocked only, value × (1 + 0.35 × (tier − 1)).
- `effectiveMagicFind(mf)`, `canDrop(config, enemyLoot, ctx, rarity)` – whether a rarity can
  currently drop from this specific enemy (unlocked, and either it's the remainder or the enemy's
  table actually has a weight/item entry for it).
- `pityCountdowns(state, config, enemyLoot, ctx)` – kills left per pity rarity that can drop here, for the UI.
- `diceFaces(item, config)` – d20 face(s) for the drop animation (GDD 9.6): 1-14 Common,
  15-18 Uncommon, 19 Rare, 20 → a gold d20 for Unique/Set/Legendary (each rarity's own face
  range, from `data/rarities.json` `diceRange`/`goldDiceRange`). The rarity is already decided;
  this only picks which face matches it. Deterministic from the item's uid - cosmetic only,
  never touches the fight's own Rng stream.

## Rules
- Pity guarantee is "at least X": only counts kills (and only forces a drop) for a rarity this
  specific enemy can actually produce (`canDrop`). The counter resets on any dropped item of
  that rarity or lower.
- Not yet: legendary traits, upgrades (M16).

## Depends on
- `core/content` (types), `core/numbers`, `core/rng`, `core/time`.

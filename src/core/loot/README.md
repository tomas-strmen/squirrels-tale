# core/loot

Item drops and generation (GDD 9.2, 9.3, 9.5, 9.6). Pure: takes the seeded Rng
and returns the advanced one. Values are internal hundredths (percentages too:
3 % -> 300), rolled in 0.01 steps (GDD 9.3 v2.0).

## Public API
- `createLootConfig({ items, rarities, affixes, balance })` – from validated data
  (`data/items.json`, `rarities.json`, `affixes.json`, `balance.json` `loot`).
- `createLootState()` – `{ killsSincePity: 0, nextUid: 1 }`.
- `rollKillDrop(state, config, rng, ctx)` – once per kill: counts pity, 4 % drop chance,
  or a sure Unique+ once `killsSincePity` reaches `pityKills` (1000). Returns the item or `null`.
- `rarityWeights(config, ctx, pityOnly?)` / `rollRarity(...)` – weights per 100, Magic Find
  (linear for Uncommon/Rare, diminishing `MF×100/(MF+100)` for Unique/Set/Legendary), Common =
  remainder (min 0), rarities below their `minTileTier` get 0 (Set only T3+).
- `generateItem(config, rng, ctx, rarity, uid)` – base item of tier `t−2..t`; stats × rarity
  multiplier; weapon damage range × multiplier; affixes. A Unique/Set with no such item on the
  tile becomes a Rare with one extra affix (GDD 9.5).
- `rollAffixes(config, rng, ctx, tier, count)` – distinct, unlocked only, value × (1 + 0.35 × (tier − 1)).
- `effectiveMagicFind(mf)`, `eligibleItems(config, tier, kind)`.

## Rules
- Pity guarantee is "at least Unique": it only picks Unique/Set when such items exist on the
  tile (on T1 that leaves Legendary). The counter resets on a Unique/Set/Legendary **item**.
- Not yet: unique/set items, their fixed properties and set bonuses, legendary traits, upgrades (M16).

## Depends on
- `core/content` (types), `core/numbers`, `core/rng`, `core/time`.

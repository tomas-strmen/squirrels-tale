# core/encounter

Searching for an enemy and a 1v1 fight with HP, XP and levels (GDD 7.1, 7.2, 6.2).
Pure TypeScript, no Phaser. The seeded Rng lives in the state, so the same seed
always gives the same fights.

M2/M3.1/M3.2/M6.1/M6.2 scope: hit/miss and damage via `core/combat`; XP and
level-ups via `core/progression` (+1.0 max HP per level, healed at once; +0.1
max damage every level; +0.1 min damage every 2nd level). A config is built
for one map tile (GDD 8.1/8.2) and lists every enemy species that can spawn
there; each new enemy rolls both a species (if the tile has more than one)
and a level within the tile's range (GDD 8.4), on its own Rng stream
(`enemyLevelRng`, like loot). Stats and XP scale with levels above each
species' own anchor level (`enemyStats`, `enemyXpAt`). When the enemy dies the
next search starts automatically and its (scaled) XP is granted, and the kill
is counted for its tile (`state.killsByTile`, used by `core/tiles` to unlock
the next one). `switchTile` moves the player to a different (unlocked) tile,
interrupting any search/fight (like Peace!) and rolling a fresh enemy there,
while keeping HP, progression, inventory and every tile's kill counts. HP
regenerates passively over time in `idle`/`searching`/`fighting` (GDD
6.1/7.1). When the squirrel is defeated (GDD 6.3, online death): she loses a
% of her current level's XP progress and spends a fixed time in the
`hideout` phase, returning to `idle` at full HP.

## Public API
- `createEncounterConfig(input)` – validated config from design values (seconds,
  1-decimal stats, whole percentages, one or more enemy species); see `core/content/encounterInput.ts`.
- `createEncounter(config, rng, tileId)` – new state in phase `idle`, squirrel at full HP, level 1, on `tileId`.
- `playerStats(config, level)` – the player's effective stats at `level` (base + level bonuses).
- `playerAttackIntervalMs(config, level, equipment?, weaponMode?)` – attack interval at `level` (×1.01 per level, min 0.5 s).
- `activeWeaponMode(state, config)` – weapon auto-switched for the current enemy (GDD 7.1, M7.3a):
  `flying` enemy (data `enemies.json`, default false) → ranged, none → fists; otherwise paws → ranged → fists.
- `fightingPlayer(state, config)` – stats + interval actually used in the fight (with that weapon mode).
- `playerHitMultiplier(state, config)` – 0.5 for fists vs a flying enemy (`fistsVsFlyingHitPct`), else 1.
- Ammo (GDD 7.3, M7.3b, `core/ammo`): `currentAmmo(state, config)` – `nuts` / `ground` for the next slingshot
  shot, null when it isn't the active weapon. Each shot (hit or miss) spends a nut from `state.wallet` while
  above `state.keepNuts`; ground pebbles are free, damage × `groundAmmoDamagePct` % (already in
  `fightingPlayer`). Player `attack` events carry `ammo` for slingshot shots.
  `setKeepNuts(state, n)` – the "keep at least N nuts" reserve (default `ammo.keepNutsDefault`); eating ignores it.
- `compareEquip` compares a ranged-slot item as it shoots (`ranged` mode), paw items in `melee` mode.
- `state.enemyId` / `state.enemyLevel` – species and level of the current (or next, while
  searching) enemy; level is rolled within `[config.enemyLevelMin, config.enemyLevelMax]`
  (GDD 8.4, the tile's own range); hit chance of both sides shifts 0.5 % per level of
  difference (GDD 7.2 v1.7).
- `enemyStats(config, enemyId, level)` / `enemyXpAt(config, enemyId, level)` – that species'
  effective stats/XP at `level` (GDD 8.4: +hpPctPerLevel/damagePctPerLevel/xpPctPerLevel/dodgePctPerLevel
  per level above its own `baseLevel`, dodge capped at `maxDodgePct`; crit is locked, not implemented yet).
- `enemyLootOf(config, enemyId)` – that species' own drop table and rarity weights (GDD 9.3/9.6
  v2.4, `core/loot` `EnemyLootTable`), e.g. for a pity countdown UI.
- `state.killsByTile` – kills so far per tile id (M6.2), read by `core/tiles` to unlock the next one.
- `switchTile(state, newConfig, tileId, unlockedTileIds)` – player picked a different tile on the
  map (event `tileSwitched { tileId }`); no-op if it's the current tile or not in `unlockedTileIds`.
- `hideoutProgress(state, config, extraMs?)` – 0..1 for a hideout recovery bar (0 outside `hideout`).
- `startSearch(state)` – player pressed **Find enemy** (only from `idle`).
- `makePeace(state)` – player pressed **Peace!**: from `searching` or `fighting` straight back to
  `idle` (event `peaceMade { from }`; the enemy leaves, no XP/loot, HP and level are kept). Does nothing while `idle`.
- `tick(state, config, mode?)` – `mode` = `'online'` (default) or `'offline'` (M9: a death costs no XP and after
  the hideout the search restarts by itself, GDD 6.3). Advances one 100 ms step, returns new state + events:
  `searchStarted`, `enemyFound`, `attack { attacker, hit, damage }`, `enemyDefeated`,
  `leveledUp { level }` (one per level gained), `playerDefeated { xpLost }`,
  `returnedFromHideout`, `peaceMade`.
- `searchProgress(state, config, extraMs?)`, `attackProgress(state, config, who, extraMs?)` – 0..1 values
  for UI bars. `extraMs` (default 0) is real time since the last tick (< 100 ms, from
  `consumeFrame`'s leftover `accumulatorMs`); it only smooths rendering between ticks
  and never changes the simulation.
- `hpFraction(state, config, who)` – 0..1 for HP bars (player's max HP reflects her current level).

## Rules
- All functions are pure (input state is never modified).
- Same-tick attacks: player first, then enemy; an enemy killed by that attack does not attack.
- A config is scoped to one tile; switching tiles means picking a different pre-built config
  (see `FightScene`), not something this module does on its own.

## Depends on
- `core/time` (`TICK_MS`, `secondsToMs`), `core/combat`, `core/progression`, `core/loot`, `core/inventory`, `core/stats`, `core/ammo`, `core/numbers` (`toHundredths`/`fromHundredths`), `core/rng` (types).

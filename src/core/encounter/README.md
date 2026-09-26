# core/encounter

Searching for an enemy and a 1v1 fight with HP, XP and levels (GDD 7.1, 7.2, 6.2).
Pure TypeScript, no Phaser. The seeded Rng lives in the state, so the same seed
always gives the same fights.

M2/M3.1/M3.2 scope: hit/miss and damage via `core/combat`; XP and level-ups via
`core/progression` (+1.0 max HP per level, healed at once; +0.1 max damage
every level; +0.1 min damage every 2nd level). When the enemy dies the next
search starts automatically and its XP is granted. HP regenerates passively
over time in `idle`/`searching`/`fighting` (GDD 6.1/7.1). When the squirrel is
defeated (GDD 6.3, online death): she loses a % of her current level's XP
progress and spends a fixed time in the `hideout` phase, returning to `idle`
at full HP. M3.2 placeholder: no map yet, so she just reappears - the player
cannot pick a tile.

## Public API
- `createEncounterConfig(input)` – validated config from design values (seconds,
  1-decimal stats, whole percentages, enemy XP); see `core/content/encounterInput.ts`.
- `createEncounter(config, rng)` – new state in phase `idle`, squirrel at full HP, level 1.
- `playerStats(config, level)` – the player's effective stats at `level` (base + level bonuses).
- `playerAttackIntervalMs(config, level)` – attack interval at `level` (×1.01 per level, min 0.5 s).
- `config.enemyLevel` – enemy level (GDD 8.4), fixed to its base level until the map (M6);
  hit chance of both sides shifts 0.5 % per level of difference (GDD 7.2 v1.7).
- `hideoutProgress(state, config, extraMs?)` – 0..1 for a hideout recovery bar (0 outside `hideout`).
- `startSearch(state)` – player pressed **Find enemy** (only from `idle`).
- `makePeace(state)` – player pressed **Peace!**: from `searching` or `fighting` straight back to
  `idle` (event `peaceMade { from }`; the enemy leaves, no XP/loot, HP and level are kept). Does nothing while `idle`.
- `tick(state, config)` – advances one 100 ms step, returns new state + events:
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

## Depends on
- `core/time` (`TICK_MS`, `secondsToMs`), `core/combat`, `core/progression`, `core/numbers` (`toHundredths`/`fromHundredths`), `core/rng` (types).

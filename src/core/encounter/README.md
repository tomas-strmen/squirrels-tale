# core/encounter

Searching for an enemy and a 1v1 fight with HP, XP and levels (GDD 7.1, 7.2, 6.2).
Pure TypeScript, no Phaser. The seeded Rng lives in the state, so the same seed
always gives the same fights.

M2/M3.1 scope: hit/miss and damage via `core/combat`; XP and level-ups via
`core/progression` (+1.0 max HP per level, healed at once; +0.1 max damage
every level; +0.1 min damage every 2nd level). When the enemy dies the
next search starts automatically and its XP is granted. When the squirrel is
defeated she is back to full HP in `idle` (placeholder until real death in
M3.2). No regeneration yet.

## Public API
- `createEncounterConfig(input)` – validated config from design values (seconds,
  1-decimal stats, whole percentages, enemy XP); see `core/content/encounterInput.ts`.
- `createEncounter(config, rng)` – new state in phase `idle`, squirrel at full HP, level 1.
- `playerStats(config, level)` – the player's effective stats at `level` (base + level bonuses).
- `startSearch(state)` – player pressed **Find enemy** (only from `idle`).
- `makePeace(state)` – player pressed **Peace!**: from `searching` or `fighting` straight back to
  `idle` (event `peaceMade { from }`; the enemy leaves, no XP/loot, HP and level are kept). Does nothing while `idle`.
- `tick(state, config)` – advances one 100 ms step, returns new state + events:
  `searchStarted`, `enemyFound`, `attack { attacker, hit, damage }`, `enemyDefeated`,
  `leveledUp { level }` (one per level gained), `playerDefeated`, `peaceMade`.
- `searchProgress(state, config, extraMs?)`, `attackProgress(state, config, who, extraMs?)` – 0..1 values
  for UI bars. `extraMs` (default 0) is real time since the last tick (< 100 ms, from
  `consumeFrame`'s leftover `accumulatorMs`); it only smooths rendering between ticks
  and never changes the simulation.
- `hpFraction(state, config, who)` – 0..1 for HP bars (player's max HP reflects her current level).

## Rules
- All functions are pure (input state is never modified).
- Same-tick attacks: player first, then enemy; an enemy killed by that attack does not attack.

## Depends on
- `core/time` (`TICK_MS`, `secondsToMs`), `core/combat`, `core/progression`, `core/numbers`, `core/rng` (types).

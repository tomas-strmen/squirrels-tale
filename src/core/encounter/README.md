# core/encounter

Searching for an enemy and the attack rhythm of a 1v1 fight (GDD 2, 7.1).
Pure TypeScript, no Phaser. M0.1 scope: no HP or damage, the fight repeats forever.

## Public API
- `createEncounterConfig(input)` – builds a validated config from design seconds (`data/*.json`).
- `createEncounter()` – new state in phase `idle`.
- `startSearch(state)` – player pressed **Find enemy** (only from `idle`).
- `makePeace(state)` – player pressed **Peace!**: from `searching` or `fighting` straight back to `idle`
  (event `peaceMade { from }`; the enemy leaves, no XP/loot). Does nothing while `idle`.
- `tick(state, config)` – advances one 100 ms step, returns new state + events
  (`searchStarted`, `enemyFound`, `attack { attacker }`).
- `searchProgress(state, config, extraMs?)`, `attackProgress(state, config, who, extraMs?)` – 0..1 values
  for UI bars. `extraMs` (default 0) is real time since the last tick (< 100 ms, from
  `consumeFrame`'s leftover `accumulatorMs`); it only smooths rendering between ticks
  and never changes the simulation.

## Rules
- All functions are pure (input state is never modified).
- Same-tick attacks: player first, then enemy.

## Depends on
- `core/time` (`TICK_MS`, `secondsToMs`).

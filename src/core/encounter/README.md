# core/encounter

Searching for an enemy and the attack rhythm of a 1v1 fight (GDD 2, 7.1).
Pure TypeScript, no Phaser. M0.1 scope: no HP or damage, the fight repeats forever.

## Public API
- `createEncounterConfig(input)` – builds a validated config from design seconds (`data/*.json`).
- `createEncounter()` – new state in phase `idle`.
- `startSearch(state)` – player pressed **Find enemy** (only from `idle`).
- `tick(state, config)` – advances one 100 ms step, returns new state + events
  (`searchStarted`, `enemyFound`, `attack { attacker }`).
- `searchProgress(...)`, `attackProgress(...)` – 0..1 values for UI bars.

## Rules
- All functions are pure (input state is never modified).
- Same-tick attacks: player first, then enemy.

## Depends on
- `core/time` (`TICK_MS`, `secondsToMs`).

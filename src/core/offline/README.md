# core/offline

Offline progress (GDD 17, M9). Pure TypeScript, no Phaser; `FightScene.catchUp` calls it when a save
is loaded (and for the debug "Skip +1 h / +3 h").

The time away is **simulated with the real fight rules** (`core/encounter` `tick(state, config, 'offline')`)
instead of estimating a time-to-kill: 6 h = 216 000 steps, well under a second. Food, ammo, loot,
pity and level-ups therefore work exactly as online and the result is deterministic (seeded Rng).

Rules (GDD 6.3, 17.2): in Peace! she only regenerates; farming, a death costs no XP, 10 s in the
hideout, then the search continues on the same tile; if she died at least once the tile is not
sustainable and she farms at half pace (simulated for half the time; deaths/hideout time are
reported from the full-length run). Boosts don't run offline (the auto-food unlock just runs out).

## Public API
- `createOfflineConfig({ capH, clockToleranceMin, minSummaryS })` (`data/balance.json` `offline`).
- `offlineMs(savedAt, maxSeenTime, now, config)` – time to catch up: `now − savedAt`, capped (6 h), whole
  100 ms steps; 0 if the clock is more than `clockToleranceMin` behind `maxSeenTime` (GDD 17.3).
- `simulateOffline(state, config, awayMs, farming)` → `{ state, summary }` – state is always `idle`
  (the caller restarts the search if `farming`); `summary` = kills, XP, levels, currencies found,
  items (and items lost to a full bag), food eaten, nuts shot, deaths, hideout time, half pace.

## Depends on
`core/encounter`, `core/currency`, `core/food`, `core/loot` (types), `core/time`.

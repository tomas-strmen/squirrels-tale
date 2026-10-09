# core/save

Save game (GDD 19, M8). Pure TypeScript, no Phaser; the browser glue is `src/game/SaveManager.ts`.

One versioned JSON object (`SaveData`, format `SAVE_VERSION` = 1, validated by `saveSchema`):
`{ version, createdAt, savedAt, maxSeenTime, rngState, player, inventory, stash, tiles, boosts, settings, stats, pity }`.
After loading, the squirrel is on the saved tile in phase `idle` (a fight or a hideout stay is not
restored; offline progress comes with M9). All four Rng streams are saved, so a reloaded game
plays on exactly like the one that was saved.

**Changing the format:** bump `SAVE_VERSION`, update `saveSchema` + `SaveData`, add
`MIGRATIONS[oldVersion]` (old object -> new object) and a test that loads a save in the old format.
An old save must always load (CLAUDE.md).

## Public API
- `snapshot(state, { createdAt, now, maxSeenTime, playTimeMs })` → `SaveData` (`maxSeenTime` never decreases, GDD 17.3).
- `restore(config, data)` → `EncounterState` (idle; HP capped at max HP, 0 HP → full; a next enemy the
  tile no longer spawns is rerolled).
- `parseSave(text, migrations?, targetVersion?, schema?)` → `SaveData`; JSON → migrations → zod. Throws `SaveError`
  (not JSON, no/newer version, missing migration, invalid content).
- `writeSave(storage, data)` / `loadSave(storage)` / `clearSave(storage)` – two slots (`SAVE_KEYS.current`,
  `SAVE_KEYS.previous`): a write moves a readable current save to previous; loading falls back to previous
  when current is corrupt. `SaveStorage` = the `getItem/setItem/removeItem` part of `localStorage`.

## Depends on
`core/encounter` (`createEncounter`, `playerStats`), `core/content` (schemas), `core/inventory`, `core/loot`,
`core/currency`, `core/rng` (types), `zod`.

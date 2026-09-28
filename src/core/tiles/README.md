# core/tiles

Map tiles (GDD 8.1/8.2, M6.2): which ones are unlocked, given how many kills
the squirrel has on each tile so far. Pure TypeScript, no Phaser.

The array order in `data/tiles.json` is the map order (T1, T2, ...). The
first tile is always unlocked; every later tile needs `unlockKills` kills on
the tile right before it in that order - not a running total across the
whole map. A tile may also set `unlockLevel` (GDD 8.2, e.g. a future T4:
30 kills + Lv 5) - both conditions must hold. Boss/quest gates aren't
modeled yet (come with a later tile).

## Public API
- `isTileUnlocked(tiles, killsByTile, playerLevel, tileId)` - whether a tile can be selected right now.
- `unlockedTileIds(tiles, killsByTile, playerLevel)` - a `Set` of every unlocked tile id, for the tile picker UI.
- `killsToUnlock(tiles, killsByTile, tileId)` - kills still needed on the previous tile (0 once unlocked), for a "🔒 N kills" label. Ignores `unlockLevel`.

`killsByTile` comes from `EncounterState.killsByTile` (`core/encounter`), keyed by tile id.

## Depends on
- `core/content` (`TileData`, `parseTiles`).

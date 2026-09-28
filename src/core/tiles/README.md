# core/tiles

Map tiles (GDD 8.1/8.2, M6.2): which ones are unlocked, given how many kills
the squirrel has on each tile so far. Pure TypeScript, no Phaser.

The array order in `data/tiles.json` is the map order (T1, T2, ...). The
first tile is always unlocked; every later tile needs `unlockKills` kills on
the tile right before it in that order - not a running total across the
whole map, and not level/boss/quest gates yet (those come with later tiles
in a future step).

## Public API
- `isTileUnlocked(tiles, killsByTile, tileId)` - whether a tile can be selected right now.
- `unlockedTileIds(tiles, killsByTile)` - a `Set` of every unlocked tile id, for the tile picker UI.
- `killsToUnlock(tiles, killsByTile, tileId)` - kills still needed on the previous tile (0 once unlocked), for a "🔒 N kills" label.

`killsByTile` comes from `EncounterState.killsByTile` (`core/encounter`), keyed by tile id.

## Depends on
- `core/content` (`TileData`, `parseTiles`).

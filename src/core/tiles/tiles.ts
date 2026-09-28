/**
 * Map tiles (GDD 8.1/8.2, M6.2): which ones are unlocked, given how many kills
 * the squirrel has on each tile so far. Pure TypeScript, no Phaser - just reads
 * `data/tiles.json` (validated by `core/content`) and a kill-count map.
 *
 * The array order in `data/tiles.json` is the map order. The first tile is
 * always unlocked; every later tile needs `unlockKills` kills on the tile
 * right before it in that order (not a running total across the whole map).
 */
import type { TileData } from '../content/schemas';

/** Whether `tileId` is unlocked given kills so far on each tile visited and the player's level. */
export function isTileUnlocked(
  tiles: readonly TileData[],
  killsByTile: Readonly<Record<string, number>>,
  playerLevel: number,
  tileId: string,
): boolean {
  const index = tiles.findIndex((t) => t.id === tileId);
  if (index <= 0) return index === 0;
  const previous = tiles[index - 1];
  const tile = tiles[index];
  if (!previous || !tile) return false;
  if (tile.unlockLevel !== undefined && playerLevel < tile.unlockLevel) return false;
  return (killsByTile[previous.id] ?? 0) >= tile.unlockKills;
}

/** Ids of every currently unlocked tile, in map order. */
export function unlockedTileIds(
  tiles: readonly TileData[],
  killsByTile: Readonly<Record<string, number>>,
  playerLevel: number,
): ReadonlySet<string> {
  return new Set(tiles.filter((t) => isTileUnlocked(tiles, killsByTile, playerLevel, t.id)).map((t) => t.id));
}

/** Kills still needed on the previous tile to unlock `tileId` (0 once it's unlocked). Ignores `unlockLevel`. */
export function killsToUnlock(
  tiles: readonly TileData[],
  killsByTile: Readonly<Record<string, number>>,
  tileId: string,
): number {
  const index = tiles.findIndex((t) => t.id === tileId);
  if (index <= 0) return 0;
  const previous = tiles[index - 1];
  const tile = tiles[index];
  if (!previous || !tile) return 0;
  return Math.max(0, tile.unlockKills - (killsByTile[previous.id] ?? 0));
}

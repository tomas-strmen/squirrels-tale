import { describe, expect, it } from 'vitest';
import { isTileUnlocked, killsToUnlock, unlockedTileIds } from './tiles';

const t1 = { id: 't1', tier: 1, enemyIds: ['worker_ant'], enemyLevelMin: 1, enemyLevelMax: 2, unlockKills: 0 };
const t2 = { id: 't2', tier: 2, enemyIds: ['worker_ant', 'pill_bug'], enemyLevelMin: 2, enemyLevelMax: 4, unlockKills: 8 };
const t3 = { id: 't3', tier: 3, enemyIds: ['armed_ant'], enemyLevelMin: 4, enemyLevelMax: 6, unlockKills: 30 };
const tiles = [t1, t2, t3];

describe('isTileUnlocked (GDD 8.2, M6.2)', () => {
  it('the first tile is always unlocked', () => {
    expect(isTileUnlocked(tiles, {}, 't1')).toBe(true);
  });

  it('a later tile is locked until enough kills on the previous one', () => {
    expect(isTileUnlocked(tiles, {}, 't2')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 7 }, 't2')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 8 }, 't2')).toBe(true);
    expect(isTileUnlocked(tiles, { t1: 100 }, 't2')).toBe(true);
  });

  it('kills on a tile do not unlock a tile further ahead (must go through t2 first)', () => {
    expect(isTileUnlocked(tiles, { t1: 100 }, 't3')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 100, t2: 29 }, 't3')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 100, t2: 30 }, 't3')).toBe(true);
  });

  it('an unknown tile id is never unlocked', () => {
    expect(isTileUnlocked(tiles, {}, 'nope')).toBe(false);
  });
});

describe('unlockedTileIds', () => {
  it('lists only the unlocked ones, in map order', () => {
    expect(unlockedTileIds(tiles, {})).toEqual(new Set(['t1']));
    expect(unlockedTileIds(tiles, { t1: 8 })).toEqual(new Set(['t1', 't2']));
    expect(unlockedTileIds(tiles, { t1: 8, t2: 30 })).toEqual(new Set(['t1', 't2', 't3']));
  });
});

describe('killsToUnlock', () => {
  it('is 0 for the first tile and once a tile is unlocked', () => {
    expect(killsToUnlock(tiles, {}, 't1')).toBe(0);
    expect(killsToUnlock(tiles, { t1: 8 }, 't2')).toBe(0);
    expect(killsToUnlock(tiles, { t1: 50 }, 't2')).toBe(0);
  });

  it('counts down remaining kills on the previous tile', () => {
    expect(killsToUnlock(tiles, {}, 't2')).toBe(8);
    expect(killsToUnlock(tiles, { t1: 3 }, 't2')).toBe(5);
  });
});

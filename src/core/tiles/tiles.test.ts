import { describe, expect, it } from 'vitest';
import { isTileUnlocked, killsToUnlock, unlockedTileIds } from './tiles';

const t1 = { id: 't1', tier: 1, spawns: [{ enemyId: 'worker_ant', weight: 1 }], enemyLevelMin: 1, enemyLevelMax: 2, unlockKills: 0 };
const t2 = { id: 't2', tier: 2, spawns: [{ enemyId: 'worker_ant', weight: 1 }, { enemyId: 'pill_bug', weight: 1 }], enemyLevelMin: 2, enemyLevelMax: 4, unlockKills: 8 };
const t3 = {
  id: 't3',
  tier: 3,
  spawns: [{ enemyId: 'armed_ant', weight: 1 }, { enemyId: 'worker_ant', weight: 1 }],
  enemyLevelMin: 4,
  enemyLevelMax: 6,
  unlockKills: 15,
};
const t4 = {
  id: 't4',
  tier: 4,
  spawns: [{ enemyId: 'armed_ant', weight: 1 }],
  enemyLevelMin: 6,
  enemyLevelMax: 8,
  unlockKills: 30,
  unlockLevel: 5,
};
const tiles = [t1, t2, t3, t4];

describe('isTileUnlocked (GDD 8.2, M6.2)', () => {
  it('the first tile is always unlocked', () => {
    expect(isTileUnlocked(tiles, {}, 1, 't1')).toBe(true);
  });

  it('a later tile is locked until enough kills on the previous one', () => {
    expect(isTileUnlocked(tiles, {}, 1, 't2')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 7 }, 1, 't2')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 8 }, 1, 't2')).toBe(true);
    expect(isTileUnlocked(tiles, { t1: 100 }, 1, 't2')).toBe(true);
  });

  it('kills on a tile do not unlock a tile further ahead (must go through t2 first)', () => {
    expect(isTileUnlocked(tiles, { t1: 100 }, 1, 't3')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 100, t2: 14 }, 1, 't3')).toBe(false);
    expect(isTileUnlocked(tiles, { t1: 100, t2: 15 }, 1, 't3')).toBe(true);
  });

  it('an unknown tile id is never unlocked', () => {
    expect(isTileUnlocked(tiles, {}, 1, 'nope')).toBe(false);
  });

  it('a tile with unlockLevel also needs the player at that level (GDD 8.2, e.g. T3->T4)', () => {
    const enoughKills = { t1: 100, t2: 100, t3: 30 };
    expect(isTileUnlocked(tiles, enoughKills, 4, 't4')).toBe(false);
    expect(isTileUnlocked(tiles, enoughKills, 5, 't4')).toBe(true);
    expect(isTileUnlocked(tiles, { ...enoughKills, t3: 29 }, 5, 't4')).toBe(false);
  });
});

describe('unlockedTileIds', () => {
  it('lists only the unlocked ones, in map order', () => {
    expect(unlockedTileIds(tiles, {}, 1)).toEqual(new Set(['t1']));
    expect(unlockedTileIds(tiles, { t1: 8 }, 1)).toEqual(new Set(['t1', 't2']));
    expect(unlockedTileIds(tiles, { t1: 8, t2: 15 }, 1)).toEqual(new Set(['t1', 't2', 't3']));
    expect(unlockedTileIds(tiles, { t1: 8, t2: 15, t3: 30 }, 1)).toEqual(new Set(['t1', 't2', 't3']));
    expect(unlockedTileIds(tiles, { t1: 8, t2: 15, t3: 30 }, 5)).toEqual(new Set(['t1', 't2', 't3', 't4']));
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

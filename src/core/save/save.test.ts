import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import tilesData from '../../../data/tiles.json';
import { toEncounterConfigInput } from '../content/encounterInput';
import { parseAffixes, parseBalance, parseEnemies, parseItems, parseRarities, parseTiles } from '../content/schemas';
import {
  createEncounter,
  createEncounterConfig,
  makePeace,
  playerStats,
  setKeepNuts,
  startSearch,
  tick,
  type EncounterConfig,
  type EncounterState,
} from '../encounter/encounter';
import { createRng } from '../rng/rng';
import {
  clearSave,
  loadSave,
  parseSave,
  restore,
  SAVE_KEYS,
  SAVE_VERSION,
  SaveError,
  UNREADABLE_KEYS,
  backupUnreadable,
  snapshot,
  writeSave,
  type SaveData,
  type SaveStorage,
} from './save';

const tiles = parseTiles(tilesData);
const lootData = { items: parseItems(itemsData), rarities: parseRarities(raritiesData), affixes: parseAffixes(affixesData) };
function configOf(tileId: string): EncounterConfig {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error(tileId);
  return createEncounterConfig(toEncounterConfigInput(parseBalance(balanceData), tile, parseEnemies(enemiesData), lootData));
}
const t1 = configOf('t1');
const meta = { createdAt: 1000, now: 5000, maxSeenTime: 0, playTimeMs: 1234 };

function runTicks(state: EncounterState, cfg: EncounterConfig, n: number): EncounterState {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s, cfg).state;
  return s;
}

/** A game that has been played a while (kills, XP, coins, maybe items), stopped with Peace!. */
function played(): EncounterState {
  const s = runTicks(startSearch(createEncounter(t1, createRng(42), 't1')).state, t1, 6000);
  return makePeace(setKeepNuts(s, 7)).state;
}

function memoryStorage(): SaveStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('save round trip (GDD 19, M8.1)', () => {
  it('snapshot -> JSON -> parse -> restore keeps the progress', () => {
    const state = played();
    expect(state.progression.level).toBeGreaterThan(1);
    const data = parseSave(JSON.stringify(snapshot(state, meta)));
    const back = restore(t1, data);
    expect(back.phase).toBe('idle');
    expect(back.progression).toEqual(state.progression);
    expect(back.playerHp).toBe(state.playerHp);
    expect(back.wallet).toEqual(state.wallet);
    expect(back.inventory).toEqual(state.inventory);
    expect(back.killsByTile).toEqual(state.killsByTile);
    expect(back.loot).toEqual(state.loot);
    expect(back.keepNuts).toBe(7);
    expect(back.enemyId).toBe(state.enemyId);
    expect(back.enemyLevel).toBe(state.enemyLevel);
    expect(data.stats.playTimeMs).toBe(1234);
  });

  it('a reloaded game plays on exactly like the one that was saved (same Rng streams)', () => {
    const state = played();
    const back = restore(t1, parseSave(JSON.stringify(snapshot(state, meta))));
    const a = runTicks(startSearch(state).state, t1, 3000);
    const b = runTicks(startSearch(back).state, t1, 3000);
    expect(b).toEqual(a);
  });

  it('keeps the highest clock time ever seen (GDD 17.3)', () => {
    expect(snapshot(played(), { ...meta, now: 5000, maxSeenTime: 9000 }).maxSeenTime).toBe(9000);
    expect(snapshot(played(), { ...meta, now: 9500, maxSeenTime: 9000 }).maxSeenTime).toBe(9500);
  });

  it('restore caps HP at max HP and comes back from a 0 HP (hideout) save at full HP', () => {
    const state = played();
    const max = playerStats(t1, state.progression.level, state.inventory.equipment).maxHp;
    const data = snapshot(state, meta);
    expect(restore(t1, { ...data, player: { ...data.player, hp: max + 500 } }).playerHp).toBe(max);
    expect(restore(t1, { ...data, player: { ...data.player, hp: 0 } }).playerHp).toBe(max);
  });

  it('rerolls a saved next enemy the tile no longer spawns', () => {
    const data = snapshot(played(), meta);
    const back = restore(t1, { ...data, tiles: { ...data.tiles, enemyId: 'gone_bug' } });
    expect(back.enemyId).toBe('worker_ant');
  });

  it('restores on the saved tile', () => {
    const t2 = configOf('t2');
    const onT2 = { ...createEncounter(t2, createRng(1), 't2'), killsByTile: { t1: 8 } };
    const back = restore(t2, parseSave(JSON.stringify(snapshot(onT2, meta))));
    expect(back.tileId).toBe('t2');
    expect(back.killsByTile).toEqual({ t1: 8 });
  });
});

describe('parseSave: versions, migrations, corrupt saves', () => {
  const good = JSON.stringify(snapshot(played(), meta));

  it('reads the current version', () => {
    expect(parseSave(good).version).toBe(SAVE_VERSION);
  });

  it('rejects broken text, a missing/newer version and invalid content', () => {
    expect(() => parseSave('{not json')).toThrow(SaveError);
    expect(() => parseSave('[]')).toThrow(SaveError);
    expect(() => parseSave(JSON.stringify({ ...JSON.parse(good), version: undefined }))).toThrow(SaveError);
    expect(() => parseSave(JSON.stringify({ ...JSON.parse(good), version: SAVE_VERSION + 1 }))).toThrow(/newer/);
    expect(() => parseSave(JSON.stringify({ ...JSON.parse(good), player: undefined }))).toThrow(SaveError);
    expect(() => parseSave(JSON.stringify({ ...JSON.parse(good), stash: { nuts: -1 } }))).toThrow(SaveError);
  });

  it('migrates an old version up step by step (example: a future v2 adds a setting)', () => {
    const v2Schema = z.object({
      version: z.literal(2),
      settings: z.object({ keepNuts: z.number(), autoEatBelowPct: z.number() }),
    });
    const migrations = {
      1: (old: Record<string, unknown>) => ({
        ...old,
        settings: { ...(old.settings as object), autoEatBelowPct: 40 },
      }),
    };
    const v2 = parseSave(good, migrations, 2, v2Schema) as unknown as z.infer<typeof v2Schema>;
    expect(v2.version).toBe(2);
    expect(v2.settings).toEqual({ keepNuts: 7, autoEatBelowPct: 40 });
    // No migration path -> can't read it.
    expect(() => parseSave(good, {}, 2, v2Schema)).toThrow(/No migration/);
  });
});

describe('save slots (GDD 19: current + previous)', () => {
  const first: SaveData = snapshot(played(), meta);
  const second: SaveData = { ...first, savedAt: 9999 };

  it('a new write moves the old current save to previous', () => {
    const storage = memoryStorage();
    expect(loadSave(storage)).toBeNull();
    writeSave(storage, first);
    writeSave(storage, second);
    expect(loadSave(storage)?.data.savedAt).toBe(9999);
    expect(parseSave(storage.map.get(SAVE_KEYS.previous) ?? '').savedAt).toBe(5000);
  });

  it('a corrupt current slot falls back to previous, and never overwrites it', () => {
    const storage = memoryStorage();
    writeSave(storage, first);
    writeSave(storage, second);
    storage.setItem(SAVE_KEYS.current, '{"broken');
    expect(loadSave(storage)).toEqual({ data: parseSave(JSON.stringify(first)), slot: 'previous' });
    writeSave(storage, { ...first, savedAt: 7777 });
    expect(parseSave(storage.map.get(SAVE_KEYS.previous) ?? '').savedAt).toBe(5000);
    expect(loadSave(storage)?.data.savedAt).toBe(7777);
  });

  it('unreadable saves are copied aside before a new game could overwrite them', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEYS.current, '{"version":99}');
    storage.setItem(SAVE_KEYS.previous, 'garbage');
    expect(loadSave(storage)).toBeNull();
    expect(backupUnreadable(storage)).toBe(2);
    expect(storage.map.get(UNREADABLE_KEYS.current)).toBe('{"version":99}');
    expect(storage.map.get(UNREADABLE_KEYS.previous)).toBe('garbage');
    // A second call keeps the first copy; readable saves are never copied.
    storage.setItem(SAVE_KEYS.current, 'other garbage');
    writeSave(storage, first);
    expect(backupUnreadable(storage)).toBe(0);
    expect(storage.map.get(UNREADABLE_KEYS.current)).toBe('{"version":99}');
  });

  it('clearSave deletes both slots', () => {
    const storage = memoryStorage();
    writeSave(storage, first);
    writeSave(storage, second);
    clearSave(storage);
    expect(storage.map.size).toBe(0);
    expect(loadSave(storage)).toBeNull();
  });
});

/**
 * Save game (GDD 19, M8): one versioned JSON object, migrations, two slots.
 *
 * - `snapshot(state, meta)` turns the running encounter into a plain `SaveData`
 *   object; `restore(config, data)` turns it back into an `EncounterState`
 *   (always in phase `idle` - a fight or hideout stay doesn't survive a reload).
 * - `parseSave(text)` reads a saved string: JSON -> migrate old versions up to
 *   `SAVE_VERSION` -> validate with zod. Anything unreadable throws `SaveError`.
 * - `writeSave` / `loadSave` keep two slots (current + previous) in a
 *   `SaveStorage` (localStorage in the browser): a corrupt current slot falls
 *   back to the previous one.
 *
 * Save must never break (CLAUDE.md): a format change = SAVE_VERSION + 1, a new
 * entry in MIGRATIONS and a test that loads the old format.
 */
import { z } from 'zod';
import { CURRENCY_IDS, itemSlotSchema, statIdSchema } from '../content/schemas';
import type { Wallet } from '../currency/currency';
import { createEncounter, playerStats, type EncounterConfig, type EncounterState } from '../encounter/encounter';
import { EQUIP_SLOTS, type Equipment } from '../inventory/inventory';
import type { Item, LootState } from '../loot/loot';
import type { MerchantState } from '../merchant/merchant';
import type { RngState } from '../rng/rng';

export const SAVE_VERSION = 3;

/** localStorage keys of the two slots (GDD 19: current + previous, in case one gets corrupted). */
export const SAVE_KEYS = { current: 'squirrels-tale.save.current', previous: 'squirrels-tale.save.previous' } as const;
/** Where unreadable saves are copied before a new game can overwrite them (never deleted automatically). */
export const UNREADABLE_KEYS = {
  current: 'squirrels-tale.save.unreadable.current',
  previous: 'squirrels-tale.save.unreadable.previous',
} as const;

const num = z.number().finite();
const int = z.number().int();
const rngSchema = z.object({ seed: int });

const itemSchema = z.object({
  uid: int,
  baseId: z.string(),
  slot: itemSlotSchema,
  tier: int,
  rarityId: z.string(),
  weapon: z.object({ damageMin: num, damageMax: num, attackIntervalModMs: num }).nullable(),
  stats: z.array(z.object({ stat: statIdSchema, value: num })),
  affixes: z.array(z.object({ id: z.string(), stat: statIdSchema, value: num })),
  locked: z.boolean().optional(),
});

const equipmentSchema = z.object(
  Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, itemSchema.nullable()])) as Record<
    (typeof EQUIP_SLOTS)[number],
    z.ZodNullable<typeof itemSchema>
  >,
);

const walletSchema = z.object(
  Object.fromEntries(CURRENCY_IDS.map((id) => [id, int.min(0)])) as Record<(typeof CURRENCY_IDS)[number], z.ZodNumber>,
);

/**
 * Save format (GDD 19 field names where they exist). Times are ms since epoch / ms durations.
 * v1 (M8.1). v2 (M9.1): `tiles.farming`. v3 (M10): `merchant`.
 */
export const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: num,
  savedAt: num,
  /** Highest clock time ever seen (GDD 17.3) - offline progress (M9) never trusts a clock that went back. */
  maxSeenTime: num,
  rngState: z.object({ combat: rngSchema, loot: rngSchema, currency: rngSchema, enemyLevel: rngSchema }),
  /** XP in hundredths of the current level, HP in hundredths. */
  player: z.object({ level: int.min(1), xp: num.min(0), hp: num.min(0) }),
  inventory: z.object({ bag: z.array(itemSchema), equipment: equipmentSchema }),
  /** Currencies and food (GDD 11.1, 7.4). */
  stash: walletSchema,
  tiles: z.object({
    current: z.string(),
    killsByTile: z.record(z.string(), int.min(0)),
    /** The next enemy (already rolled), so a reload doesn't reroll it. */
    enemyId: z.string(),
    enemyLevel: int.min(1),
    /** v2: she was searching/fighting (farms offline, GDD 17.2) - false = Peace!, only regenerates. */
    farming: z.boolean(),
  }),
  boosts: z.object({ autoFoodMsLeft: num.min(0), eatCooldownMs: num.min(0) }),
  settings: z.object({ keepNuts: int.min(0) }),
  stats: z.object({ playTimeMs: num.min(0) }),
  /** Pity counters + next item uid (GDD 9.6). */
  pity: z.object({ pityCounters: z.record(z.string(), int.min(0)), nextUid: int.min(1) }),
  /** v3: the Magpie's stock of the day (GDD 11.2). day -1 = roll a new one. */
  merchant: z.object({ day: int, stock: z.array(itemSchema), rng: rngSchema }),
});

/** The save format as TypeScript (kept in sync with `saveSchema`; JSON never holds `undefined`). */
export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly createdAt: number;
  readonly savedAt: number;
  readonly maxSeenTime: number;
  readonly rngState: { readonly combat: RngState; readonly loot: RngState; readonly currency: RngState; readonly enemyLevel: RngState };
  readonly player: { readonly level: number; readonly xp: number; readonly hp: number };
  readonly inventory: { readonly bag: readonly Item[]; readonly equipment: Equipment };
  readonly stash: Wallet;
  readonly tiles: {
    readonly current: string;
    readonly killsByTile: Readonly<Record<string, number>>;
    readonly enemyId: string;
    readonly enemyLevel: number;
    readonly farming: boolean;
  };
  readonly boosts: { readonly autoFoodMsLeft: number; readonly eatCooldownMs: number };
  readonly settings: { readonly keepNuts: number };
  readonly stats: { readonly playTimeMs: number };
  readonly pity: LootState;
  readonly merchant: MerchantState;
}

/** One migration: a save of version N (already JSON-parsed) -> the same save in version N + 1. */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] upgrades version n to n + 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 -> v2 (M9.1): `tiles.farming`. v1 didn't know - start in Peace! (safe: no offline fights).
  1: (old) => ({ ...old, tiles: { ...(old.tiles as Record<string, unknown>), farming: false } }),
  // v2 -> v3 (M10): no merchant yet - empty stock (rolled on the next check), own Rng from the combat seed.
  2: (old) => {
    const rng = old.rngState as { combat?: { seed?: unknown } } | undefined;
    const seed = typeof rng?.combat?.seed === 'number' ? rng.combat.seed : 0;
    return { ...old, merchant: { day: -1, stock: [], rng: { seed: (seed ^ 0x2545f491) | 0 } } };
  },
};

export class SaveError extends Error {}

/**
 * Reads a saved string: JSON, then migrations from its version up to `targetVersion`, then
 * validation. Throws SaveError if it can't be read (corrupt, unknown/newer version, invalid).
 */
export function parseSave(
  text: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  targetVersion: number = SAVE_VERSION,
  schema: z.ZodType = saveSchema,
): SaveData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('Save is not valid JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SaveError('Save is not an object');
  let obj = data as Record<string, unknown>;
  let version = obj.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new SaveError('Save has no version');
  if (version > targetVersion) throw new SaveError(`Save version ${version} is newer than this game (${targetVersion})`);
  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate) throw new SaveError(`No migration from save version ${version}`);
    obj = { ...migrate(obj), version: version + 1 };
    version += 1;
  }
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw new SaveError(`Save is invalid: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  return parsed.data as SaveData;
}

export interface SnapshotMeta {
  /** When this save was first created (kept across saves). */
  readonly createdAt: number;
  /** Current clock time. */
  readonly now: number;
  /** maxSeenTime from the previous save (0 for a new game). */
  readonly maxSeenTime: number;
  readonly playTimeMs: number;
}

/** The running encounter as a save object (GDD 19). */
export function snapshot(state: EncounterState, meta: SnapshotMeta): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: meta.createdAt,
    savedAt: meta.now,
    maxSeenTime: Math.max(meta.maxSeenTime, meta.now),
    rngState: { combat: state.rng, loot: state.lootRng, currency: state.currencyRng, enemyLevel: state.enemyLevelRng },
    player: { level: state.progression.level, xp: state.progression.xp, hp: state.playerHp },
    inventory: { bag: state.inventory.bag, equipment: state.inventory.equipment },
    stash: { ...state.wallet },
    tiles: {
      current: state.tileId,
      killsByTile: { ...state.killsByTile },
      enemyId: state.enemyId,
      enemyLevel: state.enemyLevel,
      farming: state.phase === 'searching' || state.phase === 'fighting',
    },
    boosts: { autoFoodMsLeft: state.autoFoodMsLeft, eatCooldownMs: state.eatCooldownMs },
    settings: { keepNuts: state.keepNuts },
    stats: { playTimeMs: meta.playTimeMs },
    pity: { pityCounters: { ...state.loot.pityCounters }, nextUid: state.loot.nextUid },
    merchant: state.merchant,
  };
}

/**
 * A save back as a running encounter on `config` (the config of `data.tiles.current`), in phase
 * `idle`. HP is capped at the max HP (data may have changed since); a saved next enemy that this
 * tile no longer spawns is rerolled.
 */
export function restore(config: EncounterConfig, data: SaveData): EncounterState {
  const fresh = createEncounter(config, data.rngState.combat, data.tiles.current);
  const knownEnemy = config.enemies.some((e) => e.id === data.tiles.enemyId);
  const levelInRange = data.tiles.enemyLevel >= config.enemyLevelMin && data.tiles.enemyLevel <= config.enemyLevelMax;
  const keepEnemy = knownEnemy && levelInRange;
  const restored: EncounterState = {
    ...fresh,
    progression: { level: data.player.level, xp: data.player.xp },
    rng: data.rngState.combat,
    lootRng: data.rngState.loot,
    currencyRng: data.rngState.currency,
    enemyLevelRng: keepEnemy ? data.rngState.enemyLevel : fresh.enemyLevelRng,
    enemyId: keepEnemy ? data.tiles.enemyId : fresh.enemyId,
    enemyLevel: keepEnemy ? data.tiles.enemyLevel : fresh.enemyLevel,
    inventory: { bag: data.inventory.bag, equipment: data.inventory.equipment },
    wallet: data.stash,
    killsByTile: data.tiles.killsByTile,
    autoFoodMsLeft: data.boosts.autoFoodMsLeft,
    eatCooldownMs: data.boosts.eatCooldownMs,
    keepNuts: data.settings.keepNuts,
    loot: { pityCounters: data.pity.pityCounters, nextUid: data.pity.nextUid },
    merchant: data.merchant,
  };
  const maxHp = playerStats(config, restored.progression.level, restored.inventory.equipment).maxHp;
  // Saved at 0 HP (in the hideout after a death): she'd have come back at full HP anyway (GDD 6.3).
  const playerHp = data.player.hp <= 0 ? maxHp : Math.min(data.player.hp, maxHp);
  return { ...restored, playerHp };
}

/** The bit of `localStorage` the save needs (so tests can pass an in-memory map). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Writes `data` as the current slot; a readable old current slot becomes the previous one
 * (a corrupt one is dropped, so it never overwrites a good previous save).
 */
export function writeSave(storage: SaveStorage, data: SaveData): void {
  const old = storage.getItem(SAVE_KEYS.current);
  if (old !== null && isReadable(old)) storage.setItem(SAVE_KEYS.previous, old);
  storage.setItem(SAVE_KEYS.current, JSON.stringify(data));
}

export interface LoadResult {
  readonly data: SaveData;
  readonly slot: 'current' | 'previous';
}

/** Newest readable save (current slot, else previous), or null for a new game. */
export function loadSave(storage: SaveStorage): LoadResult | null {
  for (const slot of ['current', 'previous'] as const) {
    const text = storage.getItem(SAVE_KEYS[slot]);
    if (text === null) continue;
    try {
      return { data: parseSave(text), slot };
    } catch {
      // Corrupt or unreadable: try the other slot.
    }
  }
  return null;
}

/**
 * Safety net: when `loadSave` found no readable save but some slot has text, copies that text to
 * `UNREADABLE_KEYS` (once - an existing copy is kept) so starting a new game can't destroy it,
 * e.g. if a bug in a newer version can't read it. Returns how many slots were copied.
 */
export function backupUnreadable(storage: SaveStorage): number {
  let copied = 0;
  for (const slot of ['current', 'previous'] as const) {
    const text = storage.getItem(SAVE_KEYS[slot]);
    if (text === null || isReadable(text) || storage.getItem(UNREADABLE_KEYS[slot]) !== null) continue;
    storage.setItem(UNREADABLE_KEYS[slot], text);
    copied++;
  }
  return copied;
}

/** Deletes both slots (debug reset). */
export function clearSave(storage: SaveStorage): void {
  storage.removeItem(SAVE_KEYS.current);
  storage.removeItem(SAVE_KEYS.previous);
}

function isReadable(text: string): boolean {
  try {
    parseSave(text);
    return true;
  } catch {
    return false;
  }
}

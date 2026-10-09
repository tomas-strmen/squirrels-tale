/**
 * Encounter: searching for an enemy, a 1v1 fight with HP, XP and levels, HP
 * regeneration and death (GDD 6.1, 6.2, 6.3, 7.1, 7.2).
 *
 * Attacks hit or miss and deal damage (core/combat). When the enemy dies, the
 * next search starts automatically (GDD 7.1), and the player gains the
 * enemy's XP - possibly leveling up (core/progression), which raises max HP
 * (healing by the same amount at once) and damage. HP regenerates passively
 * over time (idle, searching and fighting - GDD 6.1/7.1). When the squirrel
 * is defeated (GDD 6.3, online death): she loses a % of her current level's
 * XP progress (never dropping a level) and goes to the `hideout` phase for a
 * fixed time, returning to `idle` at full HP. M3.2 placeholder: there is no
 * map yet, so the player cannot pick a tile - she just reappears where she was.
 *
 * All functions are pure: they never modify the state passed in. The seeded
 * Rng lives in the state, so the same seed always gives the same fights.
 */
import {
  createCombatRules,
  createFighterStats,
  resolveAttack,
  type CombatRules,
  type CombatRulesInput,
  type FighterStats,
  type FighterStatsInput,
} from '../combat/combat';
import { addToWallet, EMPTY_WALLET, rollCurrencyDrops, type CurrencyDrop, type Wallet } from '../currency/currency';
import { createFoodConfig, nextAutoFood, type FoodConfig, type FoodConfigInput, type FoodId } from '../food/food';
import { fromHundredths, toHundredths } from '../numbers/numbers';
import {
  addToBag,
  BAG_CAPACITY,
  createInventory,
  EMPTY_EQUIPMENT,
  discardRarity,
  equip,
  toggleLock,
  unequip,
  type Equipment,
  type EquipSlot,
  type InventoryState,
} from '../inventory/inventory';
import {
  addLevelBonus,
  applyDeathXpLoss,
  createProgression,
  cumulativeLevelBonuses,
  gainXp,
  regenAmountHundredths,
  type ProgressionState,
} from '../progression/progression';
import {
  createEnemyLootTable,
  createLootConfig,
  createLootState,
  rollKillDrop,
  type EnemyLootTable,
  type Item,
  type LootConfig,
  type LootConfigInput,
  type LootState,
} from '../loot/loot';
import type { EnemyLoot } from '../content/schemas';
import { branch, next, nextInt, type RngState } from '../rng/rng';
import { chooseWeaponMode, composeStats, type ComposedStats, type WeaponMode } from '../stats/stats';
import { ammoDamagePct, createAmmoConfig, nextAmmo, spendAmmo, type AmmoConfig, type AmmoConfigInput, type AmmoKind } from '../ammo/ammo';
import { secondsToMs, TICK_MS } from '../time/fixedStep';

export type EncounterPhase = 'idle' | 'searching' | 'fighting' | 'hideout';
/**
 * 'online' = the game is open (GDD 6.3: a death costs XP, the squirrel stays in the hideout
 * until the player picks a tile). 'offline' = offline catch-up (GDD 6.3/17.2, M9): a death
 * costs no XP and after the hideout she goes straight back to searching on the same tile.
 */
export type TickMode = 'online' | 'offline';
export type Combatant = 'player' | 'enemy';

/** Enemy stat scaling per level above its tile's base level (GDD 8.4, M6.1). Crit is locked (GDD 6.1). */
export interface EnemyLeveling {
  readonly hpPctPerLevel: number;
  readonly damagePctPerLevel: number;
  readonly xpPctPerLevel: number;
  readonly dodgePctPerLevel: number;
  readonly maxDodgePct: number;
}

/** One enemy species that can spawn on a tile (GDD 8.2/8.3), resolved to internal units. */
export interface EncounterEnemyDef {
  readonly id: string;
  /** Combat stats at `baseLevel` (GDD 8.4, "b"); scaled per level by `enemyLeveling`, see enemyStats(). */
  readonly base: FighterStats;
  /** The species' own anchor level (GDD 8.4, "b") - fixed regardless of which tile it spawns on. */
  readonly baseLevel: number;
  /** Time between two of its attacks (ms). */
  readonly attackIntervalMs: number;
  /** XP granted when defeated at `baseLevel` (hundredths); scaled per level, see enemyXpAt(). */
  readonly xp: number;
  /** Its own drop table, rarity weights and currencies (GDD 9.3/9.6 v2.4, 11.1 v2.5). */
  readonly loot: EnemyLootTable;
  /** Relative chance to spawn on this tile (GDD 8.2 v2.5 spawn table); weights need not sum to 100. */
  readonly spawnWeight: number;
  /** Flying: fought with the ranged weapon only (GDD 7.1, M7.3a). */
  readonly flying: boolean;
}

/** Design values for one enemy species, as written in data/enemies.json. */
export interface EncounterEnemyInput extends FighterStatsInput {
  readonly id: string;
  readonly baseLevel: number;
  readonly attackIntervalS: number;
  /** XP granted when defeated at `baseLevel` (design value, GDD 6.2/8.3). */
  readonly xp: number;
  readonly loot: EnemyLoot;
  /** This tile's spawn weight for the species (GDD 8.2 v2.5), > 0. */
  readonly spawnWeight: number;
  /** GDD 7.1 (M7.3a); omitted = false. */
  readonly flying?: boolean;
}

export interface EncounterConfig {
  /** How long the search for an enemy takes (ms). */
  readonly searchMs: number;
  /** Time between two player attacks at level 1 (ms); faster per level, see playerAttackIntervalMs(). */
  readonly playerAttackIntervalMs: number;
  /** Attack speed gained per player level, compounding (%, GDD 6.1 v1.7). */
  readonly playerAttackSpeedPctPerLevel: number;
  /** Left-paw weapon damage, % of its own (GDD 9.1 v2.3). */
  readonly offHandDamagePct: number;
  /** Player's base stats at level 1, before level bonuses (GDD 6.2). */
  readonly playerBase: FighterStatsInput;
  /** Enemy species that can spawn on this tile (GDD 8.2); one is picked per encounter, see rollEnemy(). */
  readonly enemies: readonly EncounterEnemyDef[];
  /** Lowest/highest level enemies roll to on this tile, regardless of species (GDD 8.4). */
  readonly enemyLevelMin: number;
  readonly enemyLevelMax: number;
  readonly enemyLeveling: EnemyLeveling;
  readonly rules: CombatRules;
  /** HP regenerated every `regenIntervalMs` at level 1, before per-level growth (hundredths). */
  readonly regenAmount: number;
  readonly regenIntervalMs: number;
  /** Regen amount growth per level, compounding (GDD 6.1). */
  readonly regenGrowthPctPerLevel: number;
  /** How long the squirrel spends in the hideout after an online death (ms, GDD 6.3). */
  readonly hideoutMs: number;
  /** % of the current level's XP progress lost on an online death (GDD 6.3). */
  readonly deathXpLossPct: number;
  /** Food heals, eat cooldown and auto-food numbers (GDD 7.4, M7.2). */
  readonly food: FoodConfig;
  /** Ranged weapon ammo (GDD 7.3, M7.3b). */
  readonly ammo: AmmoConfig;
  readonly loot: LootConfig;
  /** Tier of the tile this config is for (GDD 8.2/9.3), e.g. 2 for T2. */
  readonly tileTier: number;
}

/** Design values as they are written in data/*.json. */
export interface EncounterConfigInput {
  readonly searchDurationS: number;
  readonly playerAttackIntervalS: number;
  readonly playerAttackSpeedPctPerLevel: number;
  readonly offHandDamagePct: number;
  readonly player: FighterStatsInput;
  /** Enemy species available on this tile (GDD 8.2); at least one. */
  readonly enemies: readonly EncounterEnemyInput[];
  readonly enemyLevelMin: number;
  readonly enemyLevelMax: number;
  readonly enemyLeveling: EnemyLeveling;
  readonly rules: CombatRulesInput;
  readonly regenAmount: number;
  readonly regenIntervalS: number;
  readonly regenGrowthPctPerLevel: number;
  readonly hideoutRegenS: number;
  readonly deathXpLossPct: number;
  readonly food: FoodConfigInput;
  readonly ammo: AmmoConfigInput;
  readonly loot: LootConfigInput;
  readonly tileTier: number;
}

export interface EncounterState {
  readonly phase: EncounterPhase;
  /** Time spent searching so far (ms). Only meaningful while searching. */
  readonly searchElapsedMs: number;
  /** Time since the player's last attack (ms). Only meaningful while fighting. */
  readonly playerAttackElapsedMs: number;
  /** Time since the enemy's last attack (ms). Only meaningful while fighting. */
  readonly enemyAttackElapsedMs: number;
  /** Current HP of the squirrel (hundredths). */
  readonly playerHp: number;
  /** Current HP of the enemy (hundredths). Only meaningful while fighting. */
  readonly enemyHp: number;
  /** Id of the current (or next, while searching) enemy species (GDD 8.2, M6.2). */
  readonly enemyId: string;
  /** Level of the current (or next, while searching) enemy (GDD 8.4). */
  readonly enemyLevel: number;
  /** Separate stream for rolling species+level, so it never changes how a fight plays out (like loot). */
  readonly enemyLevelRng: RngState;
  /** Time since the last regen tick (ms). Ticks in idle/searching/fighting, not in hideout. */
  readonly regenElapsedMs: number;
  /** Time spent in the hideout so far (ms). Only meaningful while `hideout`. */
  readonly hideoutElapsedMs: number;
  readonly progression: ProgressionState;
  readonly rng: RngState;
  readonly loot: LootState;
  /** Separate stream for drops, so loot never changes how fights play out. */
  readonly lootRng: RngState;
  /** Found items (bag) and equipped gear (GDD 9.1, 10). */
  readonly inventory: InventoryState;
  /** Currencies collected so far (GDD 11.1 v2.5), incl. Berries (food only). */
  readonly wallet: Wallet;
  /** Time until the next meal is allowed (ms, 0 = ready); shared by manual and auto eating (GDD 7.4). */
  readonly eatCooldownMs: number;
  /** Time auto-food stays unlocked (ms, 0 = locked); one mock ad gives `config.food.autoFoodUnlockMs`. */
  readonly autoFoodMsLeft: number;
  /** Separate stream for currency drops, so they never change item drops or fights. */
  readonly currencyRng: RngState;
  /** "Keep at least N nuts" (GDD 7.3): the slingshot never shoots the wallet below this; eating may. */
  readonly keepNuts: number;
  /** Id of the tile currently being fought on (GDD 8.1/8.2, M6.2). */
  readonly tileId: string;
  /** Kills so far on each tile ever visited, keyed by tile id (M6.2: unlocks the next tile). */
  readonly killsByTile: Readonly<Record<string, number>>;
}

export type EncounterEvent =
  | { readonly type: 'searchStarted' }
  | { readonly type: 'enemyFound' }
  | {
      readonly type: 'attack';
      readonly attacker: Combatant;
      readonly hit: boolean;
      /** Damage dealt in hundredths (0 on a miss). */
      readonly damage: number;
      /** Player shots with the ranged weapon only (GDD 7.3, M7.3b): what was shot. */
      readonly ammo?: AmmoKind;
    }
  | { readonly type: 'enemyDefeated' }
  /** A killed enemy dropped an item (GDD 9.6). `bagFull`: bag was at capacity, item was lost (M5.2a). */
  | { readonly type: 'itemFound'; readonly item: Item; readonly bagFull: boolean }
  /** A killed enemy dropped currencies (GDD 11.1 v2.5); only emitted when something dropped. */
  | { readonly type: 'currencyFound'; readonly drops: readonly CurrencyDrop[] }
  /** The squirrel ate one piece of food (GDD 7.4); `healed` in hundredths, `auto` = auto-food did it. */
  | { readonly type: 'ate'; readonly food: FoodId; readonly healed: number; readonly auto: boolean }
  /** Player leveled up (GDD 6.2): +1.0 max HP (healed at once), +0.1 max damage, and +0.1 min damage on even levels. */
  | { readonly type: 'leveledUp'; readonly level: number }
  /** Squirrel was defeated (GDD 6.3, online death): fight over, she goes to the hideout. */
  | { readonly type: 'playerDefeated'; readonly xpLost: number }
  /** Hideout time is over: back to idle at full HP (GDD 6.3). */
  | { readonly type: 'returnedFromHideout' }
  /** Player pressed "Peace!": search or fight ended at once (no XP, no loot). */
  | { readonly type: 'peaceMade'; readonly from: 'searching' | 'fighting' }
  /** Player switched to a different (unlocked) map tile (GDD 8.1, M6.2). */
  | { readonly type: 'tileSwitched'; readonly tileId: string };

export interface EncounterStep {
  readonly state: EncounterState;
  readonly events: readonly EncounterEvent[];
}

/**
 * Builds a validated config from design values.
 * Durations must be multiples of one tick (100 ms) and attack intervals > 0.
 */
export function createEncounterConfig(input: EncounterConfigInput): EncounterConfig {
  const searchMs = secondsToMs(input.searchDurationS);
  const playerAttackIntervalMs = secondsToMs(input.playerAttackIntervalS);
  if (searchMs < TICK_MS) {
    throw new Error(`searchDurationS must be at least ${TICK_MS / 1000} s`);
  }
  if (playerAttackIntervalMs < TICK_MS) {
    throw new Error(`Attack intervals must be at least ${TICK_MS / 1000} s`);
  }
  if (!Number.isInteger(input.enemyLevelMin) || input.enemyLevelMin < 1) {
    throw new Error('enemyLevelMin must be a whole number >= 1');
  }
  if (!Number.isInteger(input.enemyLevelMax) || input.enemyLevelMax < input.enemyLevelMin) {
    throw new Error('enemyLevelMax must be a whole number >= enemyLevelMin');
  }
  if (input.enemies.length === 0) {
    throw new Error('A tile needs at least one enemy species');
  }
  const regenIntervalMs = secondsToMs(input.regenIntervalS);
  if (regenIntervalMs < TICK_MS) {
    throw new Error(`regenIntervalS must be at least ${TICK_MS / 1000} s`);
  }
  const hideoutMs = secondsToMs(input.hideoutRegenS);
  if (hideoutMs < TICK_MS) {
    throw new Error(`hideoutRegenS must be at least ${TICK_MS / 1000} s`);
  }
  // Validates the base stats early (e.g. maxHp > 0); the checked value itself
  // is discarded because effective stats are recomputed per level, see playerStats().
  createFighterStats(input.player);
  const enemies = input.enemies.map((enemy): EncounterEnemyDef => {
    const attackIntervalMs = secondsToMs(enemy.attackIntervalS);
    if (attackIntervalMs < TICK_MS) {
      throw new Error(`Attack intervals must be at least ${TICK_MS / 1000} s`);
    }
    if (!(enemy.spawnWeight > 0)) {
      throw new Error(`Spawn weight of "${enemy.id}" must be greater than 0`);
    }
    return {
      id: enemy.id,
      base: createFighterStats(enemy),
      baseLevel: enemy.baseLevel,
      attackIntervalMs,
      xp: toHundredths(enemy.xp),
      loot: createEnemyLootTable(enemy.loot),
      spawnWeight: enemy.spawnWeight,
      flying: enemy.flying ?? false,
    };
  });
  return {
    searchMs,
    playerAttackIntervalMs,
    playerAttackSpeedPctPerLevel: input.playerAttackSpeedPctPerLevel,
    offHandDamagePct: input.offHandDamagePct,
    playerBase: input.player,
    enemies,
    enemyLevelMin: input.enemyLevelMin,
    enemyLevelMax: input.enemyLevelMax,
    enemyLeveling: input.enemyLeveling,
    rules: createCombatRules(input.rules),
    regenAmount: toHundredths(input.regenAmount),
    regenIntervalMs,
    regenGrowthPctPerLevel: input.regenGrowthPctPerLevel,
    hideoutMs,
    deathXpLossPct: input.deathXpLossPct,
    food: createFoodConfig(input.food),
    ammo: createAmmoConfig(input.ammo),
    loot: createLootConfig(input.loot),
    tileTier: input.tileTier,
  };
}

/** New encounter in phase `idle`, squirrel at full HP, level 1, no XP, on `tileId`. */
export function createEncounter(config: EncounterConfig, rng: RngState, tileId: string): EncounterState {
  const progression = createProgression();
  const first = rollEnemy(config, branch(rng, 'enemyLevel'));
  return {
    phase: 'idle',
    searchElapsedMs: 0,
    playerAttackElapsedMs: 0,
    enemyAttackElapsedMs: 0,
    playerHp: playerStats(config, progression.level).maxHp,
    enemyHp: 0,
    enemyId: first.enemyId,
    enemyLevel: first.level,
    enemyLevelRng: first.rng,
    regenElapsedMs: 0,
    hideoutElapsedMs: 0,
    progression,
    rng,
    loot: createLootState(),
    lootRng: branch(rng, 'loot'),
    inventory: createInventory(),
    wallet: EMPTY_WALLET,
    eatCooldownMs: 0,
    autoFoodMsLeft: 0,
    currencyRng: branch(rng, 'currency'),
    keepNuts: config.ammo.keepNutsDefault,
    tileId,
    killsByTile: {},
  };
}

/** Looks up a species' def by id. Throws if `config` (the current tile) doesn't have it. */
function enemyDefOf(config: EncounterConfig, enemyId: string): EncounterEnemyDef {
  const def = config.enemies.find((e) => e.id === enemyId);
  if (!def) throw new Error(`Unknown enemy id "${enemyId}" for this tile`);
  return def;
}

/** The current (or next, while searching) enemy's own drop table (GDD 9.3 v2.4), e.g. for a pity countdown UI. */
export function enemyLootOf(config: EncounterConfig, enemyId: string): EnemyLootTable {
  return enemyDefOf(config, enemyId).loot;
}

/**
 * Rolls the next enemy: a species from `config.enemies` (GDD 8.2) and a level within
 * [enemyLevelMin, enemyLevelMax] (GDD 8.4). Its own Rng stream, so it never changes
 * how a fight plays out (like loot). A single-species tile never rolls the species
 * (keeps the same deterministic sequence as before multi-species tiles existed).
 */
function rollEnemy(
  config: EncounterConfig,
  rng: RngState,
): { readonly enemyId: string; readonly level: number; readonly rng: RngState } {
  let nextRng = rng;
  let enemyId = config.enemies[0]?.id;
  if (config.enemies.length > 1) {
    // Weighted pick over the tile's spawn table (GDD 8.2 v2.5).
    const total = config.enemies.reduce((sum, e) => sum + e.spawnWeight, 0);
    const draw = next(nextRng);
    nextRng = draw.state;
    let target = draw.value * total;
    enemyId = config.enemies[config.enemies.length - 1]?.id; // float edge: last entry
    for (const e of config.enemies) {
      if (target < e.spawnWeight) {
        enemyId = e.id;
        break;
      }
      target -= e.spawnWeight;
    }
  }
  if (enemyId === undefined) throw new Error('A tile needs at least one enemy species');
  if (config.enemyLevelMin === config.enemyLevelMax) {
    return { enemyId, level: config.enemyLevelMin, rng: nextRng };
  }
  const draw = nextInt(nextRng, config.enemyLevelMin, config.enemyLevelMax + 1);
  return { enemyId, level: draw.value, rng: draw.state };
}

/** Enemy's effective combat stats at `level` (GDD 8.4): +hpPctPerLevel/damagePctPerLevel/dodgePctPerLevel per level above its own baseLevel. */
export function enemyStats(config: EncounterConfig, enemyId: string, level: number): FighterStats {
  const def = enemyDefOf(config, enemyId);
  const levelsAbove = level - def.baseLevel;
  const lv = config.enemyLeveling;
  const base = def.base;
  return {
    ...base,
    maxHp: Math.round(base.maxHp * (1 + (lv.hpPctPerLevel / 100) * levelsAbove)),
    damageMin: Math.round(base.damageMin * (1 + (lv.damagePctPerLevel / 100) * levelsAbove)),
    damageMax: Math.round(base.damageMax * (1 + (lv.damagePctPerLevel / 100) * levelsAbove)),
    dodgePct: Math.min(lv.maxDodgePct, base.dodgePct + lv.dodgePctPerLevel * levelsAbove),
  };
}

/** XP granted for defeating the enemy at `level` (GDD 8.4): +xpPctPerLevel per level above its own baseLevel. */
export function enemyXpAt(config: EncounterConfig, enemyId: string, level: number): number {
  const def = enemyDefOf(config, enemyId);
  const levelsAbove = level - def.baseLevel;
  return Math.round(def.xp * (1 + (config.enemyLeveling.xpPctPerLevel / 100) * levelsAbove));
}

/**
 * Character only (no gear): base stats plus the cumulative bonus for `level`
 * (GDD 6.1/6.2: +1.0 max HP/level, +0.1 max damage every level, +0.1 min
 * damage every 2nd level).
 */
export function characterStats(config: EncounterConfig, level: number): FighterStats {
  const bonus = cumulativeLevelBonuses(level);
  return createFighterStats({
    ...config.playerBase,
    maxHp: addLevelBonus(config.playerBase.maxHp, bonus.hpBonus),
    damageMax: addLevelBonus(config.playerBase.damageMax, bonus.maxDamageBonus),
    damageMin: addLevelBonus(config.playerBase.damageMin, bonus.minDamageBonus),
  });
}

/**
 * Character + gear (core/stats, GDD 6.1 v1.8): what the squirrel fights with.
 * `weaponMode` picks which weapons count (GDD 7.1, M7.3a); see activeWeaponMode().
 */
export function composedPlayer(
  config: EncounterConfig,
  level: number,
  equipment: Equipment = EMPTY_EQUIPMENT,
  weaponMode: WeaponMode = 'melee',
): ComposedStats {
  return composeStats({
    character: characterStats(config, level),
    baseAttackIntervalMs: config.playerAttackIntervalMs,
    levelSpeedFactor: (1 + config.playerAttackSpeedPctPerLevel / 100) ** (level - 1),
    minAttackIntervalMs: config.rules.minAttackIntervalMs,
    equipment,
    offHandDamagePct: config.offHandDamagePct,
    weaponMode,
  });
}

/**
 * Which weapons fight the current (or next, while searching) enemy - switched
 * automatically (GDD 7.1, M7.3a): flying -> ranged (none -> fists), otherwise
 * paws -> ranged -> fists.
 */
export function activeWeaponMode(state: EncounterState, config: EncounterConfig): WeaponMode {
  return chooseWeaponMode(state.inventory.equipment, enemyDefOf(config, state.enemyId).flying);
}

/** What the next ranged shot uses (GDD 7.3, M7.3b), or null when the slingshot isn't the active weapon. */
export function currentAmmo(state: EncounterState, config: EncounterConfig): AmmoKind | null {
  if (activeWeaponMode(state, config) !== 'ranged') return null;
  return nextAmmo(state.wallet, state.keepNuts, config.ammo);
}

/**
 * The squirrel's stats and interval against the current enemy, with the auto-switched weapon
 * and its ammo (ground pebbles: damage x groundAmmoDamagePct %, GDD 7.2 ammoMult).
 */
export function fightingPlayer(state: EncounterState, config: EncounterConfig): ComposedStats {
  const composed = composedPlayer(config, state.progression.level, state.inventory.equipment, activeWeaponMode(state, config));
  const ammo = currentAmmo(state, config);
  const pct = ammo === null ? 100 : ammoDamagePct(ammo, config.ammo);
  if (pct === 100) return composed;
  const scale = (v: number) => Math.round((v * pct) / 100);
  return {
    ...composed,
    fighter: { ...composed.fighter, damageMin: scale(composed.fighter.damageMin), damageMax: scale(composed.fighter.damageMax) },
  };
}

/** Sets "keep at least N nuts" (GDD 7.3); whole number, never below 0. */
export function setKeepNuts(state: EncounterState, keepNuts: number): EncounterState {
  return { ...state, keepNuts: Math.max(0, Math.floor(keepNuts)) };
}

/**
 * Multiplier of the squirrel's hit chance vs the current enemy (GDD 7.1 v2.7):
 * bare fists against a flying enemy hit only `fistsVsFlyingHitPct` % as often.
 */
export function playerHitMultiplier(state: EncounterState, config: EncounterConfig): number {
  const flying = enemyDefOf(config, state.enemyId).flying;
  return flying && activeWeaponMode(state, config) === 'fists' ? config.rules.fistsVsFlyingHitPct / 100 : 1;
}

/** The squirrel's effective combat stats at `level` with `equipment` (default: none). */
export function playerStats(
  config: EncounterConfig,
  level: number,
  equipment: Equipment = EMPTY_EQUIPMENT,
): FighterStats {
  return composedPlayer(config, level, equipment).fighter;
}

/**
 * The player's attack interval (GDD 6.1/7.2): fists 4.0 s + right-paw weapon
 * shift, x1.01 faster per level, gear speed %, min 0.5 s.
 */
export function playerAttackIntervalMs(
  config: EncounterConfig,
  level: number,
  equipment: Equipment = EMPTY_EQUIPMENT,
  weaponMode: WeaponMode = 'melee',
): number {
  return composedPlayer(config, level, equipment, weaponMode).attackIntervalMs;
}

/** Stat deltas from putting `item` into `slot`, vs the current `equipment` (M5.2b1). */
export interface EquipComparison {
  readonly maxHp: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly armor: number;
  /** Percentage points (not hundredths - matches FighterStats.hitPct). */
  readonly hitPct: number;
  /** Negative = faster. */
  readonly attackIntervalMs: number;
}

// GDD 5: stats display rounded to 0.1, so a delta below that isn't a visible
// difference - it should count as neither an upgrade nor a downgrade.
const HUNDREDTHS_THRESHOLD = 5; // 0.05 design units
const HIT_PCT_THRESHOLD = 0.05; // hitPct is already plain percent, not hundredths
const MS_THRESHOLD = 5; // 0.005 s

export type EquipVerdict = 'better' | 'worse' | 'mixed' | 'none';

/**
 * Overall verdict for a comparison (M5.2b1, for the bag list's green/red tint):
 * 'better' if every visible-sized stat change is an upgrade, 'worse' if every
 * one is a downgrade, 'mixed' if some go each way, 'none' if nothing visible changed.
 */
export function classifyEquip(diff: EquipComparison): EquipVerdict {
  const signs: number[] = [];
  const push = (delta: number, threshold: number, goodWhenPositive: boolean) => {
    if (Math.abs(delta) < threshold) return;
    signs.push(goodWhenPositive === (delta > 0) ? 1 : -1);
  };
  push(diff.maxHp, HUNDREDTHS_THRESHOLD, true);
  push(diff.damageMin, HUNDREDTHS_THRESHOLD, true);
  push(diff.damageMax, HUNDREDTHS_THRESHOLD, true);
  push(diff.armor, HUNDREDTHS_THRESHOLD, true);
  push(diff.hitPct, HIT_PCT_THRESHOLD, true);
  push(diff.attackIntervalMs, MS_THRESHOLD, false); // lower interval = better
  if (signs.length === 0) return 'none';
  if (signs.every((s) => s > 0)) return 'better';
  if (signs.every((s) => s < 0)) return 'worse';
  return 'mixed';
}

/** Compares equipping `item` into `slot` against the current `equipment` (M5.2b1). Pure, no state change. */
export function compareEquip(
  config: EncounterConfig,
  level: number,
  equipment: Equipment,
  item: Item,
  slot: EquipSlot,
): EquipComparison {
  // A ranged weapon is compared as it shoots (M7.3a); paw weapons as they fight in melee.
  const mode: WeaponMode = slot === 'ranged' ? 'ranged' : 'melee';
  const before = composedPlayer(config, level, equipment, mode);
  const after = composedPlayer(config, level, { ...equipment, [slot]: item }, mode);
  return {
    maxHp: after.fighter.maxHp - before.fighter.maxHp,
    damageMin: after.fighter.damageMin - before.fighter.damageMin,
    damageMax: after.fighter.damageMax - before.fighter.damageMax,
    armor: after.fighter.armor - before.fighter.armor,
    hitPct: after.fighter.hitPct - before.fighter.hitPct,
    attackIntervalMs: after.attackIntervalMs - before.attackIntervalMs,
  };
}

/**
 * Equips a bag item (GDD 9.1 v2.3). Works in any phase. Current HP never
 * exceeds the new max HP (e.g. after taking off a +HP amulet).
 */
export function equipItem(
  state: EncounterState,
  config: EncounterConfig,
  uid: number,
  slot: EquipSlot,
): EncounterState {
  return withInventory(state, config, equip(state.inventory, uid, slot));
}

export function unequipItem(state: EncounterState, config: EncounterConfig, slot: EquipSlot): EncounterState {
  return withInventory(state, config, unequip(state.inventory, slot));
}

/** Flips `locked` on a bag item (M5.2b2). Locked items are for now just a flag - protected from
 * future bulk actions (M5.2b3 discard, M16 disassembly), not from equip/unequip. */
export function toggleItemLock(state: EncounterState, config: EncounterConfig, uid: number): EncounterState {
  return withInventory(state, config, toggleLock(state.inventory, uid));
}

/** Removes every unlocked bag item of `rarityId` (M5.2b3, e.g. "Discard Common"). */
export function discardBagRarity(state: EncounterState, config: EncounterConfig, rarityId: string): EncounterState {
  return withInventory(state, config, discardRarity(state.inventory, rarityId));
}

function withInventory(state: EncounterState, config: EncounterConfig, inventory: InventoryState): EncounterState {
  if (inventory === state.inventory) return state;
  const maxHp = playerStats(config, state.progression.level, inventory.equipment).maxHp;
  return { ...state, inventory, playerHp: Math.min(state.playerHp, maxHp) };
}

/** Player pressed "Find enemy". Only works while idle. */
export function startSearch(state: EncounterState): EncounterStep {
  if (state.phase !== 'idle') {
    return { state, events: [] };
  }
  return {
    state: { ...state, phase: 'searching', searchElapsedMs: 0 },
    events: [{ type: 'searchStarted' }],
  };
}

/**
 * Player pressed "Peace!" (GDD 7.1). Stops the search, or ends the fight at once:
 * the enemy leaves, no XP and no loot. Back to `idle` until "Find enemy" is pressed again.
 * The squirrel keeps her current HP. Does nothing while idle or in the hideout.
 */
export function makePeace(state: EncounterState): EncounterStep {
  if (state.phase !== 'searching' && state.phase !== 'fighting') {
    return { state, events: [] };
  }
  return {
    state: toIdle(state, state.playerHp),
    events: [{ type: 'peaceMade', from: state.phase }],
  };
}

/**
 * Player picks a different tile on the map (GDD 8.1, M6.2). No-op if it's the tile she's
 * already on, or if `tileId` isn't in `unlockedTileIds` (e.g. a stale click on a tile that
 * just got locked again - shouldn't happen from the UI, but keeps state consistent).
 * Interrupts any search/fight in progress (like Peace!, no XP/loot) and rolls a fresh
 * enemy for the new tile; keeps HP, progression, inventory and every tile's kill counts.
 */
export function switchTile(
  state: EncounterState,
  newConfig: EncounterConfig,
  tileId: string,
  unlockedTileIds: ReadonlySet<string>,
): EncounterStep {
  if (tileId === state.tileId || !unlockedTileIds.has(tileId)) {
    return { state, events: [] };
  }
  const idle = state.phase === 'idle' ? state : toIdle(state, state.playerHp);
  const next = rollEnemy(newConfig, idle.enemyLevelRng);
  return {
    state: {
      ...idle,
      tileId,
      enemyId: next.enemyId,
      enemyLevel: next.level,
      enemyLevelRng: next.rng,
    },
    events: [{ type: 'tileSwitched', tileId }],
  };
}

/**
 * Advances the encounter by one simulation step (TICK_MS).
 * If both fighters are due to attack in the same step, the player attacks first;
 * if that attack kills the enemy, the enemy does not attack.
 */
export function tick(state: EncounterState, config: EncounterConfig, mode: TickMode = 'online'): EncounterStep {
  const step = tickPhase(state, config, mode);
  // GDD 7.4: the eat cooldown and the auto-food unlock run on simulation time.
  const timed = {
    ...step.state,
    eatCooldownMs: Math.max(0, step.state.eatCooldownMs - TICK_MS),
    autoFoodMsLeft: Math.max(0, step.state.autoFoodMsLeft - TICK_MS),
  };
  const auto = autoEat(timed, config);
  return auto ? { state: auto.state, events: [...step.events, auto.event] } : { state: timed, events: step.events };
}

/**
 * Eats one piece of `food` (GDD 7.4). Does nothing (same state, no events) while the cooldown runs,
 * in the hideout, at full HP or without that food. Heals up to the current max HP.
 */
export function eatFood(state: EncounterState, config: EncounterConfig, food: FoodId): EncounterStep {
  const eaten = tryEat(state, config, food, false);
  return eaten ? { state: eaten.state, events: [eaten.event] } : { state, events: [] };
}

/** Mock "watch an ad" (GDD 18.1): unlocks auto-food for `config.food.autoFoodUnlockMs` (refills if already on). */
export function unlockAutoFood(state: EncounterState, config: EncounterConfig): EncounterState {
  return { ...state, autoFoodMsLeft: config.food.autoFoodUnlockMs };
}

type Ate = Extract<EncounterEvent, { type: 'ate' }>;

function tryEat(
  state: EncounterState,
  config: EncounterConfig,
  food: FoodId,
  auto: boolean,
): { readonly state: EncounterState; readonly event: Ate } | null {
  if (state.phase === 'hideout' || state.eatCooldownMs > 0 || state.wallet[food] <= 0) return null;
  const maxHp = playerStats(config, state.progression.level, state.inventory.equipment).maxHp;
  if (state.playerHp >= maxHp) return null;
  const playerHp = Math.min(maxHp, state.playerHp + config.food.healHundredths[food]);
  return {
    state: {
      ...state,
      playerHp,
      wallet: { ...state.wallet, [food]: state.wallet[food] - 1 },
      eatCooldownMs: config.food.eatCooldownMs,
    },
    event: { type: 'ate', food, healed: playerHp - state.playerHp, auto },
  };
}

/** GDD 7.4 auto-food: while unlocked and HP is below the threshold, eats the first food in order. */
function autoEat(state: EncounterState, config: EncounterConfig): { state: EncounterState; event: Ate } | null {
  if (state.autoFoodMsLeft <= 0 || state.phase === 'hideout') return null;
  const maxHp = playerStats(config, state.progression.level, state.inventory.equipment).maxHp;
  if (state.playerHp * 100 >= maxHp * config.food.autoEatBelowPct) return null;
  const food = nextAutoFood(state.wallet, config.food.autoOrder);
  return food === null ? null : tryEat(state, config, food, true);
}

function tickPhase(state: EncounterState, config: EncounterConfig, mode: TickMode): EncounterStep {
  switch (state.phase) {
    case 'idle':
      return { state: applyRegen(state, config), events: [] };

    case 'hideout': {
      const hideoutElapsedMs = state.hideoutElapsedMs + TICK_MS;
      if (hideoutElapsedMs < config.hideoutMs) {
        return { state: { ...state, hideoutElapsedMs }, events: [] };
      }
      const maxHp = playerStats(config, state.progression.level, state.inventory.equipment).maxHp;
      if (mode === 'offline') {
        // GDD 6.3 offline: back at full HP on the same tile, the search starts again by itself.
        return {
          state: { ...toIdle({ ...state, hideoutElapsedMs }, maxHp), phase: 'searching' },
          events: [{ type: 'returnedFromHideout' }, { type: 'searchStarted' }],
        };
      }
      return {
        state: toIdle(
          { ...state, hideoutElapsedMs },
          playerStats(config, state.progression.level, state.inventory.equipment).maxHp,
        ),
        events: [{ type: 'returnedFromHideout' }],
      };
    }

    case 'searching': {
      const regenerated = applyRegen(state, config);
      const searchElapsedMs = regenerated.searchElapsedMs + TICK_MS;
      if (searchElapsedMs < config.searchMs) {
        return { state: { ...regenerated, searchElapsedMs }, events: [] };
      }
      return {
        state: {
          ...regenerated,
          phase: 'fighting',
          searchElapsedMs: config.searchMs,
          playerAttackElapsedMs: 0,
          enemyAttackElapsedMs: 0,
          enemyHp: enemyStats(config, regenerated.enemyId, regenerated.enemyLevel).maxHp,
        },
        events: [{ type: 'enemyFound' }],
      };
    }

    case 'fighting':
      return tickFight(applyRegen(state, config), config, mode);
  }
}

/**
 * Passive HP regeneration (GDD 6.1: base amount every `regenIntervalMs`,
 * scaled per level - GDD 7.1: ticks during a fight and between fights).
 * Never applied in the `hideout` phase (that has its own fixed recovery time).
 */
function applyRegen(state: EncounterState, config: EncounterConfig): EncounterState {
  const composed = composedPlayer(config, state.progression.level, state.inventory.equipment);
  const maxHp = composed.fighter.maxHp;
  if (state.playerHp >= maxHp) {
    return { ...state, regenElapsedMs: 0 };
  }
  const regenElapsedMs = state.regenElapsedMs + TICK_MS;
  if (regenElapsedMs < config.regenIntervalMs) {
    return { ...state, regenElapsedMs };
  }
  // GDD 6.1 + gear regen % (each item multiplies, core/stats).
  const amount = Math.round(
    regenAmountHundredths(fromHundredths(config.regenAmount), state.progression.level, config.regenGrowthPctPerLevel) *
      composed.regenMultiplier,
  );
  return {
    ...state,
    regenElapsedMs: regenElapsedMs - config.regenIntervalMs,
    playerHp: Math.min(maxHp, state.playerHp + amount),
  };
}

function tickFight(state: EncounterState, config: EncounterConfig, mode: TickMode): EncounterStep {
  const events: EncounterEvent[] = [];
  let { rng, playerHp, enemyHp, progression, wallet } = state;
  let playerAttackElapsedMs = state.playerAttackElapsedMs + TICK_MS;
  let enemyAttackElapsedMs = state.enemyAttackElapsedMs + TICK_MS;
  // GDD 7.1 (M7.3a): weapons switch automatically by enemy (flying -> ranged).
  const composed = fightingPlayer(state, config);
  const player = composed.fighter;
  const playerIntervalMs = composed.attackIntervalMs;
  const enemy = enemyStats(config, state.enemyId, state.enemyLevel);
  const enemyAttackIntervalMs = enemyDefOf(config, state.enemyId).attackIntervalMs;
  // GDD 7.2 v1.7: hit chance shifts 0.5 % per level of difference, mirrored for the enemy.
  const levelDiff = progression.level - state.enemyLevel;

  if (playerAttackElapsedMs >= playerIntervalMs) {
    playerAttackElapsedMs -= playerIntervalMs;
    const attack = resolveAttack(player, enemy, config.rules, rng, levelDiff, playerHitMultiplier(state, config));
    rng = attack.rng;
    enemyHp = Math.max(0, enemyHp - attack.result.damage);
    // GDD 7.3: every slingshot shot (hit or miss) spends its ammo; `player` already has the damage for it.
    const ammo = currentAmmo(state, config);
    if (ammo !== null) wallet = spendAmmo(wallet, ammo, config.ammo);
    events.push({ type: 'attack', attacker: 'player', ...attack.result, ...(ammo !== null ? { ammo } : {}) });
    if (enemyHp === 0) {
      events.push({ type: 'enemyDefeated' });
      // GDD 9.3/9.6 v2.4: each entry in the enemy's own drop table rolls independently -
      // zero, one or several items. Magic Find is locked until quest Q4 (GDD 6.1).
      const drop = rollKillDrop(
        state.loot,
        config.loot,
        state.lootRng,
        { magicFindPct: 0, unlocked: NO_UNLOCKS },
        enemyDefOf(config, state.enemyId).loot,
        state.enemyLevel,
      );
      const loot = drop.state;
      const lootRng = drop.rng;
      let inventory = state.inventory;
      for (const item of drop.items) {
        const bagFull = inventory.bag.length >= BAG_CAPACITY;
        inventory = addToBag(inventory, item);
        events.push({ type: 'itemFound', item, bagFull });
      }
      // GDD 11.1 v2.5: currencies come from the same per-enemy table, own Rng stream.
      const coins = rollCurrencyDrops(enemyDefOf(config, state.enemyId).loot, state.enemyLevel, state.currencyRng);
      if (coins.drops.length > 0) events.push({ type: 'currencyFound', drops: coins.drops });
      const gain = gainXp(progression, enemyXpAt(config, state.enemyId, state.enemyLevel));
      progression = gain.state;
      // Every level gained heals by exactly its HP bonus (GDD 6.2) - never a full heal.
      for (const level of gain.levelsGained) {
        playerHp += 100; // levelUpDelta().hpBonus is always +1.0 (100 hundredths).
        events.push({ type: 'leveledUp', level });
      }
      // GDD 8.2/8.4: roll the next enemy's species and level (own Rng stream, like loot).
      const next = rollEnemy(config, state.enemyLevelRng);
      const killsByTile = { ...state.killsByTile, [state.tileId]: (state.killsByTile[state.tileId] ?? 0) + 1 };
      // GDD 7.1: after each defeated enemy the next search starts automatically.
      events.push({ type: 'searchStarted' });
      return {
        state: {
          ...state,
          phase: 'searching',
          searchElapsedMs: 0,
          playerAttackElapsedMs: 0,
          enemyAttackElapsedMs: 0,
          playerHp,
          enemyHp: 0,
          enemyId: next.enemyId,
          enemyLevel: next.level,
          enemyLevelRng: next.rng,
          progression,
          rng,
          loot,
          lootRng,
          inventory,
          wallet: addToWallet(wallet, coins.drops),
          currencyRng: coins.rng,
          killsByTile,
        },
        events,
      };
    }
  }

  if (enemyAttackElapsedMs >= enemyAttackIntervalMs) {
    enemyAttackElapsedMs -= enemyAttackIntervalMs;
    const attack = resolveAttack(enemy, player, config.rules, rng, -levelDiff);
    rng = attack.rng;
    playerHp = Math.max(0, playerHp - attack.result.damage);
    events.push({ type: 'attack', attacker: 'enemy', ...attack.result });
    if (playerHp === 0) {
      // GDD 6.3 online death: lose a % of the current level's progress, level never drops.
      // Offline deaths cost no XP.
      const beforeLoss = progression;
      if (mode === 'online') progression = applyDeathXpLoss(progression, config.deathXpLossPct);
      const xpLost = beforeLoss.xp - progression.xp;
      events.push({ type: 'playerDefeated', xpLost });
      return {
        state: {
          ...state,
          phase: 'hideout',
          playerAttackElapsedMs: 0,
          enemyAttackElapsedMs: 0,
          playerHp: 0,
          enemyHp: 0,
          hideoutElapsedMs: 0,
          progression,
          rng,
          wallet,
        },
        events,
      };
    }
  }

  return {
    state: { ...state, playerAttackElapsedMs, enemyAttackElapsedMs, playerHp, enemyHp, progression, rng, wallet },
    events,
  };
}

/** No stats are unlocked yet: quests come in M13. */
const NO_UNLOCKS: ReadonlySet<string> = new Set();

function toIdle(state: EncounterState, playerHp: number): EncounterState {
  return {
    ...state,
    phase: 'idle',
    searchElapsedMs: 0,
    playerAttackElapsedMs: 0,
    enemyAttackElapsedMs: 0,
    playerHp,
    enemyHp: 0,
    regenElapsedMs: 0,
    hideoutElapsedMs: 0,
  };
}

/**
 * Search progress 0..1 (0 when not searching yet, 1 once the enemy is found).
 *
 * `extraMs` is real time elapsed since the last simulation tick (always < 100 ms,
 * from `consumeFrame`'s leftover `accumulatorMs`). It only smooths the bar for
 * rendering between ticks - the simulation itself still only advances in fixed
 * 100 ms steps.
 */
export function searchProgress(
  state: EncounterState,
  config: EncounterConfig,
  extraMs = 0,
): number {
  if (state.phase === 'idle' || state.phase === 'hideout') return 0;
  if (state.phase === 'fighting') return 1;
  return clamp01((state.searchElapsedMs + extraMs) / config.searchMs);
}

/** Hideout recovery progress 0..1 (0 outside the `hideout` phase). `extraMs`: see `searchProgress`. */
export function hideoutProgress(state: EncounterState, config: EncounterConfig, extraMs = 0): number {
  if (state.phase !== 'hideout') return 0;
  return clamp01((state.hideoutElapsedMs + extraMs) / config.hideoutMs);
}

/**
 * Attack bar progress 0..1 for one fighter (0 when not fighting).
 * `extraMs`: see `searchProgress`.
 */
export function attackProgress(
  state: EncounterState,
  config: EncounterConfig,
  who: Combatant,
  extraMs = 0,
): number {
  if (state.phase !== 'fighting') return 0;
  return who === 'player'
    ? clamp01((state.playerAttackElapsedMs + extraMs) / fightingPlayer(state, config).attackIntervalMs)
    : clamp01((state.enemyAttackElapsedMs + extraMs) / enemyDefOf(config, state.enemyId).attackIntervalMs);
}

/** HP bar value 0..1 for one fighter. */
export function hpFraction(state: EncounterState, config: EncounterConfig, who: Combatant): number {
  return who === 'player'
    ? clamp01(state.playerHp / playerStats(config, state.progression.level, state.inventory.equipment).maxHp)
    : clamp01(state.enemyHp / enemyStats(config, state.enemyId, state.enemyLevel).maxHp);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

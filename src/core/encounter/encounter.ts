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
import { fromHundredths, toHundredths } from '../numbers/numbers';
import {
  addToBag,
  BAG_CAPACITY,
  createInventory,
  EMPTY_EQUIPMENT,
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
  createLootConfig,
  createLootState,
  rollKillDrop,
  type Item,
  type LootConfig,
  type LootConfigInput,
  type LootState,
} from '../loot/loot';
import { branch, type RngState } from '../rng/rng';
import { composeStats, type ComposedStats } from '../stats/stats';
import { secondsToMs, TICK_MS } from '../time/fixedStep';

export type EncounterPhase = 'idle' | 'searching' | 'fighting' | 'hideout';
export type Combatant = 'player' | 'enemy';

export interface EncounterConfig {
  /** How long the search for an enemy takes (ms). */
  readonly searchMs: number;
  /** Time between two player attacks at level 1 (ms); faster per level, see playerAttackIntervalMs(). */
  readonly playerAttackIntervalMs: number;
  /** Attack speed gained per player level, compounding (%, GDD 6.1 v1.7). */
  readonly playerAttackSpeedPctPerLevel: number;
  /** Left-paw weapon damage, % of its own (GDD 9.1 v2.3). */
  readonly offHandDamagePct: number;
  /** Time between two enemy attacks (ms). */
  readonly enemyAttackIntervalMs: number;
  /** Player's base stats at level 1, before level bonuses (GDD 6.2). */
  readonly playerBase: FighterStatsInput;
  readonly enemy: FighterStats;
  /** Enemy level (GDD 8.4). Fixed to its base level until the map (M6) rolls it per tile. */
  readonly enemyLevel: number;
  /** XP granted when the enemy is defeated (hundredths). */
  readonly enemyXp: number;
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
  readonly loot: LootConfig;
  /** Tier of the current tile (GDD 8.2/9.3). Fixed to 1 until the map (M6). */
  readonly tileTier: number;
}

/** Design values as they are written in data/*.json. */
export interface EncounterConfigInput {
  readonly searchDurationS: number;
  readonly playerAttackIntervalS: number;
  readonly enemyAttackIntervalS: number;
  readonly playerAttackSpeedPctPerLevel: number;
  readonly offHandDamagePct: number;
  readonly player: FighterStatsInput;
  readonly enemy: FighterStatsInput;
  readonly enemyLevel: number;
  /** XP granted when the enemy is defeated (design value, GDD 6.2/8.3). */
  readonly enemyXp: number;
  readonly rules: CombatRulesInput;
  readonly regenAmount: number;
  readonly regenIntervalS: number;
  readonly regenGrowthPctPerLevel: number;
  readonly hideoutRegenS: number;
  readonly deathXpLossPct: number;
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
    }
  | { readonly type: 'enemyDefeated' }
  /** A killed enemy dropped an item (GDD 9.6). `bagFull`: bag was at capacity, item was lost (M5.2a). */
  | { readonly type: 'itemFound'; readonly item: Item; readonly bagFull: boolean }
  /** Player leveled up (GDD 6.2): +1.0 max HP (healed at once), +0.1 max damage, and +0.1 min damage on even levels. */
  | { readonly type: 'leveledUp'; readonly level: number }
  /** Squirrel was defeated (GDD 6.3, online death): fight over, she goes to the hideout. */
  | { readonly type: 'playerDefeated'; readonly xpLost: number }
  /** Hideout time is over: back to idle at full HP (GDD 6.3). */
  | { readonly type: 'returnedFromHideout' }
  /** Player pressed "Peace!": search or fight ended at once (no XP, no loot). */
  | { readonly type: 'peaceMade'; readonly from: 'searching' | 'fighting' };

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
  const enemyAttackIntervalMs = secondsToMs(input.enemyAttackIntervalS);
  if (searchMs < TICK_MS) {
    throw new Error(`searchDurationS must be at least ${TICK_MS / 1000} s`);
  }
  if (playerAttackIntervalMs < TICK_MS || enemyAttackIntervalMs < TICK_MS) {
    throw new Error(`Attack intervals must be at least ${TICK_MS / 1000} s`);
  }
  if (!Number.isInteger(input.enemyLevel) || input.enemyLevel < 1) {
    throw new Error('enemyLevel must be a whole number >= 1');
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
  return {
    searchMs,
    playerAttackIntervalMs,
    playerAttackSpeedPctPerLevel: input.playerAttackSpeedPctPerLevel,
    offHandDamagePct: input.offHandDamagePct,
    enemyAttackIntervalMs,
    playerBase: input.player,
    enemy: createFighterStats(input.enemy),
    enemyLevel: input.enemyLevel,
    enemyXp: toHundredths(input.enemyXp),
    rules: createCombatRules(input.rules),
    regenAmount: toHundredths(input.regenAmount),
    regenIntervalMs,
    regenGrowthPctPerLevel: input.regenGrowthPctPerLevel,
    hideoutMs,
    deathXpLossPct: input.deathXpLossPct,
    loot: createLootConfig(input.loot),
    tileTier: input.tileTier,
  };
}

/** New encounter in phase `idle`, squirrel at full HP, level 1, no XP. */
export function createEncounter(config: EncounterConfig, rng: RngState): EncounterState {
  const progression = createProgression();
  return {
    phase: 'idle',
    searchElapsedMs: 0,
    playerAttackElapsedMs: 0,
    enemyAttackElapsedMs: 0,
    playerHp: playerStats(config, progression.level).maxHp,
    enemyHp: 0,
    regenElapsedMs: 0,
    hideoutElapsedMs: 0,
    progression,
    rng,
    loot: createLootState(),
    lootRng: branch(rng, 'loot'),
    inventory: createInventory(),
  };
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

/** Character + gear (core/stats, GDD 6.1 v1.8): what the squirrel fights with. */
export function composedPlayer(
  config: EncounterConfig,
  level: number,
  equipment: Equipment = EMPTY_EQUIPMENT,
): ComposedStats {
  return composeStats({
    character: characterStats(config, level),
    baseAttackIntervalMs: config.playerAttackIntervalMs,
    levelSpeedFactor: (1 + config.playerAttackSpeedPctPerLevel / 100) ** (level - 1),
    minAttackIntervalMs: config.rules.minAttackIntervalMs,
    equipment,
    offHandDamagePct: config.offHandDamagePct,
  });
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
): number {
  return composedPlayer(config, level, equipment).attackIntervalMs;
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
  const before = composedPlayer(config, level, equipment);
  const after = composedPlayer(config, level, { ...equipment, [slot]: item });
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
 * Advances the encounter by one simulation step (TICK_MS).
 * If both fighters are due to attack in the same step, the player attacks first;
 * if that attack kills the enemy, the enemy does not attack.
 */
export function tick(state: EncounterState, config: EncounterConfig): EncounterStep {
  switch (state.phase) {
    case 'idle':
      return { state: applyRegen(state, config), events: [] };

    case 'hideout': {
      const hideoutElapsedMs = state.hideoutElapsedMs + TICK_MS;
      if (hideoutElapsedMs < config.hideoutMs) {
        return { state: { ...state, hideoutElapsedMs }, events: [] };
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
          enemyHp: config.enemy.maxHp,
        },
        events: [{ type: 'enemyFound' }],
      };
    }

    case 'fighting':
      return tickFight(applyRegen(state, config), config);
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

function tickFight(state: EncounterState, config: EncounterConfig): EncounterStep {
  const events: EncounterEvent[] = [];
  let { rng, playerHp, enemyHp, progression } = state;
  let playerAttackElapsedMs = state.playerAttackElapsedMs + TICK_MS;
  let enemyAttackElapsedMs = state.enemyAttackElapsedMs + TICK_MS;
  const composed = composedPlayer(config, progression.level, state.inventory.equipment);
  const player = composed.fighter;
  const playerIntervalMs = composed.attackIntervalMs;
  // GDD 7.2 v1.7: hit chance shifts 0.5 % per level of difference, mirrored for the enemy.
  const levelDiff = progression.level - config.enemyLevel;

  if (playerAttackElapsedMs >= playerIntervalMs) {
    playerAttackElapsedMs -= playerIntervalMs;
    const attack = resolveAttack(player, config.enemy, config.rules, rng, levelDiff);
    rng = attack.rng;
    enemyHp = Math.max(0, enemyHp - attack.result.damage);
    events.push({ type: 'attack', attacker: 'player', ...attack.result });
    if (enemyHp === 0) {
      events.push({ type: 'enemyDefeated' });
      // GDD 9.6: drop roll per kill. Magic Find is locked until quest Q4 (GDD 6.1).
      const drop = rollKillDrop(state.loot, config.loot, state.lootRng, {
        tileTier: config.tileTier,
        magicFindPct: 0,
        unlocked: NO_UNLOCKS,
      });
      const loot = drop.state;
      const lootRng = drop.rng;
      const bagFull = drop.item !== null && state.inventory.bag.length >= BAG_CAPACITY;
      const inventory = drop.item ? addToBag(state.inventory, drop.item) : state.inventory;
      if (drop.item) events.push({ type: 'itemFound', item: drop.item, bagFull });
      const gain = gainXp(progression, config.enemyXp);
      progression = gain.state;
      // Every level gained heals by exactly its HP bonus (GDD 6.2) - never a full heal.
      for (const level of gain.levelsGained) {
        playerHp += 100; // levelUpDelta().hpBonus is always +1.0 (100 hundredths).
        events.push({ type: 'leveledUp', level });
      }
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
          progression,
          rng,
          loot,
          lootRng,
          inventory,
        },
        events,
      };
    }
  }

  if (enemyAttackElapsedMs >= config.enemyAttackIntervalMs) {
    enemyAttackElapsedMs -= config.enemyAttackIntervalMs;
    const attack = resolveAttack(config.enemy, player, config.rules, rng, -levelDiff);
    rng = attack.rng;
    playerHp = Math.max(0, playerHp - attack.result.damage);
    events.push({ type: 'attack', attacker: 'enemy', ...attack.result });
    if (playerHp === 0) {
      // GDD 6.3 (online death): lose a % of the current level's progress, level never drops.
      const beforeLoss = progression;
      progression = applyDeathXpLoss(progression, config.deathXpLossPct);
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
        },
        events,
      };
    }
  }

  return {
    state: { ...state, playerAttackElapsedMs, enemyAttackElapsedMs, playerHp, enemyHp, progression, rng },
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
    ? clamp01(
        (state.playerAttackElapsedMs + extraMs) /
          playerAttackIntervalMs(config, state.progression.level, state.inventory.equipment),
      )
    : clamp01((state.enemyAttackElapsedMs + extraMs) / config.enemyAttackIntervalMs);
}

/** HP bar value 0..1 for one fighter. */
export function hpFraction(state: EncounterState, config: EncounterConfig, who: Combatant): number {
  return who === 'player'
    ? clamp01(state.playerHp / playerStats(config, state.progression.level, state.inventory.equipment).maxHp)
    : clamp01(state.enemyHp / config.enemy.maxHp);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

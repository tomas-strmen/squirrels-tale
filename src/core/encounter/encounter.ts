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
  addLevelBonus,
  applyDeathXpLoss,
  attackIntervalMsAtLevel,
  createProgression,
  cumulativeLevelBonuses,
  gainXp,
  regenAmountHundredths,
  type ProgressionState,
} from '../progression/progression';
import type { RngState } from '../rng/rng';
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
}

/** Design values as they are written in data/*.json. */
export interface EncounterConfigInput {
  readonly searchDurationS: number;
  readonly playerAttackIntervalS: number;
  readonly enemyAttackIntervalS: number;
  readonly playerAttackSpeedPctPerLevel: number;
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
  };
}

/**
 * The player's current effective stats: base stats plus the cumulative bonus
 * for `level` (GDD 6.1/6.2: +1.0 max HP/level, +0.1 max damage every level,
 * +0.1 min damage every 2nd level).
 */
export function playerStats(config: EncounterConfig, level: number): FighterStats {
  const bonus = cumulativeLevelBonuses(level);
  return createFighterStats({
    ...config.playerBase,
    maxHp: addLevelBonus(config.playerBase.maxHp, bonus.hpBonus),
    damageMax: addLevelBonus(config.playerBase.damageMax, bonus.maxDamageBonus),
    damageMin: addLevelBonus(config.playerBase.damageMin, bonus.minDamageBonus),
  });
}

/** The player's attack interval at `level` (GDD 6.1 v1.7: x1.01 per level, min 0.5 s). */
export function playerAttackIntervalMs(config: EncounterConfig, level: number): number {
  return attackIntervalMsAtLevel(
    config.playerAttackIntervalMs,
    level,
    config.playerAttackSpeedPctPerLevel,
    config.rules.minAttackIntervalMs,
  );
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
        state: toIdle({ ...state, hideoutElapsedMs }, playerStats(config, state.progression.level).maxHp),
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
  const maxHp = playerStats(config, state.progression.level).maxHp;
  if (state.playerHp >= maxHp) {
    return { ...state, regenElapsedMs: 0 };
  }
  const regenElapsedMs = state.regenElapsedMs + TICK_MS;
  if (regenElapsedMs < config.regenIntervalMs) {
    return { ...state, regenElapsedMs };
  }
  const amount = regenAmountHundredths(
    fromHundredths(config.regenAmount),
    state.progression.level,
    config.regenGrowthPctPerLevel,
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
  const player = playerStats(config, progression.level);
  const playerIntervalMs = playerAttackIntervalMs(config, progression.level);
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
        (state.playerAttackElapsedMs + extraMs) / playerAttackIntervalMs(config, state.progression.level),
      )
    : clamp01((state.enemyAttackElapsedMs + extraMs) / config.enemyAttackIntervalMs);
}

/** HP bar value 0..1 for one fighter. */
export function hpFraction(state: EncounterState, config: EncounterConfig, who: Combatant): number {
  return who === 'player'
    ? clamp01(state.playerHp / playerStats(config, state.progression.level).maxHp)
    : clamp01(state.enemyHp / config.enemy.maxHp);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

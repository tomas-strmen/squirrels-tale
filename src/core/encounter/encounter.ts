/**
 * Encounter: searching for an enemy and a 1v1 fight with HP, XP and levels
 * (GDD 7.1, 7.2, 6.2).
 *
 * M2 scope: attacks hit or miss and deal damage (core/combat). When the enemy
 * dies, the next search starts automatically (GDD 7.1), and the player gains
 * the enemy's XP - possibly leveling up (core/progression), which raises max
 * HP (healing by the same amount at once) and, every 2nd/5th level, unarmed
 * damage. When the squirrel is defeated the fight ends and she is back to
 * full HP in `idle` - a placeholder until real death (hideout, XP loss)
 * arrives in M3.2. No regeneration yet.
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
import { toHundredths } from '../numbers/numbers';
import {
  addLevelBonus,
  createProgression,
  cumulativeLevelBonuses,
  gainXp,
  type ProgressionState,
} from '../progression/progression';
import type { RngState } from '../rng/rng';
import { secondsToMs, TICK_MS } from '../time/fixedStep';

export type EncounterPhase = 'idle' | 'searching' | 'fighting';
export type Combatant = 'player' | 'enemy';

export interface EncounterConfig {
  /** How long the search for an enemy takes (ms). */
  readonly searchMs: number;
  /** Time between two player attacks (ms). */
  readonly playerAttackIntervalMs: number;
  /** Time between two enemy attacks (ms). */
  readonly enemyAttackIntervalMs: number;
  /** Player's base stats at level 1, before level bonuses (GDD 6.2). */
  readonly playerBase: FighterStatsInput;
  readonly enemy: FighterStats;
  /** XP granted when the enemy is defeated (hundredths). */
  readonly enemyXp: number;
  readonly rules: CombatRules;
}

/** Design values as they are written in data/*.json. */
export interface EncounterConfigInput {
  readonly searchDurationS: number;
  readonly playerAttackIntervalS: number;
  readonly enemyAttackIntervalS: number;
  readonly player: FighterStatsInput;
  readonly enemy: FighterStatsInput;
  /** XP granted when the enemy is defeated (design value, GDD 6.2/8.3). */
  readonly enemyXp: number;
  readonly rules: CombatRulesInput;
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
  /** Player leveled up (GDD 6.2): +1.0 max HP (healed at once), and damage every 2nd/5th level. */
  | { readonly type: 'leveledUp'; readonly level: number }
  /** M2 placeholder: fight over, squirrel back to full HP in idle (real death in M3.2). */
  | { readonly type: 'playerDefeated' }
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
  // Validates the base stats early (e.g. maxHp > 0); the checked value itself
  // is discarded because effective stats are recomputed per level, see playerStats().
  createFighterStats(input.player);
  return {
    searchMs,
    playerAttackIntervalMs,
    enemyAttackIntervalMs,
    playerBase: input.player,
    enemy: createFighterStats(input.enemy),
    enemyXp: toHundredths(input.enemyXp),
    rules: createCombatRules(input.rules),
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
    progression,
    rng,
  };
}

/**
 * The player's current effective stats: base stats plus the cumulative bonus
 * for `level` (GDD 6.2: +1.0 max HP/level, +0.1 max damage every 2nd level,
 * +0.1 min damage every 5th level).
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
 * The squirrel keeps her current HP. Does nothing while idle.
 */
export function makePeace(state: EncounterState): EncounterStep {
  if (state.phase === 'idle') {
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
      return { state, events: [] };

    case 'searching': {
      const searchElapsedMs = state.searchElapsedMs + TICK_MS;
      if (searchElapsedMs < config.searchMs) {
        return { state: { ...state, searchElapsedMs }, events: [] };
      }
      return {
        state: {
          ...state,
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
      return tickFight(state, config);
  }
}

function tickFight(state: EncounterState, config: EncounterConfig): EncounterStep {
  const events: EncounterEvent[] = [];
  let { rng, playerHp, enemyHp, progression } = state;
  let playerAttackElapsedMs = state.playerAttackElapsedMs + TICK_MS;
  let enemyAttackElapsedMs = state.enemyAttackElapsedMs + TICK_MS;
  const player = playerStats(config, progression.level);

  if (playerAttackElapsedMs >= config.playerAttackIntervalMs) {
    playerAttackElapsedMs -= config.playerAttackIntervalMs;
    const attack = resolveAttack(player, config.enemy, config.rules, rng);
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
    const attack = resolveAttack(config.enemy, player, config.rules, rng);
    rng = attack.rng;
    playerHp = Math.max(0, playerHp - attack.result.damage);
    events.push({ type: 'attack', attacker: 'enemy', ...attack.result });
    if (playerHp === 0) {
      events.push({ type: 'playerDefeated' });
      // M2 placeholder: back to full HP in idle (real death in M3.2).
      return { state: toIdle({ ...state, progression, rng }, player.maxHp), events };
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
  if (state.phase === 'idle') return 0;
  if (state.phase === 'fighting') return 1;
  return clamp01((state.searchElapsedMs + extraMs) / config.searchMs);
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
    ? clamp01((state.playerAttackElapsedMs + extraMs) / config.playerAttackIntervalMs)
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

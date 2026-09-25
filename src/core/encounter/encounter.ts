/**
 * Encounter: searching for an enemy and the attack rhythm of a 1v1 fight.
 *
 * M0.1 scope: no HP, no damage, nobody dies. The fight repeats forever.
 * HP, damage and death come in M2 (GDD 7).
 *
 * All functions are pure: they never modify the state passed in.
 */
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
}

/** Design values in seconds, as they are written in data/*.json. */
export interface EncounterConfigInput {
  readonly searchDurationS: number;
  readonly playerAttackIntervalS: number;
  readonly enemyAttackIntervalS: number;
}

export interface EncounterState {
  readonly phase: EncounterPhase;
  /** Time spent searching so far (ms). Only meaningful while searching. */
  readonly searchElapsedMs: number;
  /** Time since the player's last attack (ms). Only meaningful while fighting. */
  readonly playerAttackElapsedMs: number;
  /** Time since the enemy's last attack (ms). Only meaningful while fighting. */
  readonly enemyAttackElapsedMs: number;
}

export type EncounterEvent =
  | { readonly type: 'searchStarted' }
  | { readonly type: 'enemyFound' }
  /** Player pressed "Peace!": search or fight ended at once (no XP, no loot). */
  | { readonly type: 'peaceMade'; readonly from: 'searching' | 'fighting' }
  | { readonly type: 'attack'; readonly attacker: Combatant };

export interface EncounterStep {
  readonly state: EncounterState;
  readonly events: readonly EncounterEvent[];
}

/**
 * Builds a validated config from design values in seconds.
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
  return { searchMs, playerAttackIntervalMs, enemyAttackIntervalMs };
}

export function createEncounter(): EncounterState {
  return {
    phase: 'idle',
    searchElapsedMs: 0,
    playerAttackElapsedMs: 0,
    enemyAttackElapsedMs: 0,
  };
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
 * Does nothing while idle.
 */
export function makePeace(state: EncounterState): EncounterStep {
  if (state.phase === 'idle') {
    return { state, events: [] };
  }
  return {
    state: createEncounter(),
    events: [{ type: 'peaceMade', from: state.phase }],
  };
}

/**
 * Advances the encounter by one simulation step (TICK_MS).
 * If both fighters are due to attack in the same step, the player attacks first.
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
          phase: 'fighting',
          searchElapsedMs: config.searchMs,
          playerAttackElapsedMs: 0,
          enemyAttackElapsedMs: 0,
        },
        events: [{ type: 'enemyFound' }],
      };
    }

    case 'fighting': {
      const events: EncounterEvent[] = [];
      let playerAttackElapsedMs = state.playerAttackElapsedMs + TICK_MS;
      let enemyAttackElapsedMs = state.enemyAttackElapsedMs + TICK_MS;
      if (playerAttackElapsedMs >= config.playerAttackIntervalMs) {
        playerAttackElapsedMs -= config.playerAttackIntervalMs;
        events.push({ type: 'attack', attacker: 'player' });
      }
      if (enemyAttackElapsedMs >= config.enemyAttackIntervalMs) {
        enemyAttackElapsedMs -= config.enemyAttackIntervalMs;
        events.push({ type: 'attack', attacker: 'enemy' });
      }
      return {
        state: { ...state, playerAttackElapsedMs, enemyAttackElapsedMs },
        events,
      };
    }
  }
}

/** Search progress 0..1 (0 when not searching yet, 1 once the enemy is found). */
export function searchProgress(state: EncounterState, config: EncounterConfig): number {
  if (state.phase === 'idle') return 0;
  if (state.phase === 'fighting') return 1;
  return clamp01(state.searchElapsedMs / config.searchMs);
}

/** Attack bar progress 0..1 for one fighter (0 when not fighting). */
export function attackProgress(
  state: EncounterState,
  config: EncounterConfig,
  who: Combatant,
): number {
  if (state.phase !== 'fighting') return 0;
  return who === 'player'
    ? clamp01(state.playerAttackElapsedMs / config.playerAttackIntervalMs)
    : clamp01(state.enemyAttackElapsedMs / config.enemyAttackIntervalMs);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

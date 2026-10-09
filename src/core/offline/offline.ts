/**
 * Offline progress (GDD 17, M9.1). Pure TypeScript, no Phaser.
 *
 * Instead of estimating a time-to-kill (GDD 17.2 steps 3-4), the offline time is
 * simply simulated with the real fight rules (`core/encounter` `tick` in 'offline'
 * mode) - 6 h is 216 000 steps of 100 ms, well under a second. So food, ammo,
 * loot, pity and level-ups all work exactly as online. Offline rules:
 * - a death costs no XP; 10 s in the hideout, then the search goes on (GDD 6.3);
 * - if she died at least once, the tile isn't sustainable: she kills at half the
 *   pace (GDD 17.2) - modelled as farming only half of the offline time;
 * - in Peace! (not farming) she only regenerates;
 * - boosts don't run offline (GDD 18.1) - the auto-food unlock timer just runs out.
 */
import { CURRENCY_IDS, EMPTY_WALLET, type Wallet } from '../currency/currency';
import { FOOD_IDS, type FoodId } from '../food/food';
import type { Item } from '../loot/loot';
import { TICK_MS } from '../time/fixedStep';
import {
  enemyXpAt,
  makePeace,
  playerStats,
  startSearch,
  tick,
  type EncounterConfig,
  type EncounterState,
} from '../encounter/encounter';

/** Design values from data/balance.json `offline`. */
export interface OfflineConfigInput {
  /** Offline time is capped at this many hours (GDD 17.1: base 6 h). */
  readonly capH: number;
  /** A clock more than this far behind the highest time ever seen grants nothing (GDD 17.3). */
  readonly clockToleranceMin: number;
  /** Shorter absences are still simulated, but don't open the "While You Were Away" summary. */
  readonly minSummaryS: number;
}

export interface OfflineConfig {
  readonly capMs: number;
  readonly clockToleranceMs: number;
  readonly minSummaryMs: number;
}

export function createOfflineConfig(input: OfflineConfigInput): OfflineConfig {
  if (!(input.capH > 0)) throw new Error('offline capH must be greater than 0');
  return {
    capMs: Math.round(input.capH * 3_600_000),
    clockToleranceMs: Math.round(input.clockToleranceMin * 60_000),
    minSummaryMs: Math.round(input.minSummaryS * 1000),
  };
}

/**
 * GDD 17.2/17.3: time to catch up = now - savedAt, capped, in whole simulation steps.
 * 0 if the clock is more than the tolerance behind `maxSeenTime` (wound back).
 */
export function offlineMs(savedAt: number, maxSeenTime: number, now: number, config: OfflineConfig): number {
  if (now < maxSeenTime - config.clockToleranceMs) return 0;
  const ms = Math.min(Math.max(0, now - savedAt), config.capMs);
  return Math.floor(ms / TICK_MS) * TICK_MS;
}

export interface OfflineSummary {
  /** Real time away (after the cap). */
  readonly awayMs: number;
  /** Time actually farmed: `awayMs`, or half of it on a tile where she died (`halfPace`). */
  readonly farmedMs: number;
  readonly farming: boolean;
  readonly halfPace: boolean;
  readonly kills: number;
  /** XP earned, hundredths (offline deaths cost none). */
  readonly xpGained: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** Currencies picked up (before anything was eaten or shot). */
  readonly found: Wallet;
  /** Items in the bag now, and items lost because the bag was full. */
  readonly items: readonly Item[];
  readonly itemsLost: readonly Item[];
  readonly eaten: Readonly<Record<FoodId, number>>;
  readonly nutsShot: number;
  readonly deaths: number;
  /** Time spent recovering in the hideout. */
  readonly hideoutMs: number;
}

interface Run {
  readonly state: EncounterState;
  readonly summary: Omit<OfflineSummary, 'awayMs' | 'farmedMs' | 'farming' | 'halfPace' | 'levelBefore'>;
}

function run(start: EncounterState, config: EncounterConfig, ms: number): Run {
  let state = start;
  let kills = 0;
  let xpGained = 0;
  let deaths = 0;
  let nutsShot = 0;
  const found: Record<string, number> = { ...EMPTY_WALLET };
  const eaten: Record<string, number> = Object.fromEntries(FOOD_IDS.map((id) => [id, 0]));
  const items: Item[] = [];
  const itemsLost: Item[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    const before = state;
    const step = tick(state, config, 'offline');
    state = step.state;
    for (const e of step.events) {
      switch (e.type) {
        case 'enemyDefeated':
          kills++;
          xpGained += enemyXpAt(config, before.enemyId, before.enemyLevel);
          break;
        case 'itemFound':
          (e.bagFull ? itemsLost : items).push(e.item);
          break;
        case 'currencyFound':
          for (const d of e.drops) found[d.currencyId] = (found[d.currencyId] ?? 0) + d.amount;
          break;
        case 'ate':
          eaten[e.food] = (eaten[e.food] ?? 0) + 1;
          break;
        case 'attack':
          if (e.attacker === 'player' && e.ammo === 'nuts') nutsShot++;
          break;
        case 'playerDefeated':
          deaths++;
          break;
        default:
          break;
      }
    }
  }
  return {
    state,
    summary: {
      kills,
      xpGained,
      levelAfter: state.progression.level,
      found: Object.fromEntries(CURRENCY_IDS.map((id) => [id, found[id] ?? 0])) as Wallet,
      items,
      itemsLost,
      eaten: eaten as Record<FoodId, number>,
      nutsShot,
      deaths,
      hideoutMs: deaths * config.hideoutMs,
    },
  };
}

/** Back to a calm state the game can continue from: idle, or after the hideout at full HP. */
function settle(state: EncounterState, config: EncounterConfig): EncounterState {
  if (state.phase === 'hideout') {
    const maxHp = playerStats(config, state.progression.level, state.inventory.equipment).maxHp;
    return { ...state, phase: 'idle', playerHp: maxHp, hideoutElapsedMs: 0 };
  }
  return makePeace(state).state;
}

/**
 * Catches up `awayMs` of offline time on the saved tile (GDD 17.2). `farming` = she was
 * searching/fighting when the game closed (not in Peace!). Returns the new state - always
 * `idle`, the caller restarts the search if `farming` - and the summary for "While You Were Away".
 */
export function simulateOffline(
  start: EncounterState,
  config: EncounterConfig,
  awayMs: number,
  farming: boolean,
): { readonly state: EncounterState; readonly summary: OfflineSummary } {
  const idle = settle(start, config);
  const levelBefore = idle.progression.level;
  const head = { awayMs, farming, levelBefore };
  if (!farming) {
    const result = run(idle, config, awayMs);
    return { state: settle(result.state, config), summary: { ...head, ...result.summary, farmedMs: awayMs, halfPace: false } };
  }
  const searching = startSearch(idle).state;
  const full = run(searching, config, awayMs);
  if (full.summary.deaths === 0) {
    return { state: settle(full.state, config), summary: { ...head, ...full.summary, farmedMs: awayMs, halfPace: false } };
  }
  // GDD 17.2: she died -> the tile isn't sustainable: time-to-kill x2, i.e. half the kills, XP,
  // items and coins. Deaths and hideout time are reported from the full-length run.
  const farmedMs = Math.floor(awayMs / 2 / TICK_MS) * TICK_MS;
  const half = run(searching, config, farmedMs);
  return {
    state: settle(half.state, config),
    summary: {
      ...head,
      ...half.summary,
      deaths: full.summary.deaths,
      hideoutMs: full.summary.hideoutMs,
      farmedMs,
      halfPace: true,
    },
  };
}

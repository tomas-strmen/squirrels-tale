/**
 * XP, levels and the stat bonuses they grant (GDD 6.1/6.2, Changelog v1.7).
 * Attack speed per level: see `attackIntervalMsAtLevel`.
 *
 * All XP amounts here are internal hundredths (core/numbers), like HP and
 * damage - enemy XP rewards can have 1 decimal place (e.g. 5.5), so plain
 * whole numbers would lose precision.
 *
 * Level-up bonuses (Tomas, M3):
 * - every level: +1.0 max HP, and the squirrel is healed by that same amount
 *   at once (not a full heal).
 * - every level: +0.1 to max damage.
 * - every 2nd level (2, 4, 6, ...): +0.1 to min damage too.
 *
 * No level cap (GDD 6.2). Skill tree points are a later stage (M11), not
 * handled here.
 */
import { toHundredths } from '../numbers/numbers';

export interface ProgressionState {
  readonly level: number;
  /** XP gathered so far in the current level (hundredths). */
  readonly xp: number;
}

export interface LevelBonuses {
  /** Hundredths. */
  readonly hpBonus: number;
  /** Hundredths. */
  readonly maxDamageBonus: number;
  /** Hundredths. */
  readonly minDamageBonus: number;
}

/** New encounter/session starts at level 1 with no XP. */
export function createProgression(): ProgressionState {
  return { level: 1, xp: 0 };
}

/**
 * XP needed to go from `level` to `level + 1` (GDD 6.2 v1.7):
 * need(L) = round(10 x 1.3^(L-1)). Lv1: 10, Lv2: 13, Lv3: 17, Lv5: 29, Lv10: 106.
 */
export function xpToNextLevel(level: number): number {
  return Math.round(10 * 1.3 ** (level - 1));
}

/** Same as `xpToNextLevel`, in hundredths (to compare against `ProgressionState.xp`). */
export function xpToNextLevelHundredths(level: number): number {
  return xpToNextLevel(level) * 100;
}

/** Total bonuses (hundredths) earned by having reached `level` (level 1 has none). */
export function cumulativeLevelBonuses(level: number): LevelBonuses {
  return {
    hpBonus: (level - 1) * 100,
    maxDamageBonus: (level - 1) * 10,
    minDamageBonus: Math.floor(level / 2) * 10,
  };
}

/** Bonus (hundredths) gained exactly when reaching `level` (from `level - 1`). */
export function levelUpDelta(level: number): LevelBonuses {
  return {
    hpBonus: 100,
    maxDamageBonus: 10,
    minDamageBonus: level % 2 === 0 ? 10 : 0,
  };
}

export interface GainXpResult {
  readonly state: ProgressionState;
  /** Every level reached, in order (empty if no level-up happened). */
  readonly levelsGained: readonly number[];
}

/** Adds XP (hundredths), leveling up as many times as the XP allows. */
export function gainXp(state: ProgressionState, amountHundredths: number): GainXpResult {
  let level = state.level;
  let xp = state.xp + amountHundredths;
  const levelsGained: number[] = [];
  let needed = xpToNextLevelHundredths(level);
  while (xp >= needed) {
    xp -= needed;
    level += 1;
    levelsGained.push(level);
    needed = xpToNextLevelHundredths(level);
  }
  return { state: { level, xp }, levelsGained };
}

/**
 * Attack interval at `level` (GDD 6.1/7.2 v1.7): the base interval is divided by
 * (1 + pct/100)^(level-1) - compounding, e.g. x1.01 per level - rounded to whole
 * ms and never below `minMs`.
 */
export function attackIntervalMsAtLevel(
  baseMs: number,
  level: number,
  speedPctPerLevel: number,
  minMs: number,
): number {
  const factor = (1 + speedPctPerLevel / 100) ** (level - 1);
  return Math.max(minMs, Math.round(baseMs / factor));
}

/**
 * HP regenerated per tick of `regenIntervalS` at `level` (GDD 6.1: base amount,
 * +growthPctPerLevel% per level, compounding - "relatívne"). Result in hundredths.
 */
export function regenAmountHundredths(
  baseAmount: number,
  level: number,
  growthPctPerLevel: number,
): number {
  const factor = (1 + growthPctPerLevel / 100) ** (level - 1);
  return Math.round(toHundredths(baseAmount) * factor);
}

/**
 * XP lost on an online death (GDD 6.3): a percentage of the current level's
 * progress (never enough to drop a level - `xp` is always < the level's
 * requirement already, so this can never go negative).
 */
export function applyDeathXpLoss(state: ProgressionState, lossPct: number): ProgressionState {
  const lost = Math.round((state.xp * lossPct) / 100);
  return { ...state, xp: state.xp - lost };
}

/**
 * Adds the cumulative level bonuses for `level` to a base design value
 * (e.g. 5.0 maxHp at level 1 -> 6.0 at level 2). Uses hundredths internally
 * so repeated 0.1 steps never drift from floating point rounding.
 */
export function addLevelBonus(baseDesignValue: number, bonusHundredths: number): number {
  return (toHundredths(baseDesignValue) + bonusHundredths) / 100;
}

/**
 * One attack, resolved with the hit formula from GDD 7.2 (M2 subset).
 *
 * All values are internal integers: HP, damage and armor in hundredths
 * (core/numbers), percentages as whole numbers. Randomness only via the
 * seeded Rng passed in; the function is pure and returns the advanced Rng.
 *
 * M2 subset of GDD 7.2 - not yet included (they come with later stages):
 * hit% / skillHit bonuses, damage%, weapon skill and ammo multipliers (M4,
 * M7, M12), crit and stun (locked until quests Q3 / Q8, GDD 6.1).
 */
import { toHundredths } from '../numbers/numbers';
import { nextInt, type RngState } from '../rng/rng';

/** Constants of the hit formula, from data/balance.json `combat`. */
export interface CombatRules {
  readonly minHitPct: number;
  readonly maxHitPct: number;
  /** Armor constant K in DR = armor / (armor + K), in hundredths. */
  readonly armorConstant: number;
  readonly maxDamageReductionPct: number;
  /** Damage of a hit never goes below this (hundredths). */
  readonly minDamage: number;
}

/** One fighter's combat stats (internal units). */
export interface FighterStats {
  readonly maxHp: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly hitPct: number;
  readonly armor: number;
  readonly dodgePct: number;
}

export interface AttackResult {
  readonly hit: boolean;
  /** Damage dealt in hundredths (0 on a miss). */
  readonly damage: number;
}

/** Design values as written in data/*.json (1 decimal place, whole percentages). */
export interface CombatRulesInput {
  readonly minHitPct: number;
  readonly maxHitPct: number;
  readonly armorConstant: number;
  readonly maxDamageReductionPct: number;
  readonly minDamage: number;
}

export interface FighterStatsInput {
  readonly maxHp: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly hitPct: number;
  readonly armor: number;
  readonly dodgePct: number;
}

export function createCombatRules(input: CombatRulesInput): CombatRules {
  return {
    minHitPct: input.minHitPct,
    maxHitPct: input.maxHitPct,
    armorConstant: toHundredths(input.armorConstant),
    maxDamageReductionPct: input.maxDamageReductionPct,
    minDamage: toHundredths(input.minDamage),
  };
}

export function createFighterStats(input: FighterStatsInput): FighterStats {
  const stats: FighterStats = {
    maxHp: toHundredths(input.maxHp),
    damageMin: toHundredths(input.damageMin),
    damageMax: toHundredths(input.damageMax),
    hitPct: input.hitPct,
    armor: toHundredths(input.armor),
    dodgePct: input.dodgePct,
  };
  if (stats.maxHp <= 0) throw new Error('maxHp must be greater than 0');
  if (stats.damageMin > stats.damageMax) throw new Error('damageMin must not exceed damageMax');
  return stats;
}

/** hitChance = clamp(attacker hit - defender dodge, min, max) in whole %. */
export function hitChancePct(attacker: FighterStats, defender: FighterStats, rules: CombatRules): number {
  return clamp(attacker.hitPct - defender.dodgePct, rules.minHitPct, rules.maxHitPct);
}

/** DR = armor / (armor + K), capped at maxDamageReductionPct. Returns a fraction 0..1. */
export function damageReduction(armor: number, rules: CombatRules): number {
  if (armor <= 0) return 0;
  return Math.min(armor / (armor + rules.armorConstant), rules.maxDamageReductionPct / 100);
}

/**
 * Damage of a hit before the random roll is known: raw (hundredths) reduced
 * by the defender's armor, rounded to 0.1 and at least `minDamage`.
 */
export function finalDamage(raw: number, defenderArmor: number, rules: CombatRules): number {
  const reduced = raw * (1 - damageReduction(defenderArmor, rules));
  const roundedToTenth = Math.round(reduced / 10) * 10;
  return Math.max(rules.minDamage, roundedToTenth);
}

/**
 * Resolves one attack: hit roll, then damage roll uniformly in 0.1 steps
 * between damageMin and damageMax (both inclusive), then armor.
 */
export function resolveAttack(
  attacker: FighterStats,
  defender: FighterStats,
  rules: CombatRules,
  rng: RngState,
): { readonly result: AttackResult; readonly rng: RngState } {
  const hitRoll = nextInt(rng, 0, 100);
  if (hitRoll.value >= hitChancePct(attacker, defender, rules)) {
    return { result: { hit: false, damage: 0 }, rng: hitRoll.state };
  }
  // Design values have 1 decimal place, so min/max are whole tenths (multiples of 10).
  const minTenths = attacker.damageMin / 10;
  const maxTenths = attacker.damageMax / 10;
  const damageRoll = nextInt(hitRoll.state, minTenths, maxTenths + 1);
  const raw = damageRoll.value * 10;
  return {
    result: { hit: true, damage: finalDamage(raw, defender.armor, rules) },
    rng: damageRoll.state,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

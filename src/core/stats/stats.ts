/**
 * Character + equipment -> the numbers used in combat (GDD 6.1 v1.8, 7.2, 9.1 v2.3).
 *
 * - Flat values ADD: max HP, armor, damage (character fists + right-paw weapon
 *   + left-paw weapon at `offHandDamagePct` %).
 * - Percentages MULTIPLY: damage %, attack speed %, regeneration % - each item
 *   is its own (1 + p) factor.
 * - Hit % adds percentage points to the hit chance.
 * - Attack interval: (character base + right-paw weapon shift) / level factor
 *   / attack speed factors, never below the minimum. A left-paw weapon does
 *   not change it (GDD 9.1 v2.3).
 *
 * Values are hundredths (percent stats too: 3 % -> 300).
 *
 * Weapon mode (GDD 7.1, M7.3a): only one weapon set fights at a time - see
 * chooseWeaponMode(). 'melee' = both paws, 'ranged' = the ranged weapon alone
 * (it takes both paws, so a left-paw weapon adds nothing), 'fists' = no weapon
 * damage. Stats and affixes of all worn gear count in every mode.
 */
import type { FighterStats } from '../combat/combat';
import type { StatId } from '../content/schemas';
import { equippedItems, type Equipment } from '../inventory/inventory';

export type WeaponMode = 'melee' | 'ranged' | 'fists';

/**
 * GDD 7.1: a flying enemy -> ranged weapon only (none -> fists); otherwise the
 * paw weapons (none -> ranged weapon; none either -> fists).
 */
export function chooseWeaponMode(equipment: Equipment, enemyFlying: boolean): WeaponMode {
  const hasRanged = equipment.ranged?.weapon != null;
  if (enemyFlying) return hasRanged ? 'ranged' : 'fists';
  const hasMelee = equipment.rightPaw?.weapon != null || equipment.leftPaw?.weapon != null;
  if (hasMelee) return 'melee';
  return hasRanged ? 'ranged' : 'fists';
}

export interface ComposeInput {
  /** Character stats at the current level, without gear (hundredths). */
  readonly character: FighterStats;
  /** Character's own attack interval (fists), ms. */
  readonly baseAttackIntervalMs: number;
  /** Attack speed from levels, e.g. 1.01^(L-1) (GDD 6.1 v1.7). */
  readonly levelSpeedFactor: number;
  readonly minAttackIntervalMs: number;
  readonly equipment: Equipment;
  /** Left-paw weapon damage in % of its own (50). */
  readonly offHandDamagePct: number;
  /** Which weapons fight (default 'melee' = both paws). */
  readonly weaponMode?: WeaponMode;
}

export interface ComposedStats {
  readonly fighter: FighterStats;
  readonly attackIntervalMs: number;
  /** Multiplier for the regen amount (1 = none). */
  readonly regenMultiplier: number;
}

export function composeStats(input: ComposeInput): ComposedStats {
  const gear = equippedItems(input.equipment);
  const flat = (stat: StatId) =>
    gear.reduce(
      (sum, { item }) => sum + [...item.stats, ...item.affixes].filter((s) => s.stat === stat).reduce((a, s) => a + s.value, 0),
      0,
    );
  const factor = (stat: StatId) =>
    gear.reduce(
      (prod, { item }) =>
        [...item.stats, ...item.affixes].filter((s) => s.stat === stat).reduce((p, s) => p * (1 + s.value / 10000), prod),
      1,
    );

  const mode = input.weaponMode ?? 'melee';
  // 'ranged': the ranged weapon takes the main-weapon role (damage + interval shift), both paws idle.
  const right = mode === 'melee' ? (input.equipment.rightPaw?.weapon ?? null)
    : mode === 'ranged' ? (input.equipment.ranged?.weapon ?? null) : null;
  const left = mode === 'melee' ? (input.equipment.leftPaw?.weapon ?? null) : null;
  const offHand = input.offHandDamagePct / 100;
  const damageFactor = factor('damagePct');
  const rawMin = input.character.damageMin + (right?.damageMin ?? 0) + (left?.damageMin ?? 0) * offHand;
  const rawMax = input.character.damageMax + (right?.damageMax ?? 0) + (left?.damageMax ?? 0) * offHand;

  const intervalBase = input.baseAttackIntervalMs + (right?.attackIntervalModMs ?? 0);
  const attackIntervalMs = Math.max(
    input.minAttackIntervalMs,
    Math.round(intervalBase / (input.levelSpeedFactor * factor('attackSpeedPct'))),
  );

  return {
    fighter: {
      ...input.character,
      maxHp: input.character.maxHp + flat('maxHp'),
      armor: input.character.armor + flat('armor'),
      damageMin: Math.round(rawMin * damageFactor),
      damageMax: Math.round(rawMax * damageFactor),
      hitPct: input.character.hitPct + flat('hitPct') / 100,
    },
    attackIntervalMs,
    regenMultiplier: factor('regenPct'),
  };
}

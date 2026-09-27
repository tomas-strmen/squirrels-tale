/**
 * Maps validated data (data/balance.json + one enemy from data/enemies.json)
 * to the design-value input of `createEncounterConfig`. One place for this, so
 * the game and the content tests build fights exactly the same way.
 */
import type { EncounterConfigInput } from '../encounter/encounter';
import type { AffixData, Balance, Enemy, ItemData, RarityData } from './schemas';

export interface LootData {
  readonly items: readonly ItemData[];
  readonly rarities: readonly RarityData[];
  readonly affixes: readonly AffixData[];
}

export function toEncounterConfigInput(balance: Balance, enemy: Enemy, lootData: LootData): EncounterConfigInput {
  return {
    searchDurationS: balance.encounter.searchDurationS,
    playerAttackIntervalS: balance.player.unarmedAttackIntervalS,
    enemyAttackIntervalS: enemy.attackIntervalS,
    playerAttackSpeedPctPerLevel: balance.player.attackSpeedPctPerLevel,
    offHandDamagePct: balance.player.offHandDamagePct,
    player: {
      maxHp: balance.player.maxHp,
      damageMin: balance.player.unarmedDamageMin,
      damageMax: balance.player.unarmedDamageMax,
      hitPct: balance.player.hitPct,
      armor: balance.player.armor,
      // Dodge is locked until quest Q7 (GDD 6.1).
      dodgePct: 0,
    },
    enemy: {
      maxHp: enemy.maxHp,
      damageMin: enemy.damageMin,
      damageMax: enemy.damageMax,
      hitPct: enemy.hitPct,
      armor: enemy.armor,
      dodgePct: enemy.dodgePct,
    },
    // GDD 8.4: fixed at the enemy's base level until the map (M6) rolls it per tile.
    enemyLevel: enemy.baseLevel,
    enemyXp: enemy.xp,
    rules: balance.combat,
    regenAmount: balance.player.regenAmount,
    regenIntervalS: balance.player.regenIntervalS,
    regenGrowthPctPerLevel: balance.player.regenGrowthPctPerLevel,
    hideoutRegenS: balance.death.hideoutRegenS,
    deathXpLossPct: balance.death.xpLossPct,
    loot: { ...lootData, balance: balance.loot },
    // Placeholder until the map (M6): the only tile is T1.
    tileTier: 1,
  };
}

/**
 * Maps validated data (data/balance.json + a tile and its enemies from
 * data/tiles.json + data/enemies.json) to the design-value input of
 * `createEncounterConfig`. One place for this, so the game and the content
 * tests build fights exactly the same way.
 */
import type { EncounterConfigInput } from '../encounter/encounter';
import type { AffixData, Balance, Enemy, ItemData, RarityData, TileData } from './schemas';

export interface LootData {
  readonly items: readonly ItemData[];
  readonly rarities: readonly RarityData[];
  readonly affixes: readonly AffixData[];
}

/**
 * `enemies`: all of `data/enemies.json`; the tile's spawn table (`tile.spawns`, GDD 8.2 v2.5)
 * picks which of them can appear on it and with what weight.
 */
export function toEncounterConfigInput(
  balance: Balance,
  tile: TileData,
  enemies: readonly Enemy[],
  lootData: LootData,
): EncounterConfigInput {
  return {
    searchDurationS: balance.encounter.searchDurationS,
    playerAttackIntervalS: balance.player.unarmedAttackIntervalS,
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
    enemies: tile.spawns.map((spawn) => {
      const enemy = enemies.find((e) => e.id === spawn.enemyId);
      if (!enemy) throw new Error(`Tile "${tile.id}" spawns unknown enemy "${spawn.enemyId}"`);
      return { ...enemy, spawnWeight: spawn.weight };
    }),
    // GDD 8.4: rolled per encounter within the tile's own range, whichever species spawns.
    enemyLevelMin: tile.enemyLevelMin,
    enemyLevelMax: tile.enemyLevelMax,
    enemyLeveling: balance.enemyLeveling,
    rules: balance.combat,
    regenAmount: balance.player.regenAmount,
    regenIntervalS: balance.player.regenIntervalS,
    regenGrowthPctPerLevel: balance.player.regenGrowthPctPerLevel,
    hideoutRegenS: balance.death.hideoutRegenS,
    deathXpLossPct: balance.death.xpLossPct,
    food: balance.food,
    loot: { ...lootData, balance: balance.loot },
    tileTier: tile.tier,
  };
}

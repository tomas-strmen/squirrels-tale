/**
 * Zod schemas for data/*.json (GDD: "content and numbers only in data, with zod
 * schemas"). Invalid data fails loudly and early, with a clear message of what
 * is wrong - instead of crashing somewhere unrelated later.
 *
 * A new item/enemy is a new record in the JSON, never new code here.
 */
import { z } from 'zod';

/** snake_case id, used for enemies, items, etc. */
export const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case (e.g. "worker_ant")');

/**
 * A design value in seconds (GDD 5): max. 1 decimal place, never negative.
 * (Converted to whole milliseconds later by core/time's `secondsToMs`.)
 */
export const designSecondsSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => Math.abs(Math.round(value * 10) - value * 10) < 1e-9,
    'must have at most 1 decimal place',
  );

/**
 * A design value such as HP, damage or armor (GDD 5): max. 1 decimal place,
 * never negative. (Converted to hundredths later by core/numbers.)
 */
export const designValueSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => Math.abs(Math.round(value * 10) - value * 10) < 1e-9,
    'must have at most 1 decimal place',
  );

/** Like `designValueSchema` but may be negative (e.g. a weapon's attack interval shift). */
export const signedDesignValueSchema = z
  .number()
  .finite()
  .refine(
    (value) => Math.abs(Math.round(value * 10) - value * 10) < 1e-9,
    'must have at most 1 decimal place',
  );

/** A whole percentage 0..100 (GDD 5: percentages are whole numbers). */
export const percentSchema = z.number().int().min(0).max(100);

const damageRangeValid = (v: { damageMin: number; damageMax: number }) =>
  v.damageMin <= v.damageMax;

/**
 * One entry in an enemy's own drop table (GDD 9.3/9.6 v2.4): rolled independently on each
 * kill. `pctAtMin`/`pctAtMax` are the drop chance (in %, e.g. 0.5 = 0.5 %) at the enemy's own
 * `minLevel`/`maxLevel` (see `enemyLootSchema`), linearly interpolated for levels in between.
 */
export const enemyDropItemSchema = z.object({
  itemId: idSchema,
  pctAtMin: designValueSchema,
  pctAtMax: designValueSchema,
});
export type EnemyDropItem = z.infer<typeof enemyDropItemSchema>;

/**
 * An enemy's own weight for one (base-kind) rarity (GDD 9.3/9.6 v2.4), at `minLevel`/`maxLevel`,
 * same interpolation as `enemyDropItemSchema`. Only for Uncommon/Rare/Legendary - Common is
 * always the remainder (100 - the others, floored at 0) and Unique/Set are their own drop-table
 * entry with a fixed rarity (never rolled here).
 */
export const enemyRarityWeightSchema = z.object({
  rarityId: idSchema,
  weightAtMin: designValueSchema,
  weightAtMax: designValueSchema,
});
export type EnemyRarityWeight = z.infer<typeof enemyRarityWeightSchema>;

/** Wallet counters (GDD 11.1, 7.4): the three currencies plus Berries (food only). Time Needles come later (M17). */
export const CURRENCY_IDS = ['pebbles', 'seeds', 'nuts', 'berries'] as const;
export const currencyIdSchema = z.enum(CURRENCY_IDS);
export type CurrencyId = z.infer<typeof currencyIdSchema>;

/**
 * One currency in an enemy's own drop table (GDD 11.1 v2.5): rolled independently on each
 * kill. `pctAtMin`/`pctAtMax` is the chance (in %) to drop, interpolated over the enemy's own
 * `minLevel`/`maxLevel` like items; when it drops, `amountMin`..`amountMax` pieces fall (whole,
 * uniform). A currency not listed never drops from this enemy.
 */
export const enemyDropCurrencySchema = z
  .object({
    currencyId: currencyIdSchema,
    pctAtMin: designValueSchema,
    pctAtMax: designValueSchema,
    amountMin: z.number().int().min(1),
    amountMax: z.number().int().min(1),
  })
  .refine((c) => c.amountMax >= c.amountMin, { message: 'amountMax must not be less than amountMin' });
export type EnemyDropCurrency = z.infer<typeof enemyDropCurrencySchema>;

/** An enemy's whole loot setup (GDD 9.3/9.6 v2.4, 11.1 v2.5): drop table, rarity weights, currencies. */
export const enemyLootSchema = z
  .object({
    /** Anchor levels for interpolation (own to this enemy, independent of the tile). */
    minLevel: z.number().int().min(1),
    maxLevel: z.number().int().min(1),
    items: z.array(enemyDropItemSchema),
    rarities: z.array(enemyRarityWeightSchema),
    currencies: z.array(enemyDropCurrencySchema),
  })
  .refine((l) => l.maxLevel >= l.minLevel, { message: 'maxLevel must not be less than minLevel' })
  .refine((l) => new Set(l.items.map((i) => i.itemId)).size === l.items.length, {
    message: 'duplicate itemId in an enemy loot table',
  })
  .refine((l) => new Set(l.rarities.map((r) => r.rarityId)).size === l.rarities.length, {
    message: 'duplicate rarityId in an enemy loot table',
  })
  .refine((l) => new Set(l.currencies.map((c) => c.currencyId)).size === l.currencies.length, {
    message: 'duplicate currencyId in an enemy loot table',
  });
export type EnemyLoot = z.infer<typeof enemyLootSchema>;

export const enemySchema = z
  .object({
    id: idSchema,
    /**
     * Anchor level (GDD 8.4, "b"): the enemy's own lowest level of first appearance, across
     * every tile it can spawn on. Stats below apply at this level; the tile it fights on
     * supplies the actual rolled level range (see `tileSchema`).
     */
    baseLevel: z.number().int().min(1),
    maxHp: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
    damageMin: designValueSchema,
    damageMax: designValueSchema,
    attackIntervalS: designSecondsSchema,
    hitPct: percentSchema,
    armor: designValueSchema,
    dodgePct: percentSchema,
    /** XP granted when defeated at `baseLevel` (GDD 6.2, 8.3); scales with the rolled level. */
    xp: designValueSchema,
    /** Drop table and rarity weights (GDD 9.3/9.6 v2.4), own minLevel/maxLevel for interpolation. */
    loot: enemyLootSchema,
    /** Flying enemies are fought with the ranged weapon (GDD 7.1, M7.3). Omitted = false. */
    flying: z.boolean().default(false),
  })
  .refine(damageRangeValid, { message: 'damageMin must not be greater than damageMax' });
export type Enemy = z.infer<typeof enemySchema>;

export const enemiesSchema = z
  .array(enemySchema)
  .min(1, 'data/enemies.json must contain at least one enemy')
  .refine((enemies) => new Set(enemies.map((e) => e.id)).size === enemies.length, {
    message: 'enemy ids must be unique',
  });

/** A map tile (GDD 8.1/8.2): which enemies can spawn there, their rolled level range, and
 * how many kills on the previous tile unlock this one. Order in the array = map order. */
export const tileSchema = z
  .object({
    id: idSchema,
    /** Tier used by loot (GDD 9.3/9.6 `minTileTier`) - the tile's own "T" number. */
    tier: z.number().int().min(1),
    /**
     * Spawn table (GDD 8.2 v2.5): which enemy species can appear here and how likely, as relative
     * weights (e.g. 70/30, or 50/25/25 - need not sum to 100). Each new enemy rolls one entry.
     */
    spawns: z
      .array(z.object({ enemyId: idSchema, weight: designValueSchema.refine((w) => w > 0, 'must be greater than 0') }))
      .min(1),
    /** Level range enemies roll into on this tile (GDD 8.4). */
    enemyLevelMin: z.number().int().min(1),
    enemyLevelMax: z.number().int().min(1),
    /** Kills needed on the *previous* tile in the array to unlock this one (0 = unlocked from the start). */
    unlockKills: z.number().int().min(0),
    /** Player level also needed to unlock this tile (GDD 8.2, e.g. T3: 30 kills + Lv 5); omitted = none. */
    unlockLevel: z.number().int().min(1).optional(),
  })
  .refine((t) => t.enemyLevelMax >= t.enemyLevelMin, {
    message: 'enemyLevelMax must not be less than enemyLevelMin',
  })
  .refine((t) => new Set(t.spawns.map((s) => s.enemyId)).size === t.spawns.length, {
    message: 'duplicate enemyId in a tile spawn table',
  });
export type TileData = z.infer<typeof tileSchema>;

export const tilesSchema = z
  .array(tileSchema)
  .min(1, 'data/tiles.json must contain at least one tile')
  .refine((tiles) => new Set(tiles.map((t) => t.id)).size === tiles.length, {
    message: 'tile ids must be unique',
  })
  .refine((tiles) => tiles[0]?.unlockKills === 0, {
    message: 'the first tile must be unlocked from the start (unlockKills: 0)',
  });

/** Stats that gear can carry (GDD 9.3 affixes, 9.4 item stats). Values are flat or % (see name). */
export const statIdSchema = z.enum([
  'maxHp',
  'armor',
  'damagePct',
  'attackSpeedPct',
  'hitPct',
  'regenPct',
  'currencyFindPct',
  'critChancePct',
  'critDamagePct',
  'magicFindPct',
  'dodgePct',
  'stunChancePct',
]);
export type StatId = z.infer<typeof statIdSchema>;

export const itemSlotSchema = z.enum(['melee', 'ranged', 'head', 'body', 'legs', 'ring', 'amulet']);

/** Skill tree (GDD 13.1, M11): 3 branches; a node can be bought once the previous one in its branch is. */
export const treeBranchSchema = z.enum(['thorn', 'bark', 'acorn']);
export const treeNodeSchema = z.object({
  id: idSchema,
  branch: treeBranchSchema,
  /** normal = 1 skill point, keystone = 1 special point (every 5th level). */
  kind: z.enum(['normal', 'keystone']),
  effect: z.discriminatedUnion('type', [
    /** Like an item stat, design units (5 = +5 %, 0.5 = +0.5 HP). */
    z.object({ type: z.literal('stat'), stat: statIdSchema, value: designValueSchema }),
    z.object({ type: z.literal('xpPct'), value: percentSchema }),
    /** Chance a shot doesn't use up its nut (GDD 7.3). */
    z.object({ type: z.literal('nutSavePct'), value: percentSchema }),
    /** Offline time cap + minutes (GDD 17.1). */
    z.object({ type: z.literal('offlineCapMin'), value: z.number().int().min(1) }),
    z.object({ type: z.literal('keystone'), keystone: z.enum(['wildSquirrel', 'thickBark', 'goldenAcorn']) }),
  ]),
  /** Quest that unlocks this node (its stat is locked until then, GDD 6.1); null = always. */
  unlockedBy: idSchema.nullable(),
});
export type TreeNodeData = z.infer<typeof treeNodeSchema>;
export const treeSchema = z
  .object({
    /** Reset costs this many pebbles x player level (GDD 13.1). */
    resetCostPebblesPerLevel: z.number().int().min(0),
    nodes: z.array(treeNodeSchema).min(1),
  })
  .refine((t) => new Set(t.nodes.map((n) => n.id)).size === t.nodes.length, { message: 'duplicate tree node id' });
export type TreeData = z.infer<typeof treeSchema>;

export function parseTree(data: unknown): TreeData {
  return treeSchema.parse(data);
}
export type ItemSlot = z.infer<typeof itemSlotSchema>;

/** A d20 face range, both ends inclusive within 1-20 (GDD 9.6 dice roll). */
const diceRangeSchema = z
  .tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(20)])
  .refine(([min, max]) => min <= max, { message: 'min must not be greater than max' });

const statRangeSchema = z
  .object({ stat: statIdSchema, min: designValueSchema, max: designValueSchema })
  .refine((r) => r.min <= r.max, { message: 'min must not be greater than max' });

/** A base item (GDD 9.4). Rarity scales its values when it drops (9.3). */
export const itemSchema = z.object({
  id: idSchema,
  slot: itemSlotSchema,
  tier: z.number().int().min(1),
  kind: z.enum(['base', 'unique', 'set']),
  weapon: z
    .object({
      damageMin: designValueSchema,
      damageMax: designValueSchema,
      /**
       * Shift of the character's attack interval in seconds (GDD 9.4 v2.3): negative = faster
       * (Sharp Twig -0.4: 4.0 -> 3.6 s), positive = slower but heavier.
       */
      attackIntervalModS: signedDesignValueSchema,
    })
    .refine(damageRangeValid, { message: 'damageMin must not be greater than damageMax' })
    .nullable(),
  stats: z.array(statRangeSchema),
});
export type ItemData = z.infer<typeof itemSchema>;

export const itemsSchema = z
  .array(itemSchema)
  .min(1)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    message: 'item ids must be unique',
  });

/**
 * A rarity (GDD 9.2, 9.6): metadata only - weights now live per enemy (`enemyLootSchema`,
 * GDD 9.3/9.6 v2.4). Array order = rank (Common first), used by the pity guarantee ("at least X").
 */
export const raritySchema = z.object({
  id: idSchema,
  isRemainder: z.boolean(),
  statMultPct: z.number().int().min(1),
  affixCount: z.number().int().min(0),
  /** How Magic Find scales an enemy's weight for this rarity (GDD 9.6). */
  mfScaling: z.enum(['none', 'linear', 'diminishing']),
  /** Unique/Set always drop as themselves at this rarity - no roll, no fallback (9.5 v2.4). */
  itemKind: z.enum(['base', 'unique', 'set']),
  /** Quest id that unlocks this rarity (e.g. Legendary, GDD 9.6 v2.1); null = always. */
  unlockedBy: idSchema.nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour'),
  /** Face range (1-20) the d20 lands on for this rarity (GDD 9.6 dice roll). */
  diceRange: diceRangeSchema,
  /** Face range on the second, gold d20 - only unique/set/legendary (a "20" on the first die). */
  goldDiceRange: diceRangeSchema.nullable(),
  /** Merchant price, % of the item value V(t) (GDD 11.2: Uncommon x3); null = the merchant never sells it. */
  buyPct: z.number().int().min(1).nullable(),
  /** Merchant buy-back, % of V(t) (GDD 11.2: Common 0.2 V ... Legendary 10 V). */
  sellPct: z.number().int().min(0),
});
export type RarityData = z.infer<typeof raritySchema>;

export const raritiesSchema = z
  .array(raritySchema)
  .min(1)
  .refine((r) => r.filter((x) => x.isRemainder).length === 1, {
    message: 'exactly one rarity must be the remainder (Common)',
  })
  .refine((r) => new Set(r.map((x) => x.id)).size === r.length, { message: 'rarity ids must be unique' });

/** An affix (GDD 9.3). Range is for tier 1; `unlockedBy` = quest that unlocks the stat (6.1). */
export const affixSchema = z
  .object({
    id: idSchema,
    stat: statIdSchema,
    min: designValueSchema,
    max: designValueSchema,
    unlockedBy: idSchema.nullable(),
  })
  .refine((a) => a.min <= a.max, { message: 'min must not be greater than max' });
export type AffixData = z.infer<typeof affixSchema>;

export const affixesSchema = z
  .array(affixSchema)
  .min(1)
  .refine((a) => new Set(a.map((x) => x.id)).size === a.length, { message: 'affix ids must be unique' });

export function parseItems(data: unknown): ItemData[] {
  return itemsSchema.parse(data);
}
export function parseRarities(data: unknown): RarityData[] {
  return raritiesSchema.parse(data);
}
export function parseAffixes(data: unknown): AffixData[] {
  return affixesSchema.parse(data);
}

export const balanceSchema = z.object({
  encounter: z.object({
    searchDurationS: designSecondsSchema,
  }),
  player: z
    .object({
      maxHp: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
      unarmedAttackIntervalS: designSecondsSchema,
      unarmedDamageMin: designValueSchema,
      unarmedDamageMax: designValueSchema,
      hitPct: percentSchema,
      armor: designValueSchema,
      /** Attack speed gained per level, compounding (GDD 6.1 v1.7: 1 % -> x1.01). */
      attackSpeedPctPerLevel: percentSchema,
      /** Damage of a weapon in the left paw, as % of its own (GDD 9.1 v2.3). */
      offHandDamagePct: percentSchema,
      /** HP regenerated every `regenIntervalS`, before the per-level growth (GDD 6.1). */
      regenAmount: designValueSchema,
      regenIntervalS: designSecondsSchema.refine((v) => v > 0, 'must be greater than 0'),
      /** Regen amount growth per level, compounding (GDD 6.1: "+3 % / level, relatívne"). */
      regenGrowthPctPerLevel: percentSchema,
    })
    .refine((p) => p.unarmedDamageMin <= p.unarmedDamageMax, {
      message: 'unarmedDamageMin must not be greater than unarmedDamageMax',
    }),
  /** Constants of the hit formula (GDD 7.2). */
  combat: z
    .object({
      minHitPct: percentSchema,
      maxHitPct: percentSchema,
      armorConstant: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
      maxDamageReductionPct: percentSchema,
      minDamage: designValueSchema,
      /** Hit chance +/- per level of difference attacker vs defender (GDD 6.1/7.2 v1.7). */
      hitPctPerLevelDiff: designValueSchema,
      /** Attack interval never goes below this (GDD 6.1). */
      minAttackIntervalS: designSecondsSchema,
      /** Hit chance multiplier (%) for bare fists against a flying enemy (GDD 7.1 v2.7). */
      fistsVsFlyingHitPct: percentSchema,
    })
    .refine((c) => c.minHitPct <= c.maxHitPct, {
      message: 'minHitPct must not be greater than maxHitPct',
    }),
  /** Item drops (GDD 9.3, 9.6). Drop chance itself is per-enemy now (v2.4, see enemySchema). */
  loot: z.object({
    /**
     * Pity guarantees (GDD 9.6 v2.2): after `kills` kills without a drop of `rarity` or better,
     * the next drop is at least that rarity. Each counter resets on such a drop.
     */
    pity: z
      .array(z.object({ rarity: idSchema, kills: z.number().int().min(1) }))
      .refine((p) => new Set(p.map((x) => x.rarity)).size === p.length, {
        message: 'one pity entry per rarity',
      }),
    /** Affix value growth per item tier: base x (1 + pct/100 x (tier - 1)) (9.3). */
    affixTierGrowthPct: percentSchema,
    /** GDD 10: items of this rarity or better are never lost to a full bag (the bag goes over its limit). */
    keepWhenBagFullFrom: idSchema,
    /** Value growth per upgrade level (9.3, 12.2 - used from M16). */
    upgradeGrowthPct: percentSchema,
  }),
  /** Death and hideout recovery (GDD 6.3, M3.2 placeholder - no map/hideout screen yet). */
  death: z.object({
    /** Squirrel returns from the hideout at full HP after this long (GDD 6.3). */
    hideoutRegenS: designSecondsSchema.refine((v) => v > 0, 'must be greater than 0'),
    /** % of the current level's XP progress lost on an online death (GDD 6.3). Level never drops. */
    xpLossPct: percentSchema,
  }),
  /** Food (GDD 7.4, M7.2). */
  food: z.object({
    /** HP healed by one piece. */
    berryHeal: designValueSchema,
    seedHeal: designValueSchema,
    nutHeal: designValueSchema,
    /** Shared cooldown after eating, manual or auto. */
    eatCooldownS: designSecondsSchema,
    /** Auto-food eats below this % of max HP. */
    autoEatBelowPct: percentSchema,
    /** One "watch an ad" unlocks auto-food for this long (mock ad, GDD 18.1). */
    autoFoodUnlockS: designSecondsSchema.refine((v) => v > 0, 'must be greater than 0'),
  }),
  /** Merchant - the Magpie (GDD 11.2, M10). */
  merchant: z.object({
    /** She opens when this tile is unlocked (her home; quest Q2 takes over in M13). */
    unlockTile: idSchema,
    /** Item value V(t) = round(baseValue x (1 + valueGrowthPct/100)^(t-1)). */
    baseValue: z.number().int().min(1),
    valueGrowthPct: z.number().int().min(0),
    /** Lowest buy-back price. */
    minSellPrice: z.number().int().min(0),
    /** Daily stock: how many items of each rarity (GDD: 4 Common + 1 Uncommon). */
    dailyStock: z.array(z.object({ rarityId: idSchema, count: z.number().int().min(1) })),
    /** Currency paid (and paid out) by item slot: weapons pebbles, armor seeds, jewellery nuts. */
    currencyBySlot: z.object(
      Object.fromEntries(itemSlotSchema.options.map((slot) => [slot, z.enum(CURRENCY_IDS)])) as Record<
        z.infer<typeof itemSlotSchema>,
        z.ZodEnum<{ [K in (typeof CURRENCY_IDS)[number]]: K }>
      >,
    ),
  }),
  /** Offline progress (GDD 17, M9). */
  offline: z.object({
    /** Offline time cap in hours (GDD 17.1: base 6 h). */
    capH: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
    /** Clock more than this many minutes behind the highest time seen -> no offline time (GDD 17.3). */
    clockToleranceMin: z.number().min(0),
    /** Absences shorter than this are simulated silently (no "While You Were Away"). */
    minSummaryS: z.number().min(0),
  }),
  /** Ranged weapon ammo (GDD 7.3, M7.3b). */
  ammo: z.object({
    /** Nuts spent per shot. */
    nutsPerShot: z.number().int().min(1),
    /** Damage of a shot with pebbles from the ground (no nuts to spare), % of normal. */
    groundAmmoDamagePct: percentSchema.refine((v) => v > 0, 'must be greater than 0'),
    /** Starting value of "keep at least N nuts" (reserve for food/trade, not shot). */
    keepNutsDefault: z.number().int().min(0),
  }),
  /** Enemy stat scaling per level above its tile's base level (GDD 8.4, M6.1). Crit is locked (GDD 6.1). */
  enemyLeveling: z.object({
    hpPctPerLevel: percentSchema,
    damagePctPerLevel: percentSchema,
    xpPctPerLevel: percentSchema,
    dodgePctPerLevel: designValueSchema,
    maxDodgePct: percentSchema,
  }),
});
export type Balance = z.infer<typeof balanceSchema>;

/** Parses data/enemies.json. Throws a ZodError with a readable message if invalid. */
export function parseEnemies(data: unknown): Enemy[] {
  return enemiesSchema.parse(data);
}

/** Parses data/tiles.json. Throws a ZodError with a readable message if invalid. */
export function parseTiles(data: unknown): TileData[] {
  return tilesSchema.parse(data);
}

/** Parses data/balance.json. Throws a ZodError with a readable message if invalid. */
export function parseBalance(data: unknown): Balance {
  return balanceSchema.parse(data);
}

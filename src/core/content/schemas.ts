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

/** A whole percentage 0..100 (GDD 5: percentages are whole numbers). */
export const percentSchema = z.number().int().min(0).max(100);

const damageRangeValid = (v: { damageMin: number; damageMax: number }) =>
  v.damageMin <= v.damageMax;

export const enemySchema = z
  .object({
    id: idSchema,
    /** Lowest level of the tile range where it appears (GDD 8.4, "b"). */
    baseLevel: z.number().int().min(1),
    maxHp: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
    damageMin: designValueSchema,
    damageMax: designValueSchema,
    attackIntervalS: designSecondsSchema,
    hitPct: percentSchema,
    armor: designValueSchema,
    dodgePct: percentSchema,
    /** XP granted when defeated (GDD 6.2, 8.3). */
    xp: designValueSchema,
  })
  .refine(damageRangeValid, { message: 'damageMin must not be greater than damageMax' });
export type Enemy = z.infer<typeof enemySchema>;

export const enemiesSchema = z
  .array(enemySchema)
  .min(1, 'data/enemies.json must contain at least one enemy')
  .refine((enemies) => new Set(enemies.map((e) => e.id)).size === enemies.length, {
    message: 'enemy ids must be unique',
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
export type ItemSlot = z.infer<typeof itemSlotSchema>;

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
      attackIntervalS: designSecondsSchema.refine((v) => v > 0, 'must be greater than 0'),
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

/** A rarity (GDD 9.2, 9.6). Weights are per 100; the `isRemainder` one gets 100 - the rest. */
export const raritySchema = z.object({
  id: idSchema,
  weight: designValueSchema,
  isRemainder: z.boolean(),
  statMultPct: z.number().int().min(1),
  affixCount: z.number().int().min(0),
  /** How Magic Find scales this weight (GDD 9.6). */
  mfScaling: z.enum(['none', 'linear', 'diminishing']),
  /** Which base items it draws from; unique/set fall back to Rare +1 affix when none exist (9.5). */
  itemKind: z.enum(['base', 'unique', 'set']),
  /** Counts as a pity-tier drop (Unique/Set/Legendary, GDD 9.6). */
  pity: z.boolean(),
  /** Only drops on tiles of this tier or higher (e.g. Set only T3+, GDD 9.6). */
  minTileTier: z.number().int().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour'),
});
export type RarityData = z.infer<typeof raritySchema>;

export const raritiesSchema = z
  .array(raritySchema)
  .min(1)
  .refine((r) => r.filter((x) => x.isRemainder).length === 1, {
    message: 'exactly one rarity must be the remainder (Common)',
  })
  .refine((r) => r.filter((x) => !x.isRemainder).reduce((s, x) => s + x.weight, 0) <= 100, {
    message: 'non-remainder weights must add up to at most 100',
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
    })
    .refine((c) => c.minHitPct <= c.maxHitPct, {
      message: 'minHitPct must not be greater than maxHitPct',
    }),
  /** Item drops (GDD 9.3, 9.6). */
  loot: z.object({
    dropChancePct: percentSchema,
    /** Kills without a Unique/Set/Legendary before the next drop is a sure Unique+ (9.6). */
    pityKills: z.number().int().min(1),
    /** Affix value growth per item tier: base x (1 + pct/100 x (tier - 1)) (9.3). */
    affixTierGrowthPct: percentSchema,
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
});
export type Balance = z.infer<typeof balanceSchema>;

/** Parses data/enemies.json. Throws a ZodError with a readable message if invalid. */
export function parseEnemies(data: unknown): Enemy[] {
  return enemiesSchema.parse(data);
}

/** Parses data/balance.json. Throws a ZodError with a readable message if invalid. */
export function parseBalance(data: unknown): Balance {
  return balanceSchema.parse(data);
}

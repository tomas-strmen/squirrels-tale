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

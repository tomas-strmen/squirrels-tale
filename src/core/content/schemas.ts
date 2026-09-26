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
    maxHp: designValueSchema.refine((v) => v > 0, 'must be greater than 0'),
    damageMin: designValueSchema,
    damageMax: designValueSchema,
    attackIntervalS: designSecondsSchema,
    hitPct: percentSchema,
    armor: designValueSchema,
    dodgePct: percentSchema,
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
    })
    .refine((c) => c.minHitPct <= c.maxHitPct, {
      message: 'minHitPct must not be greater than maxHitPct',
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

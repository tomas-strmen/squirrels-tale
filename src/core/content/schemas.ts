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

export const enemySchema = z.object({
  id: idSchema,
  attackIntervalS: designSecondsSchema,
});
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
  player: z.object({
    unarmedAttackIntervalS: designSecondsSchema,
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

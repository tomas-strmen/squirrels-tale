import { describe, expect, it } from 'vitest';
import { balanceSchema, enemiesSchema, idSchema, parseBalance, parseEnemies } from './schemas';

describe('idSchema', () => {
  it('accepts snake_case ids', () => {
    expect(idSchema.safeParse('worker_ant').success).toBe(true);
    expect(idSchema.safeParse('a').success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(idSchema.safeParse('WorkerAnt').success).toBe(false);
    expect(idSchema.safeParse('worker-ant').success).toBe(false);
    expect(idSchema.safeParse('1ant').success).toBe(false);
    expect(idSchema.safeParse('').success).toBe(false);
  });
});

describe('enemiesSchema / parseEnemies', () => {
  const valid = [{ id: 'worker_ant', attackIntervalS: 2.0 }];

  it('accepts valid data', () => {
    expect(() => parseEnemies(valid)).not.toThrow();
  });

  it('rejects an empty list', () => {
    expect(enemiesSchema.safeParse([]).success).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const dup = [...valid, { id: 'worker_ant', attackIntervalS: 3.0 }];
    expect(enemiesSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects more than 1 decimal place', () => {
    const bad = [{ id: 'worker_ant', attackIntervalS: 2.25 }];
    expect(enemiesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a negative attack interval', () => {
    const bad = [{ id: 'worker_ant', attackIntervalS: -1 }];
    expect(enemiesSchema.safeParse(bad).success).toBe(false);
  });

  it('throws a readable error for bad data', () => {
    expect(() => parseEnemies([{ id: 'Bad Id', attackIntervalS: 2.0 }])).toThrow(/snake_case/);
  });
});

describe('balanceSchema / parseBalance', () => {
  const valid = { encounter: { searchDurationS: 1.0 }, player: { unarmedAttackIntervalS: 4.0 } };

  it('accepts valid data', () => {
    expect(() => parseBalance(valid)).not.toThrow();
  });

  it('rejects a missing field', () => {
    expect(balanceSchema.safeParse({ encounter: { searchDurationS: 1.0 } }).success).toBe(false);
  });

  it('rejects more than 1 decimal place', () => {
    const bad = { ...valid, player: { unarmedAttackIntervalS: 4.05 } };
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });
});

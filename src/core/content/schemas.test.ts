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
  const ant = {
    id: 'worker_ant',
    maxHp: 1.2,
    damageMin: 0.2,
    damageMax: 0.3,
    attackIntervalS: 2.0,
    hitPct: 65,
    armor: 0,
    dodgePct: 0,
  };
  const valid = [ant];

  it('accepts valid data', () => {
    expect(() => parseEnemies(valid)).not.toThrow();
  });

  it('rejects an empty list', () => {
    expect(enemiesSchema.safeParse([]).success).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const dup = [ant, { ...ant, attackIntervalS: 3.0 }];
    expect(enemiesSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects more than 1 decimal place', () => {
    const bad = [{ ...ant, attackIntervalS: 2.25 }];
    expect(enemiesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a negative attack interval', () => {
    const bad = [{ ...ant, attackIntervalS: -1 }];
    expect(enemiesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects damageMin greater than damageMax', () => {
    expect(enemiesSchema.safeParse([{ ...ant, damageMin: 0.5, damageMax: 0.3 }]).success).toBe(false);
  });

  it('rejects zero HP, non-integer or out-of-range percentages', () => {
    expect(enemiesSchema.safeParse([{ ...ant, maxHp: 0 }]).success).toBe(false);
    expect(enemiesSchema.safeParse([{ ...ant, hitPct: 65.5 }]).success).toBe(false);
    expect(enemiesSchema.safeParse([{ ...ant, dodgePct: 120 }]).success).toBe(false);
  });

  it('rejects HP with more than 1 decimal place', () => {
    expect(enemiesSchema.safeParse([{ ...ant, maxHp: 1.25 }]).success).toBe(false);
  });

  it('throws a readable error for bad data', () => {
    expect(() => parseEnemies([{ ...ant, id: 'Bad Id' }])).toThrow(/snake_case/);
  });
});

describe('balanceSchema / parseBalance', () => {
  const valid = {
    encounter: { searchDurationS: 1.0 },
    player: {
      maxHp: 5.0,
      unarmedAttackIntervalS: 4.0,
      unarmedDamageMin: 0.3,
      unarmedDamageMax: 0.4,
      hitPct: 85,
      armor: 0,
    },
    combat: { minHitPct: 5, maxHitPct: 98, armorConstant: 10.0, maxDamageReductionPct: 75, minDamage: 0.1 },
  };

  it('accepts valid data', () => {
    expect(() => parseBalance(valid)).not.toThrow();
  });

  it('rejects a missing field', () => {
    expect(balanceSchema.safeParse({ encounter: { searchDurationS: 1.0 } }).success).toBe(false);
  });

  it('rejects more than 1 decimal place', () => {
    const bad = { ...valid, player: { ...valid.player, unarmedAttackIntervalS: 4.05 } };
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects minHitPct greater than maxHitPct', () => {
    const bad = { ...valid, combat: { ...valid.combat, minHitPct: 99 } };
    expect(balanceSchema.safeParse(bad).success).toBe(false);
  });
});

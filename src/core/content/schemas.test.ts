import { describe, expect, it } from 'vitest';
import {
  affixesSchema,
  balanceSchema,
  enemiesSchema,
  idSchema,
  itemsSchema,
  parseBalance,
  parseEnemies,
  raritiesSchema,
} from './schemas';

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
    baseLevel: 1,
    maxHp: 1.2,
    damageMin: 0.2,
    damageMax: 0.3,
    attackIntervalS: 2.0,
    hitPct: 65,
    armor: 0,
    dodgePct: 0,
    xp: 2,
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

  it('rejects a base level below 1 or not whole', () => {
    expect(enemiesSchema.safeParse([{ ...ant, baseLevel: 0 }]).success).toBe(false);
    expect(enemiesSchema.safeParse([{ ...ant, baseLevel: 1.5 }]).success).toBe(false);
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
      attackSpeedPctPerLevel: 1,
      regenAmount: 0.1,
      regenIntervalS: 2.0,
      regenGrowthPctPerLevel: 3,
    },
    combat: {
      minHitPct: 5,
      maxHitPct: 98,
      armorConstant: 10.0,
      maxDamageReductionPct: 75,
      minDamage: 0.1,
      hitPctPerLevelDiff: 0.5,
      minAttackIntervalS: 0.5,
    },
    loot: { dropChancePct: 4, pity: [{ rarity: 'rare', kills: 1000 }, { rarity: 'unique', kills: 5000 }, { rarity: 'legendary', kills: 20000 }], affixTierGrowthPct: 35, upgradeGrowthPct: 8 },
    death: { hideoutRegenS: 10.0, xpLossPct: 10 },
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

describe('items / rarities / affixes schemas (M4.1)', () => {
  const twig = {
    id: 'sharp_twig',
    slot: 'melee',
    tier: 1,
    kind: 'base',
    weapon: { damageMin: 0.3, damageMax: 0.5, attackIntervalS: 2.0 },
    stats: [],
  };

  it('accepts a valid item and rejects bad ones', () => {
    expect(itemsSchema.safeParse([twig]).success).toBe(true);
    expect(itemsSchema.safeParse([{ ...twig, slot: 'tail' }]).success).toBe(false);
    expect(itemsSchema.safeParse([{ ...twig, tier: 0 }]).success).toBe(false);
    expect(itemsSchema.safeParse([twig, twig]).success).toBe(false);
    expect(
      itemsSchema.safeParse([{ ...twig, weapon: { damageMin: 0.6, damageMax: 0.5, attackIntervalS: 2.0 } }]).success,
    ).toBe(false);
    expect(itemsSchema.safeParse([{ ...twig, stats: [{ stat: 'luck', min: 1, max: 2 }] }]).success).toBe(false);
  });

  const rarity = {
    id: 'common',
    weight: 0,
    isRemainder: true,
    statMultPct: 100,
    affixCount: 0,
    mfScaling: 'none',
    itemKind: 'base',
    minTileTier: 1,
    unlockedBy: null,
    color: '#b8b8b8',
  };

  it('needs exactly one remainder rarity and weights <= 100', () => {
    expect(raritiesSchema.safeParse([rarity]).success).toBe(true);
    expect(raritiesSchema.safeParse([{ ...rarity, isRemainder: false }]).success).toBe(false);
    expect(
      raritiesSchema.safeParse([rarity, { ...rarity, id: 'uncommon', isRemainder: false, weight: 100.1 }]).success,
    ).toBe(false);
    expect(raritiesSchema.safeParse([{ ...rarity, color: 'grey' }]).success).toBe(false);
  });

  it('rejects affixes with min > max or unknown stats', () => {
    const hp = { id: 'max_hp', stat: 'maxHp', min: 0.2, max: 0.4, unlockedBy: null };
    expect(affixesSchema.safeParse([hp]).success).toBe(true);
    expect(affixesSchema.safeParse([{ ...hp, min: 0.5 }]).success).toBe(false);
    expect(affixesSchema.safeParse([{ ...hp, stat: 'luck' }]).success).toBe(false);
  });
});

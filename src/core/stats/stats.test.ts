import { describe, expect, it } from 'vitest';
import type { FighterStats } from '../combat/combat';
import { EMPTY_EQUIPMENT, type Equipment } from '../inventory/inventory';
import type { Item, ItemStat } from '../loot/loot';
import { composeStats, type ComposeInput } from './stats';

const character: FighterStats = { maxHp: 500, damageMin: 30, damageMax: 40, hitPct: 85, armor: 0, dodgePct: 0 };

function item(slot: Item['slot'], extra: Partial<Item> = {}): Item {
  return { uid: 1, baseId: 'x', slot, tier: 1, rarityId: 'common', weapon: null, stats: [], affixes: [], ...extra };
}
const weapon = (min: number, max: number, modMs: number) =>
  item('melee', { weapon: { damageMin: min, damageMax: max, attackIntervalModMs: modMs } });
const withStats = (slot: Item['slot'], stats: ItemStat[]) => item(slot, { stats });

function compose(equipment: Partial<Equipment>, patch: Partial<ComposeInput> = {}) {
  return composeStats({
    character,
    baseAttackIntervalMs: 4000,
    levelSpeedFactor: 1,
    minAttackIntervalMs: 500,
    equipment: { ...EMPTY_EQUIPMENT, ...equipment },
    offHandDamagePct: 50,
    ...patch,
  });
}

describe('composeStats (GDD 6.1 v1.8, 9.1 v2.3)', () => {
  it('without gear equals the character', () => {
    const c = compose({});
    expect(c.fighter).toEqual(character);
    expect(c.attackIntervalMs).toBe(4000);
    expect(c.regenMultiplier).toBe(1);
  });

  it('a right-paw weapon adds its damage and shifts the interval (Sharp Twig -0.4 s -> 3.6 s)', () => {
    const c = compose({ rightPaw: weapon(30, 50, -400) });
    expect(c.fighter.damageMin).toBe(60);
    expect(c.fighter.damageMax).toBe(90);
    expect(c.attackIntervalMs).toBe(3600);
  });

  it('a heavy weapon makes it slower (+0.7 s -> 4.7 s)', () => {
    expect(compose({ rightPaw: weapon(50, 90, 700) }).attackIntervalMs).toBe(4700);
  });

  it('a left-paw weapon adds 50 % of its damage and does not change the interval', () => {
    const c = compose({ rightPaw: weapon(30, 50, -400), leftPaw: weapon(40, 70, 200) });
    expect(c.fighter.damageMin).toBe(30 + 30 + 20);
    expect(c.fighter.damageMax).toBe(40 + 50 + 35);
    expect(c.attackIntervalMs).toBe(3600);
  });

  it('level speed applies on top of the weapon shift, and never below 0.5 s', () => {
    expect(compose({ rightPaw: weapon(30, 50, -400) }, { levelSpeedFactor: 1.01 ** 9 }).attackIntervalMs).toBe(
      Math.round(3600 / 1.01 ** 9),
    );
    expect(compose({}, { levelSpeedFactor: 100 }).attackIntervalMs).toBe(500);
  });

  it('flat stats add up across items', () => {
    const c = compose({
      head: withStats('head', [{ stat: 'armor', value: 20 }]),
      body: withStats('body', [{ stat: 'armor', value: 30 }]),
      amulet: withStats('amulet', [{ stat: 'maxHp', value: 20 }, { stat: 'armor', value: 10 }]),
    });
    expect(c.fighter.armor).toBe(60);
    expect(c.fighter.maxHp).toBe(520);
  });

  it('percentages multiply (two +10 % damage -> x1.21)', () => {
    const c = compose({
      ring: item('ring', { affixes: [{ id: 'damage_pct', stat: 'damagePct', value: 1000 }] }),
      amulet: item('amulet', { affixes: [{ id: 'damage_pct', stat: 'damagePct', value: 1000 }] }),
    });
    expect(c.fighter.damageMin).toBe(Math.round(30 * 1.21));
    expect(c.fighter.damageMax).toBe(Math.round(40 * 1.21));
  });

  it('attack speed % shortens the interval, regen % multiplies regen, hit % adds points', () => {
    const c = compose({
      ring: item('ring', {
        affixes: [
          { id: 'attack_speed_pct', stat: 'attackSpeedPct', value: 400 },
          { id: 'regen_pct', stat: 'regenPct', value: 1000 },
          { id: 'hit_pct', stat: 'hitPct', value: 250 },
        ],
      }),
    });
    expect(c.attackIntervalMs).toBe(Math.round(4000 / 1.04));
    expect(c.regenMultiplier).toBeCloseTo(1.1);
    expect(c.fighter.hitPct).toBe(87.5);
  });

  it('a ranged weapon does not add melee damage (GDD 7.1, flying enemies only)', () => {
    const bow = item('ranged', { weapon: { damageMin: 100, damageMax: 150, attackIntervalModMs: 0 } });
    expect(compose({ ranged: bow }).fighter.damageMax).toBe(40);
  });
});

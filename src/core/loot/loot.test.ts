import { describe, expect, it } from 'vitest';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import type { ItemData } from '../content/schemas';
import { parseAffixes, parseBalance, parseItems, parseRarities } from '../content/schemas';
import { createRng, type RngState } from '../rng/rng';
import {
  canDrop,
  createEnemyLootTable,
  createLootConfig,
  createLootState,
  diceFaces,
  effectiveMagicFind,
  generateItemFromBase,
  pityCountdowns,
  rarityWeights,
  rollAffixes,
  rollKillDrop,
  rollRarity,
  type LootContext,
} from './loot';

const items = parseItems(itemsData);
const rarities = parseRarities(raritiesData);
const affixes = parseAffixes(affixesData);
const balance = parseBalance(balanceData).loot;
const config = createLootConfig({ items, rarities, affixes, balance });

const ctx: LootContext = { magicFindPct: 0, unlocked: new Set() };
const rarity = (id: string) => {
  const r = rarities.find((x) => x.id === id);
  if (!r) throw new Error(id);
  return r;
};
const itemByName = (id: string) => {
  const i = items.find((x) => x.id === id);
  if (!i) throw new Error(id);
  return i;
};
const weightOf = (ws: ReturnType<typeof rarityWeights>, id: string) =>
  ws.find((w) => w.rarity.id === id)?.weight ?? -1;

/** A flat (no level scaling) drop table, close to the game's real T1 numbers. */
const workerAntLoot = createEnemyLootTable({
  currencies: [],
  minLevel: 1,
  maxLevel: 1,
  items: [{ itemId: 'leaf_cap', pctAtMin: 4, pctAtMax: 4 }],
  rarities: [
    { rarityId: 'uncommon', weightAtMin: 22, weightAtMax: 22 },
    { rarityId: 'rare', weightAtMin: 6, weightAtMax: 6 },
    { rarityId: 'legendary', weightAtMin: 0.3, weightAtMax: 0.3 },
  ],
});

describe('rarityWeights (GDD 9.6 v2.4)', () => {
  const legendaryUnlocked = new Set(['legendary_quest']);
  const loot = createEnemyLootTable({
    currencies: [],
    minLevel: 1,
    maxLevel: 5,
    items: [],
    rarities: [
      { rarityId: 'uncommon', weightAtMin: 20, weightAtMax: 20 },
      { rarityId: 'rare', weightAtMin: 6, weightAtMax: 12 },
      { rarityId: 'legendary', weightAtMin: 0.3, weightAtMax: 0.3 },
    ],
  });

  it("uses the enemy's own weights; Common is the remainder to 100", () => {
    const ws = rarityWeights(config, loot, 1, { magicFindPct: 0, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'uncommon')).toBe(20);
    expect(weightOf(ws, 'rare')).toBe(6);
    expect(weightOf(ws, 'legendary')).toBeCloseTo(0.3);
    expect(weightOf(ws, 'common')).toBeCloseTo(100 - 20 - 6 - 0.3);
  });

  it('interpolates linearly between the enemy own minLevel and maxLevel', () => {
    expect(weightOf(rarityWeights(config, loot, 1, ctx), 'rare')).toBe(6);
    expect(weightOf(rarityWeights(config, loot, 3, ctx), 'rare')).toBe(9);
    expect(weightOf(rarityWeights(config, loot, 5, ctx), 'rare')).toBe(12);
  });

  it("a rarity missing from the enemy's table never rolls", () => {
    const ws = rarityWeights(config, loot, 1, ctx);
    expect(weightOf(ws, 'unique')).toBe(0);
    expect(weightOf(ws, 'set')).toBe(0);
  });

  it("Legendary is locked until its quest (v2.1), even if it's in the enemy's table", () => {
    const ws = rarityWeights(config, loot, 1, ctx);
    expect(weightOf(ws, 'legendary')).toBe(0);
  });

  it('Magic Find: linear for Uncommon/Rare, diminishing for Legendary', () => {
    expect(effectiveMagicFind(100)).toBe(50);
    const ws = rarityWeights(config, loot, 1, { magicFindPct: 100, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'uncommon')).toBeCloseTo(40);
    expect(weightOf(ws, 'rare')).toBeCloseTo(12);
    expect(weightOf(ws, 'legendary')).toBeCloseTo(0.45);
  });

  it('Common never goes below 0', () => {
    const ws = rarityWeights(config, loot, 1, { magicFindPct: 1000, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'common')).toBe(0);
  });

  it('pity-only: at least Rare, only what can drop here (Legendary locked -> Rare)', () => {
    const ws = rarityWeights(config, loot, 1, ctx, 2); // rank of Rare
    expect(weightOf(ws, 'common')).toBe(0);
    expect(weightOf(ws, 'uncommon')).toBe(0);
    expect(weightOf(ws, 'rare')).toBe(6);
    expect(weightOf(ws, 'legendary')).toBe(0);
  });
});

describe('item rarity distribution over 10 000 drops (GDD M4 test, v2.4)', () => {
  it('matches the weights (no Unique/Set in this table, Legendary locked)', () => {
    let rng: RngState = createRng(2026);
    const counts: Record<string, number> = {};
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const r = rollRarity(config, workerAntLoot, 1, rng, ctx);
      const gen = generateItemFromBase(config, r.rng, ctx, itemByName('leaf_cap'), r.rarity, i + 1);
      rng = gen.rng;
      counts[gen.item.rarityId] = (counts[gen.item.rarityId] ?? 0) + 1;
    }
    const share = (id: string) => (counts[id] ?? 0) / n;
    // Weights: uncommon 22, rare 6, legendary 0 (locked) -> common = 72.
    expect(share('common')).toBeGreaterThan(0.70);
    expect(share('common')).toBeLessThan(0.74);
    expect(share('uncommon')).toBeGreaterThan(0.205);
    expect(share('uncommon')).toBeLessThan(0.235);
    expect(share('rare')).toBeGreaterThan(0.05);
    expect(share('rare')).toBeLessThan(0.07);
    expect(share('legendary')).toBe(0); // locked until its quest (v2.1)
  });
});

describe('generateItemFromBase (GDD 9.3)', () => {
  it('scales rolled stats by the rarity multiplier, in 0.01 steps', () => {
    let rng: RngState = createRng(3);
    const leafCap = itemByName('leaf_cap');
    const seen: number[] = [];
    for (let i = 0; i < 400; i++) {
      const gen = generateItemFromBase(config, rng, ctx, leafCap, rarity('rare'), i);
      rng = gen.rng;
      const armor = gen.item.stats.find((s) => s.stat === 'armor')?.value ?? -1;
      seen.push(armor);
      // Leaf Cap armor 0.1-0.3 x 1.35 = 0.135-0.405 -> 14..41 hundredths
      expect(armor).toBeGreaterThanOrEqual(14);
      expect(armor).toBeLessThanOrEqual(41);
    }
    expect(seen.some((v) => v % 10 !== 0)).toBe(true); // not only whole tenths
  });

  it('scales a weapon damage range by the rarity multiplier', () => {
    const sharpTwig = itemByName('sharp_twig');
    const gen = generateItemFromBase(config, createRng(4), ctx, sharpTwig, rarity('legendary'), 1);
    expect(gen.item.weapon).toEqual({ damageMin: 60, damageMax: 100, attackIntervalModMs: -400 });
  });

  it("has the rarity's affix count", () => {
    const leafCap = itemByName('leaf_cap');
    const common = generateItemFromBase(config, createRng(5), ctx, leafCap, rarity('common'), 1);
    expect(common.item.affixes).toHaveLength(0);
    const uncommon = generateItemFromBase(config, common.rng, ctx, leafCap, rarity('uncommon'), 2);
    expect(uncommon.item.affixes).toHaveLength(1);
  });

  it('is deterministic with the same seed', () => {
    const leafCap = itemByName('leaf_cap');
    const a = generateItemFromBase(config, createRng(9), ctx, leafCap, rarity('rare'), 1);
    const b = generateItemFromBase(config, createRng(9), ctx, leafCap, rarity('rare'), 1);
    expect(a).toEqual(b);
  });
});

describe('rollAffixes (GDD 9.3)', () => {
  it('never duplicates an affix and never rolls locked ones', () => {
    let rng: RngState = createRng(6);
    for (let i = 0; i < 300; i++) {
      const r = rollAffixes(config, rng, ctx, 1, 3);
      rng = r.rng;
      const ids = r.affixes.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(['crit_chance_pct', 'crit_damage_pct', 'magic_find_pct', 'dodge_pct', 'stun_chance_pct']).not.toContain(id);
      }
    }
  });

  it('rolls unlocked affixes once their quest is done', () => {
    let rng: RngState = createRng(7);
    const unlocked: LootContext = { ...ctx, unlocked: new Set(['q3', 'q4', 'q7', 'q8']) };
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = rollAffixes(config, rng, unlocked, 1, 3);
      rng = r.rng;
      r.affixes.forEach((a) => seen.add(a.id));
    }
    expect(seen.has('crit_chance_pct')).toBe(true);
    expect(seen.has('dodge_pct')).toBe(true);
  });

  it('scales affix values by tier: x (1 + 0.35 x (tier - 1))', () => {
    let rng: RngState = createRng(8);
    for (let i = 0; i < 500; i++) {
      const r = rollAffixes(config, rng, ctx, 3, 7); // all 7 unlocked affixes
      rng = r.rng;
      const hp = r.affixes.find((a) => a.id === 'max_hp');
      // +Max HP 0.2-0.4 x 1.7 = 0.34-0.68
      expect(hp?.value).toBeGreaterThanOrEqual(34);
      expect(hp?.value).toBeLessThanOrEqual(68);
    }
  });
});

describe('canDrop (GDD 9.6 v2.4)', () => {
  it('a base rarity can drop only if the enemy has a weight entry for it', () => {
    expect(canDrop(config, workerAntLoot, ctx, rarity('rare'))).toBe(true);
    expect(canDrop(config, workerAntLoot, ctx, rarity('uncommon'))).toBe(true);
  });

  it('Legendary cannot drop until its quest, even if the enemy lists it', () => {
    expect(canDrop(config, workerAntLoot, ctx, rarity('legendary'))).toBe(false);
    expect(canDrop(config, workerAntLoot, { ...ctx, unlocked: new Set(['legendary_quest']) }, rarity('legendary'))).toBe(true);
  });

  it("Unique/Set cannot drop unless the enemy's table has a matching item", () => {
    expect(canDrop(config, workerAntLoot, ctx, rarity('unique'))).toBe(false);
    expect(canDrop(config, workerAntLoot, ctx, rarity('set'))).toBe(false);
  });

  it('Common (the remainder) can always drop', () => {
    expect(canDrop(config, workerAntLoot, ctx, rarity('common'))).toBe(true);
  });
});

describe('rollKillDrop (GDD 9.6)', () => {
  it('drops an item on about 4 % of kills', () => {
    let state = createLootState();
    let rng: RngState = createRng(11);
    let drops = 0;
    const kills = 20000;
    for (let i = 0; i < kills; i++) {
      const r = rollKillDrop(state, config, rng, ctx, workerAntLoot, 1);
      state = r.state;
      rng = r.rng;
      if (r.items.length > 0) drops++;
    }
    expect(drops / kills).toBeGreaterThan(0.035);
    expect(drops / kills).toBeLessThan(0.047);
  });

  it('rolls each drop-table entry independently - a kill can drop more than one item (v2.4)', () => {
    const twoItemLoot = createEnemyLootTable({
      currencies: [],
      minLevel: 1,
      maxLevel: 1,
      items: [
        { itemId: 'leaf_cap', pctAtMin: 60, pctAtMax: 60 },
        { itemId: 'leaf_vest', pctAtMin: 60, pctAtMax: 60 },
      ],
      rarities: [],
    });
    let state = createLootState();
    let rng: RngState = createRng(50);
    let sawTwo = false;
    for (let i = 0; i < 200 && !sawTwo; i++) {
      const r = rollKillDrop(state, config, rng, ctx, twoItemLoot, 1);
      state = r.state;
      rng = r.rng;
      if (r.items.length === 2) sawTwo = true;
    }
    expect(sawTwo).toBe(true);
  });

  it('a higher enemy level drops noticeably more often, per its own minLevel/maxLevel (v2.4)', () => {
    const scalingLoot = createEnemyLootTable({
      currencies: [],
      minLevel: 1,
      maxLevel: 5,
      items: [{ itemId: 'leaf_cap', pctAtMin: 2, pctAtMax: 20 }],
      rarities: [],
    });
    const dropRateAt = (level: number) => {
      let state = createLootState();
      let rng: RngState = createRng(99);
      let drops = 0;
      const kills = 5000;
      for (let i = 0; i < kills; i++) {
        const r = rollKillDrop(state, config, rng, ctx, scalingLoot, level);
        state = r.state;
        rng = r.rng;
        if (r.items.length > 0) drops++;
      }
      return drops / kills;
    };
    expect(dropRateAt(5)).toBeGreaterThan(dropRateAt(1) * 2);
  });

  it('pity Rare: after 999 kills without Rare+, the 1000th kill surely drops Rare+ and resets', () => {
    const state = { pityCounters: { rare: 999 }, nextUid: 5 };
    const r = rollKillDrop(state, config, createRng(12), ctx, workerAntLoot, 1);
    expect(r.items.some((i) => i.rarityId === 'rare')).toBe(true);
    expect(r.state.pityCounters.rare).toBe(0);
    expect(r.state.nextUid).toBe(5 + r.items.length);
  });

  it('only rarities that can actually drop for this enemy count towards pity', () => {
    const r = rollKillDrop(createLootState(), config, createRng(20), ctx, workerAntLoot, 1);
    // legendary is in the table but locked (no quest) -> not counted; unique/set aren't in the table at all.
    expect(Object.keys(r.state.pityCounters)).toEqual(['rare']);
    const cd = pityCountdowns(r.state, config, workerAntLoot, ctx);
    expect(cd.map((c) => c.rarityId)).toEqual(['rare']);
  });

  it('Legendary pity (unlocked) forces a Legendary and resets all lower counters too', () => {
    const unlockedCtx: LootContext = { magicFindPct: 0, unlocked: new Set(['legendary_quest']) };
    const state = { pityCounters: { rare: 5, legendary: 19999 }, nextUid: 1 };
    const r = rollKillDrop(state, config, createRng(21), unlockedCtx, workerAntLoot, 1);
    expect(r.items.some((i) => i.rarityId === 'legendary')).toBe(true);
    expect(r.state.pityCounters).toEqual({ rare: 0, legendary: 0 });
  });

  it('a Rare drop resets only the Rare counter, not a not-yet-full Legendary one', () => {
    const unlockedCtx: LootContext = { magicFindPct: 0, unlocked: new Set(['legendary_quest']) };
    const state = { pityCounters: { rare: 999, legendary: 100 }, nextUid: 1 };
    const r = rollKillDrop(state, config, createRng(22), unlockedCtx, workerAntLoot, 1);
    if (r.items.some((i) => i.rarityId === 'rare')) {
      expect(r.state.pityCounters).toEqual({ rare: 0, legendary: 101 });
    }
  });

  it('pityCountdowns shows kills left per rarity', () => {
    const state = { pityCounters: { rare: 734 }, nextUid: 1 };
    expect(pityCountdowns(state, config, workerAntLoot, ctx)).toEqual([{ rarityId: 'rare', killsLeft: 266 }]);
  });

  it('counts kills towards pity and gives each item a new uid', () => {
    let state = createLootState();
    let rng: RngState = createRng(13);
    const uids: number[] = [];
    for (let i = 0; i < 500; i++) {
      const r = rollKillDrop(state, config, rng, ctx, workerAntLoot, 1);
      state = r.state;
      rng = r.rng;
      for (const item of r.items) uids.push(item.uid);
    }
    expect(new Set(uids).size).toBe(uids.length);
    expect(state.pityCounters.rare ?? 0).toBeGreaterThan(0);
  });

  it('does not modify the state passed in', () => {
    const state = createLootState();
    const copy = structuredClone(state);
    rollKillDrop(state, config, createRng(14), ctx, workerAntLoot, 1);
    expect(state).toEqual(copy);
  });
});

describe('unique/set items always drop as themselves (GDD 9.5 v2.4)', () => {
  const uniqueItem: ItemData = {
    id: 'test_unique_pike',
    slot: 'melee',
    tier: 4,
    kind: 'unique',
    weapon: { damageMin: 0.9, damageMax: 1.3, attackIntervalModS: -0.5 },
    stats: [],
  };
  const configWithUnique = createLootConfig({ items: [...items, uniqueItem], rarities, affixes, balance });
  const bossLoot = createEnemyLootTable({
    currencies: [],
    minLevel: 4,
    maxLevel: 4,
    items: [{ itemId: 'test_unique_pike', pctAtMin: 100, pctAtMax: 100 }],
    rarities: [],
  });

  it('drops at its fixed rarity - no roll, no fallback to Rare needed', () => {
    const r = rollKillDrop(createLootState(), configWithUnique, createRng(40), ctx, bossLoot, 4);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.rarityId).toBe('unique');
    expect(r.items[0]?.baseId).toBe('test_unique_pike');
  });
});

describe('diceFaces (GDD 9.6)', () => {
  it("lands within the rarity's dice range: 1-14 common, 15-18 uncommon, 19 rare", () => {
    let rng: RngState = createRng(30);
    const leafCap = itemByName('leaf_cap');
    for (let i = 0; i < 300; i++) {
      const gen = generateItemFromBase(config, rng, ctx, leafCap, rarity('common'), i);
      rng = gen.rng;
      const faces = diceFaces(gen.item, config);
      expect(faces.first).toBeGreaterThanOrEqual(1);
      expect(faces.first).toBeLessThanOrEqual(14);
      expect(faces.second).toBeNull();
    }
  });

  it('rolls a "20" plus a gold die for Unique/Set/Legendary (its own face range)', () => {
    const leafCap = itemByName('leaf_cap');
    const gen = generateItemFromBase(config, createRng(31), ctx, leafCap, rarity('unique'), 1);
    const faces = diceFaces(gen.item, config);
    expect(faces.first).toBe(20);
    expect(faces.second).toBeGreaterThanOrEqual(1);
    expect(faces.second).toBeLessThanOrEqual(7);
  });

  it('is deterministic: the same item always shows the same face(s)', () => {
    const leafCap = itemByName('leaf_cap');
    const gen = generateItemFromBase(config, createRng(32), ctx, leafCap, rarity('rare'), 42);
    expect(diceFaces(gen.item, config)).toEqual(diceFaces(gen.item, config));
  });

  it('different items (uids) tend to land on different faces within a range', () => {
    const leafCap = itemByName('leaf_cap');
    const faces = new Set<number>();
    for (let uid = 1; uid <= 50; uid++) {
      const gen = generateItemFromBase(config, createRng(1), ctx, leafCap, rarity('common'), uid);
      faces.add(diceFaces(gen.item, config).first);
    }
    expect(faces.size).toBeGreaterThan(1);
  });
});

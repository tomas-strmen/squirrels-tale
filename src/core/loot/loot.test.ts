import { describe, expect, it } from 'vitest';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import { parseAffixes, parseBalance, parseItems, parseRarities } from '../content/schemas';
import { createRng, type RngState } from '../rng/rng';
import {
  createLootConfig,
  createLootState,
  diceFaces,
  effectiveMagicFind,
  generateItem,
  pityCountdowns,
  rarityWeights,
  rollAffixes,
  rollKillDrop,
  rollRarity,
  type LootContext,
} from './loot';

const rarities = parseRarities(raritiesData);
const config = createLootConfig({
  items: parseItems(itemsData),
  rarities,
  affixes: parseAffixes(affixesData),
  balance: parseBalance(balanceData).loot,
});
const t1: LootContext = { tileTier: 1, magicFindPct: 0, unlocked: new Set() };
const rarity = (id: string) => {
  const r = rarities.find((x) => x.id === id);
  if (!r) throw new Error(id);
  return r;
};
const weightOf = (ws: ReturnType<typeof rarityWeights>, id: string) =>
  ws.find((w) => w.rarity.id === id)?.weight ?? -1;

describe('rarityWeights (GDD 9.6)', () => {
  const legendaryUnlocked = new Set(['legendary_quest']);

  it('base weights on T3+ (Legendary unlocked): Common is the remainder to 100', () => {
    const ws = rarityWeights(config, { ...t1, tileTier: 3, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'uncommon')).toBe(22);
    expect(weightOf(ws, 'rare')).toBe(6);
    expect(weightOf(ws, 'unique')).toBeCloseTo(0.9);
    expect(weightOf(ws, 'set')).toBeCloseTo(0.8);
    expect(weightOf(ws, 'legendary')).toBeCloseTo(0.3);
    expect(weightOf(ws, 'common')).toBeCloseTo(70);
  });

  it('Legendary is locked until its quest (v2.1); its share goes to Common', () => {
    const ws = rarityWeights(config, { ...t1, tileTier: 3 });
    expect(weightOf(ws, 'legendary')).toBe(0);
    expect(weightOf(ws, 'common')).toBeCloseTo(70.3);
  });

  it('Set only from T3: before that its weight goes to Common', () => {
    const ws = rarityWeights(config, t1);
    expect(weightOf(ws, 'set')).toBe(0);
    expect(weightOf(ws, 'common')).toBeCloseTo(71.1);
  });

  it('Magic Find: linear for Uncommon/Rare, diminishing for Unique/Set/Legendary', () => {
    expect(effectiveMagicFind(100)).toBe(50);
    const ws = rarityWeights(config, { ...t1, tileTier: 3, magicFindPct: 100, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'uncommon')).toBeCloseTo(44);
    expect(weightOf(ws, 'rare')).toBeCloseTo(12);
    expect(weightOf(ws, 'unique')).toBeCloseTo(1.35);
    expect(weightOf(ws, 'legendary')).toBeCloseTo(0.45);
    expect(weightOf(ws, 'common')).toBeCloseTo(100 - 44 - 12 - 1.35 - 1.2 - 0.45);
  });

  it('Common never goes below 0', () => {
    const ws = rarityWeights(config, { ...t1, tileTier: 3, magicFindPct: 1000, unlocked: legendaryUnlocked });
    expect(weightOf(ws, 'common')).toBe(0);
  });

  it('pity-only: at least Rare, only what can drop here (T1: no uniques, Legendary locked -> Rare)', () => {
    const ws = rarityWeights(config, t1, 2); // rank of Rare
    expect(weightOf(ws, 'common')).toBe(0);
    expect(weightOf(ws, 'uncommon')).toBe(0);
    expect(weightOf(ws, 'rare')).toBe(6);
    expect(weightOf(ws, 'unique')).toBe(0);
    expect(weightOf(ws, 'legendary')).toBe(0);
  });
});

describe('item rarity distribution over 10 000 drops on T1 (GDD M4 test)', () => {
  it('matches the weights (Unique falls back to Rare, no Set before T3)', () => {
    let rng: RngState = createRng(2026);
    const counts: Record<string, number> = {};
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const r = rollRarity(config, rng, t1);
      const gen = generateItem(config, r.rng, t1, r.rarity, i + 1);
      rng = gen.rng;
      counts[gen.item.rarityId] = (counts[gen.item.rarityId] ?? 0) + 1;
    }
    const share = (id: string) => (counts[id] ?? 0) / n;
    expect(share('common')).toBeGreaterThan(0.688);
    expect(share('common')).toBeLessThan(0.728);
    expect(share('uncommon')).toBeGreaterThan(0.205);
    expect(share('uncommon')).toBeLessThan(0.235);
    expect(share('rare')).toBeGreaterThan(0.061); // 6.0 + 0.9 fallen-back Unique
    expect(share('rare')).toBeLessThan(0.077);
    expect(share('unique')).toBe(0);
    expect(share('set')).toBe(0);
    expect(share('legendary')).toBe(0); // locked until its quest (v2.1)
  });
});

describe('generateItem (GDD 9.3)', () => {
  it('only drops items of tier <= t and >= t - 2', () => {
    let rng: RngState = createRng(1);
    for (let i = 0; i < 200; i++) {
      const gen = generateItem(config, rng, t1, rarity('common'), i);
      rng = gen.rng;
      expect(gen.item.tier).toBe(1);
    }
  });

  it('scales rolled stats by the rarity multiplier, in 0.01 steps', () => {
    let rng: RngState = createRng(3);
    const seen: number[] = [];
    for (let i = 0; i < 400; i++) {
      const gen = generateItem(config, rng, t1, rarity('rare'), i);
      rng = gen.rng;
      if (gen.item.baseId !== 'leaf_cap') continue;
      const armor = gen.item.stats.find((s) => s.stat === 'armor')?.value ?? -1;
      seen.push(armor);
      // Leaf Cap armor 0.1-0.3 x 1.35 = 0.135-0.405 -> 14..41 hundredths
      expect(armor).toBeGreaterThanOrEqual(14);
      expect(armor).toBeLessThanOrEqual(41);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((v) => v % 10 !== 0)).toBe(true); // not only whole tenths
  });

  it('scales a weapon damage range by the rarity multiplier', () => {
    let rng: RngState = createRng(4);
    for (let i = 0; i < 300; i++) {
      const gen = generateItem(config, rng, t1, rarity('legendary'), i);
      rng = gen.rng;
      if (gen.item.baseId === 'sharp_twig') {
        expect(gen.item.weapon).toEqual({ damageMin: 60, damageMax: 100, attackIntervalModMs: -400 });
        return;
      }
    }
    throw new Error('no Sharp Twig rolled');
  });

  it('has the rarity\'s affix count; a Unique with no unique items becomes Rare with 3 affixes (9.5)', () => {
    let rng: RngState = createRng(5);
    const common = generateItem(config, rng, t1, rarity('common'), 1);
    expect(common.item.affixes).toHaveLength(0);
    rng = common.rng;
    const uncommon = generateItem(config, rng, t1, rarity('uncommon'), 2);
    expect(uncommon.item.affixes).toHaveLength(1);
    rng = uncommon.rng;
    const unique = generateItem(config, rng, t1, rarity('unique'), 3);
    expect(unique.item.rarityId).toBe('rare');
    expect(unique.item.affixes).toHaveLength(3);
  });

  it('is deterministic with the same seed', () => {
    const a = generateItem(config, createRng(9), t1, rarity('rare'), 1);
    const b = generateItem(config, createRng(9), t1, rarity('rare'), 1);
    expect(a).toEqual(b);
  });
});

describe('rollAffixes (GDD 9.3)', () => {
  it('never duplicates an affix and never rolls locked ones', () => {
    let rng: RngState = createRng(6);
    for (let i = 0; i < 300; i++) {
      const r = rollAffixes(config, rng, t1, 1, 3);
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
    const unlocked: LootContext = { ...t1, unlocked: new Set(['q3', 'q4', 'q7', 'q8']) };
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
      const r = rollAffixes(config, rng, t1, 3, 7); // all 7 unlocked affixes
      rng = r.rng;
      const hp = r.affixes.find((a) => a.id === 'max_hp');
      // +Max HP 0.2-0.4 x 1.7 = 0.34-0.68
      expect(hp?.value).toBeGreaterThanOrEqual(34);
      expect(hp?.value).toBeLessThanOrEqual(68);
    }
  });
});

describe('rollKillDrop (GDD 9.6)', () => {
  it('drops an item on about 4 % of kills', () => {
    let state = createLootState();
    let rng: RngState = createRng(11);
    let drops = 0;
    const kills = 20000;
    for (let i = 0; i < kills; i++) {
      const r = rollKillDrop(state, config, rng, t1);
      state = r.state;
      rng = r.rng;
      if (r.item) drops++;
    }
    expect(drops / kills).toBeGreaterThan(0.035);
    expect(drops / kills).toBeLessThan(0.047);
  });

  it('pity Rare: after 999 kills without Rare+, the 1000th kill surely drops Rare+ and resets', () => {
    const state = { pityCounters: { rare: 999 }, nextUid: 5 };
    const r = rollKillDrop(state, config, createRng(12), t1);
    expect(r.item?.rarityId).toBe('rare');
    expect(r.state.pityCounters.rare).toBe(0);
    expect(r.state.nextUid).toBe(6);
  });

  it('separate counters: Unique 5000, Legendary 20000 - only while that rarity can drop', () => {
    // T1: no unique items and Legendary is locked -> only the Rare counter runs.
    const r = rollKillDrop(createLootState(), config, createRng(20), { ...t1 });
    expect(Object.keys(r.state.pityCounters)).toEqual(['rare']);
    const cd = pityCountdowns(r.state, config, t1);
    expect(cd.map((c) => c.rarityId)).toEqual(['rare']);
  });

  it('Legendary pity (unlocked) forces a Legendary at 20000 and resets all lower counters too', () => {
    const unlockedCtx: LootContext = { ...t1, unlocked: new Set(['legendary_quest']) };
    const state = { pityCounters: { rare: 5, legendary: 19999 }, nextUid: 1 };
    const r = rollKillDrop(state, config, createRng(21), unlockedCtx);
    expect(r.item?.rarityId).toBe('legendary');
    expect(r.state.pityCounters).toEqual({ rare: 0, legendary: 0 });
  });

  it('a Rare drop resets only the Rare counter', () => {
    const unlockedCtx: LootContext = { ...t1, unlocked: new Set(['legendary_quest']) };
    const state = { pityCounters: { rare: 999, legendary: 100 }, nextUid: 1 };
    const r = rollKillDrop(state, config, createRng(22), unlockedCtx);
    expect(r.item?.rarityId).not.toBe('common');
    if (r.item?.rarityId === 'rare') expect(r.state.pityCounters).toEqual({ rare: 0, legendary: 101 });
  });

  it('pityCountdowns shows kills left per rarity', () => {
    const state = { pityCounters: { rare: 734 }, nextUid: 1 };
    expect(pityCountdowns(state, config, t1)).toEqual([{ rarityId: 'rare', killsLeft: 266 }]);
  });

  it('counts kills towards pity and gives each item a new uid', () => {
    let state = createLootState();
    let rng: RngState = createRng(13);
    const uids: number[] = [];
    for (let i = 0; i < 500; i++) {
      const r = rollKillDrop(state, config, rng, t1);
      state = r.state;
      rng = r.rng;
      if (r.item) uids.push(r.item.uid);
    }
    expect(new Set(uids).size).toBe(uids.length);
    expect(state.pityCounters.rare ?? 0).toBeGreaterThan(0);
  });

  it('does not modify the state passed in', () => {
    const state = createLootState();
    const copy = structuredClone(state);
    rollKillDrop(state, config, createRng(14), t1);
    expect(state).toEqual(copy);
  });
});

describe('diceFaces (GDD 9.6)', () => {
  it('lands within the rarity\'s dice range: 1-14 common, 15-18 uncommon, 19 rare', () => {
    let rng: RngState = createRng(30);
    for (let i = 0; i < 300; i++) {
      const gen = generateItem(config, rng, t1, rarity('common'), i);
      rng = gen.rng;
      const faces = diceFaces(gen.item, config);
      expect(faces.first).toBeGreaterThanOrEqual(1);
      expect(faces.first).toBeLessThanOrEqual(14);
      expect(faces.second).toBeNull();
    }
  });

  it('rolls a "20" plus a gold die for Unique/Set/Legendary (its own face range)', () => {
    const gen = generateItem(config, createRng(31), t1, rarity('unique'), 1);
    // On T1 this falls back to Rare (no unique items) - force the rarity directly for the dice check.
    const item = { ...gen.item, rarityId: 'unique' as const };
    const faces = diceFaces(item, config);
    expect(faces.first).toBe(20);
    expect(faces.second).toBeGreaterThanOrEqual(1);
    expect(faces.second).toBeLessThanOrEqual(7);
  });

  it('is deterministic: the same item always shows the same face(s)', () => {
    const gen = generateItem(config, createRng(32), t1, rarity('rare'), 42);
    expect(diceFaces(gen.item, config)).toEqual(diceFaces(gen.item, config));
  });

  it('different items (uids) tend to land on different faces within a range', () => {
    const faces = new Set<number>();
    for (let uid = 1; uid <= 50; uid++) {
      const gen = generateItem(config, createRng(1), t1, rarity('common'), uid);
      faces.add(diceFaces(gen.item, config).first);
    }
    expect(faces.size).toBeGreaterThan(1);
  });
});

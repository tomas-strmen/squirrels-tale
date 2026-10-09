/**
 * Item drops and generation (GDD 9.2, 9.3, 9.5, 9.6).
 *
 * Pure: every function takes the seeded Rng and returns the advanced one.
 * All values are internal hundredths (core/numbers), percentages too
 * (3 % -> 300), rolled in 0.01 steps (GDD 9.3 v2.0).
 *
 * v2.4 (M6.2 follow-up): each enemy owns its drop table (which items, at what
 * %) and its own rarity weights, both interpolated between the enemy's own
 * minLevel/maxLevel. Every drop-table entry rolls independently, so a single
 * kill can drop zero, one or several items - there is no single "does
 * anything drop" gate or tile-wide item pool anymore.
 *
 * Not yet (later stages): legendary traits, upgrades (M16).
 */
import type { AffixData, CurrencyId, EnemyLoot, ItemData, ItemSlot, RarityData, StatId } from '../content/schemas';
import { toHundredths } from '../numbers/numbers';
import { branch, createRng, next, nextInt, type RngState } from '../rng/rng';
import { secondsToMs } from '../time/fixedStep';

export interface LootBalanceInput {
  readonly pity: readonly { readonly rarity: string; readonly kills: number }[];
  readonly affixTierGrowthPct: number;
  readonly upgradeGrowthPct: number;
  /** GDD 10: this rarity and better are never lost to a full bag. Omitted = every item can be lost. */
  readonly keepWhenBagFullFrom?: string;
}

export interface LootConfigInput {
  readonly items: readonly ItemData[];
  readonly rarities: readonly RarityData[];
  readonly affixes: readonly AffixData[];
  readonly balance: LootBalanceInput;
}

export interface LootConfig {
  readonly items: readonly ItemData[];
  readonly rarities: readonly RarityData[];
  readonly affixes: readonly AffixData[];
  /** Pity guarantees, lowest rarity first; `rank` = index in `rarities`. */
  readonly pity: readonly PityRule[];
  readonly affixTierGrowthPct: number;
  /** Rank (index in `rarities`) from which a drop is kept even with a full bag (GDD 10); Infinity = none. */
  readonly keepWhenBagFullRank: number;
}

/** One entry in an enemy's own drop table, resolved to internal units (GDD 9.3 v2.4). */
export interface EnemyDropItemConfig {
  readonly itemId: string;
  /** Drop chance in 0.01 % units (0.5 % -> 50), like the old flat dropChanceBp. */
  readonly pctBpAtMin: number;
  readonly pctBpAtMax: number;
}

/** An enemy's own weight for one rarity (GDD 9.3/9.6 v2.4). Not hundredths - a plain ratio, like the old global weights. */
export interface EnemyRarityWeightConfig {
  readonly rarityId: string;
  readonly weightAtMin: number;
  readonly weightAtMax: number;
}

/** One currency in an enemy's own drop table, resolved to internal units (GDD 11.1 v2.5). */
export interface EnemyDropCurrencyConfig {
  readonly currencyId: CurrencyId;
  /** Drop chance in 0.01 % units (35 % -> 3500), like item drops. */
  readonly pctBpAtMin: number;
  readonly pctBpAtMax: number;
  readonly amountMin: number;
  readonly amountMax: number;
}

export interface EnemyLootTable {
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly items: readonly EnemyDropItemConfig[];
  readonly rarities: readonly EnemyRarityWeightConfig[];
  readonly currencies: readonly EnemyDropCurrencyConfig[];
}

export function createEnemyLootTable(input: EnemyLoot): EnemyLootTable {
  return {
    minLevel: input.minLevel,
    maxLevel: input.maxLevel,
    items: input.items.map((i) => ({
      itemId: i.itemId,
      pctBpAtMin: toHundredths(i.pctAtMin),
      pctBpAtMax: toHundredths(i.pctAtMax),
    })),
    rarities: input.rarities.map((r) => ({
      rarityId: r.rarityId,
      weightAtMin: r.weightAtMin,
      weightAtMax: r.weightAtMax,
    })),
    currencies: input.currencies.map((c) => ({
      currencyId: c.currencyId,
      pctBpAtMin: toHundredths(c.pctAtMin),
      pctBpAtMax: toHundredths(c.pctAtMax),
      amountMin: c.amountMin,
      amountMax: c.amountMax,
    })),
  };
}

/** Linear interpolation between `atMin`/`atMax` over [minLevel, maxLevel], clamped; a fixed
 * (boss) level range (minLevel === maxLevel) just returns `atMin`. Callers round if needed
 * (rarity weights stay plain floats like the old global ones; item drop chances are rounded
 * to a whole basis-point unit, see rollKillDrop). */
export function interpolate(atMin: number, atMax: number, level: number, minLevel: number, maxLevel: number): number {
  if (maxLevel <= minLevel) return atMin;
  const t = Math.min(1, Math.max(0, (level - minLevel) / (maxLevel - minLevel)));
  return atMin + (atMax - atMin) * t;
}

export interface ItemStat {
  readonly stat: StatId;
  /** Hundredths (flat 0.25 -> 25; 3 % -> 300). */
  readonly value: number;
}

export interface ItemAffix extends ItemStat {
  readonly id: string;
}

export interface Item {
  /** Unique per session, increasing. */
  readonly uid: number;
  readonly baseId: string;
  readonly slot: ItemSlot;
  readonly tier: number;
  readonly rarityId: string;
  /** Weapons only: damage range (hundredths) and attack interval shift (ms; negative = faster). */
  readonly weapon: { readonly damageMin: number; readonly damageMax: number; readonly attackIntervalModMs: number } | null;
  readonly stats: readonly ItemStat[];
  readonly affixes: readonly ItemAffix[];
  /** M5.2b2: protects from future bulk-discard/disassembly. Not set (undefined) = unlocked. */
  readonly locked?: boolean;
}

export interface PityRule {
  readonly rarityId: string;
  readonly rank: number;
  readonly kills: number;
}

export interface LootState {
  /**
   * Per pity rarity: kills since the last drop of that rarity or better (GDD 9.6 v2.2,
   * "Lucky acorn"). Only counts while the rarity can actually drop (unlocked, items exist).
   */
  readonly pityCounters: Readonly<Record<string, number>>;
  readonly nextUid: number;
}

export interface LootContext {
  readonly magicFindPct: number;
  /** Quest ids that unlocked stats (GDD 6.1); locked affixes never roll. */
  readonly unlocked: ReadonlySet<string>;
}

export function createLootConfig(input: LootConfigInput): LootConfig {
  if (!input.rarities.some((r) => r.isRemainder)) throw new Error('No remainder rarity (Common)');
  const pity = input.balance.pity
    .map((p) => {
      const rank = input.rarities.findIndex((r) => r.id === p.rarity);
      if (rank < 0) throw new Error(`Unknown pity rarity "${p.rarity}"`);
      return { rarityId: p.rarity, rank, kills: p.kills };
    })
    .sort((a, b) => a.rank - b.rank);
  const keepFrom = input.balance.keepWhenBagFullFrom;
  const keepWhenBagFullRank = keepFrom === undefined ? Infinity : input.rarities.findIndex((r) => r.id === keepFrom);
  if (keepWhenBagFullRank < 0) throw new Error(`Unknown keepWhenBagFullFrom rarity "${keepFrom}"`);
  return {
    items: input.items,
    rarities: input.rarities,
    affixes: input.affixes,
    pity,
    affixTierGrowthPct: input.balance.affixTierGrowthPct,
    keepWhenBagFullRank,
  };
}

/** GDD 10: true if `item` must be kept even when the bag is full (Rare and better by default). */
export function keepsWhenBagFull(config: LootConfig, item: Item): boolean {
  return rankOf(config, item.rarityId) >= config.keepWhenBagFullRank;
}

export function createLootState(): LootState {
  return { pityCounters: {}, nextUid: 1 };
}

/** MF_eff = MF x 100 / (MF + 100): diminishing returns for Unique/Set/Legendary (GDD 9.6). */
export function effectiveMagicFind(magicFindPct: number): number {
  return magicFindPct <= 0 ? 0 : (magicFindPct * 100) / (magicFindPct + 100);
}

/**
 * Weights for this enemy's own base-kind rarities at `level` (GDD 9.3/9.6 v2.4): each
 * interpolated between the enemy's minLevel/maxLevel, then scaled by Magic Find. Common
 * (the remainder rarity) gets 100 - the rest (min 0). With `minRank`, only rarities of
 * that rank or better keep their weight (the pity "at least X" guarantee).
 */
export function rarityWeights(
  config: LootConfig,
  enemyLoot: EnemyLootTable,
  level: number,
  ctx: LootContext,
  minRank?: number,
): { readonly rarity: RarityData; readonly weight: number }[] {
  const pityOnly = minRank !== undefined;
  const mfLinear = 1 + ctx.magicFindPct / 100;
  const mfDiminishing = 1 + effectiveMagicFind(ctx.magicFindPct) / 100;
  const weighted = config.rarities.map((rarity, rank) => {
    if (rarity.isRemainder) return { rarity, weight: 0 };
    const entry = enemyLoot.rarities.find((r) => r.rarityId === rarity.id);
    if (!entry) return { rarity, weight: 0 };
    // Locked rarities (e.g. Legendary before its quest, GDD 9.6 v2.1) never drop; their share goes to Common.
    if (rarity.unlockedBy !== null && !ctx.unlocked.has(rarity.unlockedBy)) return { rarity, weight: 0 };
    if (pityOnly && rank < minRank) return { rarity, weight: 0 };
    const base = interpolate(entry.weightAtMin, entry.weightAtMax, level, enemyLoot.minLevel, enemyLoot.maxLevel);
    const mult =
      rarity.mfScaling === 'linear' ? mfLinear : rarity.mfScaling === 'diminishing' ? mfDiminishing : 1;
    return { rarity, weight: base * mult };
  });
  if (pityOnly) return weighted;
  const others = weighted.reduce((sum, w) => sum + w.weight, 0);
  return weighted.map((w) => (w.rarity.isRemainder ? { ...w, weight: Math.max(0, 100 - others) } : w));
}

export function rollRarity(
  config: LootConfig,
  enemyLoot: EnemyLootTable,
  level: number,
  rng: RngState,
  ctx: LootContext,
  minRank?: number,
): { readonly rarity: RarityData; readonly rng: RngState } {
  const weights = rarityWeights(config, enemyLoot, level, ctx, minRank);
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  const draw = next(rng);
  let target = draw.value * total;
  for (const w of weights) {
    if (target < w.weight) return { rarity: w.rarity, rng: draw.state };
    target -= w.weight;
  }
  // Floating point edge (target == total): take the last rarity with weight.
  const last = [...weights].reverse().find((w) => w.weight > 0) ?? weights[0];
  if (!last) throw new Error('No rarities configured');
  return { rarity: last.rarity, rng: draw.state };
}

function itemDataOf(config: LootConfig, itemId: string): ItemData {
  const item = config.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Unknown item id "${itemId}" in an enemy's drop table`);
  return item;
}

/** The one rarity for a non-base itemKind (Unique/Set always drop as themselves, GDD 9.5 v2.4). */
function fixedRarityFor(config: LootConfig, kind: 'unique' | 'set'): RarityData {
  const rarity = config.rarities.find((r) => r.itemKind === kind);
  if (!rarity) throw new Error(`No rarity configured for itemKind "${kind}"`);
  return rarity;
}

/**
 * Generates one instance of `base` at `rarity` (GDD 9.3 steps 3-4): stat values scaled by the
 * rarity multiplier, then affixes. `base` and `rarity` are already decided by the caller.
 */
export function generateItemFromBase(
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
  base: ItemData,
  rarity: RarityData,
  uid: number,
): { readonly item: Item; readonly rng: RngState } {
  let r = rng;
  const mult = rarity.statMultPct / 100;
  const weapon = base.weapon
    ? {
        damageMin: Math.round(toHundredths(base.weapon.damageMin) * mult),
        damageMax: Math.round(toHundredths(base.weapon.damageMax) * mult),
        attackIntervalModMs: Math.sign(base.weapon.attackIntervalModS) * secondsToMs(Math.abs(base.weapon.attackIntervalModS)),
      }
    : null;

  const stats: ItemStat[] = [];
  for (const s of base.stats) {
    const roll = rollInRange(r, toHundredths(s.min) * mult, toHundredths(s.max) * mult);
    r = roll.rng;
    stats.push({ stat: s.stat, value: roll.value });
  }

  const affixRoll = rollAffixes(config, r, ctx, base.tier, rarity.affixCount);
  return {
    item: {
      uid,
      baseId: base.id,
      slot: base.slot,
      tier: base.tier,
      rarityId: rarity.id,
      weapon,
      stats,
      affixes: affixRoll.affixes,
    },
    rng: affixRoll.rng,
  };
}

export interface DiceFaces {
  /** 1-20. Always 20 when `second` is set (GDD 9.6: a "20" triggers the gold die). */
  readonly first: number;
  /** The gold d20, only for Unique/Set/Legendary. */
  readonly second: number | null;
}

/**
 * Die faces for the drop animation (GDD 9.6): the outcome (rarity) is already
 * decided, this just picks which face(s) match it, for the roll to land on.
 * Purely cosmetic and deterministic (from the item's uid), not a source of
 * randomness for game logic - it never touches the fight's own Rng stream.
 */
export function diceFaces(item: Item, config: LootConfig): DiceFaces {
  const rarity = config.rarities.find((r) => r.id === item.rarityId);
  if (!rarity) throw new Error(`Unknown rarity "${item.rarityId}"`);
  const seed = createRng(item.uid);
  const first = pickFace(seed, rarity.diceRange);
  const second = rarity.goldDiceRange ? pickFace(branch(seed, 'gold-die'), rarity.goldDiceRange) : null;
  return { first, second };
}

function pickFace(seed: RngState, [min, max]: readonly [number, number]): number {
  const draw = next(seed);
  return min + Math.floor(draw.value * (max - min + 1));
}

/**
 * `count` distinct affixes from the unlocked pool (GDD 9.3), each rolled in
 * its tier-1 range x (1 + growth x (tier - 1)).
 */
export function rollAffixes(
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
  tier: number,
  count: number,
): { readonly affixes: ItemAffix[]; readonly rng: RngState } {
  const pool = config.affixes.filter((a) => a.unlockedBy === null || ctx.unlocked.has(a.unlockedBy));
  const tierMult = 1 + (config.affixTierGrowthPct / 100) * (tier - 1);
  const remaining = [...pool];
  const affixes: ItemAffix[] = [];
  let r = rng;
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const pick = nextInt(r, 0, remaining.length);
    r = pick.state;
    const [affix] = remaining.splice(pick.value, 1);
    if (!affix) break;
    const roll = rollInRange(r, toHundredths(affix.min) * tierMult, toHundredths(affix.max) * tierMult);
    r = roll.rng;
    affixes.push({ id: affix.id, stat: affix.stat, value: roll.value });
  }
  return { affixes, rng: r };
}

/** Can this rarity drop right now for this enemy (unlocked, and it's actually in its table)? */
export function canDrop(config: LootConfig, enemyLoot: EnemyLootTable, ctx: LootContext, rarity: RarityData): boolean {
  if (rarity.unlockedBy !== null && !ctx.unlocked.has(rarity.unlockedBy)) return false;
  if (rarity.itemKind !== 'base') {
    return enemyLoot.items.some((e) => itemDataOfSafe(config, e.itemId)?.kind === rarity.itemKind);
  }
  if (rarity.isRemainder) return true;
  return enemyLoot.rarities.some((r) => r.rarityId === rarity.id);
}

function itemDataOfSafe(config: LootConfig, itemId: string): ItemData | undefined {
  return config.items.find((i) => i.id === itemId);
}

/** Pity countdowns for the UI: rarities that can drop from this enemy now, and kills left for each (GDD 9.6). */
export function pityCountdowns(
  state: LootState,
  config: LootConfig,
  enemyLoot: EnemyLootTable,
  ctx: LootContext,
): { readonly rarityId: string; readonly killsLeft: number }[] {
  return config.pity
    .filter((p) => {
      const rarity = config.rarities[p.rank];
      return rarity !== undefined && canDrop(config, enemyLoot, ctx, rarity);
    })
    .map((p) => ({ rarityId: p.rarityId, killsLeft: Math.max(0, p.kills - (state.pityCounters[p.rarityId] ?? 0)) }));
}

/** Rank (index in config.rarities) of a rarity id. */
function rankOf(config: LootConfig, rarityId: string): number {
  return config.rarities.findIndex((r) => r.id === rarityId);
}

/**
 * Called once per killed enemy (GDD 9.3/9.6 v2.4): every entry in the enemy's own drop table
 * is rolled independently, so zero, one or several items can drop. Each dropped base item
 * separately rolls its rarity from the enemy's own rarity weights (scaled by level and Magic
 * Find); unique/set items are their own table entry and always drop as themselves - no roll,
 * no fallback needed. Pity (GDD 9.6 v2.2) still guarantees at least one item of the pity
 * rarity once its counter is full, even if the tables above wouldn't have dropped one.
 */
export function rollKillDrop(
  state: LootState,
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
  enemyLoot: EnemyLootTable,
  enemyLevel: number,
): { readonly state: LootState; readonly items: readonly Item[]; readonly rng: RngState } {
  const counters: Record<string, number> = { ...state.pityCounters };
  let forcedRarityId: string | undefined;
  let forcedRank = -1;
  for (const p of config.pity) {
    const rarity = config.rarities[p.rank];
    if (!rarity || !canDrop(config, enemyLoot, ctx, rarity)) continue;
    counters[p.rarityId] = (counters[p.rarityId] ?? 0) + 1;
    if ((counters[p.rarityId] ?? 0) >= p.kills && p.rank > forcedRank) {
      forcedRarityId = p.rarityId;
      forcedRank = p.rank;
    }
  }

  let r = rng;
  let uid = state.nextUid;
  const items: Item[] = [];
  let satisfiedRank = -1;

  for (const entry of enemyLoot.items) {
    const pctBp = Math.round(
      interpolate(entry.pctBpAtMin, entry.pctBpAtMax, enemyLevel, enemyLoot.minLevel, enemyLoot.maxLevel),
    );
    const draw = nextInt(r, 0, 10000);
    r = draw.state;
    if (draw.value >= pctBp) continue;
    const base = itemDataOf(config, entry.itemId);
    let rarity: RarityData;
    if (base.kind === 'base') {
      const rarityRoll = rollRarity(config, enemyLoot, enemyLevel, r, ctx);
      rarity = rarityRoll.rarity;
      r = rarityRoll.rng;
    } else {
      rarity = fixedRarityFor(config, base.kind);
    }
    const gen = generateItemFromBase(config, r, ctx, base, rarity, uid);
    r = gen.rng;
    uid += 1;
    items.push(gen.item);
    satisfiedRank = Math.max(satisfiedRank, rankOf(config, rarity.id));
  }

  if (forcedRarityId !== undefined && forcedRank > satisfiedRank) {
    const forcedRarity = config.rarities[forcedRank];
    if (!forcedRarity) throw new Error(`Unknown forced rarity rank ${forcedRank}`);
    const candidates = enemyLoot.items
      .map((e) => itemDataOf(config, e.itemId))
      .filter((i) => i.kind === forcedRarity.itemKind);
    if (candidates.length === 0) {
      throw new Error(`Pity wants rarity "${forcedRarity.id}" but enemy has no matching item in its drop table`);
    }
    const pick = nextInt(r, 0, candidates.length);
    r = pick.state;
    const base = candidates[pick.value];
    if (!base) throw new Error('Pity item pick out of range');
    const gen = generateItemFromBase(config, r, ctx, base, forcedRarity, uid);
    r = gen.rng;
    uid += 1;
    items.push(gen.item);
    satisfiedRank = Math.max(satisfiedRank, forcedRank);
  }

  for (const p of config.pity) {
    if (p.rank <= satisfiedRank && p.rarityId in counters) counters[p.rarityId] = 0;
  }

  return { state: { pityCounters: counters, nextUid: uid }, items, rng: r };
}

/** Uniform whole hundredths in [min, max] (both inclusive), inputs rounded first. */
function rollInRange(rng: RngState, min: number, max: number): { readonly value: number; readonly rng: RngState } {
  const lo = Math.round(min);
  const hi = Math.round(max);
  if (hi <= lo) return { value: lo, rng };
  const roll = nextInt(rng, lo, hi + 1);
  return { value: roll.value, rng: roll.state };
}

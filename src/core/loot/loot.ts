/**
 * Item drops and generation (GDD 9.2, 9.3, 9.5, 9.6).
 *
 * Pure: every function takes the seeded Rng and returns the advanced one.
 * All values are internal hundredths (core/numbers), percentages too
 * (3 % -> 300), rolled in 0.01 steps (GDD 9.3 v2.0).
 *
 * Not yet (later stages): unique/set items and their fixed properties and
 * set bonuses (need data from later tiles), legendary traits, upgrades (M16).
 */
import type { AffixData, ItemData, ItemSlot, RarityData, StatId } from '../content/schemas';
import { toHundredths } from '../numbers/numbers';
import { next, nextInt, type RngState } from '../rng/rng';
import { secondsToMs } from '../time/fixedStep';

export interface LootBalanceInput {
  readonly dropChancePct: number;
  readonly pityKills: number;
  readonly pityMinRarity: string;
  readonly affixTierGrowthPct: number;
  readonly upgradeGrowthPct: number;
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
  /** Drop chance per normal kill, in 0.01 % (4 % -> 400). */
  readonly dropChanceBp: number;
  readonly pityKills: number;
  /** Index in `rarities` (= rank) of the pity guarantee's minimum rarity. */
  readonly pityMinRank: number;
  readonly affixTierGrowthPct: number;
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
  /** Weapons only: damage range (hundredths) and attack interval (ms). */
  readonly weapon: { readonly damageMin: number; readonly damageMax: number; readonly attackIntervalMs: number } | null;
  readonly stats: readonly ItemStat[];
  readonly affixes: readonly ItemAffix[];
}

export interface LootState {
  /** Kills since the last drop of the pity rarity or better (GDD 9.6 pity, "Lucky acorn"). */
  readonly killsSincePity: number;
  readonly nextUid: number;
}

export interface LootContext {
  /** Tier of the current tile (1 until the map in M6). */
  readonly tileTier: number;
  readonly magicFindPct: number;
  /** Quest ids that unlocked stats (GDD 6.1); locked affixes never roll. */
  readonly unlocked: ReadonlySet<string>;
}

export function createLootConfig(input: LootConfigInput): LootConfig {
  if (!input.rarities.some((r) => r.isRemainder)) throw new Error('No remainder rarity (Common)');
  const pityMinRank = input.rarities.findIndex((r) => r.id === input.balance.pityMinRarity);
  if (pityMinRank < 0) throw new Error(`Unknown pityMinRarity "${input.balance.pityMinRarity}"`);
  return {
    items: input.items,
    rarities: input.rarities,
    affixes: input.affixes,
    dropChanceBp: input.balance.dropChancePct * 100,
    pityKills: input.balance.pityKills,
    pityMinRank,
    affixTierGrowthPct: input.balance.affixTierGrowthPct,
  };
}

export function createLootState(): LootState {
  return { killsSincePity: 0, nextUid: 1 };
}

/** MF_eff = MF x 100 / (MF + 100): diminishing returns for Unique/Set/Legendary (GDD 9.6). */
export function effectiveMagicFind(magicFindPct: number): number {
  return magicFindPct <= 0 ? 0 : (magicFindPct * 100) / (magicFindPct + 100);
}

/**
 * Rarity weights for this roll (GDD 9.6): base weights scaled by Magic Find,
 * rarities not available on this tile tier get 0, the remainder rarity
 * (Common) gets 100 - the rest (min 0). With `pityOnly`, only pity-tier
 * rarities keep their weight (the "at least Unique" guarantee).
 */
export function rarityWeights(
  config: LootConfig,
  ctx: LootContext,
  pityOnly = false,
): { readonly rarity: RarityData; readonly weight: number }[] {
  const mfLinear = 1 + ctx.magicFindPct / 100;
  const mfDiminishing = 1 + effectiveMagicFind(ctx.magicFindPct) / 100;
  const weighted = config.rarities.map((rarity, rank) => {
    if (rarity.isRemainder || ctx.tileTier < rarity.minTileTier) return { rarity, weight: 0 };
    // Locked rarities (e.g. Legendary before its quest, GDD 9.6 v2.1) never drop; their share goes to Common.
    if (rarity.unlockedBy !== null && !ctx.unlocked.has(rarity.unlockedBy)) return { rarity, weight: 0 };
    if (pityOnly && rank < config.pityMinRank) return { rarity, weight: 0 };
    // The pity guarantee is "at least X" (GDD 9.6), so it never picks a
    // Unique/Set that would fall back to Rare on this tile.
    if (pityOnly && rarity.itemKind !== 'base' && eligibleItems(config, ctx.tileTier, rarity.itemKind).length === 0) {
      return { rarity, weight: 0 };
    }
    const mult =
      rarity.mfScaling === 'linear' ? mfLinear : rarity.mfScaling === 'diminishing' ? mfDiminishing : 1;
    return { rarity, weight: rarity.weight * mult };
  });
  if (pityOnly) return weighted;
  const others = weighted.reduce((sum, w) => sum + w.weight, 0);
  return weighted.map((w) => (w.rarity.isRemainder ? { ...w, weight: Math.max(0, 100 - others) } : w));
}

export function rollRarity(
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
  pityOnly = false,
): { readonly rarity: RarityData; readonly rng: RngState } {
  const weights = rarityWeights(config, ctx, pityOnly);
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

/** Base items that can drop on this tile: tier <= t and >= t - 2 (GDD 9.3). */
export function eligibleItems(config: LootConfig, tileTier: number, kind: ItemData['kind']): ItemData[] {
  return config.items.filter((i) => i.kind === kind && i.tier <= tileTier && i.tier >= tileTier - 2);
}

/**
 * Generates one item of `rarity` (GDD 9.3). A Unique/Set roll with no such
 * item available on this tile becomes a Rare with one extra affix (GDD 9.5).
 */
export function generateItem(
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
  rolled: RarityData,
  uid: number,
): { readonly item: Item; readonly rng: RngState } {
  let rarity = rolled;
  let affixCount = rolled.affixCount;
  let pool = eligibleItems(config, ctx.tileTier, rolled.itemKind);
  if (pool.length === 0 && rolled.itemKind !== 'base') {
    const rare = config.rarities.find((r) => r.id === 'rare');
    if (!rare) throw new Error('Fallback rarity "rare" is missing');
    rarity = rare;
    affixCount = rare.affixCount + 1;
    pool = eligibleItems(config, ctx.tileTier, 'base');
  }
  if (pool.length === 0) throw new Error(`No items can drop on tile tier ${ctx.tileTier}`);

  let r = rng;
  const pick = nextInt(r, 0, pool.length);
  r = pick.state;
  const base = pool[pick.value];
  if (!base) throw new Error('Item pick out of range');

  const mult = rarity.statMultPct / 100;
  const weapon = base.weapon
    ? {
        damageMin: Math.round(toHundredths(base.weapon.damageMin) * mult),
        damageMax: Math.round(toHundredths(base.weapon.damageMax) * mult),
        attackIntervalMs: secondsToMs(base.weapon.attackIntervalS),
      }
    : null;

  const stats: ItemStat[] = [];
  for (const s of base.stats) {
    const roll = rollInRange(r, toHundredths(s.min) * mult, toHundredths(s.max) * mult);
    r = roll.rng;
    stats.push({ stat: s.stat, value: roll.value });
  }

  const affixRoll = rollAffixes(config, r, ctx, base.tier, affixCount);
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

/** Kills left until the pity guarantee (shown in the UI as a countdown). */
export function killsUntilPity(state: LootState, config: LootConfig): number {
  return Math.max(0, config.pityKills - state.killsSincePity);
}

/** The pity guarantee's minimum rarity ("rare" for now, GDD 9.6 v2.1). */
export function pityRarity(config: LootConfig): RarityData {
  const r = config.rarities[config.pityMinRank];
  if (!r) throw new Error('pityMinRank out of range');
  return r;
}

/**
 * Called once per killed enemy (GDD 9.6): counts towards pity, rolls the
 * 4 % drop chance - or forces a drop of at least the pity rarity once the
 * pity counter is full.
 */
export function rollKillDrop(
  state: LootState,
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
): { readonly state: LootState; readonly item: Item | null; readonly rng: RngState } {
  const kills = state.killsSincePity + 1;
  const forced = kills >= config.pityKills;
  let r = rng;
  if (!forced) {
    const chance = nextInt(r, 0, 10000);
    r = chance.state;
    if (chance.value >= config.dropChanceBp) {
      return { state: { ...state, killsSincePity: kills }, item: null, rng: r };
    }
  }
  const rarityRoll = rollRarity(config, r, ctx, forced);
  const gen = generateItem(config, rarityRoll.rng, ctx, rarityRoll.rarity, state.nextUid);
  const finalRank = config.rarities.findIndex((x) => x.id === gen.item.rarityId);
  return {
    state: {
      // Counter = kills since the last ITEM of the pity rarity or better (actual item, after any fallback).
      killsSincePity: finalRank >= config.pityMinRank ? 0 : kills,
      nextUid: state.nextUid + 1,
    },
    item: gen.item,
    rng: gen.rng,
  };
}

/** Uniform whole hundredths in [min, max] (both inclusive), inputs rounded first. */
function rollInRange(rng: RngState, min: number, max: number): { readonly value: number; readonly rng: RngState } {
  const lo = Math.round(min);
  const hi = Math.round(max);
  if (hi <= lo) return { value: lo, rng };
  const roll = nextInt(rng, lo, hi + 1);
  return { value: roll.value, rng: roll.state };
}

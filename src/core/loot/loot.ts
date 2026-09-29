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
import { branch, createRng, next, nextInt, type RngState } from '../rng/rng';
import { secondsToMs } from '../time/fixedStep';

export interface LootBalanceInput {
  readonly dropChancePct: number;
  readonly pity: readonly { readonly rarity: string; readonly kills: number }[];
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
  /** Pity guarantees, lowest rarity first; `rank` = index in `rarities`. */
  readonly pity: readonly PityRule[];
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
  /** Tier of the current tile (1 until the map in M6). */
  readonly tileTier: number;
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
  return {
    items: input.items,
    rarities: input.rarities,
    affixes: input.affixes,
    dropChanceBp: input.balance.dropChancePct * 100,
    pity,
    affixTierGrowthPct: input.balance.affixTierGrowthPct,
  };
}

export function createLootState(): LootState {
  return { pityCounters: {}, nextUid: 1 };
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
  /** Pity roll: only rarities of this rank or better keep their weight ("at least X"). */
  minRank?: number,
): { readonly rarity: RarityData; readonly weight: number }[] {
  const pityOnly = minRank !== undefined;
  const mfLinear = 1 + ctx.magicFindPct / 100;
  const mfDiminishing = 1 + effectiveMagicFind(ctx.magicFindPct) / 100;
  const weighted = config.rarities.map((rarity, rank) => {
    if (rarity.isRemainder || ctx.tileTier < rarity.minTileTier) return { rarity, weight: 0 };
    // Locked rarities (e.g. Legendary before its quest, GDD 9.6 v2.1) never drop; their share goes to Common.
    if (rarity.unlockedBy !== null && !ctx.unlocked.has(rarity.unlockedBy)) return { rarity, weight: 0 };
    if (pityOnly && rank < minRank) return { rarity, weight: 0 };
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
  minRank?: number,
): { readonly rarity: RarityData; readonly rng: RngState } {
  const weights = rarityWeights(config, ctx, minRank);
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

/**
 * Base items that can drop on this tile: tier <= t and >= t - 2 (GDD 9.3). Once nothing is
 * left in that window (map tiles have moved on to a tier no item content covers yet), falls
 * back to the newest tier at or below `t` instead of dropping nothing - keeps working with
 * only tier-1 items until higher-tier gear is added.
 */
export function eligibleItems(config: LootConfig, tileTier: number, kind: ItemData['kind']): ItemData[] {
  const inWindow = config.items.filter((i) => i.kind === kind && i.tier <= tileTier && i.tier >= tileTier - 2);
  if (inWindow.length > 0) return inWindow;
  const atOrBelow = config.items.filter((i) => i.kind === kind && i.tier <= tileTier);
  if (atOrBelow.length === 0) return atOrBelow;
  const newestTier = Math.max(...atOrBelow.map((i) => i.tier));
  return atOrBelow.filter((i) => i.tier === newestTier);
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
        attackIntervalModMs: Math.sign(base.weapon.attackIntervalModS) * secondsToMs(Math.abs(base.weapon.attackIntervalModS)),
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

/** Can this rarity drop right now (unlocked, tile tier, and for Unique/Set: such items exist here)? */
export function canDrop(config: LootConfig, ctx: LootContext, rarity: RarityData): boolean {
  if (ctx.tileTier < rarity.minTileTier) return false;
  if (rarity.unlockedBy !== null && !ctx.unlocked.has(rarity.unlockedBy)) return false;
  return rarity.itemKind === 'base' || eligibleItems(config, ctx.tileTier, rarity.itemKind).length > 0;
}

/** Pity countdowns for the UI: rarities that can drop now and kills left for each (GDD 9.6). */
export function pityCountdowns(
  state: LootState,
  config: LootConfig,
  ctx: LootContext,
): { readonly rarityId: string; readonly killsLeft: number }[] {
  return config.pity
    .filter((p) => {
      const rarity = config.rarities[p.rank];
      return rarity !== undefined && canDrop(config, ctx, rarity);
    })
    .map((p) => ({ rarityId: p.rarityId, killsLeft: Math.max(0, p.kills - (state.pityCounters[p.rarityId] ?? 0)) }));
}

/**
 * Called once per killed enemy (GDD 9.6 v2.2): each pity counter whose rarity
 * can drop here counts the kill; if one is full, the drop is forced and is at
 * least that rarity (the highest full one wins). Otherwise the normal 4 % roll.
 * A dropped item resets every counter of its rarity or lower (a Legendary also
 * satisfies the Rare and Unique guarantees).
 */
export function rollKillDrop(
  state: LootState,
  config: LootConfig,
  rng: RngState,
  ctx: LootContext,
): { readonly state: LootState; readonly item: Item | null; readonly rng: RngState } {
  const counters: Record<string, number> = { ...state.pityCounters };
  let forcedRank: number | undefined;
  for (const p of config.pity) {
    const rarity = config.rarities[p.rank];
    if (!rarity || !canDrop(config, ctx, rarity)) continue;
    counters[p.rarityId] = (counters[p.rarityId] ?? 0) + 1;
    if ((counters[p.rarityId] ?? 0) >= p.kills) forcedRank = p.rank; // sorted by rank: highest full wins
  }
  let r = rng;
  if (forcedRank === undefined) {
    const chance = nextInt(r, 0, 10000);
    r = chance.state;
    if (chance.value >= config.dropChanceBp) {
      return { state: { ...state, pityCounters: counters }, item: null, rng: r };
    }
  }
  const rarityRoll = rollRarity(config, r, ctx, forcedRank);
  const gen = generateItem(config, rarityRoll.rng, ctx, rarityRoll.rarity, state.nextUid);
  const finalRank = config.rarities.findIndex((x) => x.id === gen.item.rarityId);
  for (const p of config.pity) {
    if (p.rank <= finalRank && p.rarityId in counters) counters[p.rarityId] = 0;
  }
  return {
    state: { pityCounters: counters, nextUid: state.nextUid + 1 },
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

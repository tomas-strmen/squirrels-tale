/**
 * The merchant - Magpie (GDD 11.2, M10). Pure TypeScript, no Phaser.
 *
 * - Item value V(t) = round(5 x 1.5^(t-1)) by item tier; she sells at V x rarity `buyPct`
 *   (Common 100 %, Uncommon 300 %) and buys back at V x rarity `sellPct` (Common 20 % ...
 *   Legendary 1000 %, at least `minSellPrice`). The currency depends on the item slot:
 *   weapons pebbles, armor seeds, jewellery nuts (`balance.json` `merchant.currencyBySlot`).
 * - Daily stock (4 Common + 1 Uncommon) of base items from unlocked tiles (item tier <= the
 *   highest unlocked tile tier), rolled once per UTC day from the merchant's own Rng stream,
 *   so it's the same all day and survives reloads.
 * - Only unlocked bag items can be sold (a lock protects from selling, GDD 10).
 */
import type { CurrencyId, ItemSlot, RarityData } from '../content/schemas';
import type { EncounterState } from '../encounter/encounter';
import { addToBag, BAG_CAPACITY } from '../inventory/inventory';
import { generateItemFromBase, type Item, type LootConfig } from '../loot/loot';
import { nextInt, type RngState } from '../rng/rng';

/** Design values from data/balance.json `merchant`. */
export interface MerchantConfig {
  readonly unlockTile: string;
  readonly baseValue: number;
  readonly valueGrowthPct: number;
  readonly minSellPrice: number;
  readonly dailyStock: readonly { readonly rarityId: string; readonly count: number }[];
  readonly currencyBySlot: Readonly<Record<ItemSlot, CurrencyId>>;
}

export interface MerchantState {
  /** UTC day index (ms since epoch / 1 day) the stock belongs to; -1 = never rolled. */
  readonly day: number;
  /** Items still for sale today (bought ones are removed). */
  readonly stock: readonly Item[];
  /** Own Rng stream for the stock, so it never changes fights or drops. */
  readonly rng: RngState;
}

export const MS_PER_DAY = 86_400_000;

export interface Price {
  readonly currencyId: CurrencyId;
  readonly amount: number;
}

/** V(t) (GDD 11.2): t1 5, t3 11, t5 25, t9 128. */
export function itemValue(tier: number, config: MerchantConfig): number {
  return Math.round(config.baseValue * (1 + config.valueGrowthPct / 100) ** (tier - 1));
}

function rarityOf(loot: LootConfig, rarityId: string): RarityData {
  const rarity = loot.rarities.find((r) => r.id === rarityId);
  if (!rarity) throw new Error(`Unknown rarity "${rarityId}"`);
  return rarity;
}

/** What the merchant asks for `item`. */
export function buyPrice(item: Item, loot: LootConfig, config: MerchantConfig): Price {
  const pct = rarityOf(loot, item.rarityId).buyPct ?? 0;
  return { currencyId: config.currencyBySlot[item.slot], amount: Math.round((itemValue(item.tier, config) * pct) / 100) };
}

/** What the merchant pays for `item` (upgrades +20 % each come with the smith, M16). */
export function sellPrice(item: Item, loot: LootConfig, config: MerchantConfig): Price {
  const pct = rarityOf(loot, item.rarityId).sellPct;
  const amount = Math.max(config.minSellPrice, Math.round((itemValue(item.tier, config) * pct) / 100));
  return { currencyId: config.currencyBySlot[item.slot], amount };
}

/**
 * The stock for `day` (GDD 11.2): for each `dailyStock` entry, `count` random base items with
 * tier <= `maxTier` at that rarity. Uses (and returns) `nextUid` so the items get unique uids.
 */
export function rollStock(
  merchant: MerchantState,
  loot: LootConfig,
  config: MerchantConfig,
  day: number,
  maxTier: number,
  nextUid: number,
): { readonly merchant: MerchantState; readonly nextUid: number } {
  const pool = loot.items.filter((i) => i.kind === 'base' && i.tier <= maxTier);
  let rng = merchant.rng;
  let uid = nextUid;
  const stock: Item[] = [];
  if (pool.length > 0) {
    for (const entry of config.dailyStock) {
      const rarity = rarityOf(loot, entry.rarityId);
      for (let i = 0; i < entry.count; i++) {
        const pick = nextInt(rng, 0, pool.length);
        const base = pool[pick.value];
        if (!base) continue;
        const generated = generateItemFromBase(loot, pick.state, { magicFindPct: 0, unlocked: new Set() }, base, rarity, uid);
        rng = generated.rng;
        uid++;
        stock.push(generated.item);
      }
    }
  }
  return { merchant: { day, stock, rng }, nextUid: uid };
}

/**
 * Rolls a new stock if `day` is later than the stock's day; otherwise the same state object
 * (an earlier day - clock wound back - never rerolls the stock, GDD 17.3).
 */
export function refreshStock(
  state: EncounterState,
  loot: LootConfig,
  config: MerchantConfig,
  day: number,
  maxTier: number,
): EncounterState {
  if (day <= state.merchant.day) return state;
  const rolled = rollStock(state.merchant, loot, config, day, maxTier, state.loot.nextUid);
  return { ...state, merchant: rolled.merchant, loot: { ...state.loot, nextUid: rolled.nextUid } };
}

export type BuyResult = 'bought' | 'notEnough' | 'bagFull' | 'gone';

/** Buys stock item `uid` into the bag. Nothing changes unless the result is 'bought'. */
export function buyItem(
  state: EncounterState,
  loot: LootConfig,
  config: MerchantConfig,
  uid: number,
): { readonly state: EncounterState; readonly result: BuyResult } {
  const item = state.merchant.stock.find((i) => i.uid === uid);
  if (!item) return { state, result: 'gone' };
  const price = buyPrice(item, loot, config);
  if (state.wallet[price.currencyId] < price.amount) return { state, result: 'notEnough' };
  if (state.inventory.bag.length >= BAG_CAPACITY) return { state, result: 'bagFull' };
  return {
    result: 'bought',
    state: {
      ...state,
      wallet: { ...state.wallet, [price.currencyId]: state.wallet[price.currencyId] - price.amount },
      inventory: addToBag(state.inventory, item),
      merchant: { ...state.merchant, stock: state.merchant.stock.filter((i) => i.uid !== uid) },
    },
  };
}

/** Sells bag item `uid` (not locked, not equipped). Same state if it can't be sold. */
export function sellItem(state: EncounterState, loot: LootConfig, config: MerchantConfig, uid: number): EncounterState {
  const item = state.inventory.bag.find((i) => i.uid === uid);
  if (!item || item.locked) return state;
  const price = sellPrice(item, loot, config);
  return {
    ...state,
    wallet: { ...state.wallet, [price.currencyId]: state.wallet[price.currencyId] + price.amount },
    inventory: { ...state.inventory, bag: state.inventory.bag.filter((i) => i.uid !== uid) },
  };
}

/** UTC day index of a timestamp (daily resets, GDD 17.3: use the guarded "now"). */
export function dayIndex(timeMs: number): number {
  return Math.floor(timeMs / MS_PER_DAY);
}

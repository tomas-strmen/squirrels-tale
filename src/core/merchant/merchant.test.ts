import { describe, expect, it } from 'vitest';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import tilesData from '../../../data/tiles.json';
import { toEncounterConfigInput } from '../content/encounterInput';
import { parseAffixes, parseBalance, parseEnemies, parseItems, parseRarities, parseTiles } from '../content/schemas';
import { createEncounter, createEncounterConfig, type EncounterState } from '../encounter/encounter';
import { BAG_CAPACITY } from '../inventory/inventory';
import { createLootConfig, type Item } from '../loot/loot';
import { createRng } from '../rng/rng';
import { buyItem, buyPrice, dayIndex, itemValue, MS_PER_DAY, refreshStock, rollStock, sellItem, sellPrice } from './merchant';

const balance = parseBalance(balanceData);
const config = balance.merchant;
const lootData = { items: parseItems(itemsData), rarities: parseRarities(raritiesData), affixes: parseAffixes(affixesData) };
const loot = createLootConfig({ ...lootData, balance: balance.loot });
const t1 = parseTiles(tilesData)[0];
if (!t1) throw new Error('no tiles');
const encounterConfig = createEncounterConfig(toEncounterConfigInput(balance, t1, parseEnemies(enemiesData), lootData));

function item(baseId: string, slot: Item['slot'], tier: number, rarityId: string, extra: Partial<Item> = {}): Item {
  return { uid: 900, baseId, slot, tier, rarityId, weapon: null, stats: [], affixes: [], ...extra };
}
function fresh(): EncounterState {
  return createEncounter(encounterConfig, createRng(5), 't1');
}

describe('prices (GDD 11.2)', () => {
  it('item value V(t) = round(5 x 1.5^(t-1))', () => {
    expect([1, 3, 5, 9].map((t) => itemValue(t, config))).toEqual([5, 11, 25, 128]);
  });

  it('she sells Common at V, Uncommon at 3 V, in the currency of the slot', () => {
    expect(buyPrice(item('sharp_twig', 'melee', 1, 'common'), loot, config)).toEqual({ currencyId: 'pebbles', amount: 5 });
    expect(buyPrice(item('leaf_cap', 'head', 1, 'uncommon'), loot, config)).toEqual({ currencyId: 'seeds', amount: 15 });
    expect(buyPrice(item('pebble_pendant', 'amulet', 1, 'common'), loot, config).currencyId).toBe('nuts');
  });

  it('she buys back at 0.2 V ... 10 V by rarity, at least 1', () => {
    expect(sellPrice(item('sharp_twig', 'melee', 1, 'common'), loot, config).amount).toBe(1);
    expect(sellPrice(item('twig_slingshot', 'ranged', 3, 'rare'), loot, config)).toEqual({ currencyId: 'pebbles', amount: 17 });
    expect(sellPrice(item('leaf_vest', 'body', 1, 'legendary'), loot, config)).toEqual({ currencyId: 'seeds', amount: 50 });
  });
});

describe('daily stock', () => {
  it('4 Common + 1 Uncommon base items from unlocked tiles, with fresh uids', () => {
    const r = rollStock(fresh().merchant, loot, config, 100, 1, 50);
    expect(r.merchant.stock.map((i) => i.rarityId)).toEqual(['common', 'common', 'common', 'common', 'uncommon']);
    expect(r.merchant.stock.every((i) => i.tier <= 1)).toBe(true);
    expect(r.merchant.stock.map((i) => i.uid)).toEqual([50, 51, 52, 53, 54]);
    expect(r.nextUid).toBe(55);
    expect(r.merchant.day).toBe(100);
  });

  it('stays the same all day, a new day brings a new stock', () => {
    const day = dayIndex(1_791_584_000_000);
    const today = refreshStock(fresh(), loot, config, day, 3);
    expect(refreshStock(today, loot, config, day, 3)).toBe(today);
    const tomorrow = refreshStock(today, loot, config, day + 1, 3);
    expect(tomorrow.merchant.day).toBe(day + 1);
    expect(tomorrow.merchant.stock.map((i) => i.uid)).not.toEqual(today.merchant.stock.map((i) => i.uid));
    expect(dayIndex(MS_PER_DAY * 3 + 5)).toBe(3);
    // Clock wound back a day: the stock doesn't reroll (GDD 17.3).
    expect(refreshStock(tomorrow, loot, config, day, 3)).toBe(tomorrow);
  });
});

describe('buying and selling', () => {
  const stocked = refreshStock(fresh(), loot, config, 7, 1);
  const first = stocked.merchant.stock[0];
  if (!first) throw new Error('empty stock');
  const price = buyPrice(first, loot, config);

  it('buying moves the item into the bag and takes the price', () => {
    const rich = { ...stocked, wallet: { ...stocked.wallet, [price.currencyId]: 100 } };
    const r = buyItem(rich, loot, config, first.uid);
    expect(r.result).toBe('bought');
    expect(r.state.wallet[price.currencyId]).toBe(100 - price.amount);
    expect(r.state.inventory.bag.map((i) => i.uid)).toEqual([first.uid]);
    expect(r.state.merchant.stock.some((i) => i.uid === first.uid)).toBe(false);
    expect(buyItem(r.state, loot, config, first.uid).result).toBe('gone');
  });

  it('nothing changes without enough money or bag space', () => {
    const r = buyItem(stocked, loot, config, first.uid);
    expect(r.result).toBe('notEnough');
    expect(r.state).toBe(stocked);
    const full = {
      ...stocked,
      wallet: { ...stocked.wallet, [price.currencyId]: 100 },
      inventory: { ...stocked.inventory, bag: Array.from({ length: BAG_CAPACITY }, (_, i) => ({ ...first, uid: 1000 + i })) },
    };
    expect(buyItem(full, loot, config, first.uid).result).toBe('bagFull');
  });

  it('selling pays the buy-back price; locked items cannot be sold', () => {
    const cap = item('leaf_cap', 'head', 1, 'uncommon', { uid: 77 });
    const withCap = { ...stocked, inventory: { ...stocked.inventory, bag: [cap, { ...cap, uid: 78, locked: true }] } };
    const sold = sellItem(withCap, loot, config, 77);
    expect(sold.wallet.seeds).toBe(withCap.wallet.seeds + 3); // 0.6 x 5
    expect(sold.inventory.bag.map((i) => i.uid)).toEqual([78]);
    expect(sellItem(sold, loot, config, 78)).toBe(sold);
  });
});

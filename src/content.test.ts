/**
 * Content checks: data/*.json validate against their zod schemas (core/content),
 * and the texts they reference exist in strings/en.json.
 */
import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import enemies from '../data/enemies.json';
import tilesData from '../data/tiles.json';
import affixesData from '../data/affixes.json';
import itemsData from '../data/items.json';
import raritiesData from '../data/rarities.json';
import en from '../strings/en.json';
import { toEncounterConfigInput } from './core/content/encounterInput';
import {
  parseAffixes,
  parseBalance,
  parseEnemies,
  parseItems,
  parseRarities,
  parseTiles,
  statIdSchema,
} from './core/content/schemas';
import { createEncounterConfig } from './core/encounter/encounter';
import { EQUIP_SLOTS } from './core/inventory/inventory';
import { createLootState, rollKillDrop } from './core/loot/loot';
import { createRng } from './core/rng/rng';

const strings: Record<string, string> = en;

describe('data + strings', () => {
  it('data/enemies.json matches its schema', () => {
    expect(() => parseEnemies(enemies)).not.toThrow();
  });

  it('data/balance.json matches its schema', () => {
    expect(() => parseBalance(balance)).not.toThrow();
  });

  it('every enemy has an English name in strings/en.json', () => {
    for (const enemy of parseEnemies(enemies)) {
      expect(strings[`enemy.${enemy.id}.name`], `missing text enemy.${enemy.id}.name`).toBeTruthy();
    }
  });

  it('data/tiles.json matches its schema', () => {
    expect(() => parseTiles(tilesData)).not.toThrow();
  });

  it("every tile's enemyIds reference a known enemy (M6.2)", () => {
    const enemyIds = new Set(parseEnemies(enemies).map((e) => e.id));
    for (const tile of parseTiles(tilesData)) {
      for (const enemyId of tile.enemyIds) {
        expect(enemyIds.has(enemyId), `tile ${tile.id} references unknown enemy ${enemyId}`).toBe(true);
      }
    }
  });

  it('every tile builds a valid encounter config with the balance values (M6.2)', () => {
    const validBalance = parseBalance(balance);
    const allEnemies = parseEnemies(enemies);
    const lootData = {
      items: parseItems(itemsData),
      rarities: parseRarities(raritiesData),
      affixes: parseAffixes(affixesData),
    };
    for (const tile of parseTiles(tilesData)) {
      const tileEnemies = allEnemies.filter((e) => tile.enemyIds.includes(e.id));
      expect(() =>
        createEncounterConfig(toEncounterConfigInput(validBalance, tile, tileEnemies, lootData)),
      ).not.toThrow();
    }
  });

  it('every tile can actually roll a kill drop without crashing (M6.2 regression: T4 had no item content)', () => {
    const validBalance = parseBalance(balance);
    const allEnemies = parseEnemies(enemies);
    const lootData = {
      items: parseItems(itemsData),
      rarities: parseRarities(raritiesData),
      affixes: parseAffixes(affixesData),
    };
    for (const tile of parseTiles(tilesData)) {
      const tileEnemies = allEnemies.filter((e) => tile.enemyIds.includes(e.id));
      const config = createEncounterConfig(toEncounterConfigInput(validBalance, tile, tileEnemies, lootData));
      let state = createLootState();
      let rng = createRng(1);
      const ctx = { tileTier: config.tileTier, magicFindPct: 0, unlocked: new Set<string>() };
      for (let i = 0; i < 50; i++) {
        expect(() => {
          const drop = rollKillDrop(state, { ...config.loot, dropChanceBp: 10000 }, rng, ctx);
          state = drop.state;
          rng = drop.rng;
        }, `tile ${tile.id} (tier ${tile.tier})`).not.toThrow();
      }
    }
  });

  it('items, rarities, affixes match their schemas', () => {
    expect(() => parseItems(itemsData)).not.toThrow();
    expect(() => parseRarities(raritiesData)).not.toThrow();
    expect(() => parseAffixes(affixesData)).not.toThrow();
  });

  it('every item, rarity and stat has an English name', () => {
    for (const item of parseItems(itemsData)) {
      expect(strings[`item.${item.id}.name`], `missing text item.${item.id}.name`).toBeTruthy();
    }
    for (const rarity of parseRarities(raritiesData)) {
      expect(strings[`rarity.${rarity.id}.name`], `missing text rarity.${rarity.id}.name`).toBeTruthy();
    }
    for (const slot of EQUIP_SLOTS) {
      expect(strings[`slot.${slot}.name`], `missing text slot.${slot}.name`).toBeTruthy();
    }
    for (const stat of statIdSchema.options) {
      expect(strings[`stat.${stat}.name`], `missing text stat.${stat}.name`).toBeTruthy();
    }
  });

  it('no text is empty', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect(value.trim(), `empty text for ${key}`).not.toBe('');
    }
  });
});

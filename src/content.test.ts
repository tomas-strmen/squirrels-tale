/**
 * Content checks: data/*.json validate against their zod schemas (core/content),
 * and the texts they reference exist in strings/en.json.
 */
import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import enemies from '../data/enemies.json';
import affixesData from '../data/affixes.json';
import itemsData from '../data/items.json';
import raritiesData from '../data/rarities.json';
import en from '../strings/en.json';
import { toEncounterConfigInput } from './core/content/encounterInput';
import { parseAffixes, parseBalance, parseEnemies, parseItems, parseRarities, statIdSchema } from './core/content/schemas';
import { createEncounterConfig } from './core/encounter/encounter';

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

  it('every enemy builds a valid encounter config with the balance values', () => {
    const validBalance = parseBalance(balance);
    const lootData = {
      items: parseItems(itemsData),
      rarities: parseRarities(raritiesData),
      affixes: parseAffixes(affixesData),
    };
    for (const enemy of parseEnemies(enemies)) {
      expect(() =>
        createEncounterConfig(toEncounterConfigInput(validBalance, enemy, lootData)),
      ).not.toThrow();
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

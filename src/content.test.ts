/**
 * Content checks: data/*.json validate against their zod schemas (core/content),
 * and the texts they reference exist in strings/en.json.
 */
import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import enemies from '../data/enemies.json';
import en from '../strings/en.json';
import { parseBalance, parseEnemies } from './core/content/schemas';
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
    for (const enemy of parseEnemies(enemies)) {
      expect(() =>
        createEncounterConfig({
          searchDurationS: validBalance.encounter.searchDurationS,
          playerAttackIntervalS: validBalance.player.unarmedAttackIntervalS,
          enemyAttackIntervalS: enemy.attackIntervalS,
        }),
      ).not.toThrow();
    }
  });

  it('no text is empty', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect(value.trim(), `empty text for ${key}`).not.toBe('');
    }
  });
});

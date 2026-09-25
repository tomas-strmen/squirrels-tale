/**
 * Content checks: data files and texts fit together.
 * (Full zod schemas come in M1.)
 */
import { describe, expect, it } from 'vitest';
import balance from '../data/balance.json';
import enemies from '../data/enemies.json';
import en from '../strings/en.json';
import { createEncounterConfig } from './core/encounter/encounter';

const strings: Record<string, string> = en;

describe('data + strings', () => {
  it('has at least one enemy', () => {
    expect(enemies.length).toBeGreaterThan(0);
  });

  it('every enemy has a unique snake_case id and an English name', () => {
    const ids = enemies.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(strings[`enemy.${id}.name`], `missing text enemy.${id}.name`).toBeTruthy();
    }
  });

  it('every enemy builds a valid encounter config with the balance values', () => {
    for (const enemy of enemies) {
      expect(() =>
        createEncounterConfig({
          searchDurationS: balance.encounter.searchDurationS,
          playerAttackIntervalS: balance.player.unarmedAttackIntervalS,
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

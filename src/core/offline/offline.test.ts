import { describe, expect, it } from 'vitest';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import tilesData from '../../../data/tiles.json';
import { toEncounterConfigInput } from '../content/encounterInput';
import { parseAffixes, parseBalance, parseEnemies, parseItems, parseRarities, parseTiles } from '../content/schemas';
import {
  createEncounter,
  createEncounterConfig,
  playerStats,
  startSearch,
  tick,
  type EncounterConfig,
  type EncounterState,
} from '../encounter/encounter';
import { createRng } from '../rng/rng';
import { createOfflineConfig, offlineMs, simulateOffline } from './offline';

const balance = parseBalance(balanceData);
const tiles = parseTiles(tilesData);
const lootData = { items: parseItems(itemsData), rarities: parseRarities(raritiesData), affixes: parseAffixes(affixesData) };
function configOf(tileId: string): EncounterConfig {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error(tileId);
  return createEncounterConfig(toEncounterConfigInput(balance, tile, parseEnemies(enemiesData), lootData));
}
const t1 = configOf('t1');
const t4 = configOf('t4');
const HOUR = 3_600_000;
const offline = createOfflineConfig({ capH: 6, clockToleranceMin: 5, minSummaryS: 60 });

function squirrel(cfg: EncounterConfig, tileId: string, level: number): EncounterState {
  const s = createEncounter(cfg, createRng(7), tileId);
  const progression = { level, xp: 0 };
  return { ...s, progression, playerHp: playerStats(cfg, level).maxHp };
}

describe('offlineMs (GDD 17.1/17.3)', () => {
  it('is now - savedAt, capped at 6 h, in whole 100 ms steps', () => {
    expect(offlineMs(1000, 1000, 1000 + 2 * HOUR + 55, offline)).toBe(2 * HOUR);
    expect(offlineMs(0, 0, 10 * HOUR, offline)).toBe(6 * HOUR);
    expect(offlineMs(5000, 5000, 4000, offline)).toBe(0);
  });

  it('grants nothing when the clock is more than 5 min behind the highest time seen', () => {
    const maxSeen = 100 * HOUR;
    expect(offlineMs(90 * HOUR, maxSeen, maxSeen - 6 * 60_000, offline)).toBe(0);
    // Within the tolerance it's an ordinary (small) clock drift.
    expect(offlineMs(maxSeen - HOUR, maxSeen, maxSeen - 60_000, offline)).toBe(HOUR - 60_000);
  });
});

describe('simulateOffline (GDD 17.2, M9.1)', () => {
  it('in Peace! she only regenerates', () => {
    const hurt = { ...squirrel(t1, 't1', 1), playerHp: 100 };
    const r = simulateOffline(hurt, t1, HOUR, false);
    expect(r.summary.kills).toBe(0);
    expect(r.summary.farming).toBe(false);
    expect(r.state.playerHp).toBe(playerStats(t1, 1).maxHp);
    expect(r.state.phase).toBe('idle');
  });

  // Lv30 one-shots ants and out-regenerates them. (A gearless Lv10 still slowly bleeds out on T1 -
  // regen < damage taken; that's balance, M20.)
  it('farming a sustainable tile: kills, XP, coins and items like online, no deaths', () => {
    const r = simulateOffline(squirrel(t1, 't1', 30), t1, HOUR, true);
    expect(r.summary.deaths).toBe(0);
    expect(r.summary.halfPace).toBe(false);
    expect(r.summary.farmedMs).toBe(HOUR);
    expect(r.summary.kills).toBeGreaterThan(300);
    expect(r.state.killsByTile.t1).toBe(r.summary.kills);
    expect(r.summary.xpGained).toBeGreaterThan(0);
    expect(r.summary.levelAfter).toBeGreaterThanOrEqual(30);
    expect(Object.values(r.summary.found).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(r.state.wallet.seeds).toBe(r.summary.found.seeds);
    expect(r.state.phase).toBe('idle');
  });

  it('is deterministic: the same save gives the same result', () => {
    const a = simulateOffline(squirrel(t1, 't1', 3), t1, HOUR, true);
    const b = simulateOffline(squirrel(t1, 't1', 3), t1, HOUR, true);
    expect(b).toEqual(a);
  });

  it('dying offline costs no XP and halves the pace (GDD 6.3, 17.2)', () => {
    const weak = squirrel(t4, 't4', 1);
    const r = simulateOffline(weak, t4, HOUR, true);
    expect(r.summary.deaths).toBeGreaterThan(0);
    expect(r.summary.halfPace).toBe(true);
    expect(r.summary.farmedMs).toBe(HOUR / 2);
    expect(r.summary.hideoutMs).toBe(r.summary.deaths * t4.hideoutMs);
    expect(r.state.progression.level).toBeGreaterThanOrEqual(1);
    expect(r.state.phase).toBe('idle');
    expect(r.state.playerHp).toBeGreaterThan(0);
  });

  it('an offline death keeps all XP and goes straight back to searching after the hideout', () => {
    let s = { ...startSearch(squirrel(t4, 't4', 1)).state, progression: { level: 1, xp: 500 } };
    let lost = -1;
    let backToSearch = false;
    for (let i = 0; i < 20_000 && !backToSearch; i++) {
      const step = tick(s, t4, 'offline');
      s = step.state;
      for (const e of step.events) {
        if (e.type === 'playerDefeated') lost = e.xpLost;
        if (e.type === 'searchStarted' && lost >= 0) backToSearch = true;
      }
    }
    expect(lost).toBe(0);
    expect(backToSearch).toBe(true);
    expect(s.phase).toBe('searching');
  });

  it('6 h (the cap) is simulated in one go', () => {
    const r = simulateOffline(squirrel(t1, 't1', 30), t1, 6 * HOUR, true);
    expect(r.summary.kills).toBeGreaterThan(2000);
  });
});

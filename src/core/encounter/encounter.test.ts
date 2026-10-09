import { describe, expect, it } from 'vitest';
import affixesData from '../../../data/affixes.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import { parseAffixes, parseItems, parseRarities } from '../content/schemas';
import { createRng } from '../rng/rng';
import {
  activeWeaponMode,
  attackProgress,
  currentAmmo,
  classifyEquip,
  compareEquip,
  createEncounter,
  createEncounterConfig,
  enemyStats,
  enemyXpAt,
  hpFraction,
  fightingPlayer,
  makePeace,
  playerAttackIntervalMs,
  playerHitMultiplier,
  playerStats,
  setKeepNuts,
  eatFood,
  equipItem,
  hideoutProgress,
  searchProgress,
  startSearch,
  switchTile,
  tick,
  unequipItem,
  unlockAutoFood,
  type EncounterConfig,
  type EncounterConfigInput,
  type EncounterEnemyInput,
  type EncounterEvent,
  type EncounterState,
} from './encounter';

const rules = {
  minHitPct: 5,
  maxHitPct: 98,
  armorConstant: 10.0,
  maxDamageReductionPct: 75,
  minDamage: 0.1,
  hitPctPerLevelDiff: 0.5,
  minAttackIntervalS: 0.5,
  fistsVsFlyingHitPct: 50,
};
const food = { berryHeal: 0.3, seedHeal: 0.5, nutHeal: 1.0, eatCooldownS: 3.0, autoEatBelowPct: 40, autoFoodUnlockS: 60.0 };
const ammo = { nutsPerShot: 1, groundAmmoDamagePct: 50, keepNutsDefault: 5 };
const squirrelInput = { maxHp: 5.0, damageMin: 0.3, damageMax: 0.4, hitPct: 85, armor: 0, dodgePct: 0 };
/** A tile's only enemy, base level 1 (so `enemyLevelMin: 1` means "no levels above base"). */
const antInput: EncounterEnemyInput = {
  spawnWeight: 1,
  id: 'worker_ant',
  baseLevel: 1,
  maxHp: 1.2,
  damageMin: 0.2,
  damageMax: 0.3,
  attackIntervalS: 3.0,
  hitPct: 65,
  armor: 0,
  dodgePct: 0,
  xp: 2,
  loot: {
    currencies: [],
    minLevel: 1,
    maxLevel: 1,
    items: [{ itemId: 'sharp_twig', pctAtMin: 4, pctAtMax: 4 }],
    rarities: [
      { rarityId: 'uncommon', weightAtMin: 22, weightAtMax: 22 },
      { rarityId: 'rare', weightAtMin: 6, weightAtMax: 6 },
      { rarityId: 'legendary', weightAtMin: 0.3, weightAtMax: 0.3 },
    ],
  },
};
// GDD 8.4. Zeroed out in tests that need a fixed enemy level with no stat scaling confound.
const enemyLeveling = { hpPctPerLevel: 10, damagePctPerLevel: 5, xpPctPerLevel: 10, dodgePctPerLevel: 0.5, maxDodgePct: 40 };
const noEnemyLeveling = { hpPctPerLevel: 0, damagePctPerLevel: 0, xpPctPerLevel: 0, dodgePctPerLevel: 0, maxDodgePct: 40 };

const lootInput = {
  items: parseItems(itemsData),
  rarities: parseRarities(raritiesData),
  affixes: parseAffixes(affixesData),
  balance: { pity: [{ rarity: 'rare', kills: 1000 }, { rarity: 'unique', kills: 5000 }, { rarity: 'legendary', kills: 20000 }], affixTierGrowthPct: 35, upgradeGrowthPct: 8 },
};

function makeConfig(patch: Partial<EncounterConfigInput> = {}): EncounterConfig {
  return createEncounterConfig({
    searchDurationS: 1.0,
    playerAttackIntervalS: 2.0,
    playerAttackSpeedPctPerLevel: 1,
    offHandDamagePct: 50,
    player: squirrelInput,
    enemies: [antInput],
    enemyLevelMin: 1,
    enemyLevelMax: 1,
    enemyLeveling,
    rules,
    regenAmount: 0.1,
    regenIntervalS: 2.0,
    regenGrowthPctPerLevel: 3,
    hideoutRegenS: 10.0,
    deathXpLossPct: 10,
    food,
    ammo,
    loot: lootInput,
    tileTier: 1,
    ...patch,
  });
}

/** Real M2 numbers (squirrel vs Worker Ant). */
const config = makeConfig();
/** Nobody can die: for timing tests. */
const tanky = makeConfig({
  player: { ...squirrelInput, maxHp: 999.0 },
  enemies: [{ ...antInput, maxHp: 999.0 }],
  regenAmount: 0, // isolates attack-timing/damage tests from passive regen
});

type LogEntry = { tick: number; event: EncounterEvent };

/** Runs `steps` ticks and collects all events with the tick number (1-based). */
function run(
  state: EncounterState,
  steps: number,
  cfg: EncounterConfig = config,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  let s = state;
  for (let i = 1; i <= steps; i++) {
    const r = tick(s, cfg);
    s = r.state;
    for (const event of r.events) log.push({ tick: i, event });
  }
  return { state: s, log };
}

function fresh(cfg: EncounterConfig = config, seed = 1): EncounterState {
  return createEncounter(cfg, createRng(seed), 't1');
}

function fighting(cfg: EncounterConfig = config, seed = 1): EncounterState {
  return run(startSearch(fresh(cfg, seed)).state, 10, cfg).state;
}

function attacks(log: LogEntry[], attacker: 'player' | 'enemy'): LogEntry[] {
  return log.filter((l) => l.event.type === 'attack' && l.event.attacker === attacker);
}

/**
 * Ticks until `predicate` matches some event, then stops (inclusive of that
 * tick). Enemies respawn automatically (GDD 7.1), so a plain fixed-step `run`
 * over many ticks can keep killing and re-leveling past the first event of
 * interest - tests that care about "the first kill" use this instead.
 */
function runUntil(
  state: EncounterState,
  cfg: EncounterConfig,
  predicate: (event: EncounterEvent) => boolean,
  maxSteps = 2000,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  let s = state;
  for (let i = 1; i <= maxSteps; i++) {
    const r = tick(s, cfg);
    s = r.state;
    let matched = false;
    for (const event of r.events) {
      log.push({ tick: i, event });
      if (predicate(event)) matched = true;
    }
    if (matched) return { state: s, log };
  }
  throw new Error('runUntil: predicate never matched within maxSteps');
}

describe('createEncounterConfig', () => {
  it('converts seconds to milliseconds and stats to hundredths', () => {
    expect(config.searchMs).toBe(1000);
    expect(config.playerAttackIntervalMs).toBe(2000);
    expect(config.enemies[0]?.attackIntervalMs).toBe(3000);
    expect(config.enemies[0]?.base.maxHp).toBe(120);
    expect(config.enemies[0]?.xp).toBe(200);
    expect(config.rules.minDamage).toBe(10);
  });

  it('rejects zero or invalid durations', () => {
    expect(() => makeConfig({ searchDurationS: 0 })).toThrow();
    expect(() => makeConfig({ playerAttackIntervalS: 0 })).toThrow();
    expect(() => makeConfig({ enemies: [{ ...antInput, attackIntervalS: 0.25 }] })).toThrow();
  });

  it('rejects an invalid enemy level range', () => {
    expect(() => makeConfig({ enemyLevelMin: 0 })).toThrow();
    expect(() => makeConfig({ enemyLevelMin: 1.5 })).toThrow();
    expect(() => makeConfig({ enemyLevelMax: 0 })).toThrow(); // below enemyLevelMin (1)
  });

  it('rejects an empty enemy list', () => {
    expect(() => makeConfig({ enemies: [] })).toThrow();
  });

  it('rejects an invalid player base (e.g. 0 HP)', () => {
    expect(() => makeConfig({ player: { ...squirrelInput, maxHp: 0 } })).toThrow();
  });
});

describe('enemyStats / enemyXpAt (GDD 8.4, M6.1)', () => {
  const enemyId = 'worker_ant';
  const cfg = makeConfig({ enemies: [{ ...antInput, baseLevel: 3 }], enemyLevelMin: 3, enemyLevelMax: 5 });
  const base = () => cfg.enemies[0]!;

  it('equals the base stats at enemyLevelMin (no levels above base)', () => {
    expect(enemyStats(cfg, enemyId, 3)).toEqual(base().base);
    expect(enemyXpAt(cfg, enemyId, 3)).toBe(base().xp);
  });

  it('scales HP/damage/dodge/XP per level above its own baseLevel', () => {
    // 2 levels above: +20 % HP, +10 % damage, +1.0 dodge, +20 % XP.
    const s = enemyStats(cfg, enemyId, 5);
    expect(s.maxHp).toBe(Math.round(base().base.maxHp * 1.2));
    expect(s.damageMin).toBe(Math.round(base().base.damageMin * 1.1));
    expect(s.damageMax).toBe(Math.round(base().base.damageMax * 1.1));
    expect(s.dodgePct).toBeCloseTo(base().base.dodgePct + 1.0);
    expect(enemyXpAt(cfg, enemyId, 5)).toBe(Math.round(base().xp * 1.2));
  });

  it('caps dodge at maxDodgePct', () => {
    const highDodge = makeConfig({
      enemies: [{ ...antInput, baseLevel: 1, dodgePct: 39 }],
      enemyLevelMin: 1,
      enemyLevelMax: 20,
    });
    expect(enemyStats(highDodge, enemyId, 20).dodgePct).toBe(enemyLeveling.maxDodgePct);
  });

  it('with no leveling configured, stats never change across the range', () => {
    const flat = makeConfig({
      enemies: [{ ...antInput, baseLevel: 1 }],
      enemyLevelMin: 1,
      enemyLevelMax: 10,
      enemyLeveling: noEnemyLeveling,
    });
    expect(enemyStats(flat, enemyId, 10)).toEqual(flat.enemies[0]!.base);
    expect(enemyXpAt(flat, enemyId, 10)).toBe(flat.enemies[0]!.xp);
  });
});

describe('enemy level rolling (GDD 8.4, M6.1)', () => {
  it('rolls within [enemyLevelMin, enemyLevelMax] and never changes the fight (own Rng stream)', () => {
    const cfg = makeConfig({ enemyLevelMin: 2, enemyLevelMax: 6 });
    let state = fresh(cfg);
    const seenLevels = new Set<number>();
    for (let i = 0; i < 30; i++) {
      seenLevels.add(state.enemyLevel);
      expect(state.enemyLevel).toBeGreaterThanOrEqual(2);
      expect(state.enemyLevel).toBeLessThanOrEqual(6);
      state = run(startSearch(state).state, 10000, cfg).state;
    }
    expect(seenLevels.size).toBeGreaterThan(1); // it does vary, not stuck on one value
  });

  it('a fixed range (enemyLevelMin === enemyLevelMax) never rolls (nextInt would throw on equal bounds)', () => {
    const cfg = makeConfig({ enemyLevelMin: 4, enemyLevelMax: 4 });
    expect(fresh(cfg).enemyLevel).toBe(4);
  });

  it('picks a random species from a multi-enemy tile (GDD 8.2, M6.2)', () => {
    const pillBug: EncounterEnemyInput = { ...antInput, id: 'pill_bug', baseLevel: 2, armor: 1.0 };
    const cfg = makeConfig({ enemies: [antInput, pillBug], enemyLevelMin: 1, enemyLevelMax: 4 });
    let state = fresh(cfg);
    const seenIds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seenIds.add(state.enemyId);
      state = run(startSearch(state).state, 10000, cfg).state;
    }
    expect(seenIds).toEqual(new Set(['worker_ant', 'pill_bug']));
  });

  it('spawn weights decide how often each species appears (GDD 8.2 v2.5 spawn table)', () => {
    const pillBug: EncounterEnemyInput = { ...antInput, id: 'pill_bug', baseLevel: 2, armor: 1.0, spawnWeight: 3 };
    // Unkillable squirrel + auto-search: count every enemy that shows up (was 400 x 10 000 ticks,
    // which ran close to the 5 s test timeout).
    const cfg = makeConfig({
      player: { ...squirrelInput, maxHp: 999.0 },
      enemies: [antInput, pillBug],
      enemyLevelMin: 1,
      enemyLevelMax: 4,
    });
    let state = startSearch(fresh(cfg)).state;
    const counts: Record<string, number> = { worker_ant: 0, pill_bug: 0 };
    let found = 0;
    while (found < 400) {
      const r = tick(state, cfg);
      state = r.state;
      if (r.events.some((e) => e.type === 'enemyFound')) {
        counts[state.enemyId] = (counts[state.enemyId] ?? 0) + 1;
        found++;
      }
    }
    // weight 1 : 3 -> about 25 % ants, 75 % bugs
    expect((counts.worker_ant ?? 0) / 400).toBeGreaterThan(0.17);
    expect((counts.worker_ant ?? 0) / 400).toBeLessThan(0.33);
  });

  it('rejects a spawn weight of 0 or less', () => {
    expect(() => makeConfig({ enemies: [{ ...antInput, spawnWeight: 0 }] })).toThrow();
  });

  it('a single-species tile never rolls the species (deterministic, unaffected by other tiles)', () => {
    expect(fresh().enemyId).toBe('worker_ant');
  });
});

describe('playerStats (GDD 6.2 level bonuses)', () => {
  it('equals the base stats at level 1', () => {
    expect(playerStats(config, 1)).toEqual({
      maxHp: 500,
      damageMin: 30,
      damageMax: 40,
      hitPct: 85,
      armor: 0,
      dodgePct: 0,
    });
  });

  it('adds +1.0 max HP per level', () => {
    expect(playerStats(config, 2).maxHp).toBe(600);
    expect(playerStats(config, 6).maxHp).toBe(1000);
  });

  it('adds +0.1 max damage every level', () => {
    expect(playerStats(config, 2).damageMax).toBe(50);
    expect(playerStats(config, 3).damageMax).toBe(60);
    expect(playerStats(config, 4).damageMax).toBe(70);
  });

  it('adds +0.1 min damage every 2nd level', () => {
    expect(playerStats(config, 2).damageMin).toBe(40);
    expect(playerStats(config, 3).damageMin).toBe(40);
    expect(playerStats(config, 4).damageMin).toBe(50);
  });
});

describe('playerAttackIntervalMs (GDD 6.1 v1.7)', () => {
  it('is the base interval at level 1 and 1 % faster per level, compounding', () => {
    expect(playerAttackIntervalMs(config, 1)).toBe(2000);
    expect(playerAttackIntervalMs(config, 2)).toBe(Math.round(2000 / 1.01));
    expect(playerAttackIntervalMs(config, 10)).toBe(Math.round(2000 / 1.01 ** 9));
  });

  it('never goes below 0.5 s', () => {
    expect(playerAttackIntervalMs(config, 500)).toBe(500);
  });
});

describe('encounter', () => {
  it('starts idle at full HP, level 1, and does nothing on its own', () => {
    const idle = fresh();
    expect(idle.phase).toBe('idle');
    expect(idle.playerHp).toBe(500);
    expect(idle.progression).toEqual({ level: 1, xp: 0 });
    const { state, log } = run(idle, 100);
    expect(state).toEqual(idle);
    expect(log).toEqual([]);
  });

  it('starts searching when the player presses Find enemy', () => {
    const r = startSearch(fresh());
    expect(r.state.phase).toBe('searching');
    expect(r.events).toEqual([{ type: 'searchStarted' }]);
  });

  it('ignores Find enemy while already searching or fighting', () => {
    const searching = startSearch(fresh()).state;
    expect(startSearch(searching)).toEqual({ state: searching, events: [] });
    const fight = fighting();
    expect(startSearch(fight)).toEqual({ state: fight, events: [] });
  });

  it('finds the enemy after exactly 1.0 s (10 ticks), at full HP', () => {
    const searching = startSearch(fresh()).state;
    const after9 = run(searching, 9);
    expect(after9.state.phase).toBe('searching');
    expect(after9.log).toEqual([]);
    const after10 = run(searching, 10);
    expect(after10.state.phase).toBe('fighting');
    expect(after10.state.enemyHp).toBe(120);
    expect(after10.log).toEqual([{ tick: 10, event: { type: 'enemyFound' } }]);
  });

  it('player attacks every 2.0 s and enemy every 3.0 s', () => {
    const { log } = run(fighting(tanky), 120, tanky); // 12 s of fighting
    expect(attacks(log, 'player').map((l) => l.tick)).toEqual([20, 40, 60, 80, 100, 120]);
    expect(attacks(log, 'enemy').map((l) => l.tick)).toEqual([30, 60, 90, 120]);
  });

  it('a higher player level attacks faster (x1.01 per level)', () => {
    const atLevel = (level: number) => {
      const start = { ...fighting(tanky), progression: { level, xp: 0 } };
      return attacks(run(start, 6000, tanky).log, 'player').length; // 10 min of fighting
    };
    // Lv1: 2.0 s -> 300 attacks; Lv10: ~1.83 s -> ~328.
    expect(atLevel(1)).toBe(300);
    expect(atLevel(10)).toBeGreaterThan(320);
  });

  it('the level difference shifts hit chance for both sides (GDD 7.2 v1.7)', () => {
    const hitRate = (cfg: EncounterConfig, who: 'player' | 'enemy') => {
      const all = attacks(run(fighting(cfg, 5), 20000, cfg).log, who).map((l) => l.event);
      return all.filter((e) => e.type === 'attack' && e.hit).length / all.length;
    };
    const strongEnemy = makeConfig({
      player: { ...squirrelInput, maxHp: 999.0 },
      enemies: [{ ...antInput, maxHp: 999.0 }],
      enemyLevelMin: 21, // 20 levels above the squirrel: -10 % for her, +10 % for the enemy
      enemyLevelMax: 21,
    });
    expect(hitRate(tanky, 'player') - hitRate(strongEnemy, 'player')).toBeGreaterThan(0.06);
    expect(hitRate(strongEnemy, 'enemy') - hitRate(tanky, 'enemy')).toBeGreaterThan(0.06);
  });

  it('player attacks first when both are due in the same tick', () => {
    const { log } = run(fighting(tanky), 60, tanky);
    const at60 = log.filter((l) => l.tick === 60).map((l) => l.event);
    expect(at60.map((e) => e.type === 'attack' && e.attacker)).toEqual(['player', 'enemy']);
  });

  it('hits lower HP by their damage, misses deal nothing', () => {
    const start = fighting(tanky);
    const { state, log } = run(start, 600, tanky); // 60 s
    const dealt = (who: 'player' | 'enemy') =>
      attacks(log, who).reduce((sum, l) => sum + (l.event.type === 'attack' ? l.event.damage : 0), 0);
    expect(state.enemyHp).toBe(start.enemyHp - dealt('player'));
    expect(state.playerHp).toBe(start.playerHp - dealt('enemy'));
    const all = [...attacks(log, 'player'), ...attacks(log, 'enemy')].map((l) => l.event);
    expect(all.some((e) => e.type === 'attack' && !e.hit)).toBe(true);
    for (const e of all) {
      if (e.type === 'attack' && !e.hit) expect(e.damage).toBe(0);
    }
  });

  it('when the enemy dies, the next search starts at once and grants XP', () => {
    // A 0.1 HP enemy dies from the first hit; xp 5.0 (< 10.0 needed for Lv2, no level-up here).
    const fragile = makeConfig({ enemies: [{ ...antInput, maxHp: 0.1, hitPct: 0, xp: 5.0 }] });
    const { state, log } = runUntil(fighting(fragile), fragile, (e) => e.type === 'enemyDefeated');
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    const sameTick = log.filter((l) => l.tick === defeatTick).map((l) => l.event.type);
    expect(sameTick).toEqual(['attack', 'enemyDefeated', 'searchStarted']);
    expect(state.progression).toEqual({ level: 1, xp: 500 });
    expect(state.phase).toBe('searching');
  });

  it('leveling up from a kill heals by exactly the HP bonus and raises max HP', () => {
    const fragile = makeConfig({ enemies: [{ ...antInput, maxHp: 0.1, hitPct: 0, xp: 10.0 }] });
    const before = fighting(fragile);
    const { state, log } = runUntil(before, fragile, (e) => e.type === 'leveledUp');
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    const sameTick = log.filter((l) => l.tick === defeatTick).map((l) => l.event);
    expect(sameTick).toEqual([
      { type: 'attack', attacker: 'player', hit: true, damage: expect.any(Number) },
      { type: 'enemyDefeated' },
      { type: 'leveledUp', level: 2 },
      { type: 'searchStarted' },
    ]);
    expect(state.progression).toEqual({ level: 2, xp: 0 });
    // Healed by exactly +1.0 HP (100 hundredths), not to full of the new max.
    expect(state.playerHp).toBe(before.playerHp + 100);
    expect(playerStats(fragile, 2).maxHp).toBe(600);
  });

  it('can level up more than once from a single big XP gain', () => {
    // Lv1 needs 10.0, Lv2 needs 14.0 -> a 25.0 XP kill takes the squirrel to level 3.
    const fragile = makeConfig({ enemies: [{ ...antInput, maxHp: 0.1, hitPct: 0, xp: 25.0 }] });
    const { state, log } = runUntil(fighting(fragile), fragile, (e) => e.type === 'enemyDefeated');
    const levelUps = log.filter((l) => l.event.type === 'leveledUp').map((l) => l.event);
    expect(levelUps).toEqual([
      { type: 'leveledUp', level: 2 },
      { type: 'leveledUp', level: 3 },
    ]);
    expect(state.progression.level).toBe(3);
  });

  it('tracks kills per tile (M6.2): increments killsByTile[tileId] on each kill', () => {
    const fragile = makeConfig({ enemies: [{ ...antInput, maxHp: 0.1, hitPct: 0 }] });
    const { state } = runUntil(fighting(fragile), fragile, (e) => e.type === 'enemyDefeated');
    expect(state.killsByTile).toEqual({ t1: 1 });
  });

  it('kills can drop items (GDD 9.6): itemFound right after enemyDefeated, kept in foundItems', () => {
    const lucky = makeConfig({
      enemies: [
        {
          ...antInput,
          maxHp: 0.1,
          hitPct: 0,
          loot: { ...antInput.loot, items: [{ itemId: 'sharp_twig', pctAtMin: 100, pctAtMax: 100 }] },
        },
      ],
    });
    const { state, log } = runUntil(fighting(lucky), lucky, (e) => e.type === 'enemyDefeated');
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    const types = log.filter((l) => l.tick === defeatTick).map((l) => l.event.type);
    expect(types).toEqual(['attack', 'enemyDefeated', 'itemFound', 'searchStarted']);
    expect(state.inventory.bag).toHaveLength(1);
    expect(state.inventory.bag[0]?.tier).toBe(1);
  });

  it('kills drop currencies from the enemy own table into the wallet (GDD 11.1 v2.5)', () => {
    const withCoins = (currencies: EncounterEnemyInput['loot']['currencies']) =>
      makeConfig({
        enemies: [{ ...antInput, maxHp: 0.1, hitPct: 0, loot: { ...antInput.loot, items: [], currencies } }],
      });
    // Only seeds are listed: exactly 2-2 seeds drop on every kill, no pebbles, no nuts.
    const seedsOnly = withCoins([{ currencyId: 'seeds', pctAtMin: 100, pctAtMax: 100, amountMin: 2, amountMax: 2 }]);
    const { state, log } = runUntil(fighting(seedsOnly), seedsOnly, (e) => e.type === 'enemyDefeated');
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    const types = log.filter((l) => l.tick === defeatTick).map((l) => l.event.type);
    expect(types).toEqual(['attack', 'enemyDefeated', 'currencyFound', 'searchStarted']);
    expect(state.wallet).toEqual({ pebbles: 0, seeds: 2, nuts: 0, berries: 0 });
    // An empty currency table drops nothing and emits no event.
    const none = withCoins([]);
    const after = runUntil(fighting(none), none, (e) => e.type === 'enemyDefeated');
    expect(after.log.some((l) => l.event.type === 'currencyFound')).toBe(false);
    expect(after.state.wallet).toEqual({ pebbles: 0, seeds: 0, nuts: 0, berries: 0 });
  });

  it('equipping a weapon changes the fight: more damage, shorter interval (GDD 9.1/9.4 v2.3)', () => {
    const twig = {
      uid: 1,
      baseId: 'sharp_twig',
      slot: 'melee' as const,
      tier: 1,
      rarityId: 'common',
      weapon: { damageMin: 30, damageMax: 50, attackIntervalModMs: -400 },
      stats: [],
      affixes: [],
    };
    const base = fresh(tanky);
    const withTwig = equipItem({ ...base, inventory: { ...base.inventory, bag: [twig] } }, tanky, 1, 'rightPaw');
    expect(withTwig.inventory.equipment.rightPaw?.uid).toBe(1);
    expect(playerAttackIntervalMs(tanky, 1, withTwig.inventory.equipment)).toBe(1600); // 2.0 s fists - 0.4
    expect(playerStats(tanky, 1, withTwig.inventory.equipment).damageMax).toBe(90);
    // More player attacks over the same time than bare-pawed.
    const count = (s: EncounterState) => attacks(run(run(startSearch(s).state, 10, tanky).state, 600, tanky).log, 'player').length;
    expect(count(withTwig)).toBeGreaterThan(count(base));
    // Unequip puts it back in the bag.
    const off = unequipItem(withTwig, tanky, 'rightPaw');
    expect(off.inventory.equipment.rightPaw).toBeNull();
    expect(off.inventory.bag.map((i) => i.uid)).toEqual([1]);
  });

  it('compareEquip reports the stat deltas of putting a weapon into a slot (GDD 9.1/9.4 v2.3, M5.2b1)', () => {
    const twig = {
      uid: 1,
      baseId: 'sharp_twig',
      slot: 'melee' as const,
      tier: 1,
      rarityId: 'common',
      weapon: { damageMin: 30, damageMax: 50, attackIntervalModMs: -400 },
      stats: [],
      affixes: [],
    };
    const bare = fresh(tanky).inventory.equipment;
    const diff = compareEquip(tanky, 1, bare, twig, 'rightPaw');
    expect(diff.damageMax).toBe(90 - playerStats(tanky, 1, bare).damageMax);
    expect(diff.attackIntervalMs).toBe(1600 - playerAttackIntervalMs(tanky, 1, bare));
    expect(diff.maxHp).toBe(0);
  });

  it('classifyEquip (M5.2b1): better only when every visible-sized change is an upgrade', () => {
    const twig = {
      uid: 1,
      baseId: 'sharp_twig',
      slot: 'melee' as const,
      tier: 1,
      rarityId: 'common',
      weapon: { damageMin: 30, damageMax: 50, attackIntervalModMs: -400 },
      stats: [],
      affixes: [],
    };
    const bare = fresh(tanky).inventory.equipment;
    // More damage AND a shorter interval - a clean upgrade over bare paws.
    expect(classifyEquip(compareEquip(tanky, 1, bare, twig, 'rightPaw'))).toBe('better');
    // A tiny sub-0.1 difference doesn't count as any change.
    expect(classifyEquip({ maxHp: 1, damageMin: 0, damageMax: 0, armor: 0, hitPct: 0, attackIntervalMs: 0 })).toBe('none');
    // Damage up but interval also up (slower) - mixed.
    expect(classifyEquip({ maxHp: 0, damageMin: 10, damageMax: 10, armor: 0, hitPct: 0, attackIntervalMs: 100 })).toBe('mixed');
    // Strictly worse.
    expect(classifyEquip({ maxHp: 0, damageMin: -10, damageMax: -10, armor: 0, hitPct: 0, attackIntervalMs: 100 })).toBe('worse');
  });

  it('taking off +HP gear never leaves current HP above the new max', () => {
    const amulet = {
      uid: 2,
      baseId: 'pebble_pendant',
      slot: 'amulet' as const,
      tier: 1,
      rarityId: 'common',
      weapon: null,
      stats: [{ stat: 'maxHp' as const, value: 100 }],
      affixes: [],
    };
    const base = fresh();
    const worn = equipItem({ ...base, inventory: { ...base.inventory, bag: [amulet] } }, config, 2, 'amulet');
    const full = { ...worn, playerHp: playerStats(config, 1, worn.inventory.equipment).maxHp }; // 6.0
    expect(full.playerHp).toBe(600);
    expect(unequipItem(full, config, 'amulet').playerHp).toBe(500);
  });

  it('loot uses its own Rng stream: drops never change how the fight plays out', () => {
    const noDrops = makeConfig({
      enemies: [{ ...antInput, loot: { ...antInput.loot, items: [{ itemId: 'sharp_twig', pctAtMin: 0, pctAtMax: 0 }] } }],
    });
    const allDrops = makeConfig({
      enemies: [{ ...antInput, loot: { ...antInput.loot, items: [{ itemId: 'sharp_twig', pctAtMin: 100, pctAtMax: 100 }] } }],
    });
    const attacksOf = (cfg: EncounterConfig) =>
      run(startSearch(fresh(cfg, 77)).state, 3000, cfg).log.filter((l) => l.event.type === 'attack');
    expect(attacksOf(allDrops)).toEqual(attacksOf(noDrops));
  });

  it('with a full bag Common/Uncommon drops are lost, Rare+ goes over the limit (GDD 10, M9.3)', () => {
    const cfg = makeConfig({
      player: { ...squirrelInput, maxHp: 999.0 },
      enemies: [{ ...antInput, loot: { ...antInput.loot, items: [{ itemId: 'sharp_twig', pctAtMin: 100, pctAtMax: 100 }] } }],
      loot: { ...lootInput, balance: { ...lootInput.balance, keepWhenBagFullFrom: 'rare' } },
    });
    const filler = (uid: number) => ({
      uid: 1000 + uid,
      baseId: 'leaf_cap',
      slot: 'head' as const,
      tier: 1,
      rarityId: 'common',
      weapon: null,
      stats: [],
      affixes: [],
    });
    const base = fresh(cfg);
    const full = { ...base, inventory: { ...base.inventory, bag: Array.from({ length: 20 }, (_, i) => filler(i)) } };
    const { state, log } = run(startSearch(full).state, 30_000, cfg);
    const found = log.flatMap((l) => (l.event.type === 'itemFound' ? [l.event] : []));
    const kept = found.filter((e) => !e.bagFull);
    expect(found.some((e) => e.bagFull)).toBe(true);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((e) => !['common', 'uncommon'].includes(e.item.rarityId))).toBe(true);
    expect(found.filter((e) => e.bagFull).every((e) => ['common', 'uncommon'].includes(e.item.rarityId))).toBe(true);
    expect(state.inventory.bag).toHaveLength(20 + kept.length);
  });

  it('a killed enemy does not attack in the same tick', () => {
    // Both attack every 3.0 s, so every player attack lands in a tick where the
    // enemy is due too. The enemy has 0.1 HP, so the first hit kills it.
    const cfg = makeConfig({
      playerAttackIntervalS: 3.0,
      enemies: [{ ...antInput, maxHp: 0.1 }],
    });
    for (let seed = 1; seed <= 20; seed++) {
      const { log } = run(fighting(cfg, seed), 200, cfg);
      const defeat = log.find((l) => l.event.type === 'enemyDefeated');
      expect(defeat).toBeDefined();
      expect(attacks(log, 'enemy').filter((l) => l.tick === defeat?.tick)).toEqual([]);
    }
  });

  const deadly = makeConfig({
    enemies: [{ ...antInput, maxHp: 999.0, damageMin: 5.0, damageMax: 5.0, hitPct: 100 }],
  });
  /** A squirrel already mid-level, with XP progress to lose, about to get one-shot. */
  function aboutToDie(): EncounterState {
    return { ...fighting(deadly), progression: { level: 3, xp: 500 } };
  }

  it('when the squirrel is defeated: goes to the hideout, losing 10 % of her XP progress (GDD 6.3)', () => {
    const { state, log } = runUntil(aboutToDie(), deadly, (e) => e.type === 'playerDefeated');
    const defeated = log.find((l) => l.event.type === 'playerDefeated');
    expect(defeated?.event).toEqual({ type: 'playerDefeated', xpLost: 50 });
    expect(state.phase).toBe('hideout');
    expect(state.playerHp).toBe(0);
    expect(state.hideoutElapsedMs).toBe(0);
    expect(state.progression).toEqual({ level: 3, xp: 450 });
  });

  it('leaves the hideout after hideoutRegenS, back to idle at full HP, keeping the reduced XP', () => {
    const afterDefeat = runUntil(aboutToDie(), deadly, (e) => e.type === 'playerDefeated').state;
    expect(afterDefeat.phase).toBe('hideout');
    const stillWaiting = run(afterDefeat, 99, deadly); // 9.9 s: not there yet
    expect(stillWaiting.state.phase).toBe('hideout');
    expect(stillWaiting.log.some((l) => l.event.type === 'returnedFromHideout')).toBe(false);
    const oneMoreTick = run(stillWaiting.state, 1, deadly); // exactly 10.0 s
    expect(oneMoreTick.log).toEqual([{ tick: 1, event: { type: 'returnedFromHideout' } }]);
    expect(oneMoreTick.state.phase).toBe('idle');
    expect(oneMoreTick.state.playerHp).toBe(playerStats(deadly, 3).maxHp);
    expect(oneMoreTick.state.progression).toEqual({ level: 3, xp: 450 });
  });

  it('Find enemy and Peace! do nothing while in the hideout', () => {
    const inHideout = runUntil(aboutToDie(), deadly, (e) => e.type === 'playerDefeated').state;
    expect(startSearch(inHideout)).toEqual({ state: inHideout, events: [] });
    expect(makePeace(inHideout)).toEqual({ state: inHideout, events: [] });
  });

  it('is deterministic: same seed gives the same fights, another seed differs', () => {
    const a = run(startSearch(fresh(config, 42)).state, 2000);
    const b = run(startSearch(fresh(config, 42)).state, 2000);
    const c = run(startSearch(fresh(config, 43)).state, 2000);
    expect(a).toEqual(b);
    expect(c.log).not.toEqual(a.log);
  });

  it('headless: 100 fights give exactly the same result with the same seed (GDD M2)', () => {
    function hundredFights(seed: number) {
      let state = startSearch(fresh(config, seed)).state;
      const summary = { kills: 0, defeats: 0, ticks: 0, damageDealt: 0 };
      while (summary.kills + summary.defeats < 100) {
        const r = tick(state, config);
        state = r.state;
        summary.ticks++;
        for (const e of r.events) {
          if (e.type === 'enemyDefeated') summary.kills++;
          if (e.type === 'playerDefeated') summary.defeats++;
          if (e.type === 'attack' && e.attacker === 'player') summary.damageDealt += e.damage;
        }
        if (state.phase === 'idle') state = startSearch(state).state;
      }
      return { summary, state };
    }
    const first = hundredFights(2026);
    expect(hundredFights(2026)).toEqual(first);
    expect(first.summary.kills).toBeGreaterThan(0);
  });

  it('does not modify the state passed in', () => {
    const s = fighting();
    const copy = structuredClone(s);
    run(s, 50);
    startSearch(s);
    makePeace(s);
    expect(s).toEqual(copy);
  });
});

describe('makePeace (GDD 7.1)', () => {
  it('does nothing while idle', () => {
    const idle = fresh();
    const r = makePeace(idle);
    expect(r.state).toBe(idle);
    expect(r.events).toEqual([]);
  });

  it('stops the search and goes back to idle', () => {
    const searching = run(startSearch(fresh()).state, 5).state;
    const r = makePeace(searching);
    expect(r.state.phase).toBe('idle');
    expect(r.state.searchElapsedMs).toBe(0);
    expect(r.events).toEqual([{ type: 'peaceMade', from: 'searching' }]);
  });

  it('ends the fight at once; the squirrel keeps her current HP and XP', () => {
    const midFight = run(fighting(tanky), 300, tanky).state;
    expect(midFight.playerHp).toBeLessThan(playerStats(tanky, 1).maxHp);
    const r = makePeace(midFight);
    expect(r.state.phase).toBe('idle');
    expect(r.state.playerHp).toBe(midFight.playerHp);
    expect(r.state.progression).toEqual(midFight.progression);
    expect(r.state.enemyHp).toBe(0);
    expect(r.events).toEqual([{ type: 'peaceMade', from: 'fighting' }]);
  });

  it('stays idle afterwards: no enemy found, no attacks', () => {
    const peaceful = makePeace(fighting()).state;
    const { state, log } = run(peaceful, 100);
    expect(state.phase).toBe('idle');
    expect(log).toEqual([]);
  });

  it('a new Find enemy after Peace! starts a fresh search of 1.0 s', () => {
    const peaceful = makePeace(run(startSearch(fresh()).state, 8).state).state;
    const searching = startSearch(peaceful).state;
    expect(searchProgress(searching, config)).toBe(0);
    const { log } = run(searching, 10);
    expect(log).toEqual([{ tick: 10, event: { type: 'enemyFound' } }]);
  });
});

describe('switchTile (GDD 8.1, M6.2)', () => {
  const t2Config = makeConfig({
    enemies: [{ ...antInput, id: 'pill_bug', baseLevel: 2, armor: 1.0 }],
    enemyLevelMin: 2,
    enemyLevelMax: 2,
  });

  it('is a no-op for the tile she is already on', () => {
    const state = fresh();
    const r = switchTile(state, config, 't1', new Set(['t1', 't2']));
    expect(r).toEqual({ state, events: [] });
  });

  it('refuses a tile that is not unlocked', () => {
    const state = fresh();
    const r = switchTile(state, t2Config, 't2', new Set(['t1']));
    expect(r).toEqual({ state, events: [] });
  });

  it('interrupts the current fight, rolls a fresh enemy, keeps HP/progression/inventory/kills', () => {
    const midFight: EncounterState = {
      ...fighting(),
      progression: { level: 3, xp: 50 },
      killsByTile: { t1: 8 },
    };
    const r = switchTile(midFight, t2Config, 't2', new Set(['t1', 't2']));
    expect(r.events).toEqual([{ type: 'tileSwitched', tileId: 't2' }]);
    expect(r.state.tileId).toBe('t2');
    expect(r.state.phase).toBe('idle');
    expect(r.state.enemyId).toBe('pill_bug');
    expect(r.state.enemyLevel).toBe(2);
    expect(r.state.playerHp).toBe(midFight.playerHp);
    expect(r.state.progression).toEqual({ level: 3, xp: 50 });
    expect(r.state.killsByTile).toEqual({ t1: 8 });
  });
});

describe('passive HP regeneration (GDD 6.1/7.1)', () => {
  it('heals 0.1 HP every 2.0 s while idle', () => {
    const hurt = { ...fresh(), playerHp: 100 };
    const after19 = run(hurt, 19).state;
    expect(after19.playerHp).toBe(100);
    const after20 = run(hurt, 20).state; // exactly 2.0 s
    expect(after20.playerHp).toBe(110);
  });

  it('ticks while searching and fighting too, not only idle', () => {
    const hurtSearching = { ...startSearch(fresh()).state, playerHp: 100 };
    expect(run(hurtSearching, 20).state.playerHp).toBe(110);

    const hurtFighting = { ...fighting(tanky), playerHp: 100 };
    const cfg = makeConfig({ regenAmount: 0.1, regenIntervalS: 2.0 });
    expect(run(hurtFighting, 20, { ...tanky, regenAmount: cfg.regenAmount }).state.playerHp).toBe(110);
  });

  it('never regenerates above max HP', () => {
    const almostFull = { ...fresh(), playerHp: fresh().playerHp - 5 };
    const { state } = run(almostFull, 20);
    expect(state.playerHp).toBe(fresh().playerHp);
  });

  it('does not regenerate while in the hideout (that has its own fixed recovery)', () => {
    const deadly = makeConfig({
      enemies: [{ ...antInput, maxHp: 999.0, damageMin: 5.0, damageMax: 5.0, hitPct: 100 }],
    });
    const inHideout = runUntil(fighting(deadly), deadly, (e) => e.type === 'playerDefeated').state;
    expect(run(inHideout, 20, deadly).state.playerHp).toBe(0);
  });
});

describe('progress helpers', () => {
  it('reports search progress', () => {
    const idle = fresh();
    expect(searchProgress(idle, config)).toBe(0);
    const half = run(startSearch(idle).state, 5).state;
    expect(searchProgress(half, config)).toBeCloseTo(0.5);
    expect(searchProgress(fighting(), config)).toBe(1);
  });

  it('reports attack progress for each fighter', () => {
    expect(attackProgress(fresh(), config, 'player')).toBe(0);
    const s = run(fighting(tanky), 10, tanky).state; // 1 s into the fight
    expect(attackProgress(s, tanky, 'player')).toBeCloseTo(0.5);
    expect(attackProgress(s, tanky, 'enemy')).toBeCloseTo(1 / 3);
  });

  it('extraMs smooths progress between ticks without changing the state', () => {
    const searching = run(startSearch(fresh()).state, 5).state; // 0.5 s of 1.0 s
    const copy = structuredClone(searching);
    expect(searchProgress(searching, config, 50)).toBeCloseTo(0.55);
    expect(searchProgress(searching, config)).toBeCloseTo(0.5);
    expect(searching).toEqual(copy);

    const s = run(fighting(tanky), 10, tanky).state;
    expect(attackProgress(s, tanky, 'player', 50)).toBeCloseTo(0.525);
  });

  it('extraMs never pushes progress above 1', () => {
    expect(searchProgress(fighting(), config, 999)).toBe(1);
    const s = run(fighting(tanky), 10, tanky).state;
    expect(attackProgress(s, tanky, 'player', 100_000)).toBe(1);
  });

  it('reports HP as a fraction of max HP', () => {
    const f = fighting();
    expect(hpFraction(f, config, 'player')).toBe(1);
    expect(hpFraction(f, config, 'enemy')).toBe(1);
    expect(hpFraction({ ...f, playerHp: 250 }, config, 'player')).toBe(0.5);
    expect(hpFraction(fresh(), config, 'enemy')).toBe(0);
  });

  it('reports hideout recovery progress', () => {
    expect(hideoutProgress(fresh(), config)).toBe(0);
    expect(hideoutProgress(fighting(), config)).toBe(0);
    const inHideout = { ...fresh(), phase: 'hideout' as const, hideoutElapsedMs: 5000 };
    expect(hideoutProgress(inHideout, config)).toBeCloseTo(0.5);
    expect(hideoutProgress(inHideout, config, 50)).toBeCloseTo(0.505);
  });
});

describe('food and auto-food (GDD 7.4, M7.2)', () => {
  const wounded = (cfg: EncounterConfig, hp: number, wallet: Partial<EncounterState['wallet']> = {}, patch: Partial<EncounterState> = {}) => ({
    ...fresh(cfg),
    playerHp: hp,
    wallet: { pebbles: 0, seeds: 0, nuts: 0, berries: 0, ...wallet },
    ...patch,
  });

  it('manual eating heals by the food value, spends one piece and starts the shared cooldown', () => {
    const s = wounded(config, 100, { berries: 2, nuts: 1 });
    const a = eatFood(s, config, 'berries');
    expect(a.state.playerHp).toBe(130);
    expect(a.state.wallet.berries).toBe(1);
    expect(a.state.eatCooldownMs).toBe(3000);
    expect(a.events).toEqual([{ type: 'ate', food: 'berries', healed: 30, auto: false }]);
    // cooldown blocks even another food type
    expect(eatFood(a.state, config, 'nuts').state).toBe(a.state);
  });

  it('does nothing at full HP, with no such food, or in the hideout', () => {
    const full = wounded(config, playerStats(config, 1).maxHp, { berries: 1 });
    expect(eatFood(full, config, 'berries').events).toEqual([]);
    expect(eatFood(wounded(config, 100, { berries: 0 }), config, 'berries').events).toEqual([]);
    expect(eatFood(wounded(config, 100, { berries: 1 }, { phase: 'hideout' }), config, 'berries').events).toEqual([]);
  });

  it('never heals above max HP (the heal is trimmed)', () => {
    const max = playerStats(config, 1).maxHp;
    const a = eatFood(wounded(config, max - 20, { nuts: 1 }), config, 'nuts');
    expect(a.state.playerHp).toBe(max);
    expect(a.events).toEqual([{ type: 'ate', food: 'nuts', healed: 20, auto: false }]);
  });

  it('the cooldown runs down with ticks', () => {
    let s = eatFood(wounded(config, 100, { berries: 2 }), config, 'berries').state;
    s = run(s, 29, config).state;
    expect(s.eatCooldownMs).toBe(100);
    s = run(s, 1, config).state;
    expect(s.eatCooldownMs).toBe(0);
  });

  it('auto-food is locked until "an ad is watched": no auto-eating below the threshold', () => {
    const s = wounded(config, 100, { berries: 3 }); // 1.0 of 5.0 HP = 20 % < 40 %
    const after = run(s, 5, config);
    expect(after.log.some((l) => l.event.type === 'ate')).toBe(false);
    expect(after.state.wallet.berries).toBe(3);
  });

  it('unlocked auto-food eats berries -> seeds -> nuts below 40 % HP, one per cooldown', () => {
    const s = unlockAutoFood(wounded(config, 50, { berries: 1, seeds: 1, nuts: 1 }), config);
    const { state, log } = run(s, 100, config); // 10 s: three meals 3 s apart
    const ate = log.flatMap((l) => (l.event.type === 'ate' ? [l.event] : []));
    expect(ate.map((e) => e.food)).toEqual(['berries', 'seeds', 'nuts']);
    expect(ate.every((e) => e.auto)).toBe(true);
    expect(state.wallet.berries).toBe(0);
  });

  it('auto-food stops at the threshold and does not eat when HP is above it', () => {
    const max = playerStats(config, 1).maxHp; // 500
    const above = unlockAutoFood(wounded(config, Math.round(max * 0.41), { berries: 3 }), config);
    expect(run(above, 5, config).log.some((l) => l.event.type === 'ate')).toBe(false);
  });

  it('the unlock lasts one minute of game time, then it locks again; watching again re-unlocks', () => {
    let s = unlockAutoFood(fresh(), config);
    expect(s.autoFoodMsLeft).toBe(60000);
    s = run(s, 599, config).state;
    expect(s.autoFoodMsLeft).toBe(100);
    s = run(s, 1, config).state;
    expect(s.autoFoodMsLeft).toBe(0);
    expect(unlockAutoFood(s, config).autoFoodMsLeft).toBe(60000);
  });
});

describe('ranged weapon and auto-switching (GDD 7.1, M7.3a)', () => {
  const club = {
    uid: 1,
    baseId: 'pebble_club',
    slot: 'melee' as const,
    tier: 1,
    rarityId: 'common',
    weapon: { damageMin: 100, damageMax: 100, attackIntervalModMs: 0 },
    stats: [],
    affixes: [],
  };
  const sling = {
    uid: 2,
    baseId: 'twig_slingshot',
    slot: 'ranged' as const,
    tier: 3,
    rarityId: 'common',
    weapon: { damageMin: 30, damageMax: 50, attackIntervalModMs: -200 },
    stats: [],
    affixes: [],
  };
  const flyingTanky = makeConfig({
    player: { ...squirrelInput, maxHp: 999.0 },
    enemies: [{ ...antInput, maxHp: 999.0, flying: true }],
    regenAmount: 0,
  });
  function wearing(cfg: EncounterConfig, items: { club?: boolean; sling?: boolean }, nuts = 10000): EncounterState {
    let s = fresh(cfg);
    // Plenty of nuts by default, so slingshot shots are full damage (ammo: M7.3b tests below).
    s = { ...s, inventory: { ...s.inventory, bag: [club, sling] }, wallet: { ...s.wallet, nuts } };
    if (items.club) s = equipItem(s, cfg, 1, 'rightPaw');
    if (items.sling) s = equipItem(s, cfg, 2, 'ranged');
    return s;
  }

  it('enemies are not flying unless the data says so', () => {
    expect(config.enemies[0]?.flying).toBe(false);
    expect(flyingTanky.enemies[0]?.flying).toBe(true);
  });

  it('a ground enemy is fought with the paw weapon even if a slingshot is worn', () => {
    const s = wearing(tanky, { club: true, sling: true });
    expect(activeWeaponMode(s, tanky)).toBe('melee');
    expect(fightingPlayer(s, tanky).fighter.damageMax).toBe(140);
  });

  it('without a paw weapon the slingshot fights ground enemies too', () => {
    const s = wearing(tanky, { sling: true });
    expect(activeWeaponMode(s, tanky)).toBe('ranged');
    expect(fightingPlayer(s, tanky).attackIntervalMs).toBe(1800); // 2.0 s - 0.2
  });

  it('a flying enemy switches to the slingshot: its damage and interval, paws idle', () => {
    const s = wearing(flyingTanky, { club: true, sling: true });
    expect(activeWeaponMode(s, flyingTanky)).toBe('ranged');
    expect(fightingPlayer(s, flyingTanky).fighter.damageMax).toBe(90);
    expect(playerHitMultiplier(s, flyingTanky)).toBe(1);
    // The attack bar follows the slingshot interval (1.8 s).
    const fight = run(startSearch(s).state, 10, flyingTanky).state;
    const hits = attacks(run(fight, 36, flyingTanky).log, 'player');
    expect(hits.map((h) => h.tick)).toEqual([18, 36]);
  });

  it('a flying enemy without a slingshot: fists, half the hit chance', () => {
    const s = wearing(flyingTanky, { club: true });
    expect(activeWeaponMode(s, flyingTanky)).toBe('fists');
    expect(fightingPlayer(s, flyingTanky).fighter.damageMax).toBe(40);
    expect(playerHitMultiplier(s, flyingTanky)).toBe(0.5);
    // 85 % -> 42.5 %: over many swings clearly fewer hits than with the slingshot.
    const hitRate = (start: EncounterState) => {
      const log = attacks(run(run(startSearch(start).state, 10, flyingTanky).state, 8000, flyingTanky).log, 'player');
      return log.filter((l) => l.event.type === 'attack' && l.event.hit).length / log.length;
    };
    expect(hitRate(s)).toBeGreaterThan(0.3);
    expect(hitRate(s)).toBeLessThan(0.55);
    expect(hitRate(wearing(flyingTanky, { club: true, sling: true }))).toBeGreaterThan(0.75);
  });

  it('compareEquip shows a slingshot as it shoots (ranged slot)', () => {
    const s = wearing(tanky, { club: true });
    const diff = compareEquip(tanky, 1, s.inventory.equipment, sling, 'ranged');
    expect(diff.damageMax).toBe(50);
    expect(diff.attackIntervalMs).toBe(-200);
  });

  describe('ammo (GDD 7.3, M7.3b)', () => {
    const shots = (start: EncounterState, cfg: EncounterConfig, ticks: number) =>
      run(run(startSearch(start).state, 10, cfg).state, ticks, cfg);

    it('starts with "keep at least 5 nuts" from balance', () => {
      expect(fresh(tanky).keepNuts).toBe(5);
      expect(setKeepNuts(fresh(tanky), 12).keepNuts).toBe(12);
      expect(setKeepNuts(fresh(tanky), -3).keepNuts).toBe(0);
    });

    it('every shot (hit or miss) spends one nut while above the reserve', () => {
      const s = wearing(flyingTanky, { sling: true }, 20);
      expect(currentAmmo(s, flyingTanky)).toBe('nuts');
      const r = shots(s, flyingTanky, 18 * 4); // 1.8 s interval -> 4 shots
      const fired = attacks(r.log, 'player');
      expect(fired).toHaveLength(4);
      expect(fired.every((l) => l.event.type === 'attack' && l.event.ammo === 'nuts')).toBe(true);
      expect(r.state.wallet.nuts).toBe(16);
    });

    it('at the reserve it switches to ground pebbles: free, half damage', () => {
      const s = wearing(flyingTanky, { sling: true }, 6);
      const r = shots(s, flyingTanky, 18 * 4);
      const fired = attacks(r.log, 'player').map((l) => (l.event.type === 'attack' ? l.event.ammo : null));
      expect(fired).toEqual(['nuts', 'ground', 'ground', 'ground']);
      expect(r.state.wallet.nuts).toBe(5);
      expect(currentAmmo(r.state, flyingTanky)).toBe('ground');
      expect(fightingPlayer(r.state, flyingTanky).fighter.damageMax).toBe(45); // 0.9 x 50 %
    });

    it('a lower reserve lets it shoot more nuts; eating ignores the reserve', () => {
      const s = setKeepNuts(wearing(flyingTanky, { sling: true }, 3), 0);
      expect(currentAmmo(s, flyingTanky)).toBe('nuts');
      const hurt = { ...wearing(tanky, {}, 3), playerHp: 100 };
      expect(eatFood(hurt, tanky, 'nuts').state.wallet.nuts).toBe(2);
    });

    it('a slingshot on ground enemies (no paw weapon) uses nuts too; melee and fists never do', () => {
      const ranged = shots(wearing(tanky, { sling: true }, 20), tanky, 18);
      expect(ranged.state.wallet.nuts).toBe(19);
      const melee = shots(wearing(tanky, { club: true, sling: true }, 20), tanky, 40);
      expect(attacks(melee.log, 'player').length).toBeGreaterThan(0);
      expect(melee.state.wallet.nuts).toBe(20);
      expect(currentAmmo(wearing(tanky, { club: true, sling: true }), tanky)).toBeNull();
    });
  });
});

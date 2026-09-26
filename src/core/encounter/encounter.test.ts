import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng';
import {
  attackProgress,
  createEncounter,
  createEncounterConfig,
  hpFraction,
  makePeace,
  playerStats,
  searchProgress,
  startSearch,
  tick,
  type EncounterConfig,
  type EncounterConfigInput,
  type EncounterEvent,
  type EncounterState,
} from './encounter';

const rules = { minHitPct: 5, maxHitPct: 98, armorConstant: 10.0, maxDamageReductionPct: 75, minDamage: 0.1 };
const squirrelInput = { maxHp: 5.0, damageMin: 0.3, damageMax: 0.4, hitPct: 85, armor: 0, dodgePct: 0 };
const antInput = { maxHp: 1.2, damageMin: 0.2, damageMax: 0.3, hitPct: 65, armor: 0, dodgePct: 0 };

function makeConfig(patch: Partial<EncounterConfigInput> = {}): EncounterConfig {
  return createEncounterConfig({
    searchDurationS: 1.0,
    playerAttackIntervalS: 2.0,
    enemyAttackIntervalS: 3.0,
    player: squirrelInput,
    enemy: antInput,
    enemyXp: 2,
    rules,
    ...patch,
  });
}

/** Real M2 numbers (squirrel vs Worker Ant). */
const config = makeConfig();
/** Nobody can die: for timing tests. */
const tanky = makeConfig({
  player: { ...squirrelInput, maxHp: 999.0 },
  enemy: { ...antInput, maxHp: 999.0 },
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
  return createEncounter(cfg, createRng(seed));
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
    expect(config.enemyAttackIntervalMs).toBe(3000);
    expect(config.enemy.maxHp).toBe(120);
    expect(config.enemyXp).toBe(200);
    expect(config.rules.minDamage).toBe(10);
  });

  it('rejects zero or invalid durations', () => {
    expect(() => makeConfig({ searchDurationS: 0 })).toThrow();
    expect(() => makeConfig({ playerAttackIntervalS: 0 })).toThrow();
    expect(() => makeConfig({ enemyAttackIntervalS: 0.25 })).toThrow();
  });

  it('rejects an invalid player base (e.g. 0 HP)', () => {
    expect(() => makeConfig({ player: { ...squirrelInput, maxHp: 0 } })).toThrow();
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
    const fragile = makeConfig({ enemy: { ...antInput, maxHp: 0.1, hitPct: 0 }, enemyXp: 5.0 });
    const { state, log } = runUntil(fighting(fragile), fragile, (e) => e.type === 'enemyDefeated');
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    const sameTick = log.filter((l) => l.tick === defeatTick).map((l) => l.event.type);
    expect(sameTick).toEqual(['attack', 'enemyDefeated', 'searchStarted']);
    expect(state.progression).toEqual({ level: 1, xp: 500 });
    expect(state.phase).toBe('searching');
  });

  it('leveling up from a kill heals by exactly the HP bonus and raises max HP', () => {
    const fragile = makeConfig({ enemy: { ...antInput, maxHp: 0.1, hitPct: 0 }, enemyXp: 10.0 });
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
    const fragile = makeConfig({ enemy: { ...antInput, maxHp: 0.1, hitPct: 0 }, enemyXp: 25.0 });
    const { state, log } = runUntil(fighting(fragile), fragile, (e) => e.type === 'enemyDefeated');
    const levelUps = log.filter((l) => l.event.type === 'leveledUp').map((l) => l.event);
    expect(levelUps).toEqual([
      { type: 'leveledUp', level: 2 },
      { type: 'leveledUp', level: 3 },
    ]);
    expect(state.progression.level).toBe(3);
  });

  it('a killed enemy does not attack in the same tick', () => {
    // Both attack every 3.0 s, so every player attack lands in a tick where the
    // enemy is due too. The enemy has 0.1 HP, so the first hit kills it.
    const cfg = makeConfig({
      playerAttackIntervalS: 3.0,
      enemy: { ...antInput, maxHp: 0.1 },
    });
    for (let seed = 1; seed <= 20; seed++) {
      const { log } = run(fighting(cfg, seed), 200, cfg);
      const defeat = log.find((l) => l.event.type === 'enemyDefeated');
      expect(defeat).toBeDefined();
      expect(attacks(log, 'enemy').filter((l) => l.tick === defeat?.tick)).toEqual([]);
    }
  });

  it('when the squirrel is defeated: back to idle at full (leveled) HP (M2 placeholder)', () => {
    const deadly = makeConfig({ enemy: { ...antInput, maxHp: 999.0, damageMin: 5.0, damageMax: 5.0, hitPct: 100 } });
    const { state, log } = run(fighting(deadly), 200, deadly);
    const defeated = log.find((l) => l.event.type === 'playerDefeated');
    expect(defeated).toBeDefined();
    expect(state.phase).toBe('idle');
    expect(state.playerHp).toBe(playerStats(deadly, state.progression.level).maxHp);
    expect(log.filter((l) => l.tick > (defeated?.tick ?? 0))).toEqual([]);
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
});

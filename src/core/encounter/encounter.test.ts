import { describe, expect, it } from 'vitest';
import { createRng } from '../rng/rng';
import {
  attackProgress,
  createEncounter,
  createEncounterConfig,
  hpFraction,
  makePeace,
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

describe('createEncounterConfig', () => {
  it('converts seconds to milliseconds and stats to hundredths', () => {
    expect(config.searchMs).toBe(1000);
    expect(config.playerAttackIntervalMs).toBe(2000);
    expect(config.enemyAttackIntervalMs).toBe(3000);
    expect(config.player.maxHp).toBe(500);
    expect(config.enemy.maxHp).toBe(120);
    expect(config.rules.minDamage).toBe(10);
  });

  it('rejects zero or invalid durations', () => {
    expect(() => makeConfig({ searchDurationS: 0 })).toThrow();
    expect(() => makeConfig({ playerAttackIntervalS: 0 })).toThrow();
    expect(() => makeConfig({ enemyAttackIntervalS: 0.25 })).toThrow();
  });
});

describe('encounter', () => {
  it('starts idle at full HP and does nothing on its own', () => {
    const idle = fresh();
    expect(idle.phase).toBe('idle');
    expect(idle.playerHp).toBe(500);
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

  it('when the enemy dies, the next search starts at once and the squirrel keeps her HP', () => {
    // A 0.1 HP enemy dies from the first hit.
    const fragile = makeConfig({ enemy: { ...antInput, maxHp: 0.1, hitPct: 0 } });
    const { log } = run(fighting(fragile), 200, fragile);
    const defeatTick = log.find((l) => l.event.type === 'enemyDefeated')?.tick;
    expect(defeatTick).toBeDefined();
    const sameTick = log.filter((l) => l.tick === defeatTick).map((l) => l.event.type);
    expect(sameTick).toEqual(['attack', 'enemyDefeated', 'searchStarted']);
    // Next enemy is found exactly 1.0 s later, at full HP again.
    const next = log.find((l) => l.event.type === 'enemyFound' && l.tick > (defeatTick ?? 0));
    expect(next?.tick).toBe((defeatTick ?? 0) + 10);
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

  it('when the squirrel is defeated: back to idle at full HP (M2 placeholder)', () => {
    const deadly = makeConfig({ enemy: { ...antInput, maxHp: 999.0, damageMin: 5.0, damageMax: 5.0, hitPct: 100 } });
    const { state, log } = run(fighting(deadly), 200, deadly);
    const defeated = log.find((l) => l.event.type === 'playerDefeated');
    expect(defeated).toBeDefined();
    expect(state.phase).toBe('idle');
    expect(state.playerHp).toBe(500);
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

  it('ends the fight at once; the squirrel keeps her current HP', () => {
    const midFight = run(fighting(tanky), 300, tanky).state;
    expect(midFight.playerHp).toBeLessThan(tanky.player.maxHp);
    const r = makePeace(midFight);
    expect(r.state.phase).toBe('idle');
    expect(r.state.playerHp).toBe(midFight.playerHp);
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

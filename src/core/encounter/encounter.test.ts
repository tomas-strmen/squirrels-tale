import { describe, expect, it } from 'vitest';
import {
  attackProgress,
  createEncounter,
  createEncounterConfig,
  makePeace,
  searchProgress,
  startSearch,
  tick,
  type EncounterConfig,
  type EncounterEvent,
  type EncounterState,
} from './encounter';

const config: EncounterConfig = createEncounterConfig({
  searchDurationS: 1.0,
  playerAttackIntervalS: 2.0,
  enemyAttackIntervalS: 3.0,
});

/** Runs `steps` ticks and collects all events with the tick number (1-based). */
function run(
  state: EncounterState,
  steps: number,
): { state: EncounterState; log: { tick: number; event: EncounterEvent }[] } {
  const log: { tick: number; event: EncounterEvent }[] = [];
  let s = state;
  for (let i = 1; i <= steps; i++) {
    const r = tick(s, config);
    s = r.state;
    for (const event of r.events) log.push({ tick: i, event });
  }
  return { state: s, log };
}

function fighting(): EncounterState {
  return run(startSearch(createEncounter()).state, 10).state;
}

describe('createEncounterConfig', () => {
  it('converts seconds to milliseconds', () => {
    expect(config).toEqual({
      searchMs: 1000,
      playerAttackIntervalMs: 2000,
      enemyAttackIntervalMs: 3000,
    });
  });

  it('rejects zero or invalid durations', () => {
    expect(() =>
      createEncounterConfig({ searchDurationS: 0, playerAttackIntervalS: 2, enemyAttackIntervalS: 3 }),
    ).toThrow();
    expect(() =>
      createEncounterConfig({ searchDurationS: 1, playerAttackIntervalS: 0, enemyAttackIntervalS: 3 }),
    ).toThrow();
    expect(() =>
      createEncounterConfig({ searchDurationS: 1, playerAttackIntervalS: 2, enemyAttackIntervalS: 0.25 }),
    ).toThrow();
  });
});

describe('encounter', () => {
  it('starts idle and does nothing on its own', () => {
    const idle = createEncounter();
    expect(idle.phase).toBe('idle');
    const { state, log } = run(idle, 100);
    expect(state).toEqual(idle);
    expect(log).toEqual([]);
  });

  it('starts searching when the player presses Find enemy', () => {
    const r = startSearch(createEncounter());
    expect(r.state.phase).toBe('searching');
    expect(r.events).toEqual([{ type: 'searchStarted' }]);
  });

  it('ignores Find enemy while already searching or fighting', () => {
    const searching = startSearch(createEncounter()).state;
    expect(startSearch(searching)).toEqual({ state: searching, events: [] });
    const fight = fighting();
    expect(startSearch(fight)).toEqual({ state: fight, events: [] });
  });

  it('finds the enemy after exactly 1.0 s (10 ticks)', () => {
    const searching = startSearch(createEncounter()).state;
    const after9 = run(searching, 9);
    expect(after9.state.phase).toBe('searching');
    expect(after9.log).toEqual([]);
    const after10 = run(searching, 10);
    expect(after10.state.phase).toBe('fighting');
    expect(after10.log).toEqual([{ tick: 10, event: { type: 'enemyFound' } }]);
  });

  it('player attacks every 2.0 s and enemy every 3.0 s', () => {
    const { log } = run(fighting(), 120); // 12 s of fighting
    const playerTicks = log.filter((l) => l.event.type === 'attack' && l.event.attacker === 'player');
    const enemyTicks = log.filter((l) => l.event.type === 'attack' && l.event.attacker === 'enemy');
    expect(playerTicks.map((l) => l.tick)).toEqual([20, 40, 60, 80, 100, 120]);
    expect(enemyTicks.map((l) => l.tick)).toEqual([30, 60, 90, 120]);
  });

  it('player attacks first when both are due in the same tick', () => {
    const { log } = run(fighting(), 60);
    const at60 = log.filter((l) => l.tick === 60).map((l) => l.event);
    expect(at60).toEqual([
      { type: 'attack', attacker: 'player' },
      { type: 'attack', attacker: 'enemy' },
    ]);
  });

  it('keeps fighting forever in M0.1 (nobody dies yet)', () => {
    const { state } = run(fighting(), 10_000);
    expect(state.phase).toBe('fighting');
  });

  it('is deterministic: same inputs give the same result', () => {
    const a = run(startSearch(createEncounter()).state, 500);
    const b = run(startSearch(createEncounter()).state, 500);
    expect(a).toEqual(b);
  });

  it('does not modify the state passed in', () => {
    const s = fighting();
    const copy = structuredClone(s);
    tick(s, config);
    startSearch(s);
    makePeace(s);
    expect(s).toEqual(copy);
  });
});

describe('makePeace (GDD 7.1)', () => {
  it('does nothing while idle', () => {
    const idle = createEncounter();
    const r = makePeace(idle);
    expect(r.state).toBe(idle);
    expect(r.events).toEqual([]);
  });

  it('stops the search and goes back to idle', () => {
    const searching = run(startSearch(createEncounter()).state, 5).state;
    const r = makePeace(searching);
    expect(r.state).toEqual(createEncounter());
    expect(r.events).toEqual([{ type: 'peaceMade', from: 'searching' }]);
  });

  it('ends the fight at once and goes back to idle', () => {
    const midFight = run(fighting(), 7).state;
    const r = makePeace(midFight);
    expect(r.state).toEqual(createEncounter());
    expect(r.events).toEqual([{ type: 'peaceMade', from: 'fighting' }]);
  });

  it('stays idle afterwards: no enemy found, no attacks', () => {
    const peaceful = makePeace(fighting()).state;
    const { state, log } = run(peaceful, 100);
    expect(state.phase).toBe('idle');
    expect(log).toEqual([]);
  });

  it('a new Find enemy after Peace! starts a fresh search of 1.0 s', () => {
    const peaceful = makePeace(run(startSearch(createEncounter()).state, 8).state).state;
    const searching = startSearch(peaceful).state;
    expect(searchProgress(searching, config)).toBe(0);
    const { log } = run(searching, 10);
    expect(log).toEqual([{ tick: 10, event: { type: 'enemyFound' } }]);
  });
});

describe('progress helpers', () => {
  it('reports search progress', () => {
    const idle = createEncounter();
    expect(searchProgress(idle, config)).toBe(0);
    const half = run(startSearch(idle).state, 5).state;
    expect(searchProgress(half, config)).toBeCloseTo(0.5);
    expect(searchProgress(fighting(), config)).toBe(1);
  });

  it('reports attack progress for each fighter', () => {
    expect(attackProgress(createEncounter(), config, 'player')).toBe(0);
    const s = run(fighting(), 10).state; // 1 s into the fight
    expect(attackProgress(s, config, 'player')).toBeCloseTo(0.5);
    expect(attackProgress(s, config, 'enemy')).toBeCloseTo(1 / 3);
  });
});

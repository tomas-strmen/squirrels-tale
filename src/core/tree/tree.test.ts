import { describe, expect, it } from 'vitest';
import treeData from '../../../data/tree.json';
import { parseTree } from '../content/schemas';
import { buyNode, earnedPoints, freePoints, nodeStatus, resetCost, treeBonuses, type TreeState } from './tree';

const tree = parseTree(treeData);
const none: ReadonlySet<string> = new Set();

describe('data/tree.json (GDD 13.1)', () => {
  it('has 3 branches of 9 nodes + 1 keystone each (30 nodes)', () => {
    for (const branch of ['thorn', 'bark', 'acorn'] as const) {
      const nodes = tree.nodes.filter((n) => n.branch === branch);
      expect(nodes.filter((n) => n.kind === 'normal')).toHaveLength(9);
      expect(nodes.filter((n) => n.kind === 'keystone')).toHaveLength(1);
      expect(nodes[nodes.length - 1]?.kind).toBe('keystone');
    }
    expect(tree.nodes).toHaveLength(30);
  });
});

describe('points (GDD 6.2)', () => {
  it('1 point per level above 1, 1 special point every 5 levels', () => {
    expect(earnedPoints(1)).toEqual({ normal: 0, special: 0 });
    expect(earnedPoints(5)).toEqual({ normal: 4, special: 1 });
    expect(earnedPoints(12)).toEqual({ normal: 11, special: 2 });
    expect(freePoints(5, ['thorn_1', 'bark_1'], tree)).toEqual({ normal: 2, special: 1 });
  });
});

describe('buying nodes', () => {
  it('a branch is a chain: the next node needs the previous one', () => {
    expect(nodeStatus('thorn_1', 3, [], tree, none)).toBe('available');
    expect(nodeStatus('thorn_2', 3, [], tree, none)).toBe('needsPrevious');
    const one = buyNode('thorn_1', 3, [], tree, none);
    expect(one).toEqual(['thorn_1']);
    expect(nodeStatus('thorn_1', 3, one, tree, none)).toBe('bought');
    expect(nodeStatus('thorn_2', 3, one, tree, none)).toBe('available');
  });

  it('no free point -> nothing bought', () => {
    expect(nodeStatus('thorn_1', 1, [], tree, none)).toBe('noPoints');
    const same: TreeState = [];
    expect(buyNode('thorn_1', 1, same, tree, none)).toBe(same);
  });

  it('quest-locked stats (crit Q3 ...) wait for their quest; keystones are "coming soon"', () => {
    const five = ['thorn_1', 'thorn_2', 'thorn_3', 'thorn_4', 'thorn_5'];
    expect(nodeStatus('thorn_6', 20, five, tree, none)).toBe('questLocked');
    expect(nodeStatus('thorn_6', 20, five, tree, new Set(['q3']))).toBe('available');
    expect(nodeStatus('wild_squirrel', 20, five, tree, none)).toBe('comingSoon');
  });

  it('reset costs 10 pebbles per level', () => {
    expect(resetCost(7, tree)).toBe(70);
  });
});

describe('bonuses', () => {
  it('stat nodes add up per stat (hundredths), plus XP %, nut save and offline cap', () => {
    const b = treeBonuses(['thorn_1', 'thorn_2', 'thorn_3', 'bark_1', 'acorn_1', 'acorn_2', 'acorn_5', 'acorn_6'], tree);
    expect(b.stats).toEqual(
      expect.arrayContaining([
        { stat: 'damagePct', value: 1000 },
        { stat: 'attackSpeedPct', value: 300 },
        { stat: 'maxHp', value: 50 },
        { stat: 'currencyFindPct', value: 500 },
      ]),
    );
    expect(b.xpPct).toBe(5);
    expect(b.nutSavePct).toBe(10);
    expect(b.offlineCapMs).toBe(30 * 60_000);
  });

  it('nothing bought -> no bonuses; same bought array -> same (cached) object', () => {
    expect(treeBonuses([], tree).stats).toEqual([]);
    const bought: TreeState = ['bark_1'];
    expect(treeBonuses(bought, tree)).toBe(treeBonuses(bought, tree));
  });
});

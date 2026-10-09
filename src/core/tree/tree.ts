/**
 * Skill tree (GDD 13.1, M11). Pure TypeScript, no Phaser. Nodes in `data/tree.json`.
 *
 * - 3 branches (Thorn / Bark / Acorn), each a chain: a node can be bought once the previous
 *   node of its branch is bought. Normal nodes cost 1 skill point (1 per level above 1, GDD 6.2),
 *   keystones 1 special point (1 every 5 levels).
 * - A node whose stat is locked by a quest (crit Q3, MF Q4, dodge Q7, stun Q8 - GDD 6.1) can't
 *   be bought until then; keystone effects arrive with the quests (M13), until then "coming soon".
 * - Reset refunds every point for `resetCostPebblesPerLevel` x level pebbles.
 * - Bonuses: stat nodes add up per stat and act like one extra piece of gear (core/stats);
 *   plus XP %, nut-save chance and offline cap minutes.
 */
import type { StatId, TreeData, TreeNodeData } from '../content/schemas';
import { toHundredths } from '../numbers/numbers';
import type { ItemStat } from '../loot/loot';

export type TreeConfig = TreeData;

/** Bought node ids. */
export type TreeState = readonly string[];

export const EMPTY_TREE: TreeConfig = { resetCostPebblesPerLevel: 0, nodes: [] };

/** Keystones whose effect exists in the game so far (none until the quests, M13). */
const IMPLEMENTED_KEYSTONES: ReadonlySet<string> = new Set();

export interface TreePoints {
  readonly normal: number;
  readonly special: number;
}

/** Points earned by `level` (GDD 6.2): 1 per level above 1, + 1 special every 5 levels. */
export function earnedPoints(level: number): TreePoints {
  return { normal: Math.max(0, level - 1), special: Math.floor(level / 5) };
}

/** Points still free to spend. */
export function freePoints(level: number, bought: TreeState, config: TreeConfig): TreePoints {
  const earned = earnedPoints(level);
  const nodes = config.nodes.filter((n) => bought.includes(n.id));
  return {
    normal: earned.normal - nodes.filter((n) => n.kind === 'normal').length,
    special: earned.special - nodes.filter((n) => n.kind === 'keystone').length,
  };
}

export type NodeStatus = 'bought' | 'available' | 'noPoints' | 'needsPrevious' | 'questLocked' | 'comingSoon';

/** The node right before `node` in its branch (data order), or null for the first one. */
function previousOf(node: TreeNodeData, config: TreeConfig): TreeNodeData | null {
  const branch = config.nodes.filter((n) => n.branch === node.branch);
  const index = branch.findIndex((n) => n.id === node.id);
  return index > 0 ? (branch[index - 1] ?? null) : null;
}

export function nodeStatus(
  nodeId: string,
  level: number,
  bought: TreeState,
  config: TreeConfig,
  unlockedQuests: ReadonlySet<string>,
): NodeStatus {
  const node = config.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown tree node "${nodeId}"`);
  if (bought.includes(node.id)) return 'bought';
  if (node.effect.type === 'keystone' && !IMPLEMENTED_KEYSTONES.has(node.effect.keystone)) return 'comingSoon';
  if (node.unlockedBy !== null && !unlockedQuests.has(node.unlockedBy)) return 'questLocked';
  const previous = previousOf(node, config);
  if (previous && !bought.includes(previous.id)) return 'needsPrevious';
  const free = freePoints(level, bought, config);
  return (node.kind === 'normal' ? free.normal : free.special) > 0 ? 'available' : 'noPoints';
}

/** Buys `nodeId` if it's available; otherwise the same array. */
export function buyNode(
  nodeId: string,
  level: number,
  bought: TreeState,
  config: TreeConfig,
  unlockedQuests: ReadonlySet<string>,
): TreeState {
  return nodeStatus(nodeId, level, bought, config, unlockedQuests) === 'available' ? [...bought, nodeId] : bought;
}

/** Pebbles a reset costs at `level` (GDD 13.1: 10 x level). */
export function resetCost(level: number, config: TreeConfig): number {
  return config.resetCostPebblesPerLevel * level;
}

export interface TreeBonuses {
  /** Stat nodes summed per stat, in item units (hundredths) - fed to core/stats like gear. */
  readonly stats: readonly ItemStat[];
  readonly xpPct: number;
  readonly nutSavePct: number;
  readonly offlineCapMs: number;
}

export const NO_TREE_BONUSES: TreeBonuses = { stats: [], xpPct: 0, nutSavePct: 0, offlineCapMs: 0 };

const cache = new WeakMap<TreeState, Map<TreeConfig, TreeBonuses>>();

/** What the bought nodes give (memoized per bought-array object - states are immutable). */
export function treeBonuses(bought: TreeState, config: TreeConfig): TreeBonuses {
  if (bought.length === 0) return NO_TREE_BONUSES;
  const hit = cache.get(bought)?.get(config);
  if (hit) return hit;
  const stats = new Map<StatId, number>();
  let xpPct = 0;
  let nutSavePct = 0;
  let offlineCapMs = 0;
  for (const node of config.nodes) {
    if (!bought.includes(node.id)) continue;
    const e = node.effect;
    if (e.type === 'stat') stats.set(e.stat, (stats.get(e.stat) ?? 0) + toHundredths(e.value));
    else if (e.type === 'xpPct') xpPct += e.value;
    else if (e.type === 'nutSavePct') nutSavePct += e.value;
    else if (e.type === 'offlineCapMin') offlineCapMs += e.value * 60_000;
  }
  const result: TreeBonuses = {
    stats: [...stats.entries()].map(([stat, value]) => ({ stat, value })),
    xpPct,
    nutSavePct,
    offlineCapMs,
  };
  const perConfig = cache.get(bought) ?? new Map<TreeConfig, TreeBonuses>();
  perConfig.set(config, result);
  cache.set(bought, perConfig);
  return result;
}

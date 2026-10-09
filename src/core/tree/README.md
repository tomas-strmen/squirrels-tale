# core/tree

Skill tree (GDD 13.1, M11). Pure TypeScript, no Phaser. Nodes in `data/tree.json`.

**Status (M11.1):** data + rules + tests only – not wired into the game yet (no effect on fights,
not saved, no UI). Next: M11.2 stats/XP/currency/nuts/offline + save v4, M11.3 the tree panel.

- 3 branches (Thorn / Bark / Acorn), 9 normal nodes + 1 keystone each. A branch is a chain: a node
  can be bought once the previous one (data order) is bought.
- Points (GDD 6.2): 1 skill point per level above 1, 1 special point every 5 levels (keystones).
- Nodes whose stat is quest-locked (crit Q3, MF Q4, dodge Q7, stun Q8) wait for their quest; they
  sit at the end of each branch so the rest of the branch is usable before the quests (M13).
  Keystone effects come with the quests too – until then `comingSoon`.
- Reset: `resetCostPebblesPerLevel` × level pebbles (GDD 13.1: 10 × level).

## Public API
- `earnedPoints(level)`, `freePoints(level, bought, config)` → `{ normal, special }`.
- `nodeStatus(id, level, bought, config, unlockedQuests)` → `bought | available | noPoints | needsPrevious | questLocked | comingSoon`.
- `buyNode(id, level, bought, config, unlockedQuests)` → new bought list (same array if not available).
- `resetCost(level, config)`.
- `treeBonuses(bought, config)` → `{ stats (per stat, hundredths, like gear), xpPct, nutSavePct, offlineCapMs }` (memoized).

## Depends on
`core/content` (types, `parseTree`), `core/numbers`, `core/loot` (`ItemStat` type).

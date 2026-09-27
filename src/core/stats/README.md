# core/stats

Character + equipment → combat numbers (GDD 6.1 v1.8, 7.2, 9.1 v2.3). Pure.

## Public API
- `composeStats({ character, baseAttackIntervalMs, levelSpeedFactor, minAttackIntervalMs, equipment, offHandDamagePct })`
  → `{ fighter, attackIntervalMs, regenMultiplier }`.

## Rules
- Flat values **add**: max HP, armor, damage = fists + right-paw weapon + left-paw weapon × 50 %.
- Percentages **multiply**: each item's damage % / attack speed % / regen % is its own (1 + p) factor.
- Hit % adds percentage points.
- Attack interval = (fists 4.0 s + right-paw weapon shift, e.g. −0.4 s) / level factor / speed factors,
  min 0.5 s. The left paw never changes it.
- Ranged weapon damage isn't used in melee fights (flying enemies in M7); its other stats count.

## Depends on
- `core/combat`, `core/content`, `core/inventory`, `core/loot` (types).

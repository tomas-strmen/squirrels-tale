# core/stats

Character + equipment → combat numbers (GDD 6.1 v1.8, 7.2, 9.1 v2.3). Pure.

## Public API
- `composeStats({ character, baseAttackIntervalMs, levelSpeedFactor, minAttackIntervalMs, equipment, offHandDamagePct, weaponMode? })`
  → `{ fighter, attackIntervalMs, regenMultiplier }`.
- `chooseWeaponMode(equipment, enemyFlying)` → `'melee' | 'ranged' | 'fists'` (GDD 7.1): flying → ranged
  (none → fists); otherwise paws → ranged → fists.

## Rules
- Flat values **add**: max HP, armor, damage = fists + right-paw weapon + left-paw weapon × 50 %.
- Percentages **multiply**: each item's damage % / attack speed % / regen % is its own (1 + p) factor.
- Hit % adds percentage points.
- Attack interval = (fists 4.0 s + right-paw weapon shift, e.g. −0.4 s) / level factor / speed factors,
  min 0.5 s. The left paw never changes it.
- Weapon mode (GDD 7.1 v2.7): `melee` (default) = both paws; `ranged` = character + ranged weapon damage and
  its interval shift, both paws idle (it takes both paws); `fists` = no weapon damage, plain interval.
  Stats and affixes of all worn gear count in every mode.

## Depends on
- `core/combat`, `core/content`, `core/inventory`, `core/loot` (types).

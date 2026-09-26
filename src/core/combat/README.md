# core/combat

Resolves one attack with the hit formula from GDD 7.2 (M2 subset). Pure: takes
the seeded Rng and returns the advanced one. Values are internal integers
(HP / damage / armor in hundredths, percentages whole).

## Public API
- `createCombatRules(input)` – formula constants from `data/balance.json` `combat`.
- `createFighterStats(input)` – one fighter's stats from design values.
- `hitChancePct(attacker, defender, rules)` – `clamp(hit − dodge, 5 %, 98 %)`.
- `damageReduction(armor, rules)` – `armor / (armor + 10)`, max 75 %.
- `finalDamage(raw, armor, rules)` – reduced by armor, rounded to 0.1, min 0.1.
- `resolveAttack(attacker, defender, rules, rng)` – hit roll, damage roll
  (uniform, 0.1 steps, both ends included), armor → `{ result: { hit, damage }, rng }`.

## Not yet (later stages)
hit% / skill bonuses, damage%, weapon skill and ammo multipliers (M4, M7, M12);
crit and stun are locked until quests Q3 / Q8 (GDD 6.1).

## Depends on
- `core/numbers`, `core/rng`.

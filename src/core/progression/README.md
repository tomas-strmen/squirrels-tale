# core/progression

XP, levels and the stat bonuses they grant (GDD 6.2, Changelog v1.6). Values
are internal hundredths (core/numbers), like HP and damage.

## Public API
- `createProgression()` – new state: level 1, 0 XP.
- `xpToNextLevel(level)` / `xpToNextLevelHundredths(level)` – GDD 6.2 curve:
  `need(L) = round(10 x 1.3^(L-1))` (v1.7).
- `attackIntervalMsAtLevel(baseMs, level, pctPerLevel, minMs)` – base / (1 + pct/100)^(L−1),
  whole ms, never below `minMs` (GDD 6.1 v1.7: ×1.01 per level, min 0.5 s).
- `cumulativeLevelBonuses(level)` – total bonuses (hundredths) earned by that level:
  +1.0 max HP per level, +0.1 max damage every level, +0.1 min damage every 2nd level (GDD v1.7).
- `levelUpDelta(level)` – bonus gained exactly when reaching `level` (used to heal
  the squirrel by the HP part at once, not a full heal).
- `gainXp(state, amountHundredths)` – adds XP, applies as many level-ups as it takes;
  returns the new state and every level reached, in order.
- `addLevelBonus(baseDesignValue, bonusHundredths)` – base + bonus as a clean design
  value (e.g. `5.0 + 100 -> 6.0`).
- `regenAmountHundredths(baseAmount, level, growthPctPerLevel)` – HP regenerated per
  regen tick at `level` (GDD 6.1: base amount, compounding % growth per level).
- `applyDeathXpLoss(state, lossPct)` – online death (GDD 6.3): subtracts `lossPct` % of
  the current level's XP progress; never drops a level.

## Rules
- No level cap (GDD 6.2). Skill tree points are a later stage (M11), not handled here.
- All functions are pure (input state is never modified).

## Depends on
- `core/numbers`.

# core/numbers

Design numbers (GDD 5): converting design values (max. 1 decimal place, as written
in `data/*.json`) to whole internal integers and back, so game math never runs
into floating point rounding drift.

## Public API
- `toHundredths(designValue)` – design value → whole hundredths (5.3 → 530). Throws
  on more than 1 decimal place or a non-finite value.
- `fromHundredths(hundredths)` – hundredths → plain decimal, for further math.
- `formatHundredths(hundredths)` – hundredths → display string rounded to 0.1 (e.g. `"5.3"`).

## Rules
- This module is for stats and other non-duration values (HP, damage, armor, ...).
  Durations (ms) are `core/time`'s job (`secondsToMs`), not this module's.

## Depends on
- Nothing.

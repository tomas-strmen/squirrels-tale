# core/clock

Real-world (wall-clock) timestamps: when the save was last closed, daily
resets, and the guard against a player winding their device clock back to
fake offline progress (GDD 17.3). Separate from `core/time`, which is the
100 ms simulation step, not calendar time.

## Public API
- `now()` – current time in ms since epoch. The only place that touches
  `Date.now()`, so everything else here is pure and testable with fixed
  timestamps.
- `guardAgainstClockRewind(maxSeenTimeMs, observedNowMs)` – returns the
  effective "now" and the new `maxSeenTimeMs` to persist; a rewound clock is
  clamped to the max ever seen (no time granted), never goes backwards.
- `utcDaysBetween(fromMs, toMs)`, `isNewUtcDay(fromMs, toMs)` – whole UTC
  calendar days between two timestamps, for daily quests / login reward
  resets that flip at UTC midnight, not a rolling 24 h window.

## Depends on
- Nothing.

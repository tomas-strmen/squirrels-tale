# core/time

Fixed-step simulation clock (GDD 5: 100 ms steps, independent of FPS).

## Public API
- `TICK_MS` – 100.
- `consumeFrame(accumulatorMs, frameDeltaMs, maxSteps?)` – how many steps to run this frame.
- `secondsToMs(seconds)` – design seconds (max. 1 decimal) → whole ms; throws on bad values.

## Depends on
- nothing.

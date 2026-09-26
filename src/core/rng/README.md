# core/rng

Seeded deterministic RNG (GDD: "randomness only via a seeded Rng"). Pure and
immutable like the rest of core - `next(state)` never mutates its input.

## Public API
- `createRng(seed)` – new `RngState` from a number or string seed.
- `next(state)` – next value in `[0, 1)`, returns `{ value, state }`.
- `nextInt(state, min, max)` – whole number in `[min, max)`.
- `nextBool(state, probability = 0.5)` – weighted coin flip.
- `branch(state, label)` – derives a new, independent stream from `state` and a
  label (e.g. `"loot:worker_ant"`). Deterministic (same state + label ->
  same branch); never advances or changes `state` itself. Used to give
  different subsystems (loot, crit, ...) independent streams, and for
  "vrátenie v čase" (M17) to start a fresh timeline after a rewind.

## Rules
- Same seed always produces the same sequence (determinism for tests, the
  headless balance sim, and save/replay).
- Algorithm: mulberry32 (fast, good enough distribution; not cryptographic).

## Depends on
- Nothing.

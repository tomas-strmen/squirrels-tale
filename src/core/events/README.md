# core/events

Small typed pub/sub event bus, so core modules and `src/game` can communicate
without importing each other's internals (ROADMAP: "moduly komunikujú cez
verejné API a event bus").

## Public API
- `createEventBus<TEvents>()` – `TEvents` is a map of event name -> payload
  type. Returns:
  - `on(event, listener)` – subscribe; returns an unsubscribe function.
  - `off(event, listener)` – unsubscribe a specific listener.
  - `emit(event, payload)` – calls every current listener, in subscription order.
  - `clear()` – removes every listener for every event (e.g. between tests, or scenes).

## Rules
- Not a pure state-transition module like most of `core` (a subscriber list is
  inherently mutable), but still plain TypeScript with no Phaser dependency.
- Safe to unsubscribe (even oneself) from inside a listener while `emit` is running.

## Depends on
- Nothing.

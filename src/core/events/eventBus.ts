/**
 * Typed event bus (ROADMAP: "moduly komunikujú cez verejné API a event bus").
 *
 * A small pub/sub so core modules stay decoupled from each other and from
 * src/game (e.g. combat can emit "enemyDied" without importing the UI, and
 * FightScene can subscribe without importing combat internals). Unlike most
 * of core this is not a pure state-transition module - a subscriber list is
 * inherently mutable - but it stays plain TypeScript, no Phaser.
 *
 * `TEvents` is a map of event name -> payload type, e.g.:
 *   interface AppEvents { enemyDied: { enemyId: string }; leveledUp: { level: number } }
 *   const bus = createEventBus<AppEvents>();
 */

export type Listener<TPayload> = (payload: TPayload) => void;

export interface EventBus<TEvents extends object> {
  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void;
  /** Removes a specific listener (alternative to calling the unsubscribe function). */
  off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void;
  /** Calls every current listener for `event` with `payload`, in subscription order. */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
  /** Removes every listener for every event. */
  clear(): void;
}

export function createEventBus<TEvents extends object>(): EventBus<TEvents> {
  const listeners = new Map<keyof TEvents, Set<Listener<never>>>();

  function on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => off(event, listener);
  }

  function off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
    listeners.get(event)?.delete(listener as Listener<never>);
  }

  function emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    // Snapshot into an array first: a listener may unsubscribe itself (or
    // others) while running, which must not skip or double-call listeners.
    const current = listeners.get(event);
    if (!current) return;
    for (const listener of [...current]) {
      (listener as Listener<TEvents[K]>)(payload);
    }
  }

  function clear(): void {
    listeners.clear();
  }

  return { on, off, emit, clear };
}

import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './eventBus';

interface TestEvents {
  ping: { n: number };
  greet: { name: string };
}

describe('createEventBus', () => {
  it('calls a subscribed listener with the emitted payload', () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    bus.on('ping', listener);
    bus.emit('ping', { n: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ n: 1 });
  });

  it('calls every listener for the event, in subscription order', () => {
    const bus = createEventBus<TestEvents>();
    const calls: string[] = [];
    bus.on('ping', () => calls.push('a'));
    bus.on('ping', () => calls.push('b'));
    bus.emit('ping', { n: 1 });
    expect(calls).toEqual(['a', 'b']);
  });

  it('does not call listeners of a different event', () => {
    const bus = createEventBus<TestEvents>();
    const pingListener = vi.fn();
    const greetListener = vi.fn();
    bus.on('ping', pingListener);
    bus.on('greet', greetListener);
    bus.emit('ping', { n: 1 });
    expect(pingListener).toHaveBeenCalledTimes(1);
    expect(greetListener).not.toHaveBeenCalled();
  });

  it('emitting with no listeners does nothing', () => {
    const bus = createEventBus<TestEvents>();
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow();
  });

  it('on() returns an unsubscribe function', () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = bus.on('ping', listener);
    unsubscribe();
    bus.emit('ping', { n: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('off() removes a specific listener', () => {
    const bus = createEventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.off('ping', a);
    bus.emit('ping', { n: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a listener unsubscribing itself during emit does not break the others', () => {
    const bus = createEventBus<TestEvents>();
    const b = vi.fn();
    const unsubscribeA = bus.on('ping', () => unsubscribeA());
    bus.on('ping', b);
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
    // The self-unsubscribe took effect: a second emit only calls b.
    bus.emit('ping', { n: 2 });
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('clear() removes every listener for every event', () => {
    const bus = createEventBus<TestEvents>();
    const pingListener = vi.fn();
    const greetListener = vi.fn();
    bus.on('ping', pingListener);
    bus.on('greet', greetListener);
    bus.clear();
    bus.emit('ping', { n: 1 });
    bus.emit('greet', { name: 'x' });
    expect(pingListener).not.toHaveBeenCalled();
    expect(greetListener).not.toHaveBeenCalled();
  });
});

import { now } from '../core/clock/clock';
import type { EncounterState } from '../core/encounter/encounter';
import {
  backupUnreadable,
  clearSave,
  loadSave,
  parseSave,
  snapshot,
  writeSave,
  type SaveData,
  type SaveStorage,
} from '../core/save/save';

/** Real seconds between autosaves (GDD 19). */
const AUTOSAVE_INTERVAL_MS = 30_000;

/** `window.localStorage`, or null where it's blocked (private mode, sandboxed iframe). */
function browserStorage(): SaveStorage | null {
  try {
    const storage = window.localStorage;
    const probe = 'squirrels-tale.probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Glue between the running game and `core/save` (M8.1): loads at start, autosaves every
 * 30 s of real time, when the page is hidden/closed and soon after important actions
 * (`requestSave`). Without localStorage the game still runs, it just doesn't save.
 */
export class SaveManager {
  private readonly storage = browserStorage();
  private createdAt = now();
  private maxSeenTime = 0;
  private sinceSaveMs = 0;
  private pending = false;
  /** After a reset/import the page reloads - don't let the closing page save over it. */
  private suspended = false;

  /** The newest readable save, or null for a new game. */
  load(): SaveData | null {
    if (!this.storage) return null;
    const loaded = loadSave(this.storage);
    if (!loaded) {
      if (backupUnreadable(this.storage) > 0) console.error('Save could not be read - a copy was kept, starting a new game.');
      return null;
    }
    if (loaded.slot === 'previous') console.warn('Current save was unreadable - loaded the previous one.');
    this.createdAt = loaded.data.createdAt;
    this.maxSeenTime = loaded.data.maxSeenTime;
    return loaded.data;
  }

  /** Saves on the next `update` (once, however many actions asked for it in between). */
  requestSave(): void {
    this.pending = true;
  }

  /** Call every frame with the real (unscaled) frame time. */
  update(realDeltaMs: number, state: EncounterState, playTimeMs: number): void {
    this.sinceSaveMs += realDeltaMs;
    if (this.pending || this.sinceSaveMs >= AUTOSAVE_INTERVAL_MS) this.save(state, playTimeMs);
  }

  save(state: EncounterState, playTimeMs: number): void {
    this.pending = false;
    this.sinceSaveMs = 0;
    if (!this.storage || this.suspended) return;
    const data = snapshot(state, { createdAt: this.createdAt, now: now(), maxSeenTime: this.maxSeenTime, playTimeMs });
    try {
      writeSave(this.storage, data);
      this.maxSeenTime = data.maxSeenTime;
    } catch (error) {
      console.warn('Saving failed', error); // e.g. storage full - keep playing, try again later
    }
  }

  /** The current game as save text (M8.2 export), for support or moving to another device. */
  exportText(state: EncounterState, playTimeMs: number): string {
    return JSON.stringify(
      snapshot(state, { createdAt: this.createdAt, now: now(), maxSeenTime: this.maxSeenTime, playTimeMs }),
    );
  }

  /**
   * Stores pasted save text as the current save (M8.2 import) and stops saving until the
   * page reloads. Throws SaveError if the text isn't a readable save; nothing changes then.
   */
  importText(text: string): void {
    const data = parseSave(text.trim());
    if (!this.storage) throw new Error('Saving is not available in this browser');
    writeSave(this.storage, data);
    this.suspended = true;
  }

  /** Deletes both save slots (debug reset) and stops saving until the page reloads. */
  clear(): void {
    if (this.storage) clearSave(this.storage);
    this.suspended = true;
  }
}

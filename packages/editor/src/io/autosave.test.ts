import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSetAsideSnapshot,
  loadAutosaveSnapshot,
  loadSetAsideSnapshot,
  saveAutosaveSnapshot,
  setAsideAutosaveSnapshot,
} from './autosave';

describe('an autosave this build cannot open', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is moved out of the slot the timer overwrites, and kept whole', () => {
    saveAutosaveSnapshot('{"schemaVersion":99}');
    const snapshot = loadAutosaveSnapshot();
    expect(snapshot).toBeDefined();
    setAsideAutosaveSnapshot(snapshot!);

    expect(loadAutosaveSnapshot()).toBeUndefined();
    expect(loadSetAsideSnapshot()).toEqual(snapshot);

    // The next session's autosave lands in its own slot and leaves it alone.
    saveAutosaveSnapshot('{"schemaVersion":1}');
    expect(loadSetAsideSnapshot()).toEqual(snapshot);
  });

  it('is gone once cleared, after a later build has opened it', () => {
    setAsideAutosaveSnapshot({ text: '{}', savedAt: 1 });
    clearSetAsideSnapshot();
    expect(loadSetAsideSnapshot()).toBeUndefined();
  });
});

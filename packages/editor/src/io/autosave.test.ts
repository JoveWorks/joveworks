import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  claimAutosaveSnapshot,
  clearAutosaveSnapshot,
  clearSetAsideSnapshot,
  loadAutosaveSnapshot,
  loadSetAsideSnapshot,
  saveAutosaveSnapshot,
  setAsideAutosaveSnapshot,
} from './autosave';

/** One browser: localStorage shared by every tab, sessionStorage per tab. */
let local: Map<string, string>;
const sessions = new Map<string, Map<string, string>>();

function storageOf(map: Map<string, string>): Storage {
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Switch which tab the module is running in. */
function inTab(name: string): void {
  if (!sessions.has(name)) sessions.set(name, new Map());
  vi.stubGlobal('window', { localStorage: storageOf(local), sessionStorage: storageOf(sessions.get(name)!) });
}

let clock = 1_000;

beforeEach(() => {
  local = new Map();
  sessions.clear();
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('autosave, one slot per tab', () => {
  it('lets two tabs keep two different unsaved documents', () => {
    inTab('a');
    saveAutosaveSnapshot('document A');
    inTab('b');
    saveAutosaveSnapshot('document B');

    inTab('a');
    expect(loadAutosaveSnapshot()?.text).toBe('document A');
    inTab('b');
    expect(loadAutosaveSnapshot()?.text).toBe('document B');
  });

  it('clears only its own tab\'s snapshot on Save or Open', () => {
    inTab('a');
    saveAutosaveSnapshot('document A');
    inTab('b');
    saveAutosaveSnapshot('document B');
    clearAutosaveSnapshot();

    inTab('a');
    expect(loadAutosaveSnapshot()?.text).toBe('document A');
  });

  it('offers a new tab the newest work a closed tab left, once', () => {
    inTab('a');
    saveAutosaveSnapshot('older', true);
    inTab('b');
    saveAutosaveSnapshot('newer', true);

    inTab('fresh');
    const offered = loadAutosaveSnapshot();
    expect(offered?.text).toBe('newer');
    claimAutosaveSnapshot(offered!);

    inTab('another');
    expect(loadAutosaveSnapshot()?.text).toBe('older');
    inTab('fresh');
    expect(loadAutosaveSnapshot()?.text).toBe('newer');
  });

  it('never offers a new tab the work of a tab that is still open', () => {
    inTab('a');
    saveAutosaveSnapshot('still being worked on');
    inTab('fresh');
    expect(loadAutosaveSnapshot()).toBeUndefined();
  });

  it('treats a slot nobody has written for a while as left — a tab that crashed never marked it', () => {
    inTab('a');
    saveAutosaveSnapshot('from a crashed tab');
    clock += 6 * 60_000;
    inTab('fresh');
    expect(loadAutosaveSnapshot()?.text).toBe('from a crashed tab');
  });

  it('still restores the single slot older builds wrote', () => {
    local.set('joveworks:autosave', JSON.stringify({ text: 'from an older build', savedAt: 5 }));
    inTab('a');
    const offered = loadAutosaveSnapshot();
    expect(offered?.text).toBe('from an older build');
    claimAutosaveSnapshot(offered!);
    expect(local.has('joveworks:autosave')).toBe(false);
  });

  it('keeps only the newest few slots', () => {
    for (const name of ['1', '2', '3', '4', '5', '6', '7']) {
      inTab(name);
      saveAutosaveSnapshot(`document ${name}`, true);
    }
    const slots = [...local.keys()].filter((key) => key.startsWith('joveworks:autosave:tab:'));
    expect(slots).toHaveLength(5);
    inTab('1');
    expect(loadAutosaveSnapshot()?.text).not.toBe('document 1');
  });
});

describe('an autosave this build cannot open', () => {
  it('is moved out of the slot the timer overwrites, and kept whole', () => {
    inTab('a');
    saveAutosaveSnapshot('{"schemaVersion":99}');
    const snapshot = loadAutosaveSnapshot()!;
    setAsideAutosaveSnapshot(snapshot);

    expect(loadAutosaveSnapshot()).toBeUndefined();
    expect(loadSetAsideSnapshot()?.text).toBe(snapshot.text);

    // The next session's autosave lands in its own slot and leaves it alone.
    saveAutosaveSnapshot('{"schemaVersion":1}');
    expect(loadSetAsideSnapshot()?.text).toBe(snapshot.text);
  });

  it('is gone once cleared, after a later build has opened it', () => {
    inTab('a');
    setAsideAutosaveSnapshot({ text: '{}', savedAt: 1 });
    clearSetAsideSnapshot();
    expect(loadSetAsideSnapshot()).toBeUndefined();
  });
});

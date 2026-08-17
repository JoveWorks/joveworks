/**
 * Three columns, and the canvas is always the middle one.
 *
 * Both side panels collapse, because a node editor wants horizontal room, and
 * there is **no properties panel** — values, units and ranges are edited on the
 * node, or the canvas would show a diagram while the real work happened beside
 * it.
 *
 * This component owns the two pieces of state everything else reads: the
 * document, and the catalogues loaded against it. The kernel is re-run on every
 * change, which is affordable because a graph is tens of nodes and because it is
 * the only way connect time and evaluation time cannot drift apart.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

import {
  emptyDocument,
  loadCatalogue,
  loadDocument,
  saveDocument,
  type Catalogue,
  type GraphDocument,
} from '@mds/schema';

import { Canvas } from './canvas/Canvas';
import { ContextMenu, type MenuItem } from './canvas/ContextMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { DOCS_BASE_URL } from './help-links';
import { GraphContext } from './graph-context';
import { SettingsContext } from './settings-context';
import { clearAutosaveSnapshot, loadAutosaveSnapshot, saveAutosaveSnapshot } from './io/autosave';
import { cacheCatalogue, cachedCatalogueTexts } from './io/catalogueCache';
import { openTextFile, saveTextFile } from './io/files';
import {
  loadRecentDocuments,
  recordRecentDocument,
  type RecentDocument,
} from './io/recentDocuments';
import { analyse } from './model/analysis';
import { bundledCatalogues, baseCatalogue, withCatalogue } from './model/catalogues';
import { groupIntoSection } from './model/document';
import { autoArrange } from './model/layout';
import {
  loadMinimapVisible,
  loadTitleMathRendering,
  loadThemePreference,
  saveMinimapVisible,
  saveTitleMathRendering,
  saveThemePreference,
  type ThemePreference,
} from './model/editorSettings';
import {
  commitPending,
  initHistory,
  pushEdit,
  pushLiveEdit,
  redoHistory,
  undoHistory,
  type History,
} from './model/history';
import {
  loadNumberFormatSettings,
  saveNumberFormatSettings,
  type NumberFormatSettings,
} from './model/numberFormat';
import { messageOf } from './model/quantity';
import {
  equationId,
  loadStoredUserEquations,
  parseUserEquations,
  saveUserEquations,
  storeUserEquations,
  type UserEquation,
} from './model/userEquations';
import {
  BELT_LAB_FORMULAS,
  CANTILEVER_FORMULAS,
  beltLab,
  cantileverHollowSections,
  padPressure,
  provides,
} from './model/samples';
import { Notebook } from './notebook/Notebook';
import { Palette } from './palette/Palette';
import { SettingsDialog } from './settings/SettingsDialog';
import { Tutorial } from './tutorial/Tutorial';
import { loadTutorialSeen } from './tutorial/tutorialSettings';
import { useResizableWidth } from './useResizableWidth';

/**
 * The base catalogue, the bundled public catalogue, and whatever was cached
 * from a previous session. Base nodes and the public catalogue both ship
 * `restricted: false` — neither needs a student to import it by hand the way
 * an R&M catalogue does, so both are always present.
 */
function initialCatalogues(): readonly Catalogue[] {
  let catalogues: readonly Catalogue[] = [baseCatalogue(), ...bundledCatalogues()];
  for (const text of cachedCatalogueTexts()) {
    try {
      catalogues = withCatalogue(catalogues, loadCatalogue(text));
    } catch {
      // A corrupted or stale cache entry is skipped rather than blocking
      // startup — caching is a convenience, and the student can always
      // reload the catalogue file if it is actually missing.
    }
  }
  return catalogues;
}

/** Frequent enough that an accidental close loses little, infrequent enough
 * to stay off the profiler for graphs of the size this app targets. */
const AUTOSAVE_INTERVAL_MS = 30_000;
const RESTORED_AUTOSAVE_NOTICE = 'Restored unsaved work from the last session.';

/** An autosave snapshot left over from a session that never hit explicit
 * Save takes priority over the usual startup document — recovery from an
 * accidental close should not require a prompt to get back to work. A
 * corrupted snapshot falls back to the usual default silently; there is
 * nothing a student could do about a bad cache entry except lose the session
 * to a dialog explaining it. */
function startupDocument(): { readonly document: GraphDocument; readonly restored: boolean } {
  const snapshot = loadAutosaveSnapshot();
  if (snapshot !== undefined) {
    try {
      return { document: loadDocument(snapshot.text), restored: true };
    } catch {
      // Falls through to the default document below.
    }
  }
  return {
    document: padPressure([baseCatalogue()]) ?? emptyDocument('untitled', 'Untitled'),
    restored: false,
  };
}

/**
 * `AppShell` needs `useReactFlow()` (an open-canvas location for a section
 * spawned with nothing selected), which only works inside a
 * `<ReactFlowProvider>` — so this wrapper exists purely to be the parent that
 * renders one around it.
 */
export function App(): ReactElement {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  );
}

function AppShell(): ReactElement {
  const flow = useReactFlow();
  const [catalogues, setCatalogues] = useState<readonly Catalogue[]>(initialCatalogues);
  const [userEquations, setUserEquationsState] = useState<readonly UserEquation[]>(loadStoredUserEquations);
  const setUserEquations = (update: (current: readonly UserEquation[]) => readonly UserEquation[]): void =>
    setUserEquationsState((current) => {
      const next = update(current);
      storeUserEquations(next);
      return next;
    });
  const [{ document: initialDocument, restored: restoredAutosave }] = useState(startupDocument);
  const [history, setHistory] = useState<History<GraphDocument>>(() => initHistory(initialDocument));
  const document = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const edit = (change: (current: GraphDocument) => GraphDocument): void =>
    setHistory((current) => pushEdit(current, change));
  const editLive = (change: (current: GraphDocument) => GraphDocument): void =>
    setHistory((current) => pushLiveEdit(current, change));
  const commitEdit = (): void => setHistory((current) => commitPending(current));
  const undo = (): void => setHistory(undoHistory);
  const redo = (): void => setHistory(redoHistory);
  // The serialized text of the document the last time it was known to be
  // safe to walk away from — right after an explicit Save, or right after
  // loading something new (whatever just loaded is by definition not
  // unsaved yet). `undefined` while a restored autosave hasn't been saved
  // to a file at all, so it reads as dirty from the very first render
  // rather than only once it's edited again.
  const [savedSnapshot, setSavedSnapshot] = useState<string | undefined>(() =>
    restoredAutosave ? undefined : saveDocument(initialDocument),
  );
  const isDirty = savedSnapshot === undefined || saveDocument(document) !== savedSnapshot;
  // Loading a different document (open file, a sample) starts a fresh undo
  // history — there is nothing to gain from undoing back into a document
  // that is no longer open, same as most editors treat "open a file". It
  // also resets the dirty baseline (what just loaded is the new "saved"
  // state until it's edited again) and asks the canvas to re-fit: the
  // `fitView` prop on `<ReactFlow>` (`Canvas.tsx`) only ever fires once, on
  // mount, so swapping in a different document leaves whatever pan/zoom was
  // already on screen — opening a sample (or the tutorial) into a distant or
  // zoomed-in viewport can land on an empty patch of canvas with nothing
  // visible.
  const resetDocument = (next: GraphDocument): void => {
    setHistory(initHistory(next));
    setSavedSnapshot(saveDocument(next));
    setFitRequest((current) => current + 1);
  };
  const [fitRequest, setFitRequest] = useState(0);
  useEffect(() => {
    // 0 is the initial value, already covered by `<ReactFlow fitView>`'s own
    // on-mount fit — only re-fit for a `resetDocument` that happens after.
    if (fitRequest === 0) return;
    // A newly swapped-in node list is measured by React Flow asynchronously
    // after this render commits; fitting a frame later gives it that tick
    // rather than fitting to stale (or zero-size) node bounds.
    const frame = requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, flow]);
  // Guards anything that calls `resetDocument` behind a confirmation once
  // there's something to lose — New, Open, a recent document, a sample, the
  // tutorial. Runs the action immediately when the graph is already clean.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | undefined>(undefined);
  const guardDiscard = (action: () => void): void => {
    if (isDirty) setPendingDiscard(() => action);
    else action();
  };
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<ReadonlySet<string>>(new Set());
  const [showPalette, setShowPalette] = useState(true);
  const [showNotebook, setShowNotebook] = useState(true);
  const [showCanvasControls, setShowCanvasControls] = useState(true);
  const [numberFormat, setNumberFormatState] = useState<NumberFormatSettings>(loadNumberFormatSettings);
  const [minimapVisible, setMinimapVisibleState] = useState<boolean>(loadMinimapVisible);
  const [titleMathRendering, setTitleMathRenderingState] = useState<boolean>(loadTitleMathRendering);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(loadThemePreference);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    window.document.title = `NodeBook|${document.title}`;
  }, [document.title]);
  // Only offers itself unprompted on the document it was actually written
  // for: a restored autosave is somebody's own graph, not the pad-pressure
  // sample the script's steps assume. Launching it from the Help menu still
  // works on any document — it loads the sample first (see `helpMenuItems`).
  const [tutorialActive, setTutorialActive] = useState(() => !restoredAutosave && !loadTutorialSeen());
  const [openMenu, setOpenMenu] = useState<
    | { readonly menu: 'file' | 'edit' | 'view' | 'help'; readonly x: number; readonly y: number }
    | undefined
  >(undefined);
  // The cursor crossing the gap between a ribbon button and its dropdown
  // leaves both for a moment; closing on that instant (rather than on a
  // short delay) is the "I hate this in other GUIs" behaviour ROADMAP.md
  // flagged, so a pending close can be cancelled if the cursor lands back on
  // the button row or the dropdown before the delay elapses.
  const closeMenuTimeout = useRef<number | undefined>(undefined);
  const cancelMenuClose = (): void => {
    if (closeMenuTimeout.current !== undefined) {
      window.clearTimeout(closeMenuTimeout.current);
      closeMenuTimeout.current = undefined;
    }
  };
  const scheduleMenuClose = (): void => {
    cancelMenuClose();
    closeMenuTimeout.current = window.setTimeout(() => setOpenMenu(undefined), 300);
  };
  useEffect(() => cancelMenuClose, []);
  const [paletteWidth, resizePalette] = useResizableWidth(360, 200, 480, 1);
  const [notebookWidth, resizeNotebook] = useResizableWidth(540, 240, 800, -1);
  const [restoredAutosaveNoticeId] = useState(() =>
    restoredAutosave ? crypto.randomUUID() : undefined,
  );
  const [notices, setNotices] = useState<readonly { readonly id: string; readonly message: string }[]>(() =>
    restoredAutosaveNoticeId === undefined
      ? []
      : [{ id: restoredAutosaveNoticeId, message: RESTORED_AUTOSAVE_NOTICE }],
  );
  const dismissNotice = (id: string): void =>
    setNotices((current) => current.filter((notice) => notice.id !== id));

  /** A notice joins the stack rather than replacing it, and clears itself. */
  const pushNotice = (message: string): void => {
    const id = crypto.randomUUID();
    setNotices((current) => [...current, { id, message }]);
    window.setTimeout(() => dismissNotice(id), 6000);
  };

  // A ref rather than a `document` dependency: restarting the interval on
  // every edit would autosave far more often than the interval implies, for
  // no benefit — the ref just needs to read whatever is current when the
  // timer (or unload) fires.
  const documentRef = useRef(document);
  documentRef.current = document;

  useEffect(() => {
    const snapshot = (): void => saveAutosaveSnapshot(saveDocument(documentRef.current));
    const interval = window.setInterval(snapshot, AUTOSAVE_INTERVAL_MS);
    window.addEventListener('beforeunload', snapshot);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', snapshot);
    };
  }, []);

  // The restore notice is seeded into state above rather than appended here:
  // StrictMode may remount the component in development, and an append-only
  // mount effect can otherwise create the same notice twice. This effect only
  // owns its auto-dismiss timer and cleans up StrictMode's first pass.
  useEffect(() => {
    if (restoredAutosaveNoticeId === undefined) return;
    const timeout = window.setTimeout(() => dismissNotice(restoredAutosaveNoticeId), 6000);
    return () => window.clearTimeout(timeout);
  }, [restoredAutosaveNoticeId]);

  const setNumberFormat = (next: NumberFormatSettings): void => {
    setNumberFormatState(next);
    saveNumberFormatSettings(next);
  };

  const setMinimapVisible = (next: boolean): void => {
    setMinimapVisibleState(next);
    saveMinimapVisible(next);
  };

  const setTitleMathRendering = (next: boolean): void => {
    setTitleMathRenderingState(next);
    saveTitleMathRendering(next);
  };

  const setThemePreference = (next: ThemePreference): void => {
    setThemePreferenceState(next);
    saveThemePreference(next);
  };

  // `system` defers entirely to the OS via the CSS media query in
  // styles.css; an explicit choice is the only thing that needs a DOM hook,
  // so `data-theme` is absent rather than set to 'system'.
  useEffect(() => {
    if (themePreference === 'system') delete window.document.documentElement.dataset.theme;
    else window.document.documentElement.dataset.theme = themePreference;
  }, [themePreference]);

  const settingsContext = useMemo(
    () => ({
      numberFormat,
      setNumberFormat,
      minimapVisible,
      setMinimapVisible,
      titleMathRendering,
      setTitleMathRendering,
      themePreference,
      setThemePreference,
    }),
    [numberFormat, minimapVisible, titleMathRendering, themePreference],
  );

  const analysis = useMemo(() => analyse(document, catalogues), [document, catalogues]);

  // The first global keyboard shortcut in the app — Backspace/Delete is
  // React Flow's own `deleteKeyCode`, kept out of text fields by
  // `fields.tsx`'s `stopPropagation`. The notebook's two textareas and this
  // title input don't do that, so the guard against firing mid-typing has to
  // check the event target itself rather than lean on that pattern.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const context = useMemo(
    () => ({
      document,
      catalogues,
      userEquations,
      saveUserEquation: (label: string, expression: string) =>
        setUserEquations((current) => {
          const existing = current.find((equation) => equation.label === label);
          const saved = { id: existing?.id ?? equationId(label, current), label, expression };
          return existing === undefined
            ? [...current, saved]
            : current.map((equation) => (equation.id === existing.id ? saved : equation));
        }),
      removeUserEquation: (id: string) =>
        setUserEquations((current) => current.filter((equation) => equation.id !== id)),
      analysis,
      edit,
      editLive,
      commitEdit,
      pinned,
      togglePin: (id: string) =>
        setPinned((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      selected,
      setSelected,
      hovered,
      setHovered,
    }),
    [analysis, catalogues, document, userEquations, pinned, selected, hovered],
  );

  const beltAvailable = provides(catalogues, BELT_LAB_FORMULAS);
  const cantileverAvailable = provides(catalogues, CANTILEVER_FORMULAS);

  const loadCatalogueFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      const loaded = loadCatalogue(file.text);
      setCatalogues((current) => withCatalogue(current, loaded));
      cacheCatalogue(loaded.id, file.text);
      pushNotice(`Loaded ${loaded.name} — ${loaded.formulas.length} formulas.`);
    } catch (error) {
      pushNotice(`That file is not a catalogue: ${messageOf(error)}`);
    }
  };

  const importUserEquationFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      const loaded = parseUserEquations(file.text);
      setUserEquations((current) => {
        const incoming = new Map(loaded.map((equation) => [equation.id, equation]));
        return [...current.filter((equation) => !incoming.has(equation.id)), ...loaded];
      });
      pushNotice(`Imported ${loaded.length} saved equation${loaded.length === 1 ? '' : 's'}.`);
    } catch (error) {
      pushNotice(`That file is not a user-equation library: ${messageOf(error)}`);
    }
  };

  const openDocumentFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      const loaded = loadDocument(file.text);
      resetDocument(loaded);
      recordRecentDocument(loaded);
      clearAutosaveSnapshot();
    } catch (error) {
      pushNotice(`That file is not a graph: ${messageOf(error)}`);
    }
  };

  const newDocument = (): void => {
    resetDocument(emptyDocument('untitled', 'Untitled'));
    clearAutosaveSnapshot();
  };

  const openRecentDocument = (recent: RecentDocument): void => {
    try {
      const loaded = loadDocument(recent.text);
      resetDocument(loaded);
      recordRecentDocument(loaded);
    } catch (error) {
      pushNotice(`Could not reopen "${recent.title}": ${messageOf(error)}`);
    }
  };

  const addSection = (): void => {
    const at = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    edit((current) => groupIntoSection(current, selected, at));
  };

  const arrangeGraph = (): void => {
    edit((current) => autoArrange(current));
  };

  // Open/save belong in a conventional File/Edit/View/Help ribbon, top-left
  // (docs/UX-SPEC.md) — not wherever the individual actions used to live.
  // Recent is read fresh on every render rather than kept in its own state:
  // the list only changes as a side effect of actions that already trigger a
  // re-render (Open, Save, picking a recent entry), so there is nothing an
  // extra state variable would keep in sync that a plain read doesn't.
  const recentDocuments = loadRecentDocuments();
  const fileMenuItems: readonly MenuItem[] = [
    { label: 'New', onClick: () => guardDiscard(newDocument) },
    { label: 'Open…', onClick: () => guardDiscard(() => void openDocumentFile()) },
    {
      label: 'Save',
      onClick: () => {
        const text = saveDocument(document);
        saveTextFile(`${document.id}.mds.json`, text);
        recordRecentDocument(document);
        clearAutosaveSnapshot();
        setSavedSnapshot(text);
      },
    },
    { heading: 'Recent' },
    ...(recentDocuments.length === 0
      ? [{ label: 'No recent documents', disabled: true, onClick: () => undefined }]
      : recentDocuments.map((recent) => ({
          label: recent.title,
          onClick: () => guardDiscard(() => openRecentDocument(recent)),
        }))),
    { label: 'Load catalogue…', onClick: () => void loadCatalogueFile() },
    { heading: 'User equations' },
    { label: 'Import equations…', onClick: () => void importUserEquationFile() },
    {
      label: 'Export equations',
      disabled: userEquations.length === 0,
      onClick: () => saveTextFile('nodebook-equations.json', saveUserEquations(userEquations)),
    },
    { label: 'Settings…', onClick: () => setShowSettings(true) },
  ];

  const editMenuItems: readonly MenuItem[] = [
    { label: 'Group into new section', onClick: addSection },
    { label: 'Auto-arrange', onClick: arrangeGraph },
    { label: 'Undo', disabled: !canUndo, onClick: undo },
    { label: 'Redo', disabled: !canRedo, onClick: redo },
  ];

  const viewMenuItems: readonly MenuItem[] = [
    { label: showPalette ? 'Hide palette' : 'Show palette', onClick: () => setShowPalette((s) => !s) },
    { label: showNotebook ? 'Hide notebook' : 'Show notebook', onClick: () => setShowNotebook((s) => !s) },
    { heading: 'Theme' },
    {
      label: 'Light',
      checked: themePreference === 'light',
      onClick: () => setThemePreference('light'),
    },
    {
      label: 'Dark',
      checked: themePreference === 'dark',
      onClick: () => setThemePreference('dark'),
    },
    {
      label: 'System',
      checked: themePreference === 'system',
      onClick: () => setThemePreference('system'),
    },
  ];

  // Every sample graph lives here rather than scattered under File — one
  // place a student (or a colleague seeing a demo) looks for "show me
  // something that already works".
  const helpMenuItems: readonly MenuItem[] = [
    {
      label: 'Documentation',
      onClick: () => {
        window.open(DOCS_BASE_URL, '_blank', 'noopener');
      },
    },
    {
      label: 'Take the tour',
      onClick: () =>
        guardDiscard(() => {
          // The script's steps are written against the pad-pressure sample
          // specifically, so launching it loads that sample first — same as
          // any other item under Examples below, and just as destructive to
          // whatever is currently on the canvas. Its notebook step has
          // nothing to point at if the panel was hidden going in.
          const sample = padPressure(catalogues);
          if (sample !== undefined) resetDocument(sample);
          setShowNotebook(true);
          setTutorialActive(true);
        }),
    },
    {
      label: showCanvasControls ? 'Hide canvas controls' : 'Show canvas controls',
      onClick: () => setShowCanvasControls((visible) => !visible),
    },
    { heading: 'Examples' },
    {
      label: 'Pad pressure sweep',
      onClick: () =>
        guardDiscard(() => {
          const sample = padPressure(catalogues);
          if (sample !== undefined) resetDocument(sample);
        }),
    },
    {
      label: 'Belt lab',
      disabled: !beltAvailable,
      onClick: () =>
        guardDiscard(() => {
          const sample = beltLab(catalogues);
          if (sample !== undefined) resetDocument(sample);
        }),
    },
    {
      label: 'Cantilever — hollow sections',
      disabled: !cantileverAvailable,
      onClick: () =>
        guardDiscard(() => {
          const sample = cantileverHollowSections(catalogues);
          if (sample !== undefined) resetDocument(sample);
        }),
    },
  ];

  const menuItemsFor = (menu: 'file' | 'edit' | 'view' | 'help'): readonly MenuItem[] =>
    menu === 'file'
      ? fileMenuItems
      : menu === 'edit'
        ? editMenuItems
        : menu === 'view'
          ? viewMenuItems
          : helpMenuItems;

  const menuButton = (menu: 'file' | 'edit' | 'view' | 'help', label: string): ReactElement => (
    <button
      type="button"
      className={`menu-button${openMenu?.menu === menu ? ' open' : ''}`}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setOpenMenu((current) =>
          current?.menu === menu ? undefined : { menu, x: rect.left, y: rect.bottom },
        );
      }}
      onMouseEnter={(event) => {
        cancelMenuClose();
        // Once one ribbon menu is open, hovering another button switches
        // straight to it — the conventional ribbon behaviour — without
        // waiting for a click.
        if (openMenu !== undefined && openMenu.menu !== menu) {
          const rect = event.currentTarget.getBoundingClientRect();
          setOpenMenu({ menu, x: rect.left, y: rect.bottom });
        }
      }}
    >
      {label}
    </button>
  );

  const localVersionSuffix = window.location.hostname === 'localhost' ? ' (local)' : '';

  return (
    <SettingsContext.Provider value={settingsContext}>
      <GraphContext.Provider value={context}>
        {/* Right-click opens an app menu wherever one is wired up (Canvas,
            Notebook); everywhere else it should do nothing rather than fall
            through to the browser's own menu, which offers nothing useful over
            a canvas. */}
        <div className="app" onContextMenu={(event) => event.preventDefault()}>
          <header className="menubar" onMouseEnter={cancelMenuClose} onMouseLeave={scheduleMenuClose}>
            {menuButton('file', 'File')}
            {menuButton('edit', 'Edit')}
            {menuButton('view', 'View')}
            {menuButton('help', 'Help')}

            <div className="menubar-meta">
              <span className="menubar-product">NodeBook</span>

              {/* v0.x is unstable by semver convention — the badge names that
                  explicitly rather than relying on a reader knowing the
                  convention, and drops away on its own once a 1.0 ships. */}
              <span
                className={`menubar-version${__APP_VERSION__.startsWith('0.') ? ' alpha' : ''}`}
                title={`machine-design-studio v${__APP_VERSION__}${localVersionSuffix}`}
              >
                {__APP_VERSION__.startsWith('0.') ? 'alpha · ' : ''}v{__APP_VERSION__}
                {localVersionSuffix}
              </span>

              {/* Students are the target audience and mostly don't know what a
                  GitHub issue is, so the guidance spells out email as the first
                  option rather than assuming familiarity with issue trackers. */}
              <span className="menubar-feedback">
                Feedback:{' '}
                <a href="mailto:thomas.van.riel@gmail.com?subject=machine-design-studio%20feedback">
                  email
                </a>{' '}
                or{' '}
                <a
                  href="https://github.com/ThomasVanRiel/machine-design-studio/issues/new"
                  target="_blank"
                  rel="noopener"
                >
                  open an issue
                </a>
              </span>

              <a
                className="menubar-github"
                href="https://github.com/ThomasVanRiel/machine-design-studio"
                target="_blank"
                rel="noopener"
                aria-label="NodeBook repository on GitHub"
                title="View the NodeBook repository on GitHub"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.17c.98 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"
                  />
                </svg>
              </a>
            </div>
          </header>
          {openMenu === undefined ? null : (
            <ContextMenu
              x={openMenu.x}
              y={openMenu.y}
              items={menuItemsFor(openMenu.menu)}
              onClose={() => setOpenMenu(undefined)}
              onMouseEnter={cancelMenuClose}
              onMouseLeave={scheduleMenuClose}
            />
          )}

          <main>
            {/* Overlays the workspace instead of sitting in normal flow, so
                showing or dismissing one does not shift the canvas (docs/UX-SPEC.md:
                messages must overlay, not push other UI down). Stacks rather than
                replacing, and each clears itself after a delay. */}
            {notices.length === 0 ? null : (
              <div className="notices">
                {notices.map((notice) => (
                  <div key={notice.id} className="notice" role="status">
                    {notice.message}
                    <button type="button" onClick={() => dismissNotice(notice.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showPalette ? (
              <>
                <aside className="left" style={{ width: paletteWidth, flexBasis: paletteWidth }}>
                  <Palette />
                </aside>
                <div className="resize-handle" onMouseDown={resizePalette} />
              </>
            ) : null}

            <Canvas controlsVisible={showCanvasControls} />

            {showNotebook ? (
              <>
                <div className="resize-handle" onMouseDown={resizeNotebook} />
                <aside
                  className="right"
                  data-tour="notebook"
                  style={{ width: notebookWidth, flexBasis: notebookWidth }}
                >
                  <Notebook />
                </aside>
              </>
            ) : null}
          </main>

          {showSettings ? (
            <SettingsDialog
              settings={numberFormat}
              onChange={setNumberFormat}
              minimapVisible={minimapVisible}
              onMinimapVisibleChange={setMinimapVisible}
              titleMathRendering={titleMathRendering}
              onTitleMathRenderingChange={setTitleMathRendering}
              onClose={() => setShowSettings(false)}
            />
          ) : null}

          <Tutorial
            active={tutorialActive}
            onClose={() => setTutorialActive(false)}
            pinned={pinned}
            setPinned={setPinned}
          />

          {pendingDiscard === undefined ? null : (
            <ConfirmDialog
              message="Discard the current graph? Unsaved changes will be lost."
              onConfirm={() => {
                const action = pendingDiscard;
                setPendingDiscard(undefined);
                action();
              }}
              onCancel={() => setPendingDiscard(undefined)}
            />
          )}
        </div>
      </GraphContext.Provider>
    </SettingsContext.Provider>
  );
}

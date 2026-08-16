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

import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
import { GraphContext } from './graph-context';
import { SettingsContext } from './settings-context';
import { cacheCatalogue, cachedCatalogueTexts } from './io/catalogueCache';
import { openTextFile, saveTextFile } from './io/files';
import { analyse } from './model/analysis';
import { basicMechanicsCatalogue, baseCatalogue, withCatalogue } from './model/catalogues';
import { groupIntoSection } from './model/document';
import {
  loadMinimapVisible,
  loadThemePreference,
  saveMinimapVisible,
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
import { useResizableWidth } from './useResizableWidth';

/**
 * The base catalogue, the bundled public catalogue, and whatever was cached
 * from a previous session. Base nodes and the public catalogue both ship
 * `restricted: false` — neither needs a student to import it by hand the way
 * an R&M catalogue does, so both are always present.
 */
function initialCatalogues(): readonly Catalogue[] {
  let catalogues: readonly Catalogue[] = [baseCatalogue(), basicMechanicsCatalogue()];
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
  const [history, setHistory] = useState<History<GraphDocument>>(() =>
    initHistory(padPressure([baseCatalogue()]) ?? emptyDocument('untitled', 'Untitled')),
  );
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
  // Loading a different document (open file, a sample) starts a fresh undo
  // history — there is nothing to gain from undoing back into a document
  // that is no longer open, same as most editors treat "open a file".
  const resetDocument = (next: GraphDocument): void => setHistory(initHistory(next));
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [showPalette, setShowPalette] = useState(true);
  const [showNotebook, setShowNotebook] = useState(true);
  const [numberFormat, setNumberFormatState] = useState<NumberFormatSettings>(loadNumberFormatSettings);
  const [minimapVisible, setMinimapVisibleState] = useState<boolean>(loadMinimapVisible);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(loadThemePreference);
  const [showSettings, setShowSettings] = useState(false);
  const [openMenu, setOpenMenu] = useState<
    | { readonly menu: 'file' | 'edit' | 'view' | 'help'; readonly x: number; readonly y: number }
    | undefined
  >(undefined);
  const [paletteWidth, resizePalette] = useResizableWidth(320, 200, 480, 1);
  const [notebookWidth, resizeNotebook] = useResizableWidth(540, 240, 800, -1);
  const [notices, setNotices] = useState<readonly { readonly id: string; readonly message: string }[]>(
    [],
  );

  const dismissNotice = (id: string): void =>
    setNotices((current) => current.filter((notice) => notice.id !== id));

  /** A notice joins the stack rather than replacing it, and clears itself. */
  const pushNotice = (message: string): void => {
    const id = crypto.randomUUID();
    setNotices((current) => [...current, { id, message }]);
    window.setTimeout(() => dismissNotice(id), 6000);
  };

  const setNumberFormat = (next: NumberFormatSettings): void => {
    setNumberFormatState(next);
    saveNumberFormatSettings(next);
  };

  const setMinimapVisible = (next: boolean): void => {
    setMinimapVisibleState(next);
    saveMinimapVisible(next);
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
      themePreference,
      setThemePreference,
    }),
    [numberFormat, minimapVisible, themePreference],
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
    }),
    [analysis, catalogues, document, pinned, selected],
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

  const openDocumentFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      resetDocument(loadDocument(file.text));
    } catch (error) {
      pushNotice(`That file is not a graph: ${messageOf(error)}`);
    }
  };

  const addSection = (): void => {
    const at = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    edit((current) => groupIntoSection(current, selected, at));
  };

  // Open/save belong in a conventional File/Edit/View/Help ribbon, top-left
  // (docs/UX-SPEC.md) — not wherever the individual actions used to live.
  const fileMenuItems: readonly MenuItem[] = [
    { label: 'Open…', onClick: () => void openDocumentFile() },
    { label: 'Save', onClick: () => saveTextFile(`${document.id}.mds.json`, saveDocument(document)) },
    { label: 'Load catalogue…', onClick: () => void loadCatalogueFile() },
    { label: 'Settings…', onClick: () => setShowSettings(true) },
  ];

  const editMenuItems: readonly MenuItem[] = [
    { label: 'Group into new section', onClick: addSection },
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
    { heading: 'Examples' },
    {
      label: 'Pad pressure sweep',
      onClick: () => {
        const sample = padPressure(catalogues);
        if (sample !== undefined) resetDocument(sample);
      },
    },
    {
      label: 'Belt lab',
      disabled: !beltAvailable,
      onClick: () => {
        const sample = beltLab(catalogues);
        if (sample !== undefined) resetDocument(sample);
      },
    },
    {
      label: 'Cantilever — hollow sections',
      disabled: !cantileverAvailable,
      onClick: () => {
        const sample = cantileverHollowSections(catalogues);
        if (sample !== undefined) resetDocument(sample);
      },
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
    >
      {label}
    </button>
  );

  return (
    <SettingsContext.Provider value={settingsContext}>
      <GraphContext.Provider value={context}>
        {/* Right-click opens an app menu wherever one is wired up (Canvas,
            Notebook); everywhere else it should do nothing rather than fall
            through to the browser's own menu, which offers nothing useful over
            a canvas. */}
        <div className="app" onContextMenu={(event) => event.preventDefault()}>
          <header className="menubar">
            {menuButton('file', 'File')}
            {menuButton('edit', 'Edit')}
            {menuButton('view', 'View')}
            {menuButton('help', 'Help')}

            {/* v0.x is unstable by semver convention — the badge names that
                explicitly rather than relying on a reader knowing the
                convention, and drops away on its own once a 1.0 ships. */}
            <span
              className={`menubar-version${__APP_VERSION__.startsWith('0.') ? ' alpha' : ''}`}
              title={`machine-design-studio v${__APP_VERSION__}`}
            >
              {__APP_VERSION__.startsWith('0.') ? 'alpha · ' : ''}v{__APP_VERSION__}
            </span>
          </header>
          {openMenu === undefined ? null : (
            <ContextMenu
              x={openMenu.x}
              y={openMenu.y}
              items={menuItemsFor(openMenu.menu)}
              onClose={() => setOpenMenu(undefined)}
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

            <Canvas />

            {showNotebook ? (
              <>
                <div className="resize-handle" onMouseDown={resizeNotebook} />
                <aside className="right" style={{ width: notebookWidth, flexBasis: notebookWidth }}>
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
              onClose={() => setShowSettings(false)}
            />
          ) : null}
        </div>
      </GraphContext.Provider>
    </SettingsContext.Provider>
  );
}

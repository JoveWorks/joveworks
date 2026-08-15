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

import { useMemo, useState, type ReactElement } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

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
import { frameAround, reframe, uniqueId } from './model/document';
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

export function App(): ReactElement {
  const [catalogues, setCatalogues] = useState<readonly Catalogue[]>(initialCatalogues);
  const [document, setDocument] = useState<GraphDocument>(
    () => padPressure([baseCatalogue()]) ?? emptyDocument('untitled', 'Untitled'),
  );
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [showPalette, setShowPalette] = useState(true);
  const [showNotebook, setShowNotebook] = useState(true);
  const [numberFormat, setNumberFormatState] = useState<NumberFormatSettings>(loadNumberFormatSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [openMenu, setOpenMenu] = useState<
    | { readonly menu: 'file' | 'edit' | 'view' | 'help'; readonly x: number; readonly y: number }
    | undefined
  >(undefined);
  const [paletteWidth, resizePalette] = useResizableWidth(300, 200, 480, 1);
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

  const settingsContext = useMemo(
    () => ({ numberFormat, setNumberFormat }),
    [numberFormat],
  );

  const analysis = useMemo(() => analyse(document, catalogues), [document, catalogues]);

  const context = useMemo(
    () => ({
      document,
      catalogues,
      analysis,
      edit: (change: (current: GraphDocument) => GraphDocument) => setDocument(change),
      pinned,
      togglePin: (id: string) =>
        setPinned((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [analysis, catalogues, document, pinned],
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
      setDocument(loadDocument(file.text));
    } catch (error) {
      pushNotice(`That file is not a graph: ${messageOf(error)}`);
    }
  };

  const addSection = (): void =>
    setDocument((current) => {
      const inside = current.nodes.filter((node) => node.frameId === undefined);
      if (inside.length === 0) {
        pushNotice('Every node is already in a section.');
        return current;
      }
      const id = uniqueId(current, 'section');
      const frame = frameAround(id, 'New section', inside);
      return reframe({ ...current, frames: [...current.frames, frame] });
    });

  // Open/save belong in a conventional File/Edit/View/Help ribbon, top-left
  // (UX-SPEC.md) — not wherever the individual actions used to live.
  const fileMenuItems: readonly MenuItem[] = [
    { label: 'Open…', onClick: () => void openDocumentFile() },
    { label: 'Save', onClick: () => saveTextFile(`${document.id}.mds.json`, saveDocument(document)) },
    { label: 'Load catalogue…', onClick: () => void loadCatalogueFile() },
  ];

  const editMenuItems: readonly MenuItem[] = [
    { label: 'Group into new section', onClick: addSection },
    { label: 'Settings…', onClick: () => setShowSettings(true) },
  ];

  const viewMenuItems: readonly MenuItem[] = [
    { label: showPalette ? 'Hide palette' : 'Show palette', onClick: () => setShowPalette((s) => !s) },
    { label: showNotebook ? 'Hide notebook' : 'Show notebook', onClick: () => setShowNotebook((s) => !s) },
  ];

  // Every sample graph lives here rather than scattered under File — one
  // place a student (or a colleague seeing a demo) looks for "show me
  // something that already works".
  const helpMenuItems: readonly MenuItem[] = [
    { label: 'Examples', disabled: true, onClick: () => {} },
    {
      label: 'Pad pressure sweep',
      onClick: () => {
        const sample = padPressure(catalogues);
        if (sample !== undefined) setDocument(sample);
      },
    },
    {
      label: 'Belt lab',
      disabled: !beltAvailable,
      onClick: () => {
        const sample = beltLab(catalogues);
        if (sample !== undefined) setDocument(sample);
      },
    },
    {
      label: 'Cantilever — hollow sections',
      disabled: !cantileverAvailable,
      onClick: () => {
        const sample = cantileverHollowSections(catalogues);
        if (sample !== undefined) setDocument(sample);
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
        <ReactFlowProvider>
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

              <input
                className="document-title"
                value={document.title}
                onChange={(event) =>
                  setDocument((current) => ({ ...current, title: event.target.value }))
                }
              />
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
                  showing or dismissing one does not shift the canvas (UX-SPEC.md:
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
                onClose={() => setShowSettings(false)}
              />
            ) : null}
          </div>
        </ReactFlowProvider>
      </GraphContext.Provider>
    </SettingsContext.Provider>
  );
}

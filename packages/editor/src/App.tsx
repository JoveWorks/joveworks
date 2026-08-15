/**
 * Three columns, and the canvas is always the middle one (S46).
 *
 * Both side panels collapse, because a node editor wants horizontal room, and
 * there is **no properties panel** — values, units and ranges are edited on the
 * node, or the canvas would show a diagram while the real work happened beside
 * it.
 *
 * This component owns the two pieces of state everything else reads: the
 * document, and the catalogues loaded against it. The kernel is re-run on every
 * change, which is affordable because a graph is tens of nodes and because it is
 * the only way connect time and evaluation time cannot drift apart (S64).
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
import { GraphContext } from './graph-context';
import { openTextFile, saveTextFile } from './io/files';
import { analyse } from './model/analysis';
import { baseCatalogue, withCatalogue } from './model/catalogues';
import { frameAround, reframe, uniqueId } from './model/document';
import { messageOf } from './model/quantity';
import { BELT_LAB_FORMULAS, beltLab, padPressure, provides } from './model/samples';
import { Notebook } from './notebook/Notebook';
import { Palette } from './palette/Palette';

export function App(): ReactElement {
  const [catalogues, setCatalogues] = useState<readonly Catalogue[]>(() => [baseCatalogue()]);
  const [document, setDocument] = useState<GraphDocument>(
    () => padPressure([baseCatalogue()]) ?? emptyDocument('untitled', 'Untitled'),
  );
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [showPalette, setShowPalette] = useState(true);
  const [showNotebook, setShowNotebook] = useState(true);
  const [notice, setNotice] = useState<string | undefined>(undefined);

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

  const loadCatalogueFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      const loaded = loadCatalogue(file.text);
      setCatalogues((current) => withCatalogue(current, loaded));
      setNotice(`Loaded ${loaded.name} — ${loaded.formulas.length} formulas.`);
    } catch (error) {
      setNotice(`That file is not a catalogue: ${messageOf(error)}`);
    }
  };

  const openDocumentFile = async (): Promise<void> => {
    const file = await openTextFile();
    if (file === undefined) return;
    try {
      setDocument(loadDocument(file.text));
      setNotice(undefined);
    } catch (error) {
      setNotice(`That file is not a graph: ${messageOf(error)}`);
    }
  };

  const addSection = (): void =>
    setDocument((current) => {
      const inside = current.nodes.filter((node) => node.frameId === undefined);
      if (inside.length === 0) {
        setNotice('Every node is already in a section.');
        return current;
      }
      const id = uniqueId(current, 'section');
      const frame = frameAround(id, 'New section', inside);
      return reframe({ ...current, frames: [...current.frames, frame] });
    });

  return (
    <GraphContext.Provider value={context}>
      <ReactFlowProvider>
        <div className="app">
          <header className="toolbar">
            <button
              type="button"
              className="toggle"
              onClick={() => setShowPalette((shown) => !shown)}
              title="Show or hide the palette"
            >
              {showPalette ? '◂' : '▸'} palette
            </button>

            <input
              className="document-title"
              value={document.title}
              onChange={(event) =>
                setDocument((current) => ({ ...current, title: event.target.value }))
              }
            />

            <div className="actions">
              <button type="button" onClick={() => void openDocumentFile()}>
                open
              </button>
              <button
                type="button"
                onClick={() => saveTextFile(`${document.id}.mds.json`, saveDocument(document))}
              >
                save
              </button>
              <button type="button" onClick={() => void loadCatalogueFile()}>
                load catalogue
              </button>
              <button type="button" onClick={addSection}>
                + section
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample = padPressure(catalogues);
                  if (sample !== undefined) setDocument(sample);
                }}
              >
                pad sweep
              </button>
              <button
                type="button"
                disabled={!beltAvailable}
                title={
                  beltAvailable
                    ? 'The belt lab, whose golden values are the milestone 1 acceptance criterion'
                    : 'The belt lab needs its catalogue — load it first (S23/S45)'
                }
                onClick={() => {
                  const sample = beltLab(catalogues);
                  if (sample !== undefined) setDocument(sample);
                }}
              >
                belt lab
              </button>
            </div>

            <button
              type="button"
              className="toggle"
              onClick={() => setShowNotebook((shown) => !shown)}
              title="Show or hide the notebook"
            >
              notebook {showNotebook ? '▸' : '◂'}
            </button>
          </header>

          {notice === undefined ? null : (
            <div className="notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice(undefined)}>
                ✕
              </button>
            </div>
          )}

          <main>
            {showPalette ? (
              <aside className="left">
                <Palette />
              </aside>
            ) : null}

            <Canvas />

            {showNotebook ? (
              <aside className="right">
                <Notebook />
              </aside>
            ) : null}
          </main>
        </div>
      </ReactFlowProvider>
    </GraphContext.Provider>
  );
}

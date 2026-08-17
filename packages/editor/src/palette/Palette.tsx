/**
 * The palette: every formula the loaded catalogues carry, plus the document-
 * schema node kinds that aren't formulas at all — Input and Output, each its
 * own header with a shortcut per starting kind (the kind stays switchable on
 * the node afterward; the shortcut only saves the first click). `compare`
 * and `equation` (a closure node) aren't formulas either, but each reads as
 * an operation by shape, so they live with routing nodes in the domain-free
 * General section rather than pretending to be catalogue formulas.
 *
 * A student finds a formula by equation number or by what it computes, so the
 * search reads ids, citations, descriptions and port names alike. Quarantined
 * records are listed, marked, and can still be dragged in: quarantine is
 * **visible and not silently usable**, which is a different thing from hidden —
 * the node lands on the canvas and says why it cannot be evaluated.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useReactFlow } from '@xyflow/react';

import { parseUnit, type Unit } from '@joveworks/units';
import {
  localize,
  axes as documentAxes,
  formulaRef,
  type Formula,
  type Output,
  type Position,
  type ValueSpec,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { addNode, uniqueId } from '../model/document';
import { entries, search, type PaletteEntry } from '../model/catalogues';
import { loadFavourites, saveFavourites } from '../model/palettePreferences';
import { converted } from '../canvas/ValueEditor';
import { ContextMenu } from '../canvas/ContextMenu';
import { DOCS_BASE_URL } from '../help-links';
import { Symbol } from '../Symbol';

/** The keys the two document-schema headers — Input, Output — collapse under; neither is a catalogue id. */
const INPUT = '__input__';
const OUTPUT = '__output__';
const GENERAL = '__general__';
const USER = '__user__';
const FAVOURITES = '__favourites__';

/** An input's starting kind, built off a plain `1`, matching `ValueKindSelect`'s own conversion. */
function seedValue(kind: 'scalar' | 'linear' | 'list', unit: Unit): ValueSpec {
  return converted({ kind: 'scalar', value: 1, unit }, kind);
}

/** Where a node dropped from the palette lands: the middle of what you can see. */
function useDropPosition(): () => Position {
  const flow = useReactFlow();
  return () => {
    const centre = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const { x, y } = flow.screenToFlowPosition(centre);
    // A small cascade so successive additions do not stack exactly.
    const jitter = (Math.random() - 0.5) * 60;
    return { x: Math.round(x + jitter), y: Math.round(y + jitter) };
  };
}

export function Palette(): ReactElement {
  const { document, catalogues, userEquations, removeUserEquation, edit } = useGraph();
  const { locale } = useSettings();
  const [query, setQuery] = useState('');
  // Session UI state, not a document field — reopens on reload, same
  // precedent as a node's pin state. Which sections are open changes nothing
  // about what the graph is. Search ignores this and always shows a match.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [favourites, setFavouritesState] = useState<ReadonlySet<string>>(loadFavourites);
  const [menu, setMenu] = useState<
    | { readonly entry: PaletteEntry; readonly x: number; readonly y: number }
    | { readonly userEquationId: string; readonly x: number; readonly y: number }
    | undefined
  >();
  const setFavourites = (update: (current: ReadonlySet<string>) => ReadonlySet<string>): void =>
    setFavouritesState((current) => {
      const next = update(current);
      saveFavourites(next);
      return next;
    });
  const position = useDropPosition();

  const toggleCollapsed = (catalogueId: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(catalogueId)) next.delete(catalogueId);
      else next.add(catalogueId);
      return next;
    });
  const inputCollapsed = collapsed.has(INPUT);
  const outputCollapsed = collapsed.has(OUTPUT);

  const all = useMemo(() => entries(catalogues), [catalogues]);
  const found = useMemo(() => search(all, query, locale), [all, query, locale]);

  const grouped = useMemo(() => {
    const byCatalogue = new Map<string, PaletteEntry[]>();
    for (const entry of found) {
      const list = byCatalogue.get(entry.catalogue.id);
      if (list === undefined) byCatalogue.set(entry.catalogue.id, [entry]);
      else list.push(entry);
    }
    return [...byCatalogue.entries()];
  }, [found]);
  const favouriteEntries = all.filter(({ formula }) => favourites.has(formula.id));
  const favouriteUserEquations = userEquations.filter((equation) => favourites.has(`user:${equation.id}`));

  const addFormula = (formula: Formula): void =>
    edit((current) =>
      addNode(current, {
        kind: 'formula',
        id: uniqueId(current, formula.id.replace(/[^\w.]/gu, '_')),
        formula: formulaRef(formula),
        position: position(),
      }),
    );

  const addInput = (kind: 'scalar' | 'linear' | 'list'): void =>
    edit((current) => {
      const id = uniqueId(current, 'input');
      return addNode(current, {
        kind: 'input',
        id,
        label: id,
        value: seedValue(kind, parseUnit('')),
        position: position(),
      });
    });

  const ranges = documentAxes(document);

  const addOutput = (kind: Output['kind']): void =>
    edit((current) => {
      const id = uniqueId(current, kind === 'print' ? 'result' : kind);
      const output: Output =
        kind === 'check'
          ? { kind, comparison: '>=', threshold: { value: 1, unit: parseUnit('') } }
          : kind === 'plot'
            ? { kind }
            : kind === 'table'
              ? { kind, columns: [] }
              : { kind: 'print' };
      return addNode(current, { kind: 'output', id, label: id, output, position: position() });
    });

  const addCompare = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'compare');
      return addNode(current, {
        kind: 'compare',
        id,
        label: id,
        comparison: '>=',
        threshold: { value: 1, unit: parseUnit('') },
        position: position(),
      });
    });

  const addClosure = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'equation');
      return addNode(current, { kind: 'closure', id, label: id, expression: '', position: position() });
    });

  const addUserEquation = (id: string): void => {
    const saved = userEquations.find((equation) => equation.id === id);
    if (saved === undefined) return;
    edit((current) => {
      const nodeId = uniqueId(current, saved.id);
      return addNode(current, {
        kind: 'closure', id: nodeId, label: saved.label, expression: saved.expression, position: position(),
      });
    });
  };

  const formulaEntry = (entry: PaletteEntry, keyPrefix = ''): ReactElement => {
    const { formula } = entry;
    const title = formula.label === undefined
      ? formula.citation ?? formula.id
      : localize(formula.label, locale);
    return (
      <li key={`${keyPrefix}${formula.id}`}>
        <button
          type="button"
          className={`entry ${formula.status}`}
          title={formula.status === 'quarantined' ? `Quarantined: ${formula.quarantineReason === undefined ? '' : localize(formula.quarantineReason, locale)}` : localize(formula.description, locale)}
          onClick={() => addFormula(formula)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ entry, x: event.clientX, y: event.clientY });
          }}
        >
          <span className="entry-id">{title}</span>
          <span className="entry-output"><Symbol name={formula.output.name} /></span>
          {formula.status === 'quarantined' ? <span className="entry-status">quarantined</span> : null}
        </button>
      </li>
    );
  };

  const addWaypoint = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'waypoint');
      return addNode(current, { kind: 'waypoint', id, label: id, position: position() });
    });

  const addPack = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'pack');
      return addNode(current, { kind: 'pack', id, label: id, position: position() });
    });

  const addUnpack = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'unpack');
      return addNode(current, { kind: 'unpack', id, label: id, position: position() });
    });

  return (
    <div className="palette">
      <input
        className="search"
        value={query}
        placeholder="equation number, symbol, or what it computes"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="palette-list">
        {query.trim().length === 0 && favouriteEntries.length + favouriteUserEquations.length > 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(FAVOURITES)}>
              <span className="section-toggle-title">Favourites{collapsed.has(FAVOURITES) ? ` (${favouriteEntries.length + favouriteUserEquations.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(FAVOURITES) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(FAVOURITES) ? null : <ul>
              {favouriteEntries.map((entry) => formulaEntry(entry, 'fav-'))}
              {favouriteUserEquations.map((equation) => <li key={`fav-user-${equation.id}`}><button type="button" className="entry" onClick={() => addUserEquation(equation.id)}><span className="entry-id">{equation.label}</span><span className="entry-output">saved equation</span></button></li>)}
            </ul>}
          </section>
        ) : null}
        {/* Ahead of the catalogues, not one-off toolbar buttons (docs/UX-SPEC.md):
            an input and an output are what every graph is built from and
            eventually ends in, so they read the same way a catalogue entry
            does rather than living apart from the rest of the palette. Each
            kind shortcut only sets the *starting* kind — every one of these
            is still switchable on the node afterward. */}
        {query.trim().length === 0 ? (
          <section>
            <h3>
              <button type="button" className="section-toggle" onClick={() => toggleCollapsed(INPUT)}>
                <span className="section-toggle-title">
                  Input
                  {inputCollapsed ? <span className="section-toggle-count"> (3)</span> : null}
                </span>
                <span className="chevron" aria-hidden="true">
                  {inputCollapsed ? '▸' : '▾'}
                </span>
              </button>
            </h3>
            {inputCollapsed ? null : (
              <ul>
                <li>
                  <button type="button" className="entry" onClick={() => addInput('scalar')}>
                    <span className="entry-id">value</span>
                    <span className="entry-output">a single number</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="entry" onClick={() => addInput('linear')}>
                    <span className="entry-id">range</span>
                    <span className="entry-output">swept from a start to a stop</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="entry" onClick={() => addInput('list')}>
                    <span className="entry-id">list</span>
                    <span className="entry-output">swept over hand-typed values</span>
                  </button>
                </li>
              </ul>
            )}
          </section>
        ) : null}

        {query.trim().length === 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(GENERAL)}>
              <span className="section-toggle-title">General{collapsed.has(GENERAL) ? ' (5)' : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(GENERAL) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(GENERAL) ? null : <ul>
              <li><button type="button" className="entry" onClick={addCompare}><span className="entry-id">compare</span><span className="entry-output">a wireable pass/fail verdict</span></button></li>
              <li><button type="button" className="entry" onClick={addClosure}><span className="entry-id">equation</span><span className="entry-output">type one — its ports follow from what it uses</span></button></li>
              <li><button type="button" className="entry" onClick={addWaypoint}><span className="entry-id">waypoint</span><span className="entry-output">route independent wires through one stop</span></button></li>
              <li><button type="button" className="entry" onClick={addPack}><span className="entry-id">pack</span><span className="entry-output">bundle several wires into one</span></button></li>
              <li><button type="button" className="entry" onClick={addUnpack}><span className="entry-id">unpack</span><span className="entry-output">split a bundle back into its wires</span></button></li>
            </ul>}
          </section>
        ) : null}

        {query.trim().length === 0 && userEquations.length > 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(USER)}>
              <span className="section-toggle-title">My equations{collapsed.has(USER) ? ` (${userEquations.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(USER) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(USER) ? null : <ul>{userEquations.map((equation) => <li key={equation.id}>
              <button type="button" className="entry" title={equation.expression} onClick={() => addUserEquation(equation.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ userEquationId: equation.id, x: event.clientX, y: event.clientY }); }}>
                <span className="entry-id">{equation.label}</span><span className="entry-output">saved equation</span>
              </button>
            </li>)}</ul>}
          </section>
        ) : null}

        {query.trim().length === 0 ? (
          <section>
            <h3>
              <button type="button" className="section-toggle" onClick={() => toggleCollapsed(OUTPUT)}>
                <span className="section-toggle-title">
                  Output
                  {outputCollapsed ? <span className="section-toggle-count"> (4)</span> : null}
                </span>
                <span className="chevron" aria-hidden="true">
                  {outputCollapsed ? '▸' : '▾'}
                </span>
              </button>
            </h3>
            {outputCollapsed ? null : (
              <ul>
                <li>
                  <button type="button" className="entry" onClick={() => addOutput('print')}>
                    <span className="entry-id">print</span>
                    <span className="entry-output">a value, as text</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="entry"
                    disabled={ranges.length === 0}
                    title={
                      ranges.length === 0
                        ? 'Needs a range input somewhere in the graph to plot against'
                        : undefined
                    }
                    onClick={() => addOutput('plot')}
                  >
                    <span className="entry-id">plot</span>
                    <span className="entry-output">a value over a swept range</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="entry" onClick={() => addOutput('table')}>
                    <span className="entry-id">table</span>
                    <span className="entry-output">several series as rows, one per column</span>
                  </button>
                </li>
                <li>
                  <button type="button" className="entry" onClick={() => addOutput('check')}>
                    <span className="entry-id">check</span>
                    <span className="entry-output">pass or fail against a threshold</span>
                  </button>
                </li>
              </ul>
            )}
          </section>
        ) : null}

        {grouped.map(([catalogueId, list]) => {
          const isCollapsed = query.trim().length === 0 && collapsed.has(catalogueId);
          const count = list.length;
          return (
            <section key={catalogueId}>
              <h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => toggleCollapsed(catalogueId)}
                >
                  <span className="section-toggle-title">
                    {list[0] === undefined ? catalogueId : localize(list[0].catalogue.name, locale)}
                    {list[0]?.catalogue.restricted === true ? (
                      <span className="restricted" title="Restricted content — never exported.">
                        restricted
                      </span>
                    ) : null}
                    {isCollapsed ? <span className="section-toggle-count"> ({count})</span> : null}
                  </span>
                  <span className="chevron" aria-hidden="true">
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                </button>
              </h3>
              {isCollapsed ? null : (
                <ul>
                  {list.map((entry) => formulaEntry(entry))}
                </ul>
              )}
            </section>
          );
        })}
        {found.length === 0 ? <p className="empty">Nothing matches “{query}”.</p> : null}
      </div>

      <p className="palette-footer">
        {document.nodes.length} nodes · {catalogues.length} catalogue
        {catalogues.length === 1 ? '' : 's'} loaded
      </p>
      {menu !== undefined ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={'entry' in menu ? [
            { label: 'Insert', onClick: () => addFormula(menu.entry.formula) },
            { label: 'Help', onClick: () => window.open(`${DOCS_BASE_URL}/guide/node-reference#formula`, '_blank', 'noopener') },
            { label: favourites.has(menu.entry.formula.id) ? 'Remove from favourites' : 'Add to favourites', onClick: () => setFavourites((current) => { const next = new Set(current); if (next.has(menu.entry.formula.id)) next.delete(menu.entry.formula.id); else next.add(menu.entry.formula.id); return next; }) },
          ] : [
            { label: 'Insert', onClick: () => addUserEquation(menu.userEquationId) },
            { label: favourites.has(`user:${menu.userEquationId}`) ? 'Remove from favourites' : 'Add to favourites', onClick: () => setFavourites((current) => { const key = `user:${menu.userEquationId}`; const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }) },
            { label: 'Remove from palette', danger: true, onClick: () => removeUserEquation(menu.userEquationId) },
          ]}
        />
      ) : null}
    </div>
  );
}

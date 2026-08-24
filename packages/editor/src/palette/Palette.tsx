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
import { ARRAY_CATALOGUE_ID, BASE_CATALOGUE_ID } from '@joveworks/nodes';
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
import { phrase, ui } from '../i18n';
import { addNode, defaultOutput, uniqueId } from '../model/document';
import { entries, search, type PaletteEntry } from '../model/catalogues';
import { LockedCatalogueSection } from './LockedCatalogueSection';
import { monteCarloSampleCount, monteCarloSampleLimit } from '../model/monteCarlo';
import { DEFAULT_READER } from '../files/readers';
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
const ANALYSIS = '__analysis__';

interface PaletteAction {
  /** Stable across translated labels: this is what the local preference stores. */
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly insert: () => void;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
}

type PaletteMenu =
  | { readonly entry: PaletteEntry; readonly x: number; readonly y: number }
  | { readonly userEquationId: string; readonly x: number; readonly y: number }
  | { readonly action: PaletteAction; readonly x: number; readonly y: number };

/** An input's starting kind, built off a plain `1`, matching `ValueKindSelect`'s own conversion. */
function seedValue(kind: 'scalar' | 'linear' | 'list' | 'spectrum' | 'categorical', unit: Unit): ValueSpec {
  if (kind === 'categorical') return { kind, value: 'H' };
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

export function Palette({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { document, catalogues, lockedCatalogues, unlockCatalogue, userEquations, removeUserEquation, edit } = useGraph();
  const { locale } = useSettings();
  const copy = ui(locale);
  const t = (english: string): string => phrase(locale, english);
  const [query, setQuery] = useState('');
  // Session UI state, not a document field — reopens on reload, same
  // precedent as a node's pin state. Which sections are open changes nothing
  // about what the graph is. Search ignores this and always shows a match.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [favourites, setFavouritesState] = useState<ReadonlySet<string>>(loadFavourites);
  const [menu, setMenu] = useState<PaletteMenu>();
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
  const addFormula = (formula: Formula): void =>
    edit((current) =>
      addNode(current, {
        kind: 'formula',
        id: uniqueId(current, formula.id.replace(/[^\w.]/gu, '_')),
        formula: formulaRef(formula),
        position: position(),
      }),
    );

  const addInput = (kind: 'scalar' | 'linear' | 'list' | 'spectrum' | 'categorical'): void =>
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
      return addNode(current, { kind: 'output', id, label: id, output: defaultOutput(kind), position: position() });
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

  /** A lookup-only formula's single categorical axis, e.g. "pick a camera" —
   * its many output symbols (MP, w, h, d, p, px, py, ...) would swamp the
   * palette row, so the entry counts the library instead of listing them. */
  const pickerDomain = (formula: Formula): readonly (string | number)[] | undefined => {
    if (formula.expressions !== undefined || formula.lookup === undefined || formula.lookup.axes.length !== 1) {
      return undefined;
    }
    const [axis] = formula.lookup.axes;
    return axis?.kind === 'categorical' ? axis.values : undefined;
  };

  const formulaEntry = (entry: PaletteEntry, keyPrefix = ''): ReactElement => {
    const { formula } = entry;
    const title = formula.label === undefined
      ? formula.citation ?? formula.id
      : localize(formula.label, locale);
    const domain = pickerDomain(formula);
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
          <span className="entry-output">
            {domain === undefined
              ? formula.outputs.map((port, i) => (
                  <span key={port.name}>
                    {i === 0 ? null : ', '}
                    <Symbol name={port.name} />
                  </span>
                ))
              : `${domain.length} ${domain.length === 1 ? 'entry' : 'entries'}`}
          </span>
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

  /**
   * Dropped empty, with no file picked and therefore no ports yet — the
   * same unfinished-but-valid state a fresh equation node is in. The node's
   * own button is where a file is chosen, so nothing here opens a dialog.
   */
  const addFile = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'file');
      return addNode(current, {
        kind: 'file',
        id,
        label: id,
        reader: DEFAULT_READER.id,
        sources: [],
        fields: [],
        position: position(),
      });
    });

  const addMonteCarloGenerator = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'draw');
      return addNode(current, {
        kind: 'monteCarloGenerator',
        id,
        label: id,
        distribution: 'uniform',
        min: 0,
        max: 1,
        // Matches whatever count is already in use (ROADMAP.md #31) so a
        // freshly dropped generator never disagrees with one already on the
        // canvas.
        count: monteCarloSampleCount(current),
        unit: parseUnit(''),
        position: position(),
      });
    });

  const addMonteCarloReceiver = (): void =>
    edit((current) => {
      const id = uniqueId(current, 'watch');
      return addNode(current, {
        kind: 'monteCarloReceiver',
        id,
        label: id,
        // Matches whatever limit is already in use (ROADMAP.md #31), the
        // same treatment a freshly dropped generator's count gets.
        sampleLimit: monteCarloSampleLimit(current),
        position: position(),
      });
    });

  const actions: readonly PaletteAction[] = [
    { id: 'builtin:input:value', label: copy.value, summary: copy.singleNumber, insert: () => addInput('scalar') },
    { id: 'builtin:input:range', label: copy.range, summary: copy.rangeSummary, insert: () => addInput('linear') },
    { id: 'builtin:input:list', label: copy.list, summary: copy.listSummary, insert: () => addInput('list') },
    { id: 'builtin:input:spectrum', label: 'spectrum', summary: 'consumed whole, not swept', insert: () => addInput('spectrum') },
    { id: 'builtin:input:category', label: 'category', summary: 'a named choice', insert: () => addInput('categorical') },
    // A source like the five above it, not a routing node: it starts a graph
    // rather than doing anything to values already in one.
    { id: 'builtin:input:file', label: copy.file, summary: copy.fileSummary, insert: addFile },
    { id: 'builtin:general:compare', label: copy.compare, summary: copy.compareSummary, insert: addCompare },
    { id: 'builtin:general:equation', label: copy.equation, summary: copy.equationSummary, insert: addClosure },
    { id: 'builtin:general:waypoint', label: copy.waypoint, summary: copy.waypointSummary, insert: addWaypoint },
    { id: 'builtin:general:pack', label: copy.pack, summary: copy.packSummary, insert: addPack },
    { id: 'builtin:general:unpack', label: copy.unpack, summary: copy.unpackSummary, insert: addUnpack },
    { id: 'builtin:output:print', label: copy.print, summary: copy.printSummary, insert: () => addOutput('print') },
    {
      id: 'builtin:output:plot', label: copy.plot, summary: copy.plotSummary, insert: () => addOutput('plot'),
      disabled: ranges.length === 0,
      title: ranges.length === 0 ? 'Needs a range input somewhere in the graph to plot against' : undefined,
    },
    { id: 'builtin:output:table', label: copy.table, summary: copy.tableSummary, insert: () => addOutput('table') },
    { id: 'builtin:output:check', label: copy.check, summary: copy.checkSummary, insert: () => addOutput('check') },
  ];

  // Grouped by id prefix, not array position — a positional slice silently
  // reshuffles category membership whenever an entry is inserted or removed.
  const inputActions = actions.filter((action) => action.id.startsWith('builtin:input:'));
  const generalActions = actions.filter((action) => action.id.startsWith('builtin:general:'));
  const outputActions = actions.filter((action) => action.id.startsWith('builtin:output:'));

  // A separate catalogue-styled section, not part of General — the
  // umbrella for graph-level analysis tools generally, not just per-node
  // results: Monte Carlo generator/receiver (their own node kinds with
  // their own concerns — playback, distributions — distinct enough from
  // routing nodes like waypoint/pack to earn their own heading) alongside
  // Feasibility and Sensitivity, placed right after the built-in node
  // library rather than folded into it or into the general Output section.
  const analysisActions: readonly PaletteAction[] = [
    {
      id: 'builtin:montecarlo:generator',
      label: copy.monteCarloGenerator,
      summary: copy.monteCarloGeneratorSummary,
      insert: addMonteCarloGenerator,
    },
    {
      id: 'builtin:montecarlo:receiver',
      label: copy.monteCarloReceiver,
      summary: copy.monteCarloReceiverSummary,
      insert: addMonteCarloReceiver,
    },
    {
      id: 'builtin:output:feasibility',
      label: copy.feasibility,
      summary: copy.feasibilitySummary,
      insert: () => addOutput('feasibility'),
    },
    {
      id: 'builtin:output:sensitivity',
      label: copy.sensitivity,
      summary: copy.sensitivitySummary,
      insert: () => addOutput('sensitivity'),
    },
  ];

  const favouriteEntries = all.filter(({ formula }) => favourites.has(formula.id));
  const favouriteUserEquations = userEquations.filter((equation) => favourites.has(`user:${equation.id}`));
  const favouriteActions = [...actions, ...analysisActions].filter((action) => favourites.has(action.id));

  const actionEntry = (action: PaletteAction, keyPrefix = ''): ReactElement => (
    <li key={`${keyPrefix}${action.id}`} onContextMenu={(event) => {
      event.preventDefault();
      setMenu({ action, x: event.clientX, y: event.clientY });
    }}>
      <button type="button" className="entry" disabled={action.disabled} title={action.title} onClick={action.insert}>
        <span className="entry-id">{action.label}</span>
        <span className="entry-output">{action.summary}</span>
      </button>
    </li>
  );

  const catalogueSection = ([catalogueId, list]: (typeof grouped)[number]): ReactElement => {
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
                <span className="restricted" title={t('Restricted content — never exported.')}>
                  {t('restricted')}
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
  };
  // The built-in library renders in its usual catalogue slot; Monte Carlo
  // is not a formula catalogue at all (its two entries are node kinds, like
  // waypoint/pack), so it gets its own fixed section rather than a spot in
  // `grouped` — placed right after the built-in section it conceptually
  // extends, ahead of whatever real catalogues (restricted or bundled) come
  // next. Array nodes gets the same fixed placement, right after Base nodes,
  // rather than falling wherever it happens to sort among real catalogues.
  const builtInGroup = grouped.find(([catalogueId]) => catalogueId === BASE_CATALOGUE_ID);
  const arrayGroup = grouped.find(([catalogueId]) => catalogueId === ARRAY_CATALOGUE_ID);
  const otherGroups = grouped.filter(
    ([catalogueId]) => catalogueId !== BASE_CATALOGUE_ID && catalogueId !== ARRAY_CATALOGUE_ID,
  );

  const userEquationEntry = (equation: typeof userEquations[number], keyPrefix = ''): ReactElement => (
    <li key={`${keyPrefix}${equation.id}`}>
      <button
        type="button"
        className="entry"
        title={equation.expression}
        onClick={() => addUserEquation(equation.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ userEquationId: equation.id, x: event.clientX, y: event.clientY });
        }}
      >
        <span className="entry-id">{equation.label}</span><span className="entry-output">saved equation</span>
      </button>
    </li>
  );

  return (
    <div className="palette">
      <div className="palette-header">
        <input
          className="search"
          value={query}
          placeholder={copy.searchPalette}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="panel-close-button"
          aria-label={t('Close palette')}
          title={t('Close palette — reopen it from the View menu')}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="palette-list">
        {query.trim().length === 0 && favouriteEntries.length + favouriteUserEquations.length + favouriteActions.length > 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(FAVOURITES)}>
              <span className="section-toggle-title">{copy.favourites}{collapsed.has(FAVOURITES) ? ` (${favouriteEntries.length + favouriteUserEquations.length + favouriteActions.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(FAVOURITES) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(FAVOURITES) ? null : <ul>
              {favouriteEntries.map((entry) => formulaEntry(entry, 'fav-'))}
              {favouriteUserEquations.map((equation) => userEquationEntry(equation, 'fav-user-'))}
              {favouriteActions.map((action) => actionEntry(action, 'fav-'))}
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
                  {copy.input}
                  {inputCollapsed ? <span className="section-toggle-count"> ({inputActions.length})</span> : null}
                </span>
                <span className="chevron" aria-hidden="true">
                  {inputCollapsed ? '▸' : '▾'}
                </span>
              </button>
            </h3>
            {inputCollapsed ? null : (
              <ul>
                {inputActions.map((action) => actionEntry(action))}
              </ul>
            )}
          </section>
        ) : null}

        {query.trim().length === 0 ? (
          <section>
            <h3>
              <button type="button" className="section-toggle" onClick={() => toggleCollapsed(OUTPUT)}>
                <span className="section-toggle-title">
                  {copy.output}
                  {outputCollapsed ? <span className="section-toggle-count"> ({outputActions.length})</span> : null}
                </span>
                <span className="chevron" aria-hidden="true">
                  {outputCollapsed ? '▸' : '▾'}
                </span>
              </button>
            </h3>
            {outputCollapsed ? null : (
              <ul>
                {outputActions.map((action) => actionEntry(action))}
              </ul>
            )}
          </section>
        ) : null}

        {query.trim().length === 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(GENERAL)}>
              <span className="section-toggle-title">{copy.general}{collapsed.has(GENERAL) ? ` (${generalActions.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(GENERAL) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(GENERAL) ? null : <ul>
              {generalActions.map((action) => actionEntry(action))}
            </ul>}
          </section>
        ) : null}

        {query.trim().length === 0 && userEquations.length > 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(USER)}>
              <span className="section-toggle-title">My equations{collapsed.has(USER) ? ` (${userEquations.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(USER) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(USER) ? null : <ul>{userEquations.map((equation) => userEquationEntry(equation))}</ul>}
          </section>
        ) : null}

        {builtInGroup === undefined ? null : catalogueSection(builtInGroup)}
        {arrayGroup === undefined ? null : catalogueSection(arrayGroup)}

        {query.trim().length === 0 ? (
          <section>
            <h3><button type="button" className="section-toggle" onClick={() => toggleCollapsed(ANALYSIS)}>
              <span className="section-toggle-title">{copy.analysis}{collapsed.has(ANALYSIS) ? ` (${analysisActions.length})` : ''}</span>
              <span className="chevron" aria-hidden="true">{collapsed.has(ANALYSIS) ? '▸' : '▾'}</span>
            </button></h3>
            {collapsed.has(ANALYSIS) ? null : <ul>
              {analysisActions.map((action) => actionEntry(action))}
            </ul>}
          </section>
        ) : null}

        {otherGroups.map((group) => catalogueSection(group))}

        {query.trim().length === 0
          ? lockedCatalogues.map((locked) => (
              <LockedCatalogueSection key={locked.id} locked={locked} locale={locale} onUnlock={unlockCatalogue} />
            ))
          : null}

        {found.length === 0 ? <p className="empty">{t('Nothing matches')} “{query}”.</p> : null}
      </div>

      <p className="palette-footer">
        {document.nodes.length} {t(document.nodes.length === 1 ? 'node' : 'nodes')} · {catalogues.length} {t(catalogues.length === 1 ? 'catalogue' : 'catalogues')} {t('loaded')}
      </p>
      {menu !== undefined ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={'entry' in menu ? [
            { label: t('Insert'), onClick: () => addFormula(menu.entry.formula) },
            { label: t('Help'), onClick: () => window.open(`${DOCS_BASE_URL}/guide/node-reference#formula`, '_blank', 'noopener') },
            { label: t(favourites.has(menu.entry.formula.id) ? 'Remove from favourites' : 'Add to favourites'), onClick: () => setFavourites((current) => { const next = new Set(current); if (next.has(menu.entry.formula.id)) next.delete(menu.entry.formula.id); else next.add(menu.entry.formula.id); return next; }) },
          ] : 'userEquationId' in menu ? [
            { label: t('Insert'), onClick: () => addUserEquation(menu.userEquationId) },
            { label: t(favourites.has(`user:${menu.userEquationId}`) ? 'Remove from favourites' : 'Add to favourites'), onClick: () => setFavourites((current) => { const key = `user:${menu.userEquationId}`; const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }) },
            { label: t('Remove from palette'), danger: true, onClick: () => removeUserEquation(menu.userEquationId) },
          ] : [
            { label: t('Insert'), ...(menu.action.disabled === undefined ? {} : { disabled: menu.action.disabled }), onClick: menu.action.insert },
            { label: t(favourites.has(menu.action.id) ? 'Remove from favourites' : 'Add to favourites'), onClick: () => setFavourites((current) => { const next = new Set(current); if (next.has(menu.action.id)) next.delete(menu.action.id); else next.add(menu.action.id); return next; }) },
          ]}
        />
      ) : null}
    </div>
  );
}

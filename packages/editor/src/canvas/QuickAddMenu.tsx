/**
 * Dropping a dragged wire on empty canvas offers a node to finish it with: a
 * search bar over the catalogue, every non-formula kind with a compatible
 * port for the wire being dragged, and — since a graph of any size has nodes a
 * student has simply forgotten they already placed — every existing node on
 * the canvas that has a port fitting the drag, found by typing its name.
 *
 * A dragged **output** needs a node with an input to receive it; a dragged
 * **input** needs a node with an output to fill it. Canvas asks the kernel
 * about each prospective edge, so this menu has no parallel list of which
 * formula, computation, routing, and output kinds happen to work.
 *
 * All three lists are ranked by `fuzzySearch` (model/fuzzy.ts) — a
 * subsequence match, so "pdwd" finds "Pad width d" without needing the exact
 * substring.
 */

import { useMemo, useState, type ReactElement } from 'react';

import type { Catalogue, Formula, GraphNode } from '@joveworks/schema';
import { parseExpression, toLatex } from '@joveworks/kernel';

import { entries, search } from '../model/catalogues';
import { fuzzySearch } from '../model/fuzzy';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { TitleText } from './TitleField';
import { phrase } from '../i18n';
import { useSettings } from '../settings-context';

export type QuickAddChoice =
  | { readonly kind: 'formula'; readonly formula: Formula; readonly port: string }
  | { readonly kind: 'input' }
  | { readonly kind: 'output'; readonly outputKind: 'print' | 'check' | 'plot' | 'table' | 'sensitivity' }
  | { readonly kind: 'compare' }
  | { readonly kind: 'closure' }
  | { readonly kind: 'waypoint' }
  | { readonly kind: 'pack' }
  | { readonly kind: 'unpack' }
  | { readonly kind: 'monteCarloGenerator' }
  | { readonly kind: 'monteCarloReceiver' }
  | { readonly kind: 'existing'; readonly nodeId: string; readonly port: string };

export type QuickAddCandidate =
  | { readonly kind: 'formula'; readonly formula: Formula }
  | Exclude<QuickAddChoice, { readonly kind: 'formula' | 'existing' }>;

/** How many ranked formula matches the menu shows — and the cap on how many pay for a kernel compatibility check. */
const MAX_FORMULA_RESULTS = 30;

/**
 * Compile-time guarantee that every node kind the schema knows about (besides
 * `formula`, which the catalogue search above already covers) has a
 * `QuickAddChoice` — the exact gap Monte Carlo nodes fell into: they existed
 * in the schema and the palette for a while with no corresponding entry
 * here, and nothing forced anyone to notice. If this stops compiling, a new
 * schema node kind needs a `QuickAddChoice` variant and a `possibleSpecials`
 * entry below, not just a palette action.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AssertEveryNodeKindIsQuickAddable<T extends QuickAddChoice['kind']> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _EveryNodeKindIsQuickAddable = AssertEveryNodeKindIsQuickAddable<Exclude<GraphNode['kind'], 'formula'>>;

/** An already-placed node the menu can offer, worked out by Canvas.tsx from the drag's direction. */
export interface ExistingCandidate {
  readonly nodeId: string;
  /** What to search and display by — `nodeLabel`, not the raw id. */
  readonly label: string;
  /** A short second line — the node kind, or a formula's citation. */
  readonly subtitle: string;
  /** The port this pick would wire the dragged endpoint onto. */
  readonly port: string;
  /**
   * What is already wired to `port`, if anything — picking this candidate
   * silently replaces it (Canvas.tsx's `occupantOf`). Shown so a click meant
   * as "give me a fresh node" doesn't land here without warning: an uncited
   * base formula's subtitle is its bare id, which reads identically to what
   * a *new* instance of that same formula would show below.
   */
  readonly replaces?: string;
}

interface Props {
  readonly x: number;
  readonly y: number;
  readonly catalogues: readonly Catalogue[];
  readonly existing: readonly ExistingCandidate[];
  /** Whether a plot has a range to plot against (Canvas already knows). */
  readonly canPlot: boolean;
  /** Returns the fresh node port that can complete this drag, or no port when it cannot. */
  readonly compatiblePort: (choice: QuickAddCandidate) => string | undefined;
  readonly onPick: (choice: QuickAddChoice) => void;
  readonly onClose: () => void;
}

export function QuickAddMenu({
  x,
  y,
  catalogues,
  existing,
  canPlot,
  compatiblePort,
  onPick,
  onClose,
}: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [query, setQuery] = useState('');

  // The catalogue's own `search` reads ports and descriptions too, which a
  // name-only fuzzy match would not replicate — kept as the formula list's
  // first pass, with fuzzy ranking only re-ordering what it already found.
  //
  // `compatiblePort` asks the kernel about a prospective edge — a document
  // clone plus a full `resolveGraph`/`canConnect` — so it must only run on
  // what the menu can actually show (`MAX_FORMULA_RESULTS`, matching the
  // render slice below), not on every fuzzy match. Running it on every match
  // was the quick-add slowdown: a common query matches most of the
  // catalogue, and each one was paying for a full graph resolution.
  const formulas = useMemo(
    () =>
      search(entries(catalogues), query)
        .slice(0, MAX_FORMULA_RESULTS)
        .flatMap(({ formula, ...match }) => {
          const port = compatiblePort({ kind: 'formula', formula });
          return port === undefined ? [] : [{ formula, ...match, port }];
        }),
    [catalogues, compatiblePort, query],
  );
  const matchingExisting = useMemo(
    () => fuzzySearch(query, existing, (candidate) => candidate.label),
    [existing, query],
  );

  const possibleSpecials: readonly {
    readonly label: string;
    readonly choice: Exclude<QuickAddCandidate, { readonly kind: 'formula' }>;
    readonly disabled?: boolean;
  }[] = [
      { label: t('input'), choice: { kind: 'input' } },
      { label: t('Monte Carlo generator'), choice: { kind: 'monteCarloGenerator' } },
      { label: t('equation'), choice: { kind: 'closure' } },
      { label: t('waypoint'), choice: { kind: 'waypoint' } },
      { label: t('pack'), choice: { kind: 'pack' } },
      { label: t('unpack'), choice: { kind: 'unpack' } },
      { label: t('compare'), choice: { kind: 'compare' } },
      { label: t('print output'), choice: { kind: 'output', outputKind: 'print' } },
      { label: t('check output'), choice: { kind: 'output', outputKind: 'check' } },
      {
        label: t('plot output'),
        choice: { kind: 'output', outputKind: 'plot' },
        disabled: !canPlot,
      },
      { label: t('table output'), choice: { kind: 'output', outputKind: 'table' } },
      { label: t('Monte Carlo receiver'), choice: { kind: 'monteCarloReceiver' } },
      // `feasibility` is deliberately excluded — it has no port for a
      // dragged wire to complete (it references existing Check nodes by
      // id, never by wire), unlike `sensitivity`, which has a `VALUE_PORT`
      // like print/check/plot.
      { label: t('sensitivity output'), choice: { kind: 'output', outputKind: 'sensitivity' } },
  ];
  const specials = possibleSpecials.filter(({ choice }) => compatiblePort(choice) !== undefined);
  const matchingSpecials = fuzzySearch(query, specials, (entry) => entry.label);

  const pick = (choice: QuickAddChoice) => {
    onPick(choice);
    onClose();
  };

  // What Enter would pick — "Add new" before "On this canvas", matching this
  // menu's own render order — so the same row can be highlighted as selected.
  const topSpecial = matchingSpecials.find((entry) => entry.disabled !== true);
  const topFormula = formulas[0];
  const topExisting = matchingExisting[0];
  const selected: { readonly kind: 'special' | 'formula' | 'existing'; readonly key: string } | undefined =
    topSpecial !== undefined
      ? { kind: 'special', key: topSpecial.label }
      : topFormula !== undefined
        ? { kind: 'formula', key: topFormula.formula.id }
        : topExisting !== undefined
          ? { kind: 'existing', key: topExisting.nodeId }
          : undefined;

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={onClose} />
      <div className="quick-add" style={{ left: x, top: y }}>
        <input
          className="search"
          autoFocus
          placeholder={t('add a node, or find one already on the canvas…')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter') {
              // Picking with Enter lands on whichever row is highlighted as
              // `selected` above.
              if (topSpecial !== undefined) pick(topSpecial.choice);
              else if (topFormula !== undefined) pick({ kind: 'formula', formula: topFormula.formula, port: topFormula.port });
              else if (topExisting !== undefined) {
                pick({ kind: 'existing', nodeId: topExisting.nodeId, port: topExisting.port });
              }
            }
          }}
        />
        <div className="quick-add-list">
          {matchingSpecials.length === 0 && formulas.length === 0 ? null : (
            <>
              <div className="quick-add-heading">{t('Add new')}</div>
              {matchingSpecials.map(({ label, choice, disabled }) => (
                <button
                  key={label}
                  type="button"
                  className={selected?.kind === 'special' && selected.key === label ? 'selected' : undefined}
                  disabled={disabled ?? false}
                  title={
                    disabled === true ? t('Needs a range input somewhere in the graph to plot against') : undefined
                  }
                  onClick={() => pick(choice)}
                >
                  {label}
                </button>
              ))}
              {formulas.map(({ formula, port }) => (
                <button
                  key={formula.id}
                  type="button"
                  className={
                    'quick-add-formula' +
                    (selected?.kind === 'formula' && selected.key === formula.id ? ' selected' : '')
                  }
                  onClick={() => pick({ kind: 'formula', formula, port })}
                >
                  <span className="quick-add-formula-heading">
                    <span className="entry-id">{formula.citation ?? formula.id}</span>
                    <span className="entry-output">
                      {formula.outputs.map((output, i) => (
                        <span key={output.name}>
                          {i === 0 ? null : ', '}
                          <Symbol name={output.name} />
                        </span>
                      ))}
                    </span>
                  </span>
                  {formula.expression === undefined ? null : (
                    <Equation latex={toLatex(parseExpression(formula.expression))} displayMode={false} />
                  )}
                </button>
              ))}
            </>
          )}
          {matchingExisting.length === 0 ? null : (
            <>
              <div className="quick-add-heading">{t('On this canvas')}</div>
              {matchingExisting.slice(0, 20).map((candidate) => (
                <button
                  key={candidate.nodeId}
                  type="button"
                  className={
                    selected?.kind === 'existing' && selected.key === candidate.nodeId ? 'selected' : undefined
                  }
                  title={
                    candidate.replaces === undefined
                      ? undefined
                      : t(`Replaces the wire from ${candidate.replaces} — that input takes one connection.`)
                  }
                  onClick={() => pick({ kind: 'existing', nodeId: candidate.nodeId, port: candidate.port })}
                >
                  <span className="entry-id"><TitleText value={candidate.label} /></span>
                  <span className="entry-output">
                    {candidate.subtitle}
                    {candidate.replaces === undefined ? null : (
                      <span className="replaces"> {t('replaces')} <TitleText value={candidate.replaces} /></span>
                    )}
                  </span>
                </button>
              ))}
            </>
          )}
          {matchingSpecials.length === 0 && matchingExisting.length === 0 && formulas.length === 0 ? (
            <p className="empty">{t(`Nothing matches "${query}".`)}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

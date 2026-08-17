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

import type { Catalogue, Formula } from '@joveworks/schema';

import { entries, search } from '../model/catalogues';
import { fuzzySearch } from '../model/fuzzy';
import { Symbol } from '../Symbol';
import { TitleText } from './TitleField';

export type QuickAddChoice =
  | { readonly kind: 'formula'; readonly formula: Formula; readonly port: string }
  | { readonly kind: 'input' }
  | { readonly kind: 'output'; readonly outputKind: 'print' | 'check' | 'plot' | 'table' }
  | { readonly kind: 'compare' }
  | { readonly kind: 'closure' }
  | { readonly kind: 'waypoint' }
  | { readonly kind: 'pack' }
  | { readonly kind: 'unpack' }
  | { readonly kind: 'existing'; readonly nodeId: string; readonly port: string };

export type QuickAddCandidate =
  | { readonly kind: 'formula'; readonly formula: Formula }
  | Exclude<QuickAddChoice, { readonly kind: 'formula' | 'existing' }>;

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
  const [query, setQuery] = useState('');

  // The catalogue's own `search` reads ports and descriptions too, which a
  // name-only fuzzy match would not replicate — kept as the formula list's
  // first pass, with fuzzy ranking only re-ordering what it already found.
  const formulas = useMemo(
    () =>
      search(entries(catalogues), query).flatMap(({ formula, ...match }) => {
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
      { label: 'input', choice: { kind: 'input' } },
      { label: 'equation', choice: { kind: 'closure' } },
      { label: 'waypoint', choice: { kind: 'waypoint' } },
      { label: 'pack', choice: { kind: 'pack' } },
      { label: 'unpack', choice: { kind: 'unpack' } },
      { label: 'compare', choice: { kind: 'compare' } },
      { label: 'print output', choice: { kind: 'output', outputKind: 'print' } },
      { label: 'check output', choice: { kind: 'output', outputKind: 'check' } },
      {
        label: 'plot output',
        choice: { kind: 'output', outputKind: 'plot' },
        disabled: !canPlot,
      },
      { label: 'table output', choice: { kind: 'output', outputKind: 'table' } },
  ];
  const specials = possibleSpecials.filter(({ choice }) => compatiblePort(choice) !== undefined);
  const matchingSpecials = fuzzySearch(query, specials, (entry) => entry.label);

  const pick = (choice: QuickAddChoice) => {
    onPick(choice);
    onClose();
  };

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={onClose} />
      <div className="quick-add" style={{ left: x, top: y }}>
        <input
          className="search"
          autoFocus
          placeholder="add a node, or find one already on the canvas…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter') {
              // "Add new" before "On this canvas" (QuickAddMenu's own render
              // order below) — picking with Enter should land on the same
              // thing hitting the first visible row would.
              const special = matchingSpecials.find((entry) => entry.disabled !== true)?.choice;
              const existingMatch = matchingExisting[0];
              if (special !== undefined) pick(special);
              else if (formulas[0] !== undefined) pick({ kind: 'formula', formula: formulas[0].formula, port: formulas[0].port });
              else if (existingMatch !== undefined) {
                pick({ kind: 'existing', nodeId: existingMatch.nodeId, port: existingMatch.port });
              }
            }
          }}
        />
        <div className="quick-add-list">
          {matchingSpecials.length === 0 && formulas.length === 0 ? null : (
            <>
              <div className="quick-add-heading">Add new</div>
              {matchingSpecials.map(({ label, choice, disabled }) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabled ?? false}
                  title={
                    disabled === true ? 'Needs a range input somewhere in the graph to plot against' : undefined
                  }
                  onClick={() => pick(choice)}
                >
                  {label}
                </button>
              ))}
              {formulas.slice(0, 30).map(({ formula, port }) => (
                <button key={formula.id} type="button" onClick={() => pick({ kind: 'formula', formula, port })}>
                  <span className="entry-id">{formula.citation ?? formula.id}</span>
                  <span className="entry-output">
                    <Symbol name={formula.output.name} />
                  </span>
                </button>
              ))}
            </>
          )}
          {matchingExisting.length === 0 ? null : (
            <>
              <div className="quick-add-heading">On this canvas</div>
              {matchingExisting.slice(0, 20).map((candidate) => (
                <button
                  key={candidate.nodeId}
                  type="button"
                  title={
                    candidate.replaces === undefined
                      ? undefined
                      : `Replaces the wire from ${candidate.replaces} — that input takes one connection.`
                  }
                  onClick={() => pick({ kind: 'existing', nodeId: candidate.nodeId, port: candidate.port })}
                >
                  <span className="entry-id"><TitleText value={candidate.label} /></span>
                  <span className="entry-output">
                    {candidate.subtitle}
                    {candidate.replaces === undefined ? null : (
                      <span className="replaces"> replaces <TitleText value={candidate.replaces} /></span>
                    )}
                  </span>
                </button>
              ))}
            </>
          )}
          {matchingSpecials.length === 0 && matchingExisting.length === 0 && formulas.length === 0 ? (
            <p className="empty">Nothing matches "{query}".</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

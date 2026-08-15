/**
 * Dropping a dragged wire on empty canvas offers a node to finish it with: a
 * search bar over the catalogue, the non-formula kinds that fit the
 * direction being dragged, and — since a graph of any size has nodes a
 * student has simply forgotten they already placed — every existing node on
 * the canvas that has a port fitting the drag, found by typing its name.
 *
 * A dragged **output** needs a node with an input to receive it — a formula,
 * an existing node with a free-enough input, a `compare` (its `value` port),
 * or a `print`/`check`/`plot` output — a non-formula sink for a value. A dragged
 * **input** needs a node with an output to fill it — a formula, an existing
 * node's own output, a `compare` (its `verdict` port), or a plain `input`.
 * `compare` offers in both directions, like a formula; `input` and the
 * output kinds each have only the one port a dragged wire could be
 * finishing, so they offer in one direction only.
 *
 * All three lists are ranked by `fuzzySearch` (model/fuzzy.ts) — a
 * subsequence match, so "pdwd" finds "Pad width d" without needing the exact
 * substring.
 */

import { useMemo, useState, type ReactElement } from 'react';

import type { Catalogue, Formula } from '@mds/schema';

import { entries, search } from '../model/catalogues';
import { fuzzySearch } from '../model/fuzzy';
import { Symbol } from '../Symbol';

export type QuickAddChoice =
  | { readonly kind: 'formula'; readonly formula: Formula }
  | { readonly kind: 'input' }
  | { readonly kind: 'output'; readonly outputKind: 'print' | 'check' | 'plot' | 'table' }
  | { readonly kind: 'compare' }
  | { readonly kind: 'existing'; readonly nodeId: string; readonly port: string };

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
  readonly direction: 'source' | 'target';
  readonly catalogues: readonly Catalogue[];
  readonly existing: readonly ExistingCandidate[];
  /** Whether a plot has a range to plot against (Canvas already knows). */
  readonly canPlot: boolean;
  readonly onPick: (choice: QuickAddChoice) => void;
  readonly onClose: () => void;
}

export function QuickAddMenu({
  x,
  y,
  direction,
  catalogues,
  existing,
  canPlot,
  onPick,
  onClose,
}: Props): ReactElement {
  const [query, setQuery] = useState('');

  // The catalogue's own `search` reads ports and descriptions too, which a
  // name-only fuzzy match would not replicate — kept as the formula list's
  // first pass, with fuzzy ranking only re-ordering what it already found.
  const formulas = useMemo(() => search(entries(catalogues), query), [catalogues, query]);
  const matchingExisting = useMemo(
    () => fuzzySearch(query, existing, (candidate) => candidate.label),
    [existing, query],
  );

  // `compare` fits either direction — like a formula, it has both a target
  // port (`value`) and a source port (`verdict`) — unlike `input` and the
  // output kinds below, which each have only the one port a dragged wire
  // could be finishing.
  const specials: readonly { readonly label: string; readonly choice: QuickAddChoice; readonly disabled?: boolean }[] =
    direction === 'target'
      ? [{ label: 'input', choice: { kind: 'input' } }, { label: 'compare', choice: { kind: 'compare' } }]
      : [
          { label: 'print output', choice: { kind: 'output', outputKind: 'print' } },
          { label: 'check output', choice: { kind: 'output', outputKind: 'check' } },
          {
            label: 'plot output',
            choice: { kind: 'output', outputKind: 'plot' },
            disabled: !canPlot,
          },
          { label: 'table output', choice: { kind: 'output', outputKind: 'table' } },
          { label: 'compare', choice: { kind: 'compare' } },
        ];
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
              const special = matchingSpecials.find((entry) => entry.disabled !== true)?.choice;
              const existingMatch = matchingExisting[0];
              if (special !== undefined) pick(special);
              else if (existingMatch !== undefined) {
                pick({ kind: 'existing', nodeId: existingMatch.nodeId, port: existingMatch.port });
              } else if (formulas[0] !== undefined) pick({ kind: 'formula', formula: formulas[0].formula });
            }
          }}
        />
        <div className="quick-add-list">
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
                  <span className="entry-id">{candidate.label}</span>
                  <span className="entry-output">
                    {candidate.subtitle}
                    {candidate.replaces === undefined ? null : (
                      <span className="replaces"> replaces {candidate.replaces}</span>
                    )}
                  </span>
                </button>
              ))}
            </>
          )}
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
              {formulas.slice(0, 30).map(({ formula }) => (
                <button key={formula.id} type="button" onClick={() => pick({ kind: 'formula', formula })}>
                  <span className="entry-id">{formula.citation ?? formula.id}</span>
                  <span className="entry-output">
                    <Symbol name={formula.output.name} />
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

/**
 * Dropping a dragged wire on empty canvas offers a node to finish it with: a
 * search bar over the catalogue, plus the non-formula kinds that fit the
 * direction being dragged.
 *
 * A dragged **output** needs a node with an input to receive it — a formula,
 * or a `print`/`check`/`plot` output (S60's non-formula sinks). A dragged
 * **input** needs a node with an output to fill it — a formula, or a plain
 * `input`. Only one direction ever offers the non-formula kinds because each
 * one has exactly one port a dragged wire could be finishing.
 */

import { useMemo, useState, type ReactElement } from 'react';

import type { Catalogue, Formula } from '@mds/schema';

import { entries, search } from '../model/catalogues';

export type QuickAddChoice =
  | { readonly kind: 'formula'; readonly formula: Formula }
  | { readonly kind: 'input' }
  | { readonly kind: 'output'; readonly outputKind: 'print' | 'check' | 'plot' };

interface Props {
  readonly x: number;
  readonly y: number;
  readonly direction: 'source' | 'target';
  readonly catalogues: readonly Catalogue[];
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
  canPlot,
  onPick,
  onClose,
}: Props): ReactElement {
  const [query, setQuery] = useState('');

  const formulas = useMemo(() => search(entries(catalogues), query), [catalogues, query]);

  const specials: readonly { readonly label: string; readonly choice: QuickAddChoice; readonly disabled?: boolean }[] =
    direction === 'target'
      ? [{ label: 'input', choice: { kind: 'input' } }]
      : [
          { label: 'print output', choice: { kind: 'output', outputKind: 'print' } },
          { label: 'check output', choice: { kind: 'output', outputKind: 'check' } },
          {
            label: 'plot output',
            choice: { kind: 'output', outputKind: 'plot' },
            disabled: !canPlot,
          },
        ];
  const matchingSpecials = specials.filter(({ label }) =>
    label.toLowerCase().includes(query.trim().toLowerCase()),
  );

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
          placeholder="add a node…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter') {
              const special = matchingSpecials.find((entry) => entry.disabled !== true)?.choice;
              if (special !== undefined) pick(special);
              else if (formulas[0] !== undefined) pick({ kind: 'formula', formula: formulas[0].formula });
            }
          }}
        />
        <div className="quick-add-list">
          {matchingSpecials.map(({ label, choice, disabled }) => (
            <button
              key={label}
              type="button"
              disabled={disabled ?? false}
              title={disabled === true ? 'Needs a range input somewhere in the graph to plot against' : undefined}
              onClick={() => pick(choice)}
            >
              {label}
            </button>
          ))}
          {formulas.slice(0, 30).map(({ formula }) => (
            <button key={formula.id} type="button" onClick={() => pick({ kind: 'formula', formula })}>
              <span className="entry-id">{formula.citation ?? formula.id}</span>
              <span className="entry-output">{formula.output.name}</span>
            </button>
          ))}
          {matchingSpecials.length === 0 && formulas.length === 0 ? (
            <p className="empty">Nothing matches "{query}".</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

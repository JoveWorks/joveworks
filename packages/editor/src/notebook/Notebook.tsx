/**
 * The notebook: a view over the graph, not a second document.
 *
 * Group frames are its sections, in the order the document carries them, and the
 * output nodes inside a frame are that section's results — so arranging the
 * canvas arranges the report. Prose lives at two levels: a section note
 * here, and a caption on each output, both edited where they are read.
 *
 * Export is the browser's own print-to-PDF, aimed at just this panel by
 * `@media print` rules in styles.css — no PDF library, no second renderer to
 * keep in sync with this one. The rule that citation and values show by
 * default, with expressions only behind a marked toggle, now has exactly one
 * exception, and it is the toggle itself: an `equation` output node renders
 * its wired formula's expression as typeset math, opt-in by construction —
 * a student adds this specific node type to show an equation, rather than
 * expressions leaking out from a global setting.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type TextareaHTMLAttributes,
} from 'react';

import { parseExpression, toLatex, type OutputResult } from '@joveworks/kernel';
import type { Frame, GraphDocument, OutputNode, Position } from '@joveworks/schema';

import type { NumberFormat } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { ContextMenu, type MenuItem } from '../canvas/ContextMenu';
import { TitleText, typesetTitle } from '../canvas/TitleField';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { moveFrame, reframe, removeNodes, reorderFrame, updateFrame, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { display, displayNumber } from '../model/quantity';
import { summarise } from '../model/values';
import { PlotFigure } from './PlotFigure';

/**
 * Enter finishes the field (blurs it, same as `fields.tsx`'s `TextField`);
 * Shift+Enter is what actually types a line break. Both notebook textareas
 * already save on every keystroke, so "finishes" has nothing left to commit
 * — it only ever means "I'm done here," the same signal Enter already gives
 * everywhere else in the app.
 */
function commitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.blur();
}

interface NotebookTextFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> {
  readonly value: string;
}

function NotebookTextField({
  value,
  className,
  onBlur,
  ...props
}: NotebookTextFieldProps): ReactElement {
  const { titleMathRendering } = useSettings();
  const [editing, setEditing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;
  const showingTypeset = !editing && typeset !== undefined;

  const resize = (): void => {
    const element = textarea.current;
    if (element === null) return;

    // Clear the explicit height first so deleting text can shrink the field as
    // well as adding text can grow it.
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value, showingTypeset]);

  useEffect(() => {
    const element = textarea.current;
    if (element === null) return;

    // Resizing the notebook changes line wrapping without changing `value`.
    // Only react to width changes: our own height update also notifies a
    // ResizeObserver and must not start an observation loop.
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth === undefined || nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [showingTypeset]);

  if (showingTypeset) {
    return (
      <div
        className={`notebook-text-display${className === undefined ? '' : ` ${className}`}`}
        role="textbox"
        tabIndex={0}
        aria-label={value}
        title="Click to edit the raw text"
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setEditing(true);
        }}
      >
        {typeset}
      </div>
    );
  }

  return (
    <textarea
      {...props}
      ref={textarea}
      className={className}
      value={value}
      autoFocus={editing}
      onBlur={(event) => {
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}

const COMPARISON_TEXT: Readonly<Record<string, string>> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

function Result({ result }: { readonly result: OutputResult }): ReactElement {
  const { document } = useGraph();
  const { numberFormat } = useSettings();
  const format: NumberFormat = toUnitsFormat(numberFormat);
  const label = result.label ?? result.nodeId;

  if (result.kind === 'print') {
    return (
      <p className="result print">
        <span className="label">
          <TitleText value={label} />
        </span>
        <span className="number">{summarise(result, result.figures, format)}</span>
      </p>
    );
  }

  if (result.kind === 'check') {
    const shown = display(result.threshold, result.unit, 4, format);
    // A scalar check has exactly one verdict, so ✓/✗ already says everything.
    // A swept one has one verdict per point, and a single mark for the
    // whole range used to read as "the range failed" on the first bad point
    // — the count says which, and how many, instead, matching the wording
    // the compact node's own badge already uses (OutputNodeView.tsx).
    const swept = result.results.length > 1;
    const failures = result.results.filter((passed) => !passed).length;
    return (
      <p className={`result check ${result.passed ? 'pass' : 'fail'}`}>
        <span className="mark">{result.passed ? '✓' : '✗'}</span>
        <span className="label">
          <TitleText value={label} />
        </span>
        {swept && !result.passed ? (
          <span className="count">
            fails at {failures} of {result.results.length} points
          </span>
        ) : null}
        <span className="number">
          {summarise({ series: result.series, unit: result.unit }, 4, format)}{' '}
          {COMPARISON_TEXT[result.comparison] ?? result.comparison} {shown}
        </span>
      </p>
    );
  }

  if (result.kind === 'equation') {
    return (
      <div className="result equation">
        <span className="label">
          <TitleText value={label} />
        </span>
        <Equation latex={toLatex(parseExpression(result.expression))} />
      </div>
    );
  }

  if (result.kind === 'table') {
    const rows = Math.max(...result.columns.map((column) => column.series.data.length));
    return (
      <div className="result table">
        <span className="label">
          <TitleText value={label} />
        </span>
        <table>
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name}>
                  <ParameterLabel name={column.name} unit={column.unit} unitClassName="unit" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_unused, row) => (
              <tr key={row}>
                {result.columns.map((column) => {
                  const cell = column.series.data[row];
                  return (
                    <td key={column.name}>
                      {cell === undefined
                        ? ''
                        : typeof cell === 'number'
                          ? displayNumber(cell, column.unit, 4, format)
                          : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="result plot">
      <span className="label">
        <TitleText value={label} />
      </span>
      <PlotFigure result={result} document={document} format={format} />
      {result.threshold === undefined ? null : (
        <p className="threshold">
          threshold at {display(result.threshold, result.unit, 4, format)} — where the curve crosses
          it is the size that works
        </p>
      )}
    </div>
  );
}

function Caption({
  node,
  defaultCaption,
}: {
  readonly node: OutputNode;
  readonly defaultCaption?: string;
}): ReactElement {
  const { editLive, commitEdit } = useGraph();
  return (
    <NotebookTextField
      className="caption"
      value={node.caption ?? ''}
      placeholder={defaultCaption ?? 'caption — what this result says'}
      rows={1}
      onKeyDown={commitOnEnter}
      onChange={(event) => {
        const caption = event.target.value;
        editLive((current) =>
          updateNode<OutputNode>(current, node.id, (entry) => {
            const { caption: _cleared, ...rest } = entry;
            return caption.length === 0 ? rest : { ...rest, caption };
          }),
        );
      }}
      onBlur={() => commitEdit()}
    />
  );
}

/** The key `frame === undefined`'s pseudo-section collapses under — no frame id to key it by. */
const UNGROUPED = '__ungrouped__';

function Section({
  frame,
  outputs,
  collapsed,
  onToggle,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  readonly frame?: Frame;
  readonly outputs: readonly OutputNode[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** Set by the notebook (a single, shared value — see its own comment) rather than owned locally. */
  readonly dragOver: 'before' | 'after' | undefined;
  readonly onDragOver: (position: 'before' | 'after') => void;
  readonly onDragLeave: () => void;
  /**
   * The notebook decides what a drop actually does — it knows the canonical
   * drop target (`dragOver`'s state), which after normalising "after A" into
   * "before B" isn't necessarily *this* section even when the pointer is
   * physically over it. Resolving the reorder here, against this section's
   * own `frame.id`, would silently no-op on exactly the boundary that
   * normalising was meant to fix.
   */
  readonly onDrop: (sourceId: string) => void;
  /**
   * Fires on the drag *source* when the operation ends for any reason —
   * dropped on a valid target, dropped outside one, or cancelled (Escape).
   * dragover/dragleave/drop on a *target* aren't guaranteed to fire in every
   * one of those cases, so this is the only reliable place to clear the
   * indicator — without it, ending a drag outside a valid target (or right
   * back over the section being dragged) could leave the line stuck.
   */
  readonly onDragEnd: () => void;
}): ReactElement | null {
  const { document, analysis, edit, editLive, commitEdit, setHovered } = useGraph();
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  if (outputs.length === 0) return null;

  const clearHover = (): void => setHovered(() => new Set());

  const results = new Map(
    (analysis.evaluation?.outputs ?? []).map((result) => [result.nodeId, result] as const),
  );

  const menuItems: readonly MenuItem[] =
    frame === undefined
      ? []
      : [
          {
            label: 'Move up',
            disabled: document.frames[0]?.id === frame.id,
            onClick: () => edit((current) => moveFrame(current, frame.id, 'up')),
          },
          {
            label: 'Move down',
            disabled: document.frames.at(-1)?.id === frame.id,
            onClick: () => edit((current) => moveFrame(current, frame.id, 'down')),
          },
          {
            label: 'Delete section',
            danger: true,
            onClick: () => edit((current) => reframe(removeNodes(current, new Set([frame.id])))),
          },
        ];

  return (
    <section
      className={`notebook-section${dragOver === undefined ? '' : ` drag-over-${dragOver}`}`}
      onDragOver={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // Which half of the section the pointer is over decides whether the
        // drop lands before or after it — not always "before", which read as
        // arbitrary when the drop target's own bottom half was still "above".
        const bounds = event.currentTarget.getBoundingClientRect();
        onDragOver(event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        if (frame === undefined) return;
        // Unconditional, regardless of whether `dragOver` (this section's own,
        // possibly-normalised-away slice of the shared state) says this is
        // the drop target — without it, the browser's default action for a
        // text/plain drop onto a descendant text field (inserting it as
        // literal text) goes through instead of being suppressed.
        event.preventDefault();
        onDrop(event.dataTransfer.getData('text/plain'));
      }}
      onContextMenu={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <h2
        {...(frame === undefined
          ? {}
          : {
              onMouseEnter: () => setHovered(() => new Set([frame.id])),
              onMouseLeave: clearHover,
            })}
      >
        {frame === undefined ? null : (
          <span className="grip" aria-hidden="true">
            ⠿
          </span>
        )}
        {frame === undefined ? (
          <button type="button" className="section-toggle" onClick={onToggle}>
            <span className="section-toggle-title">Not in a section</span>
            <span className="chevron" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
          </button>
        ) : (
          <>
            <input
              className="section-title"
              value={frame.title}
              size={Math.max(frame.title.length, 1)}
              onChange={(event) => {
                const title = event.target.value;
                editLive((current) => updateFrame(current, frame.id, (entry) => ({ ...entry, title })));
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.currentTarget.blur();
              }}
              onBlur={() => commitEdit()}
            />
            <button
              type="button"
              className="section-toggle"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand section' : 'Collapse section'}
              // The whole flex-filled gap between the title and the chevron is
              // both the toggle click target and the drag-to-reorder handle —
              // a single element can be both, since the browser only starts a
              // drag once the pointer moves past a threshold, a click never
              // does. Keeping this off the section's title/note/caption
              // fields (not the section itself) is what keeps their own
              // double-click text selection working — see the commit that
              // moved dragging off the whole section.
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', frame.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={onDragEnd}
            >
              {collapsed ? (
                <span className="section-toggle-count">
                  {outputs.length} result{outputs.length === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="chevron" aria-hidden="true">
                {collapsed ? '▸' : '▾'}
              </span>
            </button>
          </>
        )}
      </h2>
      {menu === undefined ? null : (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(undefined)} />
      )}
      {collapsed ? null : (
        <>
          {frame === undefined ? null : (
            <NotebookTextField
              className="note"
              value={frame.note ?? ''}
              placeholder="what this section establishes"
              rows={3}
              onKeyDown={commitOnEnter}
              onChange={(event) => {
                const note = event.target.value;
                editLive((current) =>
                  updateFrame(current, frame.id, (entry) => {
                    const { note: _cleared, ...rest } = entry;
                    return note.length === 0 ? rest : { ...rest, note };
                  }),
                );
              }}
              onBlur={() => commitEdit()}
            />
          )}

          {outputs.map((node) => {
            const result = results.get(node.id);
            const captionProps =
              result?.kind === 'equation'
                ? { defaultCaption: result.citation ?? node.label ?? node.id }
                : {};
            return (
              <div
                key={node.id}
                className="entry"
                onMouseEnter={() => setHovered(() => new Set([node.id]))}
                onMouseLeave={clearHover}
              >
                {result === undefined ? (
                  <p className="result pending">
                    <span className="label">
                      <TitleText value={node.label ?? node.id} />
                    </span>
                    <span className="number">
                      {analysis.problems.get(node.id) ?? 'not yet computed'}
                    </span>
                  </p>
                ) : (
                  <Result result={result} />
                )}
                <Caption node={node} {...captionProps} />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/**
 * Two nodes within this many px of vertical distance read as the same "row" —
 * ordered by x instead of the (functionally arbitrary) sub-pixel difference
 * in y a hand-placed layout is full of. Roughly a node's own height, the
 * same order of magnitude `frameAround` (`model/document.ts`) assumes.
 */
const ROW_TOLERANCE = 100;

/** Top-to-bottom, then left-to-right on near-ties — comic-book reading order. */
export function readingOrder(a: { readonly position: Position }, b: { readonly position: Position }): number {
  const dy = a.position.y - b.position.y;
  return Math.abs(dy) > ROW_TOLERANCE ? dy : a.position.x - b.position.x;
}

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes
    .filter((node): node is OutputNode => node.kind === 'output' && node.frameId === frameId)
    .slice()
    .sort(readingOrder);
}

export function Notebook(): ReactElement {
  const { document, analysis, edit, editLive, commitEdit } = useGraph();
  // Session UI state, not a document field (same call as Palette.tsx) —
  // a section's collapse reopens on reload, same as a pinned node.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Shared across every section, rather than each Section owning its own —
  // two adjacent sections independently tracking "am I the drop target" could
  // both end up drawing a line (theirs at the shared edge doesn't reliably
  // clear on dragleave before the neighbour's dragover sets its own), which
  // read as two drop targets at once instead of one line at the boundary.
  // A single value can only ever belong to one section.
  const [dragOver, setDragOver] = useState<{ frameId: string; position: 'before' | 'after' } | undefined>(
    undefined,
  );
  // "After section N" and "before section N+1" are the same drop point, so
  // hovering the bottom half of a section is normalised to "before the next
  // one" below — one canonical state per boundary instead of two sections
  // each able to claim it, which was the actual source of the two-line bug
  // (dragOver being shared only fixed staleness within a single
  // representation, not this duplicate one). That normalisation means the
  // section whose *own* dragover last fired isn't always the section whose
  // id ends up in `dragOver` — so onDragLeave can't just compare frame ids.
  // This ref tracks which section most recently won the write, so a leave
  // event only clears the state it's actually still responsible for, not one
  // a neighbour has since (validly) taken over.
  const dragSource = useRef<string | undefined>(undefined);
  const clearDragOver = (): void => {
    dragSource.current = undefined;
    setDragOver(undefined);
  };

  // A collapsed section renders nothing (Section returns before its body), so
  // a printed PDF would silently drop whatever was folded up on screen.
  // Printing forces every section open for the print, then restores whatever
  // was collapsed — collapse state is session UI, not something export changes.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = (): void => setPrinting(false);
    window.addEventListener('afterprint', done);
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  return (
    <div
      className="notebook"
      // A dragged section's own drop targets (the sections themselves) call
      // this already; this catch-all is for everywhere else in the panel —
      // the title, the export button, the warnings list — none of which has
      // a drop handler of its own, so without this the browser falls back to
      // its default action for a text/plain drop onto a text field: inserting
      // it as literal text.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="notebook-header">
        <input
          className="notebook-title"
          value={document.title}
          onChange={(event) => {
            const title = event.target.value;
            editLive((current) => ({ ...current, title }));
          }}
          onBlur={() => commitEdit()}
        />
        <button
          type="button"
          className="notebook-export-button"
          disabled={printing}
          onClick={() => setPrinting(true)}
        >
          Export PDF…
        </button>
      </div>

      {document.frames.map((frame, index) => (
        <Section
          key={frame.id}
          frame={frame}
          outputs={outputsOf(document, frame.id)}
          collapsed={printing ? false : collapsed.has(frame.id)}
          onToggle={() => toggle(frame.id)}
          dragOver={dragOver?.frameId === frame.id ? dragOver.position : undefined}
          onDragOver={(position) => {
            dragSource.current = frame.id;
            const next = position === 'after' ? document.frames[index + 1] : undefined;
            setDragOver(
              next === undefined ? { frameId: frame.id, position } : { frameId: next.id, position: 'before' },
            );
          }}
          onDragLeave={() => {
            if (dragSource.current !== frame.id) return;
            clearDragOver();
          }}
          // Uses whatever `dragOver` currently holds — the canonical target,
          // not necessarily this section's own frame.id (see the prop's own
          // comment) — rather than resolving the reorder against `frame`
          // directly, which would silently no-op on a normalised boundary.
          onDrop={(sourceId) => {
            const target = dragOver;
            clearDragOver();
            if (target === undefined || sourceId.length === 0) return;
            edit((current) => reorderFrame(current, sourceId, target.frameId, target.position));
          }}
          onDragEnd={clearDragOver}
        />
      ))}
      <Section
        outputs={outputsOf(document, undefined)}
        collapsed={printing ? false : collapsed.has(UNGROUPED)}
        onToggle={() => toggle(UNGROUPED)}
        dragOver={undefined}
        onDragOver={() => {}}
        onDragLeave={() => {}}
        onDrop={() => {}}
        onDragEnd={() => {}}
      />

      {analysis.message === undefined ? null : (
        <p className="notebook-problem">{analysis.message}</p>
      )}
      {analysis.warnings.length === 0 ? null : (
        <section className="notebook-warnings">
          <h2>Worth a look</h2>
          <ul>
            {analysis.warnings.map((warning) => (
              <li key={`${warning.kind}-${warning.nodeId ?? ''}-${warning.message}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

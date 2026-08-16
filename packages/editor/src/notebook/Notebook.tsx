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
 * default, with expressions only behind a marked toggle, holds trivially:
 * nothing in this panel renders an expression, printed or not.
 */

import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';

import type { OutputResult } from '@mds/kernel';
import type { Frame, GraphDocument, OutputNode } from '@mds/schema';

import type { NumberFormat } from '@mds/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { ContextMenu, type MenuItem } from '../canvas/ContextMenu';
import { Symbol } from '../Symbol';
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
        <span className="label">{label}</span>
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
        <span className="label">{label}</span>
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

  if (result.kind === 'table') {
    const rows = Math.max(...result.columns.map((column) => column.series.data.length));
    return (
      <div className="result table">
        <span className="label">{label}</span>
        <table>
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name}>
                  <Symbol name={column.name} /> <span className="unit">{column.unit.symbol}</span>
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
      <span className="label">{label}</span>
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

function Caption({ node }: { readonly node: OutputNode }): ReactElement {
  const { editLive, commitEdit } = useGraph();
  return (
    <textarea
      className="caption"
      value={node.caption ?? ''}
      placeholder="caption — what this result says"
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
}: {
  readonly frame?: Frame;
  readonly outputs: readonly OutputNode[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** Set by the notebook (a single, shared value — see its own comment) rather than owned locally. */
  readonly dragOver: 'before' | 'after' | undefined;
  readonly onDragOver: (position: 'before' | 'after') => void;
  readonly onDragLeave: () => void;
}): ReactElement | null {
  const { document, analysis, edit, editLive, commitEdit } = useGraph();
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  if (outputs.length === 0) return null;

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
        if (frame === undefined || dragOver === undefined) return;
        event.preventDefault();
        const position = dragOver;
        onDragLeave();
        const sourceId = event.dataTransfer.getData('text/plain');
        if (sourceId.length === 0) return;
        edit((current) => reorderFrame(current, sourceId, frame.id, position));
      }}
      onContextMenu={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <h2>
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
            <textarea
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
            return (
              <div key={node.id} className="entry">
                {result === undefined ? (
                  <p className="result pending">
                    <span className="label">{node.label ?? node.id}</span>
                    <span className="number">
                      {analysis.problems.get(node.id) ?? 'not yet computed'}
                    </span>
                  </p>
                ) : (
                  <Result result={result} />
                )}
                <Caption node={node} />
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes.filter(
    (node): node is OutputNode => node.kind === 'output' && node.frameId === frameId,
  );
}

export function Notebook(): ReactElement {
  const { document, analysis, editLive, commitEdit } = useGraph();
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
    <div className="notebook">
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

      {document.frames.map((frame) => (
        <Section
          key={frame.id}
          frame={frame}
          outputs={outputsOf(document, frame.id)}
          collapsed={printing ? false : collapsed.has(frame.id)}
          onToggle={() => toggle(frame.id)}
          dragOver={dragOver?.frameId === frame.id ? dragOver.position : undefined}
          onDragOver={(position) => setDragOver({ frameId: frame.id, position })}
          onDragLeave={() =>
            setDragOver((current) => (current?.frameId === frame.id ? undefined : current))
          }
        />
      ))}
      <Section
        outputs={outputsOf(document, undefined)}
        collapsed={printing ? false : collapsed.has(UNGROUPED)}
        onToggle={() => toggle(UNGROUPED)}
        dragOver={undefined}
        onDragOver={() => {}}
        onDragLeave={() => {}}
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

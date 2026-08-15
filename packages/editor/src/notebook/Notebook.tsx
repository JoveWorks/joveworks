/**
 * The notebook: a view over the graph, not a second document (S30).
 *
 * Group frames are its sections, in the order the document carries them, and the
 * output nodes inside a frame are that section's results — so arranging the
 * canvas arranges the report. Prose lives at two levels (S48): a section note
 * here, and a caption on each output, both edited where they are read.
 *
 * What is *not* here is export. S32's rule — citation and values by default,
 * expressions only behind a marked toggle — is a promise about a file that
 * leaves the app, and there is no such file in milestone 1. Nothing in this
 * panel renders an expression, which is the same rule holding trivially.
 */

import { useState, type ReactElement } from 'react';

import type { OutputResult } from '@mds/kernel';
import type { Frame, GraphDocument, OutputNode } from '@mds/schema';

import { useGraph } from '../graph-context';
import { ContextMenu, type MenuItem } from '../canvas/ContextMenu';
import { moveFrame, reframe, removeNodes, reorderFrame, updateFrame, updateNode } from '../model/document';
import { display } from '../model/quantity';
import { summarise } from '../model/values';
import { PlotFigure } from './PlotFigure';

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
  const label = result.label ?? result.nodeId;

  if (result.kind === 'print') {
    return (
      <p className="result print">
        <span className="label">{label}</span>
        <span className="number">{summarise(result, result.figures)}</span>
      </p>
    );
  }

  if (result.kind === 'check') {
    const shown = display(result.threshold, result.unit);
    return (
      <p className={`result check ${result.passed ? 'pass' : 'fail'}`}>
        <span className="mark">{result.passed ? '✓' : '✗'}</span>
        <span className="label">{label}</span>
        <span className="number">
          {summarise({ series: result.series, unit: result.unit })}{' '}
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
                  {column.name} <span className="unit">{column.unit.symbol}</span>
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
                          ? display(cell, column.unit)
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
      <PlotFigure result={result} document={document} />
      {result.threshold === undefined ? null : (
        <p className="threshold">
          threshold at {display(result.threshold, result.unit)} — where the curve crosses it is the
          size that works
        </p>
      )}
    </div>
  );
}

function Caption({ node }: { readonly node: OutputNode }): ReactElement {
  const { edit } = useGraph();
  return (
    <textarea
      className="caption"
      value={node.caption ?? ''}
      placeholder="caption — what this result says"
      rows={1}
      onChange={(event) => {
        const caption = event.target.value;
        edit((current) =>
          updateNode<OutputNode>(current, node.id, (entry) => {
            const { caption: _cleared, ...rest } = entry;
            return caption.length === 0 ? rest : { ...rest, caption };
          }),
        );
      }}
    />
  );
}

function Section({
  frame,
  outputs,
}: {
  readonly frame?: Frame;
  readonly outputs: readonly OutputNode[];
}): ReactElement | null {
  const { document, analysis, edit } = useGraph();
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  const [dragOver, setDragOver] = useState<'before' | 'after' | undefined>(undefined);
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
      draggable={frame !== undefined}
      onDragStart={(event) => {
        if (frame === undefined) return;
        event.dataTransfer.setData('text/plain', frame.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // Which half of the section the pointer is over decides whether the
        // drop lands before or after it — not always "before", which read as
        // arbitrary when the drop target's own bottom half was still "above".
        const bounds = event.currentTarget.getBoundingClientRect();
        setDragOver(event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={() => setDragOver(undefined)}
      onDrop={(event) => {
        if (frame === undefined || dragOver === undefined) return;
        event.preventDefault();
        const position = dragOver;
        setDragOver(undefined);
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
      <h2>{frame === undefined ? 'Not in a section' : <span className="grip">⠿ {frame.title}</span>}</h2>
      {menu === undefined ? null : (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(undefined)} />
      )}
      {frame === undefined ? null : (
        <textarea
          className="note"
          value={frame.note ?? ''}
          placeholder="what this section establishes"
          rows={3}
          onChange={(event) => {
            const note = event.target.value;
            edit((current) =>
              updateFrame(current, frame.id, (entry) => {
                const { note: _cleared, ...rest } = entry;
                return note.length === 0 ? rest : { ...rest, note };
              }),
            );
          }}
        />
      )}

      {outputs.map((node) => {
        const result = results.get(node.id);
        return (
          <div key={node.id} className="entry">
            {result === undefined ? (
              <p className="result pending">
                <span className="label">{node.label ?? node.id}</span>
                <span className="number">{analysis.problems.get(node.id) ?? 'not yet computed'}</span>
              </p>
            ) : (
              <Result result={result} />
            )}
            <Caption node={node} />
          </div>
        );
      })}
    </section>
  );
}

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes.filter(
    (node): node is OutputNode => node.kind === 'output' && node.frameId === frameId,
  );
}

export function Notebook(): ReactElement {
  const { document, analysis } = useGraph();

  return (
    <div className="notebook">
      <h1>{document.title}</h1>

      {document.frames.map((frame) => (
        <Section key={frame.id} frame={frame} outputs={outputsOf(document, frame.id)} />
      ))}
      <Section outputs={outputsOf(document, undefined)} />

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

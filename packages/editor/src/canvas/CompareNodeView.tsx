/**
 * A compare node: `value` against `threshold`, wired or typed, emitting a
 * `pass`/`fail` verdict as an ordinary wireable value.
 *
 * Unlike the output node's `check` kind — a badge over a value that already
 * exists and goes nowhere else (S60) — this is a first-class node so its
 * verdict can flow onward, most usefully into a table column that shows
 * which of a swept design's points fail (S33's table). `threshold` is the
 * first port in the app with both a typed default *and* a wire that can
 * override it: unwired, the typed quantity below is what is compared
 * against; wired, the edge wins outright (model/document.ts's
 * `evaluateCompare` in the kernel is the authority, not this file).
 *
 * `value` has no default — there is nothing sensible to compare against
 * when nothing is wired — so it is "missing" exactly the way a formula's
 * own required port is (S50).
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  COMPARISONS,
  THRESHOLD_PORT,
  VALUE_PORT,
  VERDICT_PORT,
  type CompareNode,
  type Comparison,
} from '@mds/schema';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { formatAuthored, parseAuthored } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { Symbol } from '../Symbol';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TextField } from './fields';

/** `fails at 1 of 2 points`, or `passes` — the same badge idiom the check output uses. */
function Verdict({ nodeId }: { readonly nodeId: string }): ReactElement | null {
  const { analysis } = useGraph();
  const value = reading(analysis, nodeId, VERDICT_PORT);
  if (value === undefined || value.series.kind !== 'categorical') return null;
  const { data } = value.series;
  const failures = data.filter((cell) => cell !== 'pass').length;
  return (
    <span className={`badge ${failures === 0 ? 'pass' : 'fail'}`}>
      {failures === 0
        ? 'passes'
        : `fails at ${failures} of ${data.length} point${data.length === 1 ? '' : 's'}`}
    </span>
  );
}

export function CompareNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'compare') return null;

  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const verdict = reading(analysis, id, VERDICT_PORT);

  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const valueMissing = !wired.has(VALUE_PORT);

  const setNode = (change: Partial<Pick<CompareNode, 'comparison' | 'threshold'>>): void =>
    edit((current) =>
      updateNode<CompareNode>(current, id, (entry) => ({ ...entry, ...change })),
    );

  return (
    <NodeShell
      kind="compare"
      state={state}
      {...(problem === undefined ? {} : { problem })}
      selected={selected ?? false}
      pinned={pinned.has(id)}
      onTogglePin={() => togglePin(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TextField
          className="title"
          value={node.label ?? id}
          onCommit={(label) => edit((current) => renameNode(current, id, label))}
        />
      }
      subtitle={`${node.comparison} ${formatAuthored(node.threshold)}`}
      detail={
        <div className="output-editor">
          <label>
            is
            <select
              className="nodrag"
              value={node.comparison}
              onChange={(event) => setNode({ comparison: event.target.value as Comparison })}
            >
              {COMPARISONS.map((comparison) => (
                <option key={comparison} value={comparison}>
                  {comparison}
                </option>
              ))}
            </select>
          </label>
          <label>
            threshold
            <TextField
              className="quantity"
              value={formatAuthored(node.threshold)}
              placeholder="1.5"
              title={
                wired.has(THRESHOLD_PORT)
                  ? 'Overridden by the wire — this is what applies when it is removed.'
                  : 'A number a student types, with its unit (S58), unless something is wired in.'
              }
              onCommit={(text) => setNode({ threshold: parseAuthored(text) })}
            />
          </label>
        </div>
      }
    >
      <ul className="ports">
        <li className={valueMissing ? 'port missing' : 'port'}>
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(VALUE_PORT, 0)}
            className={valueMissing ? 'missing' : ''}
          />
          <span className="port-name">
            <Symbol name={VALUE_PORT} />
          </span>
        </li>
        <li className="port">
          <Handle type="target" position={Position.Left} id={slotHandleId(THRESHOLD_PORT, 0)} />
          <span className="port-name">
            <Symbol name={THRESHOLD_PORT} />
          </span>
        </li>
      </ul>

      <div className="node-value">
        <span className="reading">{verdict === undefined ? '—' : summarise(verdict)}</span>
        {verdict === undefined ? null : <Sparkline reading={verdict} />}
        <Verdict nodeId={id} />
        <span className="port-out">
          <Symbol name={VERDICT_PORT} />
        </span>
        <Handle type="source" position={Position.Right} id={VERDICT_PORT} />
      </div>
    </NodeShell>
  );
}

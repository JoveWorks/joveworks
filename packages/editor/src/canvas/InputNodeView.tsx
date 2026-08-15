/**
 * An input node: a literal, or the range that turns the graph into a study.
 *
 * It carries a `ValueSpec` directly rather than referencing a formula — there is
 * no equation behind `250 kW` (S60) — so the editing surface here is the value
 * itself, on the node (S47).
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { VALUE_PORT, isRange, type InputNode } from '@mds/schema';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, updateNode } from '../model/document';
import { axisLabel, reading } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { TextField } from './fields';
import { ValueFields, ValueKindSelect, ValuePointsField } from './ValueEditor';

export function InputNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'input') return null;

  const value = reading(analysis, id, VALUE_PORT);
  const swept = isRange(node.value);
  const setValue = (next: InputNode['value']): void =>
    edit((current) => updateNode<InputNode>(current, id, (input) => ({ ...input, value: next })));

  return (
    <NodeShell
      kind="input"
      state={analysis.states.get(id) ?? 'ok'}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      selected={selected ?? false}
      pinned={pinned.has(id)}
      onTogglePin={() => togglePin(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TextField
          className="title"
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) =>
              updateNode<InputNode>(current, id, (input) => {
                // A rename should be seen wherever the axis label was
                // following it. axisLabel is only ever set by sample
                // authoring or copied forward by duplicateNode — there is no
                // UI to edit it directly — so once set it would otherwise
                // keep showing the old text in the plot's axis picker no
                // matter how many times the node was renamed afterwards.
                const { axisLabel: _stale, ...rest } = input;
                return { ...rest, label };
              }),
            )
          }
        />
      }
      subtitle={swept ? 'range' : 'input'}
      detail={
        <>
          <ValueKindSelect value={node.value} onChange={setValue} />
          <ValuePointsField value={node.value} onChange={setValue} />
        </>
      }
    >
      {/* The port always docks on whichever row is actually showing the value:
          the field itself when it's a scalar (S47's "presented once"), the
          swept-range summary below when it's a range — never both, and never
          neither. */}
      <div className="node-value-editor">
        <ValueFields value={node.value} onChange={setValue} />
        {swept ? null : <Handle type="source" position={Position.Right} id={VALUE_PORT} />}
      </div>
      {swept ? (
        // The extent is already the two bounds above (S47's "presented once")
        // — this row only earns its place for what isn't shown there: the
        // sparkline's shape and the axis label.
        <div className="node-value">
          {value === undefined ? null : <Sparkline reading={value} />}
          {value === undefined ? null : <span className="axis">{axisLabel(value) ?? ''}</span>}
          <Handle type="source" position={Position.Right} id={VALUE_PORT} />
        </div>
      ) : null}
    </NodeShell>
  );
}

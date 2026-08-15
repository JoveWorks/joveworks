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
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { TextField } from './fields';
import { ValueEditor } from './ValueEditor';

export function InputNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'input') return null;

  const value = reading(analysis, id, VALUE_PORT);
  const swept = isRange(node.value);

  return (
    <NodeShell
      kind="input"
      state={analysis.states.get(id) ?? 'ok'}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) as string } : {})}
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
              updateNode<InputNode>(current, id, (input) => ({ ...input, label })),
            )
          }
        />
      }
      subtitle={swept ? 'range' : 'input'}
      detail={
        <ValueEditor
          value={node.value}
          onChange={(next) =>
            edit((current) =>
              updateNode<InputNode>(current, id, (input) => ({ ...input, value: next })),
            )
          }
        />
      }
    >
      <div className="node-value">
        <span className="reading">{value === undefined ? '—' : summarise(value)}</span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className="axis">{axisLabel(value) ?? ''}</span>
        )}
        <Handle type="source" position={Position.Right} id={VALUE_PORT} />
      </div>
    </NodeShell>
  );
}

/**
 * An input node: a literal, or the range that turns the graph into a study.
 *
 * It carries a `ValueSpec` directly rather than referencing a formula — there is
 * no equation behind `250 kW` — so the editing surface here is the value
 * itself, on the node.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { VALUE_PORT, isRange, type InputNode } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { phrase } from '../i18n';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { axisLabel, reading } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';
import { ValueFields, ValueKindSelect, ValuePointsField, ValueSliderBoundsFields } from './ValueEditor';

export function InputNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, editLive, commitEdit, expanded, toggleExpanded, hovered } = useGraph();
  const { locale } = useSettings();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'input') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const value = reading(analysis, id, VALUE_PORT);
  const swept = isRange(node.value);
  const setValue = (next: InputNode['value']): void =>
    edit((current) => updateNode<InputNode>(current, id, (input) => {
      if (next.kind === 'slider') return { ...input, value: next };
      const { exposeInNotebook: _exposure, ...rest } = input;
      return { ...rest, value: next };
    }));
  const setSliderLive = (next: InputNode['value']): void =>
    editLive((current) => updateNode<InputNode>(current, id, (input) => ({ ...input, value: next })));

  return (
    <NodeShell
      kind="input"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`input-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<InputNode>(current, id, (input) => {
                // A rename should be seen wherever the axis label was
                // following it. axisLabel is only ever set by sample
                // authoring or copied forward by duplicateNode — there is no
                // UI to edit it directly — so once set it would otherwise
                // keep showing the old text in the plot's axis picker no
                // matter how many times the node was renamed afterwards.
                const { axisLabel: _stale, ...rest } = input;
                return { ...rest, label };
              });
              // Also keeps any table column still named after this node's
              // old label in sync (syncColumnLabels, model/document.ts).
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle="input"
      detail={
        <>
          <ValueKindSelect value={node.value} onChange={setValue} />
          <ValuePointsField value={node.value} onChange={setValue} />
          <ValueSliderBoundsFields value={node.value} onChange={setValue} />
          {node.value.kind === 'slider' ? (
            <label className="points-field notebook-exposure-field">
              <input
                type="checkbox"
                className="nodrag"
                checked={node.exposeInNotebook ?? false}
                onChange={(event) => {
                  const exposed = event.target.checked;
                  edit((current) => updateNode<InputNode>(current, id, (input) => {
                    if (exposed) return { ...input, exposeInNotebook: true };
                    const { exposeInNotebook: _exposure, ...rest } = input;
                    return rest;
                  }));
                }}
              />
              {phrase(locale, 'Expose in NodeBook')}
            </label>
          ) : null}
        </>
      }
    >
      {/* The port always docks on whichever row is actually showing the value:
          the field itself when it's a scalar, the swept-range summary below
          when it's a range — never both, and never neither. Hover handlers
          live on the row itself, not just the handle, so the value text
          hits the same target as the port circle. */}
      <div
        className="node-value-editor"
        {...(swept
          ? {}
          : {
              onMouseEnter: () => data?.onPortHover?.({ nodeId: id, port: VALUE_PORT }),
              onMouseLeave: () => data?.onPortHover?.(),
            })}
      >
        <ValueFields
          value={node.value}
          onChange={setValue}
          onSliderChange={setSliderLive}
          onSliderCommit={commitEdit}
        />
        {swept ? null : (
          <Handle
            type="source"
            position={Position.Right}
            id={VALUE_PORT}
            className={highlightedPorts.has(VALUE_PORT) ? 'port-highlighted' : ''}
          />
        )}
      </div>
      {swept ? (
        // The extent is already the two bounds above, presented once — this
        // row only earns its place for what isn't shown there: the
        // sparkline's shape and the axis label.
        <div
          className="node-value"
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: VALUE_PORT })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          {value === undefined ? null : <Sparkline reading={value} />}
          {value === undefined ? null : (
            <span className={`axis${highlightedPorts.has(VALUE_PORT) ? ' port-highlighted' : ''}`}>
              <TitleText value={axisLabel(value) ?? ''} />
            </span>
          )}
          <Handle
            type="source"
            position={Position.Right}
            id={VALUE_PORT}
            className={highlightedPorts.has(VALUE_PORT) ? 'port-highlighted' : ''}
          />
        </div>
      ) : null}
    </NodeShell>
  );
}

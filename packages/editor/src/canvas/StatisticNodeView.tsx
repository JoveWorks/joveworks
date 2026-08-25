import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  ALONG_PORT,
  PERCENTILE_PORT,
  STATISTICS,
  STATISTIC_RESULT_PORT,
  VALUE_PORT,
  type Statistic,
  type StatisticNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { changeStatistic, reframe, removeNodes, updateNode } from '../model/document';
import { NODE_HELP_URLS } from '../help-links';
import { NodeShell } from './NodeShell';
import { NumberField, TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { TitleField } from './TitleField';

export function StatisticNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'statistic') return null;
  const highlighted = new Set(data?.highlightedPorts ?? []);
  const setNode = (change: (current: StatisticNode) => StatisticNode): void =>
    edit((current) => updateNode<StatisticNode>(current, id, change));
  const port = (name: string, optional = false): ReactElement => (
    <li key={name} className={`port${highlighted.has(name) ? ' port-highlighted' : ''}`}>
      <Handle type="target" position={Position.Left} id={slotHandleId(name, 0)} />
      <span className="port-name">{name}</span>
      {optional ? <span className="port-unit">optional</span> : null}
    </li>
  );

  return (
    <NodeShell
      kind="statistic"
      helpUrl={NODE_HELP_URLS.statistic}
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={<TitleField value={node.label ?? id} onCommit={(label) => setNode((current) => ({ ...current, label }))} />}
      subtitle={`${node.running ? 'running ' : ''}${node.statistic} over a swept axis`}
      detail={
        <div className="generator-editor">
          <label>statistic
            <select value={node.statistic} onChange={(event) => edit((current) => changeStatistic(current, id, event.target.value as Statistic))}>
              {STATISTICS.map((statistic) => <option key={statistic} value={statistic}>{statistic}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={node.running ?? false} onChange={(event) => setNode((current) => ({ ...current, running: event.target.checked }))} /> running</label>
          {node.statistic === 'probability' ? <label>match <TextField value={node.match} onCommit={(match) => setNode((current) => current.statistic === 'probability' ? { ...current, match } : current)} /></label> : null}
        </div>
      }
    >
      <ul className="ports">
        {port(VALUE_PORT)}
        {port(ALONG_PORT, true)}
        {node.statistic === 'percentile' ? (
          <li className="port">
            <Handle type="target" position={Position.Left} id={slotHandleId(PERCENTILE_PORT, 0)} />
            <span className="port-name">{PERCENTILE_PORT}</span>
            <NumberField value={node.percentile} minimum={0} onCommit={(percentile) => setNode((current) => current.statistic === 'percentile' ? { ...current, percentile: Math.min(100, percentile) } : current)} />
          </li>
        ) : null}
      </ul>
      <div className="node-value">
        <span>{node.statistic}</span>
        <Handle type="source" position={Position.Right} id={STATISTIC_RESULT_PORT} className={highlighted.has(STATISTIC_RESULT_PORT) ? 'port-highlighted' : ''} />
      </div>
    </NodeShell>
  );
}

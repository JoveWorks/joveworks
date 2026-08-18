/**
 * A Monte Carlo receiver (`ROADMAP.md` #27): accumulates whatever numeric
 * series is wired to its `sample` port and plays it back sample by sample —
 * the didactic half of #27, watching values populate and an aggregate
 * converge rather than only seeing a final number.
 *
 * The playback widget itself (transport, running mean, histogram) is
 * `MonteCarloReceiverPlayback` — shared with this receiver's notebook entry
 * (`Notebook.tsx`) so a student sees the same live playback in both places.
 * This file is just that widget's canvas chrome: the node card, its ports,
 * and its settings (sample limit, ramp-up, which visuals show).
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { MONTE_CARLO_SAMPLE_PORT, type MonteCarloReceiverNode } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { ParameterLabel } from '../ParameterLabel';
import { MonteCarloReceiverPlayback } from './MonteCarloReceiverPlayback';
import { NodeShell } from './NodeShell';
import { slotHandleId } from './spectrumSlots';
import { NumberField } from './fields';
import { TitleField } from './TitleField';

export function MonteCarloReceiverNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'monteCarloReceiver') return null;

  const sampleLimit = node.sampleLimit;
  const rampUp = node.rampUp;
  const showMeanBand = node.showMeanBand ?? true;
  const showHistogram = node.showHistogram ?? true;
  const targetType = analysis.resolution?.targets.get(`${id}.${MONTE_CARLO_SAMPLE_PORT}`);

  const setReceiver = (change: (current: MonteCarloReceiverNode) => MonteCarloReceiverNode): void =>
    edit((current) => updateNode<MonteCarloReceiverNode>(current, id, change));

  return (
    <NodeShell
      kind="monteCarloReceiver"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`monteCarloReceiver-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) => edit((current) => renameNode(current, id, label))}
        />
      }
      subtitle="receiver"
      detail={
        <div className="receiver-editor">
          <label>
            sample limit
            <NumberField
              value={sampleLimit}
              integer
              minimum={1}
              onCommit={(limit) => setReceiver((current) => ({ ...current, sampleLimit: limit }))}
            />
          </label>
          <label>
            slow start
            <input
              className="nodrag"
              type="checkbox"
              checked={rampUp ?? false}
              onChange={(event) => setReceiver((current) => ({ ...current, rampUp: event.target.checked }))}
            />
          </label>
          <label>
            mean band
            <input
              className="nodrag"
              type="checkbox"
              checked={showMeanBand}
              onChange={(event) =>
                setReceiver((current) => ({ ...current, showMeanBand: event.target.checked }))
              }
            />
          </label>
          <label>
            histogram
            <input
              className="nodrag"
              type="checkbox"
              checked={showHistogram}
              onChange={(event) =>
                setReceiver((current) => ({ ...current, showHistogram: event.target.checked }))
              }
            />
          </label>
        </div>
      }
    >
      <ul className="ports">
        <li className="port">
          <Handle type="target" position={Position.Left} id={slotHandleId(MONTE_CARLO_SAMPLE_PORT, 0)} />
          <ParameterLabel
            name={MONTE_CARLO_SAMPLE_PORT}
            unit={targetType?.unit}
            nameClassName="port-name"
            unitClassName="port-unit"
          />
        </li>
      </ul>

      <MonteCarloReceiverPlayback receiverId={id} />
    </NodeShell>
  );
}

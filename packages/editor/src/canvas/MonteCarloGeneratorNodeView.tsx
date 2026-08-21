/**
 * A Monte Carlo generator (`ROADMAP.md` #27): an axis-introducing node like
 * `InputNode`, except its values are drawn from a distribution rather than
 * computed from `start`/`stop`/`points`. Sampling is deterministic
 * (`packages/kernel/src/random.ts`) — the sparkline below is the same draw
 * the kernel used to evaluate the rest of the document, not a preview of it.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { parseUnit } from '@joveworks/units';
import {
  MONTE_CARLO_DISTRIBUTIONS,
  VALUE_PORT,
  type MonteCarloDistribution,
  type MonteCarloGeneratorNode,
  type NormalMonteCarloGeneratorNode,
  type UniformMonteCarloGeneratorNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { setMonteCarloSampleCount } from '../model/monteCarlo';
import { axisLabel, reading } from '../model/values';
import { NodeShell } from './NodeShell';
import { NumberField, TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { Sparkline } from './Sparkline';
import { TitleField, TitleText } from './TitleField';

/**
 * Switching distributions keeps `id`/`count`/`unit`/`label` and picks a
 * spread for the other shape from whatever was there — not a reset back to
 * some fixed default, so a student tuning a uniform range and then trying
 * normal instead starts from roughly the same place.
 */
function toUniform(node: MonteCarloGeneratorNode): UniformMonteCarloGeneratorNode {
  if (node.distribution === 'uniform') return node;
  const { mean, stddev, ...rest } = node;
  return { ...rest, distribution: 'uniform', min: mean - stddev, max: mean + stddev };
}

function toNormal(node: MonteCarloGeneratorNode): NormalMonteCarloGeneratorNode {
  if (node.distribution === 'normal') return node;
  const { min, max, ...rest } = node;
  return { ...rest, distribution: 'normal', mean: (min + max) / 2, stddev: Math.max((max - min) / 4, 1e-6) };
}

export function MonteCarloGeneratorNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'monteCarloGenerator') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const value = reading(analysis, id, VALUE_PORT);
  const setNode = (change: (current: MonteCarloGeneratorNode) => MonteCarloGeneratorNode): void =>
    edit((current) => updateNode<MonteCarloGeneratorNode>(current, id, change));

  const setMin = (min: number): void =>
    setNode((current) => (current.distribution === 'uniform' ? { ...current, min } : current));
  const setMax = (max: number): void =>
    setNode((current) => (current.distribution === 'uniform' ? { ...current, max } : current));
  const setMean = (mean: number): void =>
    setNode((current) => (current.distribution === 'normal' ? { ...current, mean } : current));
  const setStddev = (stddev: number): void =>
    setNode((current) => (current.distribution === 'normal' ? { ...current, stddev } : current));

  return (
    <NodeShell
      kind="monteCarloGenerator"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`monteCarloGenerator-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<MonteCarloGeneratorNode>(current, id, (generator) => {
                const { axisLabel: _stale, ...rest } = generator;
                return { ...rest, label };
              });
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle={`${node.distribution} draw`}
      detail={
        <div className="generator-editor">
          <label>
            distribution
            <select
              className="nodrag"
              value={node.distribution}
              onChange={(event) => {
                const distribution = event.target.value as MonteCarloDistribution;
                setNode((current) => (distribution === 'uniform' ? toUniform(current) : toNormal(current)));
              }}
            >
              {MONTE_CARLO_DISTRIBUTIONS.map((distribution) => (
                <option key={distribution} value={distribution}>
                  {distribution}
                </option>
              ))}
            </select>
          </label>
          <label>
            samples
            <NumberField
              value={node.count}
              integer
              minimum={1}
              // Shared across every generator in the document, not just this
              // node (`ROADMAP.md` #31) — combining generators only makes
              // sense when they draw the same number of trials.
              onCommit={(count) => edit((current) => setMonteCarloSampleCount(current, count))}
            />
          </label>
        </div>
      }
    >
      <div className="node-value-editor generator-editor">
        {node.distribution === 'uniform' ? (
          <>
            <label>
              min
              <NumberField value={node.min} onCommit={setMin} />
            </label>
            <label>
              max
              <NumberField value={node.max} onCommit={setMax} />
            </label>
          </>
        ) : (
          <>
            <label>
              mean
              <NumberField value={node.mean} onCommit={setMean} />
            </label>
            <label>
              stddev
              <NumberField value={node.stddev} minimum={1e-6} onCommit={setStddev} />
            </label>
          </>
        )}
        <label>
          unit
          <TextField
            className="unit"
            value={node.unit.symbol}
            autoSize={4}
            onCommit={(text) => setNode((current) => ({ ...current, unit: parseUnit(text) }))}
          />
        </label>
      </div>
      <div className="node-value">
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className="axis">
            <TitleText value={axisLabel(value) ?? ''} />
          </span>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id={VALUE_PORT}
          className={highlightedPorts.has(VALUE_PORT) ? 'port-highlighted' : ''}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: VALUE_PORT })}
          onMouseLeave={() => data?.onPortHover?.()}
        />
      </div>
    </NodeShell>
  );
}

/**
 * A Monte Carlo generator (`ROADMAP.md` #27): an axis-introducing node like
 * `InputNode`, except its values are drawn from a distribution rather than
 * computed from `start`/`stop`/`points`. Sampling is deterministic
 * (`packages/kernel/src/random.ts`) — the sparkline below is the same draw
 * the kernel used to evaluate the rest of the document, not a preview of it.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { parseUnit, type Unit } from '@joveworks/units';
import {
  MAX_PORT,
  MEAN_PORT,
  MIN_PORT,
  MONTE_CARLO_DISTRIBUTIONS,
  STDDEV_PORT,
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
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { NumberField, TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { Sparkline } from './Sparkline';
import { TitleField, TitleText } from './TitleField';

/**
 * One distribution-parameter port row — `mean`/`stddev` or `min`/`max`,
 * whichever pair matches the node's current distribution. The same
 * wireable-with-typed-default shape `CompareNodeView.threshold` and the
 * check/plot output's own threshold row use: always editable, a wire (if
 * any) overriding it at evaluation time (`packages/kernel/src/evaluate.ts`'s
 * `generatorParam`), not this field.
 */
function ParamPort({
  name,
  value,
  unit,
  minimum,
  wired,
  highlighted,
  onCommit,
  onHover,
  onHoverEnd,
}: {
  readonly name: string;
  readonly value: number;
  readonly unit: Unit;
  readonly minimum?: number;
  readonly wired: boolean;
  readonly highlighted: boolean;
  readonly onCommit: (value: number) => void;
  readonly onHover: () => void;
  readonly onHoverEnd: () => void;
}): ReactElement {
  return (
    <li className={`port${highlighted ? ' port-highlighted' : ''}`} onMouseEnter={onHover} onMouseLeave={onHoverEnd}>
      <Handle
        type="target"
        position={Position.Left}
        id={slotHandleId(name, 0)}
        className={highlighted ? 'port-highlighted' : ''}
      />
      <ParameterLabel name={name} unit={unit} nameClassName="port-name" unitClassName="port-unit" />
      <span className="quantity-split port-quantity">
        <NumberField
          className="quantity"
          value={value}
          autoSize={4}
          {...(minimum === undefined ? {} : { minimum })}
          title={
            wired
              ? 'Overridden by the wire — this is what applies when it is removed.'
              : 'A number, unless something is wired in.'
          }
          onCommit={onCommit}
        />
      </span>
    </li>
  );
}

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
  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const onPortHover = (port: string) => () => data?.onPortHover?.({ nodeId: id, port });
  const onPortHoverEnd = () => data?.onPortHover?.();
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
      {/* A full-width row list, like every other node's wireable ports
          (`CompareNodeView`) — not nested in `.generator-editor`'s two-column
          grid, whose `.port .react-flow__handle` docks at its own row's left
          edge and needs that row spanning the node's full width to land at
          the card's edge rather than partway across it. */}
      <ul className="ports">
        {node.distribution === 'uniform' ? (
          <>
            <ParamPort
              name={MIN_PORT}
              value={node.min}
              unit={node.unit}
              wired={wired.has(MIN_PORT)}
              highlighted={highlightedPorts.has(MIN_PORT)}
              onCommit={setMin}
              onHover={onPortHover(MIN_PORT)}
              onHoverEnd={onPortHoverEnd}
            />
            <ParamPort
              name={MAX_PORT}
              value={node.max}
              unit={node.unit}
              wired={wired.has(MAX_PORT)}
              highlighted={highlightedPorts.has(MAX_PORT)}
              onCommit={setMax}
              onHover={onPortHover(MAX_PORT)}
              onHoverEnd={onPortHoverEnd}
            />
          </>
        ) : (
          <>
            <ParamPort
              name={MEAN_PORT}
              value={node.mean}
              unit={node.unit}
              wired={wired.has(MEAN_PORT)}
              highlighted={highlightedPorts.has(MEAN_PORT)}
              onCommit={setMean}
              onHover={onPortHover(MEAN_PORT)}
              onHoverEnd={onPortHoverEnd}
            />
            <ParamPort
              name={STDDEV_PORT}
              value={node.stddev}
              unit={node.unit}
              minimum={1e-6}
              wired={wired.has(STDDEV_PORT)}
              highlighted={highlightedPorts.has(STDDEV_PORT)}
              onCommit={setStddev}
              onHover={onPortHover(STDDEV_PORT)}
              onHoverEnd={onPortHoverEnd}
            />
          </>
        )}
      </ul>
      <div className="node-value-editor generator-editor">
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
    </NodeShell>
  );
}

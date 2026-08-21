/**
 * "Which input actually matters?" — a tornado diagram, built from nothing
 * more than repeated forward evaluation.
 *
 * For each candidate input, every *other* sweepable input is collapsed to a
 * representative fixed value, the candidate itself is spliced to a scalar at
 * its low and high bound in turn, and the wired target is read at both —
 * `O(2k)` full evaluations, `k` = number of candidates. Every sub-evaluation
 * is scalar (`gridSize` 1 everywhere), so cost scales with node count, not
 * sweep width, which is what lets this run live on every document edit like
 * everything else in the editor's `analysis.tsx` today.
 *
 * The one thing that is mandatory: every cloned sub-document has its
 * `output`-kind nodes stripped before evaluating. Without it, a document
 * containing a second analysis output (another Sensitivity, or a
 * Feasibility) would be recursively re-evaluated inside every one of the
 * `2k` calls, compounding combinatorially.
 */

import { isGenericDimension, type Unit } from '@joveworks/units';
import {
  VALUE_PORT,
  axes as documentAxes,
  isRange,
  renardValues,
  type AxisNode,
  type Catalogue,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type RangeSpec,
  type ValueSpec,
} from '@joveworks/schema';

import { KernelError } from './errors.js';
import { evaluateDocument, valueAt } from './evaluate.js';
import { resolveGraph, type ResolvedTableColumn, type Resolution } from './graph.js';
import type { Warning } from './warnings.js';

/** One input the tornado can rank, with its low/high bracket in its own display unit. */
export interface SensitivityCandidate {
  readonly nodeId: string;
  readonly label: string;
  readonly unit: Unit;
  readonly low: number;
  readonly high: number;
}

/** One bar of the tornado: a candidate's bracket, and the target's swing across it. */
export interface SensitivityRankingResult {
  readonly nodeId: string;
  readonly label: string;
  /** The candidate's own low/high bound, in its own display unit. */
  readonly low: number;
  readonly high: number;
  readonly unit: Unit;
  /** The target's value at the low and high bound, in canonical units. */
  readonly lowValue: number;
  readonly highValue: number;
  readonly swing: number;
}

function midpoint(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] as number;
}

function rangeBounds(
  range: RangeSpec,
  tableColumn: ResolvedTableColumn | undefined,
): { readonly unit: Unit; readonly low: number; readonly high: number } | undefined {
  switch (range.kind) {
    case 'linear':
    case 'logarithmic':
      return { unit: range.unit, low: Math.min(range.start, range.stop), high: Math.max(range.start, range.stop) };
    case 'list':
      return range.values.length === 0
        ? undefined
        : { unit: range.unit, low: Math.min(...range.values), high: Math.max(...range.values) };
    case 'renard': {
      const values = renardValues(range.series, range.start, range.stop);
      return values.length === 0
        ? undefined
        : { unit: range.unit, low: values[0] as number, high: values[values.length - 1] as number };
    }
    case 'tableColumn':
      return tableColumn === undefined || tableColumn.kind !== 'numeric' || tableColumn.values.length === 0
        ? undefined
        : { unit: tableColumn.unit, low: Math.min(...tableColumn.values), high: Math.max(...tableColumn.values) };
    // A numeric swing has no natural meaning on an unordered categorical axis.
    case 'categoricalList':
      return undefined;
  }
}

/**
 * Every input the tornado can rank, in document order: a range node's own
 * bounds, or — this is `validRange`'s first real consumer — a scalar input's
 * wired port's declared bounds, when both `min` and `max` are given.
 */
export function sensitivityCandidates(
  document: GraphDocument,
  resolution: Resolution,
): readonly SensitivityCandidate[] {
  const candidates: SensitivityCandidate[] = [];
  for (const node of document.nodes) {
    if (node.kind !== 'input') continue;

    if (isRange(node.value)) {
      const bounds = rangeBounds(node.value, resolution.tableColumns.get(node.id));
      if (bounds === undefined) continue;
      candidates.push({
        nodeId: node.id,
        label: node.axisLabel ?? node.label ?? node.id,
        unit: bounds.unit,
        low: bounds.low,
        high: bounds.high,
      });
      continue;
    }

    if (node.value.kind === 'categorical' || node.value.kind === 'spectrum') continue;

    const outgoing = document.edges.find((edge) => edge.from.node === node.id && edge.from.port === VALUE_PORT);
    if (outgoing === undefined) continue;
    const formula = resolution.formulas.get(outgoing.to.node);
    const port = formula?.inputs.find((candidate) => candidate.name === outgoing.to.port);
    if (port === undefined || port.kind !== 'numeric' || isGenericDimension(port.unit)) continue;
    const { min, max } = port.validRange ?? {};
    if (min === undefined || max === undefined) continue;
    candidates.push({ nodeId: node.id, label: node.label ?? node.id, unit: port.unit, low: min, high: max });
  }
  return candidates;
}

/** The "hold this input fixed at a representative value" transform. */
function collapseRange(range: RangeSpec, tableColumn: ResolvedTableColumn | undefined): ValueSpec {
  switch (range.kind) {
    case 'linear':
      return { kind: 'scalar', value: (range.start + range.stop) / 2, unit: range.unit };
    case 'logarithmic':
      return { kind: 'scalar', value: Math.sqrt(range.start * range.stop), unit: range.unit };
    case 'list':
      return { kind: 'scalar', value: midpoint(range.values), unit: range.unit };
    case 'renard': {
      const values = renardValues(range.series, range.start, range.stop);
      return { kind: 'scalar', value: midpoint(values.length === 0 ? [range.start] : values), unit: range.unit };
    }
    case 'tableColumn': {
      if (tableColumn === undefined) throw new KernelError('this table column could not be resolved');
      if (tableColumn.kind === 'categorical') {
        const { values } = tableColumn;
        return { kind: 'categorical', value: values[Math.floor((values.length - 1) / 2)] ?? '' };
      }
      return { kind: 'scalar', value: midpoint(tableColumn.values), unit: tableColumn.unit };
    }
    case 'categoricalList':
      return { kind: 'categorical', value: range.values[Math.floor((range.values.length - 1) / 2)] as string };
  }
}

/**
 * `node: AxisNode` because both range kinds this collapses are axis-
 * introducing — a `MonteCarloGeneratorNode` isn't a `ValueSpec`/`InputNode`
 * at all, so it gets its own collapse: uniform → mean of `[min, max]`,
 * normal → its own `mean` field.
 */
function collapseAxis(node: AxisNode, tableColumn: ResolvedTableColumn | undefined): InputNode {
  if (node.kind === 'monteCarloGenerator') {
    const value: ValueSpec =
      node.distribution === 'uniform'
        ? { kind: 'scalar', value: (node.min + node.max) / 2, unit: node.unit }
        : { kind: 'scalar', value: node.mean, unit: node.unit };
    return {
      kind: 'input',
      id: node.id,
      position: node.position,
      value,
      ...(node.frameId === undefined ? {} : { frameId: node.frameId }),
      ...(node.label === undefined ? {} : { label: node.label }),
      ...(node.displayUnits === undefined ? {} : { displayUnits: node.displayUnits }),
    };
  }
  // `documentAxes` only ever includes an `input` node here when its value is
  // a range — the same invariant `axisOf` in graph.ts relies on.
  if (!isRange(node.value)) throw new KernelError('not a range node', node.id);
  return { ...node, value: collapseRange(node.value, tableColumn) };
}

/** Every `output`-kind node stripped, and every edge that touched one — the mandatory guard. */
function stripOutputs(document: GraphDocument): GraphDocument {
  const outputIds = new Set(document.nodes.filter((node) => node.kind === 'output').map((node) => node.id));
  return {
    ...document,
    nodes: document.nodes.filter((node) => !outputIds.has(node.id)),
    edges: document.edges.filter((edge) => !outputIds.has(edge.from.node) && !outputIds.has(edge.to.node)),
  };
}

function withCandidateValue(document: GraphDocument, candidate: SensitivityCandidate, value: number): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node): GraphNode =>
      node.id === candidate.nodeId
        ? { ...(node as InputNode), value: { kind: 'scalar', value, unit: candidate.unit } }
        : node,
    ),
  };
}

function readTarget(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  targetNode: string,
  targetPort: string,
): number {
  const evaluation = evaluateDocument(document, catalogues);
  const value = valueAt(evaluation, targetNode, targetPort);
  if (value === undefined || value.kind !== 'numeric' || value.data.length === 0) {
    throw new KernelError(`'${targetNode}.${targetPort}' produced no numeric value`, targetNode);
  }
  return value.data[0] as number;
}

/**
 * Rank every candidate input by how much the wired target moves across its
 * bracket, descending — empty when there are no candidates. A candidate that
 * throws (a formula outside its domain at that bound, say) is skipped with a
 * warning rather than aborting the whole result.
 */
export function evaluateSensitivity(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  targetNode: string,
  targetPort: string,
  warnings: Warning[] = [],
): readonly SensitivityRankingResult[] {
  const resolution = resolveGraph(document, catalogues);
  const candidates = sensitivityCandidates(document, resolution);
  const axisNodes = documentAxes(document);
  const stripped = stripOutputs(document);

  const rankings: SensitivityRankingResult[] = [];
  for (const candidate of candidates) {
    try {
      let baseline = stripped;
      for (const axisNode of axisNodes) {
        if (axisNode.id === candidate.nodeId) continue;
        const collapsed = collapseAxis(axisNode, resolution.tableColumns.get(axisNode.id));
        baseline = {
          ...baseline,
          nodes: baseline.nodes.map((node) => (node.id === axisNode.id ? collapsed : node)),
        };
      }

      const lowValue = readTarget(withCandidateValue(baseline, candidate, candidate.low), catalogues, targetNode, targetPort);
      const highValue = readTarget(withCandidateValue(baseline, candidate, candidate.high), catalogues, targetNode, targetPort);
      rankings.push({
        nodeId: candidate.nodeId,
        label: candidate.label,
        low: candidate.low,
        high: candidate.high,
        unit: candidate.unit,
        lowValue,
        highValue,
        swing: Math.abs(highValue - lowValue),
      });
    } catch (error) {
      warnings.push({
        kind: 'sensitivityCandidateSkipped',
        nodeId: candidate.nodeId,
        message:
          `'${candidate.label}' could not be evaluated for sensitivity` +
          (error instanceof KernelError ? `: ${error.message}` : ''),
      });
    }
  }
  rankings.sort((a, b) => b.swing - a.swing);
  return rankings;
}

/**
 * The shafts domain's part of the kernel (ROADMAP item 19): typing and
 * evaluating the Load, Distributed load, Support and Shaft nodes, the
 * `shaft:` formula evaluator, and the Shaft view output, registered through
 * the kernel's `domain.ts`. Part of the shafts domain; `../kernel.ts`
 * loads it, which is what registers the kinds.
 */

import {
  SHAFTS_DOMAIN,
  ACTING_PORT,
  LOAD_FIELD_UNITS,
  LOAD_PORT,
  SHAFT_FIELD_UNITS,
  SHAFT_I_PORT,
  SHAFT_PORT,
  SHAFT_PROFILE_PORT,
  SHAFT_Z_PORT,
  SUPPORT_PORT,
  loadFieldValue,
  loadNodeFields,
  shaftFieldValue,
  shaftNodeFields,
  type DistributedLoadNode,
  type FormulaShaft,
  type LoadNode,
  type ShaftNode,
  type SupportNode,
} from '../schema.js';
import {
  registerKernelEvaluator,
  registerKernelNode,
  registerKernelOutput,
  registerKernelPortKind,
  type ResolveContext,
} from '@joveworks/kernel';
import type { PortValue } from '@joveworks/kernel';
import {
  evaluateLoad,
  evaluateShaft,
  evaluateShaftNode,
  shaftProfile,
  shaftSecondMoment,
  shaftView,
  type ShaftViewResult,
} from './evaluate.js';
import { loadSeries, shaftSeries, type LoadValue, type ShaftValue } from './values.js';

declare module '@joveworks/kernel' {
  interface DomainValueTypes {
    load: LoadValue;
    shaft: ShaftValue;
  }
  interface DomainResultTypes {
    shaftView: ShaftViewResult;
  }
  interface DomainWarningTypes {
    /** More than one bearing locates a shaft axially. */
    shaftSupports: true;
    /** A shaft view could not draw part of what is wired to it. */
    shaftView: true;
  }
}

registerKernelPortKind({
  domain: SHAFTS_DOMAIN,
  kind: 'load',
  noun: 'a load or a support',
  // Bundling a shaft's loads and supports into one wire is the point of a pack here.
  packable: true,
  stranded: "this wire carries a load or a support, which only a shaft diagram's 'acting' port takes",
  series: (value: LoadValue) => loadSeries(value),
});

registerKernelPortKind({
  domain: SHAFTS_DOMAIN,
  kind: 'shaft',
  noun: 'a shaft',
  packable: false,
  stranded: "this wire carries a shaft, which only a shaft diagram's 'shaft' port takes",
  series: (value: ShaftValue) => shaftSeries(value),
});

/**
 * A load or support node's fields: `RangeNode`'s shape with a fixed
 * dimension per field — each field is a port, typed by `LOAD_FIELD_UNITS`,
 * its typed value the fallback.
 */
function resolveLoad(node: LoadNode | DistributedLoadNode | SupportNode, context: ResolveContext): void {
  for (const field of node.kind === 'support' ? (['at'] as const) : loadNodeFields(node)) {
    context.field(field, LOAD_FIELD_UNITS[field], (node.kind === 'support' ? node.at : loadFieldValue(node, field))?.unit);
  }
  context.source(node.kind === 'support' ? SUPPORT_PORT : LOAD_PORT, { kind: 'load' });
}

for (const kind of ['load', 'distributedLoad'] as const) {
  registerKernelNode({
    domain: SHAFTS_DOMAIN,
    kind,
    resolve: (node: LoadNode | DistributedLoadNode, context) => resolveLoad(node, context),
    evaluate: (node: LoadNode | DistributedLoadNode, { resolution, values }) =>
      new Map<string, PortValue>([[LOAD_PORT, evaluateLoad(node, resolution, values)]]),
  });
}

registerKernelNode({
  domain: SHAFTS_DOMAIN,
  kind: 'support',
  resolve: (node: SupportNode, context) => resolveLoad(node, context),
  evaluate: (node: SupportNode, { resolution, values }) =>
    new Map<string, PortValue>([[SUPPORT_PORT, evaluateLoad(node, resolution, values)]]),
});

registerKernelNode({
  domain: SHAFTS_DOMAIN,
  kind: 'shaft',
  resolve: (node: ShaftNode, context) => {
    // A range's shape again: each wireable field is a port of a fixed
    // dimension, its typed value the fallback.
    for (const field of shaftNodeFields(node)) context.field(field, SHAFT_FIELD_UNITS[field], shaftFieldValue(node, field)?.unit);
    context.source(SHAFT_PORT, { kind: 'shaft' });
    const zUnit = node.from.unit;
    context.source(SHAFT_Z_PORT, { kind: 'numeric', dimension: zUnit.dimension, unit: zUnit });
    const iUnit = node.section.kind === 'secondMoment' ? node.section.I.unit : SHAFT_FIELD_UNITS.I;
    context.source(SHAFT_I_PORT, { kind: 'numeric', dimension: iUnit.dimension, unit: iUnit });
    if (node.section.kind !== 'secondMoment') {
      const dUnit = node.section.kind === 'stepped' ? node.section.unit : node.section.d.unit;
      context.source(SHAFT_PROFILE_PORT, { kind: 'numeric', dimension: dUnit.dimension, unit: dUnit });
    }
  },
  evaluate: (node: ShaftNode, { resolution, values }) => {
    const shaft = evaluateShaftNode(node, resolution, values);
    const produced = new Map<string, PortValue>([
      [SHAFT_PORT, shaft],
      [SHAFT_Z_PORT, shaft.z],
      [SHAFT_I_PORT, shaftSecondMoment(shaft)],
    ]);
    if (node.section.kind !== 'secondMoment') produced.set(SHAFT_PROFILE_PORT, shaftProfile(node, shaft, resolution, values));
    return produced;
  },
  axis: {
    label: (node: ShaftNode) => node.axisLabel ?? 'z',
    length: (node: ShaftNode) => node.count,
    coordinatePort: SHAFT_Z_PORT,
    // The positions along a shaft are geometry, not an uncertain input: they
    // collapse to the shaft's midpoint, the same way a range collapses to its
    // own, and the diagrams are read there.
    collapse: (node: ShaftNode) => ({ ...node, count: 1 }),
  },
});

registerKernelOutput({
  domain: SHAFTS_DOMAIN,
  kind: 'shaftView',
  // A shaft view draws a shaft, what acts on it, and any diagrams of it —
  // the last two take a wire per load or diagram.
  ports: () => [SHAFT_PORT, ACTING_PORT],
  variadic: [ACTING_PORT],
  resolve: (_node, context) => {
    const shaft = context.wired(SHAFT_PORT);
    context.target(SHAFT_PORT, { kind: 'shaft' });
    if (shaft !== undefined) context.checkKind(shaft, { kind: 'shaft' }, SHAFT_PORT);
    context.structuredInputs(ACTING_PORT, 'load');
  },
  evaluate: (node, { resolution, values, warnings }) => shaftView(node, resolution, values, warnings),
});

registerKernelEvaluator({
  domain: SHAFTS_DOMAIN,
  key: 'shaft',
  evaluate: (node, formula, spec: FormulaShaft, { resolution, values, warnings, largeGrid }) =>
    evaluateShaft(node, formula, spec, resolution, values, warnings, largeGrid),
});

export { loadSeries, shaftSeries } from './values.js';
export type { LoadValue, PointLoadValue, SpanLoadValue, SupportValue, ShaftValue } from './values.js';
export type { ShaftViewMark, ShaftViewPlane, ShaftViewResult, ShaftViewSpan } from './evaluate.js';

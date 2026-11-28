/**
 * What a domain adds to the kernel (ROADMAP item 19) — the counterpart of
 * the schema's `domain.ts`, which adds the same kinds to the formats.
 *
 * The kernel knows its own node and output kinds and nothing else. A domain
 * registers, per kind, how it is typed during resolution and what it
 * evaluates to; and, per structured port kind (a load, a shaft), how a wire
 * carrying one behaves. The generic rules for structured values live in the
 * core and need no registration of their own: such a value is carried whole
 * — never broadcast into an expression, never rendered by a core output — so
 * it travels through waypoints, rides in a pack when its kind allows it,
 * lands only on ports that declare its kind, and joins a variadic port the
 * way numbers do, a pack holding nothing but that kind included.
 *
 * Types are added the way the schema's are, by declaration merging:
 * `DomainValueTypes` for what a structured port carries, `DomainResultTypes`
 * for what a domain output produces, `DomainWarningTypes` for the warnings
 * it raises.
 */

import type { DomainOwned, Edge, Formula, GraphDocument, GraphNode, OutputNode, PortKind } from '@joveworks/schema';
import type { Unit } from '@joveworks/units';
import type { Axis, NumericSeries, PortValue } from './series.js';
import type { PortType, Resolution } from './graph.js';
import type { Warning } from './warnings.js';

/** What each structured port kind carries, keyed by `kind`. Filled by declaration merging. */
export interface DomainValueTypes {}

/** What each domain output kind evaluates to, keyed by `kind`. Filled by declaration merging. */
export interface DomainResultTypes {}

/** The warning kinds a domain raises, as keys (their values are unused). Filled by declaration merging. */
export interface DomainWarningTypes {}

export type DomainValue = DomainValueTypes[keyof DomainValueTypes];
export type DomainResult = DomainResultTypes[keyof DomainResultTypes];

/** What the core sees of a structured value it does not know: a kind string (see `AnyDomainNode` in the schema). */
export type AnyDomainValue = { readonly kind: string };

/**
 * A structured port kind's behaviour on a wire. `noun` is how an error
 * names what the wire carries ("a load or a support"); `stranded` is what
 * a wire carrying one is told when it lands somewhere nothing reads it.
 * `series` lists the numbers inside a value, so broadcasting and the zip
 * checks see the axes it varies along.
 */
export interface KernelPortKindDefinition extends DomainOwned {
  readonly kind: string;
  readonly noun: string;
  /** Whether a pack may carry it as a channel. */
  readonly packable: boolean;
  readonly stranded: string;
  series(value: never): readonly NumericSeries[];
}

/** What a domain node or output is given while the graph is being typed. */
export interface ResolveContext {
  readonly document: GraphDocument;
  /** Declare what an input port takes. */
  target(port: string, type: PortType): void;
  /** Declare what an output port produces; a display unit the student chose applies to a numeric one. */
  source(port: string, type: PortType): void;
  /** What the one wire into `port` carries, if one is wired (a second is refused). */
  wired(port: string): PortType | undefined;
  /** Every wire into a variadic `port`, with what each carries. */
  wiredAll(port: string): readonly { readonly edge: Edge; readonly type: PortType }[];
  /** Refuse a wire whose kind is not the port's. */
  checkKind(source: PortType, target: PortType, port: string): void;
  /**
   * The common shape of a field port: a fixed dimension, the typed value's
   * unit (or the reference unit) to display in, and a wire, if any, that
   * must match it.
   */
  field(port: string, reference: Unit, typed?: Unit): void;
  /**
   * A variadic port taking `kind`: every wire must carry one, or a pack of
   * nothing else.
   */
  structuredInputs(port: string, kind: PortKind): void;
}

/** What a domain node, output or evaluator is given while the graph is evaluated. */
export interface EvaluateContext {
  readonly resolution: Resolution;
  readonly values: ReadonlyMap<string, PortValue>;
  readonly warnings: Warning[];
  /** The grid size past which a large-grid warning is raised. */
  readonly largeGrid: number;
}

/**
 * The axis a domain node introduces of its own, where its schema definition
 * says it does (`introducesAxis`).
 */
export interface KernelAxisDefinition {
  readonly label: (node: never) => string;
  readonly length: (node: never) => number;
  /** The output port holding the axis coordinates, which a plot reads. */
  readonly coordinatePort: string;
  /** The node with its axis collapsed to one point, for a sensitivity study's baseline. */
  readonly collapse: (node: never) => GraphNode;
}

export interface KernelNodeDefinition extends DomainOwned {
  readonly kind: string;
  resolve(node: never, context: ResolveContext): void;
  /** Every output port's value, by port name. */
  evaluate(node: never, context: EvaluateContext): ReadonlyMap<string, PortValue>;
  readonly axis?: KernelAxisDefinition;
}

export interface KernelOutputDefinition extends DomainOwned {
  readonly kind: string;
  /** The output's input ports. */
  ports(output: never): readonly string[];
  /** Those of them that take several wires. */
  readonly variadic: readonly string[];
  resolve(node: OutputNode, context: ResolveContext): void;
  /** The result, without the fields every output result has (`nodeId`, `label`, …). */
  evaluate(node: OutputNode, context: EvaluateContext): Readonly<Record<string, unknown>>;
}

/**
 * A domain formula evaluator (`DomainEvaluatorDefinition` in the schema):
 * every output of a formula carrying `key`, computed from its parsed value.
 */
export interface KernelEvaluatorDefinition extends DomainOwned {
  readonly key: string;
  evaluate(
    node: { readonly id: string },
    formula: Formula,
    spec: never,
    context: EvaluateContext,
  ): ReadonlyMap<string, PortValue>;
}

const portKinds = new Map<string, KernelPortKindDefinition>();
const nodes = new Map<string, KernelNodeDefinition>();
const outputs = new Map<string, KernelOutputDefinition>();
const evaluators = new Map<string, KernelEvaluatorDefinition>();

/**
 * As in the schema (`claim` in its `domain.ts`): a kind belongs to one
 * domain, so a second domain registering it is refused, naming both, and the
 * same domain registering again replaces its own.
 */
function claim<T extends DomainOwned>(registry: Map<string, T>, what: string, name: string, definition: T): void {
  const existing = registry.get(name);
  if (existing !== undefined && existing.domain !== definition.domain) {
    throw new Error(
      `'${name}' is a ${what} of both the '${existing.domain}' and the '${definition.domain}' domains — ` +
        'a kind belongs to one domain, so build only one of them',
    );
  }
  registry.set(name, definition);
}

export function registerKernelPortKind(definition: KernelPortKindDefinition): void {
  claim(portKinds, 'port kind', definition.kind, definition);
}

export function registerKernelNode(definition: KernelNodeDefinition): void {
  claim(nodes, 'node kind', definition.kind, definition);
}

export function registerKernelOutput(definition: KernelOutputDefinition): void {
  claim(outputs, 'output kind', definition.kind, definition);
}

export function registerKernelEvaluator(definition: KernelEvaluatorDefinition): void {
  claim(evaluators, 'formula evaluator', definition.key, definition);
}

export function kernelPortKind(kind: string): KernelPortKindDefinition | undefined {
  return portKinds.get(kind);
}

export function kernelNode(kind: string): KernelNodeDefinition | undefined {
  return nodes.get(kind);
}

export function kernelOutput(kind: string): KernelOutputDefinition | undefined {
  return outputs.get(kind);
}

export function kernelEvaluator(key: string): KernelEvaluatorDefinition | undefined {
  return evaluators.get(key);
}

/** Whether a value is a domain's structured value rather than a core one. */
export function isDomainValue(value: PortValue): value is DomainValue {
  return portKinds.has(value.kind);
}

/** Whether a port type is a domain's structured kind. */
export function isStructuredKind(kind: string): boolean {
  return portKinds.has(kind);
}

/** The axis a domain node introduces, as `Resolution.axes` holds it. */
export function domainAxis(node: GraphNode, order: number): Axis | undefined {
  const axis = nodes.get(node.kind)?.axis;
  if (axis === undefined) return undefined;
  return { id: node.id, label: axis.label(node as never), length: axis.length(node as never), order };
}

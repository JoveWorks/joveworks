/**
 * What a domain adds to the document and catalogue formats (ROADMAP item 19).
 *
 * The core knows its own node, output and port kinds and nothing else; a
 * domain — the shafts, say — brings more, and this is where it says how they
 * are read and written. Two halves, for the compiler and for the parser:
 *
 * - **Types.** The interfaces below start empty, and a domain fills them by
 *   declaration merging (`declare module` … `interface DomainNodeTypes {
 *   shaft: ShaftNode }`). `GraphNode`, `Output` and `Port` take every member
 *   in, so narrowing on `kind` is as exact for a domain's node as for a core
 *   one. A program that does not include the domain sees no such kinds at
 *   all — which is the point: the core compiled alone cannot name a shaft,
 *   so whatever it does with a node it does not know goes through here.
 * - **Parsing.** `registerDomainNode` and friends hand the parsers a kind's
 *   reading and writing, at startup and before anything is opened. A kind
 *   nobody registered is refused the way an unknown core kind is.
 *
 * The saved form of a domain's kind is exactly what a core kind's is — its
 * `kind` string and its own fields beside the common ones — so moving a kind
 * between the core and a domain never changes a file.
 */

import type { GraphNode, NodeBase, Output } from './document.js';
import type { JsonObject, JsonValue } from './json.js';
import type { Port, PortBase } from './port.js';

/** Node kinds a domain adds, keyed by `kind`. Filled by declaration merging. */
export interface DomainNodeTypes {}

/**
 * The subset of `DomainNodeTypes` that introduce a sweep axis of their own
 * (`introducesAxis`) — what `AxisNode` takes in. Filled by declaration merging.
 */
export interface DomainAxisNodeTypes {}

/** Output kinds a domain adds, keyed by `kind`. Filled by declaration merging. */
export interface DomainOutputTypes {}

/** Port kinds a domain adds, keyed by `kind`. Filled by declaration merging. */
export interface DomainPortTypes {}

export type DomainNode = DomainNodeTypes[keyof DomainNodeTypes];

/*
 * What the core sees of a domain kind it does not know: the common fields
 * and a kind string. Compiled without any domain, `DomainNode` is `never`, so
 * past an `isDomainNode` guard the core reads the node through this instead.
 */
export type AnyDomainNode = NodeBase & { readonly kind: string };
export type AnyDomainOutput = { readonly kind: string };
export type AnyDomainPort = PortBase & { readonly kind: string };
export type DomainAxisNode = DomainAxisNodeTypes[keyof DomainAxisNodeTypes];
export type DomainOutput = DomainOutputTypes[keyof DomainOutputTypes];
export type DomainPort = DomainPortTypes[keyof DomainPortTypes];

/**
 * What every registration carries: the domain that owns it, by its folder
 * name under `domains/` (`shafts`). A kind is a name in the saved format, so
 * it belongs to exactly one domain — see `claim` below.
 */
export interface DomainOwned {
  readonly domain: string;
}

/**
 * How one domain node kind is read and written. `parse` and `serialize`
 * deal in the kind's own fields only; the common ones (`id`, `position`,
 * `label` and the rest) are the core's.
 */
export interface DomainNodeDefinition extends DomainOwned {
  readonly kind: string;
  parse(object: JsonObject, path: string): JsonObject | Readonly<Record<string, unknown>>;
  serialize(node: never): JsonObject;
  /**
   * Whether the node introduces a sweep axis of its own, the way a range
   * does (`axes` in `document.ts`). Absent means it never does.
   */
  readonly introducesAxis?: (node: never) => boolean;
}

/** How one domain output kind is read and written, apart from its `kind`. */
export interface DomainOutputDefinition extends DomainOwned {
  readonly kind: string;
  parse(object: JsonObject, path: string): Readonly<Record<string, unknown>>;
  serialize(output: never): JsonObject;
}

/**
 * How one domain port kind is read and written, apart from `kind`, `name`
 * and `description`. A domain port carries a structured value, never a
 * number, so it has no unit and no dimension; and only the domain's own
 * nodes produce one, never a catalogue formula — `outputRefusal` is what a
 * formula declaring one as its output is told.
 */
export interface DomainPortDefinition extends DomainOwned {
  readonly kind: string;
  parse(object: JsonObject, path: string): Readonly<Record<string, unknown>>;
  serialize(port: never): JsonObject;
  readonly outputRefusal: string;
}

/**
 * A formula evaluator a domain adds beside `lookup`, `piecewise` and
 * `deflection`: a catalogue record's field `key` (`shaft`, say), answering
 * every output of its formula. A formula carrying one declares no
 * expression and no other evaluator. The parsed value sits on the `Formula`
 * under the same key, which the domain declares by merging into `Formula`.
 * `check` sees the formula's ports, to refuse a record that names an input
 * it does not have.
 */
export interface DomainEvaluatorDefinition extends DomainOwned {
  readonly key: string;
  /** What the evaluator is, for error messages: "a shaft diagram". */
  readonly noun: string;
  parse(value: JsonValue, path: string): unknown;
  check(value: never, ports: { readonly inputs: readonly unknown[]; readonly outputs: readonly unknown[] }, path: string): void;
  serialize(value: never): JsonValue;
}

const nodes = new Map<string, DomainNodeDefinition>();
const outputs = new Map<string, DomainOutputDefinition>();
const ports = new Map<string, DomainPortDefinition>();
const evaluators = new Map<string, DomainEvaluatorDefinition>();

type Registered = 'node kind' | 'output kind' | 'port kind' | 'formula evaluator';

/**
 * The names a domain may not take, because the core already has them: its
 * own node, output and port kinds, and the fields of a formula record (a
 * domain evaluator is one more such field). The modules that define them
 * hand them in as they load (`reserveCoreNames`), so this one imports
 * nothing of theirs and no import cycle forms.
 */
const CORE_NAMES: Record<Registered, Set<string>> = {
  'node kind': new Set(),
  'output kind': new Set(),
  'port kind': new Set(),
  'formula evaluator': new Set(),
};

export function reserveCoreNames(what: Registered, names: readonly string[]): void {
  for (const name of names) CORE_NAMES[what].add(name);
}

/**
 * Record `definition` as `name`'s, or refuse it. A kind is a name in the
 * saved format, so two domains cannot both own one: a school that copies
 * the shafts into its own domain while the upstream one is still built in
 * would otherwise get whichever registered last, silently. The same domain
 * registering again replaces its own — a module evaluated twice (a hot
 * reload, two test files) must not leave two readers for one kind.
 */
function claim<T extends DomainOwned>(registry: Map<string, T>, what: Registered, name: string, definition: T): void {
  if (CORE_NAMES[what].has(name)) {
    throw new Error(`the '${definition.domain}' domain registers '${name}', which is already one of JoveWorks' own ${what}s`);
  }
  const existing = registry.get(name);
  if (existing !== undefined && existing.domain !== definition.domain) {
    throw new Error(
      `'${name}' is a ${what} of both the '${existing.domain}' and the '${definition.domain}' domains — ` +
        'a kind belongs to one domain, so build only one of them',
    );
  }
  registry.set(name, definition);
}

export function registerDomainNode(definition: DomainNodeDefinition): void {
  claim(nodes, 'node kind', definition.kind, definition);
}

export function registerDomainOutput(definition: DomainOutputDefinition): void {
  claim(outputs, 'output kind', definition.kind, definition);
}

export function registerDomainPort(definition: DomainPortDefinition): void {
  claim(ports, 'port kind', definition.kind, definition);
}

export function registerDomainEvaluator(definition: DomainEvaluatorDefinition): void {
  claim(evaluators, 'formula evaluator', definition.key, definition);
}

export function domainNodeDefinition(kind: string): DomainNodeDefinition | undefined {
  return nodes.get(kind);
}

export function domainOutputDefinition(kind: string): DomainOutputDefinition | undefined {
  return outputs.get(kind);
}

export function domainPortDefinition(kind: string): DomainPortDefinition | undefined {
  return ports.get(kind);
}

export function domainNodeKinds(): readonly string[] {
  return [...nodes.keys()];
}

export function domainOutputKinds(): readonly string[] {
  return [...outputs.keys()];
}

export function domainPortKinds(): readonly string[] {
  return [...ports.keys()];
}

export function domainEvaluators(): readonly DomainEvaluatorDefinition[] {
  return [...evaluators.values()];
}

// The guards the core narrows with: past one, what is left is a core kind,
// and a switch over it is exhaustive again.

export function isDomainNode(node: GraphNode): node is DomainNode {
  return nodes.has(node.kind);
}

export function isDomainOutput(output: Output): output is DomainOutput {
  return outputs.has(output.kind);
}

export function isDomainPort(port: Port): port is DomainPort {
  return ports.has(port.kind);
}

/**
 * The domain evaluator a formula carries, if any: its key (`shaft`) and its
 * parsed value. At most one — the parser refuses a second.
 */
export function domainEvaluation(formula: object): { readonly key: string; readonly value: unknown } | undefined {
  const fields = formula as Readonly<Record<string, unknown>>;
  for (const key of evaluators.keys()) {
    if (fields[key] !== undefined) return { key, value: fields[key] };
  }
  return undefined;
}

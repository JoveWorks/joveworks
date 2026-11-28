/**
 * The shafts domain's part of the formats (ROADMAP item 19): Shaft, Support,
 * Load and Distributed load nodes, the Shaft view output, the `load` and
 * `shaft` port kinds and the `shaft:` formula evaluator — everything the
 * formats know about shafts. It adds its
 * kinds through `domain.ts`: declaration merging for the types, and a
 * registration for the parsers, run when this module loads.
 *
 * Part of the examples domain; nothing in the schema package imports it.
 * `../kernel.ts` loads it, which is what registers the kinds.
 */

import { ANGLE, dimensionsEqual, FORCE, LENGTH, multiplyDimensions, parseUnit, type Dimension, type Unit } from '@joveworks/units';
import {
  fail,
  join,
  optional,
  parseQuantity,
  parseUnitField,
  portDimension,
  put,
  readArray,
  readBoolean,
  readEnum,
  readInteger,
  readName,
  readNumber,
  readObject,
  readString,
  registerDomainEvaluator,
  registerDomainNode,
  registerDomainOutput,
  registerDomainPort,
  required,
  serializeQuantity,
  type JsonObject,
  type JsonValue,
  type NodeBase,
  type OutputPort,
  type Port,
  type PortBase,
  type Quantity,
} from '@joveworks/schema';

declare module '@joveworks/schema' {
  interface DomainNodeTypes {
    load: LoadNode;
    distributedLoad: DistributedLoadNode;
    support: SupportNode;
    shaft: ShaftNode;
  }
  interface DomainAxisNodeTypes {
    shaft: ShaftNode;
  }
  interface DomainOutputTypes {
    shaftView: ShaftViewOutput;
  }
  interface DomainPortTypes {
    load: LoadPort;
    shaft: ShaftPort;
  }

  interface Formula {
    /** Optional shaft-diagram evaluator; a formula carrying it has no expression and no other evaluator. */
    readonly shaft?: FormulaShaft;
  }
}

/**
 * A drawing of a shaft: its outline from the Shaft node wired into `shaft`
 * (steps and bore to scale), the supports and loads wired into `acting`, one
 * elevation per transverse plane, and any diagrams wired into `diagrams`
 * drawn underneath on the same z scale. Nothing to configure: everything it
 * shows comes from its wires.
 */
export interface ShaftViewOutput {
  readonly kind: 'shaftView';
}

/** A shaft view's (and a shaft diagram's) variadic port for loads and supports. */
export const ACTING_PORT = 'acting';

/** The one output port of a Load and a Distributed load node. */
export const LOAD_PORT = 'load';

/** A Load node's fields, which are also its input ports, in display order. */
export const POINT_LOAD_FIELDS = ['at', 'Fx', 'Fy', 'torque', 'Cx', 'Cy'] as const;
export type PointLoadField = (typeof POINT_LOAD_FIELDS)[number];

/** A Distributed load node's fields, which are also its input ports, in display order. */
export const SPAN_LOAD_FIELDS = ['from', 'to', 'qx', 'qy'] as const;
export type SpanLoadField = (typeof SPAN_LOAD_FIELDS)[number];

export type LoadField = PointLoadField | SpanLoadField;

/**
 * Each load field's reference unit. Its dimension is the field's type — a
 * typed value or a wire must match it — and it is the unit a fresh node is
 * typed in.
 */
export const LOAD_FIELD_UNITS: Readonly<Record<LoadField, Unit>> = {
  at: parseUnit('mm'),
  Fx: parseUnit('N'),
  Fy: parseUnit('N'),
  torque: parseUnit('Nmm'),
  Cx: parseUnit('Nmm'),
  Cy: parseUnit('Nmm'),
  from: parseUnit('mm'),
  to: parseUnit('mm'),
  qx: parseUnit('N/mm'),
  qy: parseUnit('N/mm'),
};

/**
 * One physical load on a shaft: where it acts and everything it applies
 * there, on one wire. A gear's two force components, its torque and the
 * couple its axial force makes about the shaft all sit at one position, so
 * they are one node rather than several entries kept in step by hand.
 *
 * The shaft runs along z, so the transverse planes are x and y. `Fx` and `Fy`
 * are signed forces in those planes; `Cx` and `Cy` are concentrated bending
 * couples, each named by the plane whose moment diagram it enters.
 *
 * Every field is also an input port of the same name, the field the value
 * that applies until something is wired there — `RangeNode`'s shape. An
 * absent optional field is zero. The output port `LOAD_PORT` carries the
 * whole load.
 */
export interface LoadNode extends NodeBase {
  readonly kind: 'load';
  /** Position along the shaft. */
  readonly at: Quantity;
  /** Transverse force in the x plane. */
  readonly Fx?: Quantity;
  /** Transverse force in the y plane. */
  readonly Fy?: Quantity;
  readonly torque?: Quantity;
  /** Bending couple entering the x-plane moment diagram. */
  readonly Cx?: Quantity;
  /** Bending couple entering the y-plane moment diagram. */
  readonly Cy?: Quantity;
}

/**
 * A uniform load over a span of the shaft, `from` to `to`, as a force per
 * length in each transverse plane. Produces the same kind of wire as a
 * `LoadNode`, so a diagram takes both on one port. Fields are ports exactly
 * as there; `to ≥ from` is checked by the kernel, since a wired value can
 * break it.
 */
export interface DistributedLoadNode extends NodeBase {
  readonly kind: 'distributedLoad';
  readonly from: Quantity;
  readonly to: Quantity;
  /** Force per length in the x plane. */
  readonly qx?: Quantity;
  /** Force per length in the y plane. */
  readonly qy?: Quantity;
}

export const SUPPORT_TYPES = ['simple', 'fixed', 'locating', 'floating'] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

/**
 * Where the shaft is held, and how. It produces the same `load` wire as a
 * Load node and goes into the same `acting` port of a shaft diagram, which
 * solves its reaction.
 *
 * - `simple` — a pin or roller: takes a transverse force, free to rotate.
 * - `fixed` — clamped: takes a force and a bending moment. One alone holds a
 *   cantilever.
 * - `locating`, `floating` — rolling bearings, simple supports in bending.
 *   Their roles differ only axially, which the diagrams do not model; the
 *   kernel warns when more than one bearing locates the shaft.
 *
 * `at` is a port of the same name, the typed value applying until something
 * is wired there.
 */
export interface SupportNode extends NodeBase {
  readonly kind: 'support';
  readonly at: Quantity;
  readonly support: SupportType;
}

/** A Support node's one output port. It carries the same kind of wire as a load. */
export const SUPPORT_PORT = 'support';

/** A Shaft node's output ports: the shaft itself, and the positions along it. */
export const SHAFT_PORT = 'shaft';
export const SHAFT_Z_PORT = 'z';
/** A round or stepped Shaft node's outer diameter along its own z — what a plot draws the profile from. */
export const SHAFT_PROFILE_PORT = 'profile';
/** A Shaft node's second moment of area along its own z, whatever its section — the I the solve uses. */
export const SHAFT_I_PORT = 'I';

/** One step of a stepped shaft, in the profile's own unit. `d_i` absent means solid. */
export interface ShaftStep {
  /** Where this step starts along the shaft; it runs to the next step's start. */
  readonly start: number;
  readonly d: number;
  readonly d_i?: number;
}

/**
 * A shaft's cross-section along its length.
 *
 * - `round` — one solid or hollow round section throughout.
 * - `secondMoment` — one section of any shape, given by its I.
 * - `stepped` — a round section per step, typed as rows. A step runs from its
 *   own `start` to the next one's; the first also covers anything before it,
 *   the last anything after.
 */
export type ShaftSection =
  | { readonly kind: 'round'; readonly d: Quantity; readonly d_i?: Quantity }
  | { readonly kind: 'secondMoment'; readonly I: Quantity }
  | { readonly kind: 'stepped'; readonly unit: Unit; readonly steps: readonly ShaftStep[] };

export const SHAFT_SECTION_KINDS = ['round', 'secondMoment', 'stepped'] as const;

/**
 * The shaft a diagram is drawn on: its extent `from`–`to` along z, Young's
 * modulus `E`, and its section — enough for a diagram to solve any support
 * arrangement, statically indeterminate ones included, and to draw the
 * deflection of a stepped shaft with its real stiffness.
 *
 * An axis-introducing node like `RangeNode`: `count` points from `from` to
 * `to` are its `z` output, which every diagram it feeds is drawn along. A
 * round or stepped shaft also outputs its outer diameter at each of those
 * points, `profile`, to plot against what the diagrams require.
 * `from`, `to`, `E` and a `round` or `secondMoment` section's fields are also
 * ports of the same name, typed until wired; a stepped profile's rows are
 * typed only.
 */
export interface ShaftNode extends NodeBase {
  readonly kind: 'shaft';
  readonly from: Quantity;
  readonly to: Quantity;
  readonly count: number;
  readonly E: Quantity;
  readonly section: ShaftSection;
  /** What the axis is called. Defaults to `z`. */
  readonly axisLabel?: string;
}

/** A Shaft node's wireable fields, in display order, given its section. */
export function shaftNodeFields(node: ShaftNode): readonly ('from' | 'to' | 'E' | 'd' | 'd_i' | 'I')[] {
  const section = node.section.kind === 'round' ? (['d', 'd_i'] as const) : node.section.kind === 'secondMoment' ? (['I'] as const) : [];
  return ['from', 'to', 'E', ...section];
}

/** A Shaft node's reference unit per wireable field: its dimension is the field's type. */
export const SHAFT_FIELD_UNITS: Readonly<Record<'from' | 'to' | 'E' | 'd' | 'd_i' | 'I', Unit>> = {
  from: parseUnit('mm'),
  to: parseUnit('mm'),
  E: parseUnit('N/mm²'),
  d: parseUnit('mm'),
  d_i: parseUnit('mm'),
  I: parseUnit('mm⁴'),
};

/** A Shaft node's typed value for one wireable field, if it has one. */
export function shaftFieldValue(node: ShaftNode, field: 'from' | 'to' | 'E' | 'd' | 'd_i' | 'I'): Quantity | undefined {
  if (field === 'from' || field === 'to' || field === 'E') return node[field];
  const section = node.section as Partial<Record<'d' | 'd_i' | 'I', Quantity>>;
  return section[field];
}

/** A load node's fields, in display order — the ports it takes. */
export function loadNodeFields(node: LoadNode | DistributedLoadNode): readonly LoadField[] {
  return node.kind === 'load' ? POINT_LOAD_FIELDS : SPAN_LOAD_FIELDS;
}

/** A load node's typed value for one of its fields, if it has one. */
export function loadFieldValue(node: LoadNode | DistributedLoadNode, field: LoadField): Quantity | undefined {
  return (node as unknown as Partial<Record<LoadField, Quantity>>)[field];
}

/** What a shaft record answers: quantities along the shaft, or one support's reaction. */
export const SHAFT_ANSWERS = ['diagrams', 'reactions'] as const;
export type ShaftAnswer = (typeof SHAFT_ANSWERS)[number];

/** A quantity a `diagrams` shaft record may draw along the shaft, one per output. */
export const SHAFT_QUANTITIES = ['shear', 'moment', 'deflection', 'slope', 'torque'] as const;
export type ShaftQuantity = (typeof SHAFT_QUANTITIES)[number];

/** What a shaft record's `plane` input may name. */
export const SHAFT_PLANES = ['x', 'y', 'resultant'] as const;

/**
 * A shaft calculation from everything acting on a shaft — every Load,
 * Distributed load and Support node wired into one `acting` port — on the
 * shaft a Shaft node describes.
 *
 * The support reactions are solved inside, for any arrangement: equilibrium,
 * plus zero deflection at every support and zero slope at a fixed one, with
 * the shaft's own stiffness section by section. So a statically
 * indeterminate shaft (three bearings, a fixed end and a bearing) is solved
 * as readily as two simple supports, and a stepped shaft's reactions and
 * deflection use its real I. Signs follow the loads: a force is positive up
 * in its plane, a couple positive clockwise with z to the right, and the
 * moment is positive when the shaft sags.
 *
 * - `diagrams` — one output per entry of `quantities`, in order: shear V,
 *   moment M, deflection y, slope θ, torque T (the running total of each
 *   load's torque, taken as balanced), all drawn along the shaft.
 * - `reactions` — the force and the moment at the one support wired into
 *   `support`, as two outputs in that order. No axis.
 *
 * `axis` names an optional length input: unwired, the quantities run along
 * the shaft's own z; wired, they are evaluated where that says. `plane`
 * names a categorical input choosing `x`, `y` or `resultant` (√(x² + y²) of
 * the two planes' values); torque ignores it. A shaft record declares no
 * expression: like a lookup, it answers every output in the unit that
 * output declares.
 */
export interface FormulaShaft {
  readonly answers: ShaftAnswer;
  /** `diagrams` only: what each output is, in output order. */
  readonly quantities?: readonly ShaftQuantity[];
  /** The declared variadic `load` input every load and support is wired into. */
  readonly acting: string;
  /** The declared `shaft` input. */
  readonly shaft: string;
  /** The declared optional length input the quantities are evaluated at. `diagrams` only. */
  readonly axis?: string;
  /** The declared categorical plane input. Required unless every quantity is torque. */
  readonly plane?: string;
  /** The declared single `load` input naming the support to report. `reactions` only. */
  readonly support?: string;
}

/**
 * One or more loads on a shaft — what a Load or Distributed load node
 * produces (`LoadNode`, `DistributedLoadNode` in `document.ts`). A load is a
 * structured value, not a number: a position and what acts there, kept
 * together on one wire so nothing downstream has to pair a position with a
 * force by wire order. `variadic` takes one wire per load, point and
 * distributed alike. Input-only — only those two node kinds produce one.
 */
export interface LoadPort extends PortBase {
  readonly kind: 'load';
  readonly variadic?: boolean;
}

/**
 * A whole shaft — its extent along z, Young's modulus and the second moment
 * of area of each section — as a Shaft node produces it (`ShaftNode` in
 * `document.ts`). Input-only, and never variadic: a diagram is drawn on one
 * shaft.
 */
export interface ShaftPort extends PortBase {
  readonly kind: 'shaft';
}

function parseLoadField(
  value: JsonValue | undefined,
  path: string,
  field: LoadField,
  mandatory: boolean,
): Quantity | undefined {
  if (value === undefined) {
    if (mandatory) fail(path, 'is required');
    return undefined;
  }
  const quantity = parseQuantity(value, path);
  const expected = LOAD_FIELD_UNITS[field];
  if (!dimensionsEqual(quantity.unit.dimension, expected.dimension)) {
    fail(join(path, 'unit'), `'${quantity.unit.symbol}' is not the same kind of quantity as '${expected.symbol}'`);
  }
  return quantity;
}

function parseShaftField(
  value: JsonValue | undefined,
  path: string,
  field: keyof typeof SHAFT_FIELD_UNITS,
  mandatory: boolean,
): Quantity | undefined {
  if (value === undefined) {
    if (mandatory) fail(path, 'is required');
    return undefined;
  }
  const quantity = parseQuantity(value, path);
  const expected = SHAFT_FIELD_UNITS[field];
  if (!dimensionsEqual(quantity.unit.dimension, expected.dimension)) {
    fail(join(path, 'unit'), `'${quantity.unit.symbol}' is not the same kind of quantity as '${expected.symbol}'`);
  }
  return quantity;
}

function parseShaftSection(value: JsonValue, path: string): ShaftSection {
  const object = readObject(value, path);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), SHAFT_SECTION_KINDS);
  if (kind === 'round') {
    return {
      kind,
      d: parseShaftField(object['d'], join(path, 'd'), 'd', true) as Quantity,
      ...put('d_i', parseShaftField(object['d_i'], join(path, 'd_i'), 'd_i', false)),
    };
  }
  if (kind === 'secondMoment') {
    return { kind, I: parseShaftField(object['I'], join(path, 'I'), 'I', true) as Quantity };
  }
  const unit = parseUnitField(required(object, 'unit', path), join(path, 'unit'));
  if (!dimensionsEqual(unit.dimension, SHAFT_FIELD_UNITS.d.dimension)) fail(join(path, 'unit'), 'must be a length');
  const steps = readArray(required(object, 'steps', path), join(path, 'steps')).map((entry, i): ShaftStep => {
    const stepPath = `${join(path, 'steps')}[${i}]`;
    const step = readObject(entry, stepPath);
    const d = readNumber(required(step, 'd', stepPath), join(stepPath, 'd'));
    const d_i = optional(step, 'd_i', stepPath, readNumber);
    if (d <= 0) fail(join(stepPath, 'd'), 'must be above zero');
    if (d_i !== undefined && (d_i < 0 || d_i >= d)) fail(join(stepPath, 'd_i'), 'must lie between zero and d');
    return { start: readNumber(required(step, 'start', stepPath), join(stepPath, 'start')), d, ...put('d_i', d_i) };
  });
  if (steps.length === 0) fail(join(path, 'steps'), 'is empty — a stepped shaft needs at least one step');
  for (let i = 1; i < steps.length; i += 1) {
    if ((steps[i] as ShaftStep).start <= (steps[i - 1] as ShaftStep).start) {
      fail(`${join(path, 'steps')}[${i}].start`, 'must lie after the step before it');
    }
  }
  return { kind, unit, steps };
}

function serializeShaftSection(section: ShaftSection): JsonObject {
  if (section.kind === 'round') {
    return { kind: section.kind, d: serializeQuantity(section.d), ...put('d_i', section.d_i === undefined ? undefined : serializeQuantity(section.d_i)) };
  }
  if (section.kind === 'secondMoment') return { kind: section.kind, I: serializeQuantity(section.I) };
  return {
    kind: section.kind,
    unit: section.unit.symbol,
    steps: section.steps.map((step) => ({ start: step.start, d: step.d, ...put('d_i', step.d_i) })),
  };
}

function parseLoadFields(
  object: JsonObject,
  path: string,
  fields: readonly LoadField[],
  mandatory: readonly LoadField[],
): Partial<Record<LoadField, Quantity>> {
  const read: Partial<Record<LoadField, Quantity>> = {};
  for (const field of fields) {
    const quantity = parseLoadField(object[field], join(path, field), field, mandatory.includes(field));
    if (quantity !== undefined) read[field] = quantity;
  }
  return read;
}

function serializeLoadFields(node: LoadNode | DistributedLoadNode): JsonObject {
  const fields = loadNodeFields(node).flatMap((field) => {
    const quantity = loadFieldValue(node, field);
    return quantity === undefined ? [] : [[field, serializeQuantity(quantity)] as const];
  });
  return Object.fromEntries(fields);
}

function parseShaft(value: JsonValue, path: string): FormulaShaft {
  const object = readObject(value, path);
  const name = (key: string): string | undefined => optional(object, key, path, readName);
  const quantities = optional(object, 'quantities', path, (entry, at) =>
    readArray(entry, at).map((item, i) => readEnum(item, `${at}[${i}]`, SHAFT_QUANTITIES)),
  );
  return {
    answers: readEnum(required(object, 'answers', path), join(path, 'answers'), SHAFT_ANSWERS),
    ...put('quantities', quantities),
    acting: readName(required(object, 'acting', path), join(path, 'acting')),
    shaft: readName(required(object, 'shaft', path), join(path, 'shaft')),
    ...put('axis', name('axis')),
    ...put('plane', name('plane')),
    ...put('support', name('support')),
  };
}

function serializeShaft(shaft: FormulaShaft): JsonObject {
  return {
    answers: shaft.answers,
    ...put('quantities', shaft.quantities === undefined ? undefined : [...shaft.quantities]),
    acting: shaft.acting,
    shaft: shaft.shaft,
    ...put('axis', shaft.axis),
    ...put('plane', shaft.plane),
    ...put('support', shaft.support),
  };
}

/** The dimension each shaft quantity is answered in — canonical mm, N, rad. */
const QUANTITY_DIMENSIONS: Readonly<Record<ShaftQuantity, Dimension>> = {
  shear: FORCE,
  moment: multiplyDimensions(FORCE, LENGTH),
  deflection: LENGTH,
  slope: ANGLE,
  torque: multiplyDimensions(FORCE, LENGTH),
};

/**
 * Every name a `FormulaShaft` uses resolves to an input of the right shape,
 * each field is present exactly when it is needed, and the outputs are what
 * the record says they are.
 */
function checkShaft(shaft: FormulaShaft, inputs: readonly Port[], outputs: readonly OutputPort[], path: string): void {
  const at = (key: string): string => join(path, `shaft.${key}`);
  const needs = (key: keyof FormulaShaft, wanted: boolean, why: string): void => {
    const present = shaft[key] !== undefined;
    if (wanted && !present) fail(at(key), `is required ${why}`);
    if (!wanted && present) fail(at(key), `has no meaning ${why} — leave it off`);
  };
  const diagrams = shaft.answers === 'diagrams';
  needs('quantities', diagrams, diagrams ? 'for diagrams' : 'for reactions');
  needs('support', !diagrams, diagrams ? 'for diagrams' : 'for reactions');
  if (!diagrams) needs('axis', false, 'for reactions');
  const planar = !diagrams || (shaft.quantities ?? []).some((quantity) => quantity !== 'torque');
  needs('plane', planar, planar ? 'when a quantity lies in a plane' : 'for torque alone');

  const find = (name: string): Port | undefined => inputs.find((port) => port.name === name);
  const acting = find(shaft.acting);
  if (acting === undefined || acting.kind !== 'load' || acting.variadic !== true) {
    fail(at('acting'), `'${shaft.acting}' must be a declared variadic load input`);
  }
  if (find(shaft.shaft)?.kind !== 'shaft') fail(at('shaft'), `'${shaft.shaft}' must be a declared shaft input`);
  if (shaft.support !== undefined) {
    const support = find(shaft.support);
    if (support === undefined || support.kind !== 'load' || support.variadic === true) {
      fail(at('support'), `'${shaft.support}' must be a declared single load input`);
    }
  }
  if (shaft.axis !== undefined) {
    const port = find(shaft.axis);
    const dimension = port === undefined ? undefined : portDimension(port);
    if (port === undefined || port.kind !== 'numeric' || port.variadic === true || dimension === undefined || !dimensionsEqual(dimension, LENGTH)) {
      fail(at('axis'), `'${shaft.axis}' must be a declared length input`);
    }
    if (port.default !== undefined) fail(at('axis'), `'${shaft.axis}' takes no default — unwired, the quantities run along the shaft`);
  }
  if (shaft.plane !== undefined) {
    const port = find(shaft.plane);
    if (port === undefined || port.kind !== 'categorical') fail(at('plane'), `'${shaft.plane}' must be a declared categorical input`);
    const outside = port.domain.find((entry) => !(SHAFT_PLANES as readonly string[]).includes(entry));
    if (outside !== undefined) fail(at('plane'), `'${outside}' is not a plane`);
  }

  const produces: readonly Dimension[] = diagrams
    ? (shaft.quantities ?? []).map((quantity) => QUANTITY_DIMENSIONS[quantity])
    : [FORCE, multiplyDimensions(FORCE, LENGTH)];
  if (outputs.length !== produces.length) {
    fail(join(path, 'output'), diagrams ? 'declares one output per quantity' : 'a reactions record declares two outputs, the force then the moment');
  }
  outputs.forEach((output, i) => {
    const dimension = portDimension(output);
    if (output.kind !== 'numeric' || dimension === undefined || !dimensionsEqual(dimension, produces[i] as Dimension)) {
      fail(join(path, 'output'), `'${output.name}' is not of the dimension its quantity is answered in`);
    }
  });
}

registerDomainNode({
  kind: 'load',
  parse: (object, path) => parseLoadFields(object, path, POINT_LOAD_FIELDS, ['at']),
  serialize: (node: LoadNode) => serializeLoadFields(node),
});

registerDomainNode({
  kind: 'distributedLoad',
  parse: (object, path) => parseLoadFields(object, path, SPAN_LOAD_FIELDS, ['from', 'to']),
  serialize: (node: DistributedLoadNode) => serializeLoadFields(node),
});

registerDomainNode({
  kind: 'support',
  parse: (object, path) => ({
    at: parseLoadField(object['at'], join(path, 'at'), 'at', true) as Quantity,
    support: readEnum(required(object, 'support', path), join(path, 'support'), SUPPORT_TYPES),
  }),
  serialize: (node: SupportNode) => ({ at: serializeQuantity(node.at), support: node.support }),
});

registerDomainNode({
  kind: 'shaft',
  parse: (object, path) => {
    const field = (key: 'from' | 'to' | 'E'): Quantity => parseShaftField(object[key], join(path, key), key, true) as Quantity;
    return {
      from: field('from'),
      to: field('to'),
      count: readInteger(required(object, 'count', path), join(path, 'count'), 2),
      E: field('E'),
      section: parseShaftSection(required(object, 'section', path), join(path, 'section')),
      ...put('axisLabel', optional(object, 'axisLabel', path, readString)),
    };
  },
  serialize: (node: ShaftNode) => ({
    from: serializeQuantity(node.from),
    to: serializeQuantity(node.to),
    count: node.count,
    E: serializeQuantity(node.E),
    section: serializeShaftSection(node.section),
    ...put('axisLabel', node.axisLabel),
  }),
  // Its positions along z are an axis, always.
  introducesAxis: () => true,
});

registerDomainOutput({ kind: 'shaftView', parse: () => ({}), serialize: () => ({}) });

registerDomainPort({
  kind: 'load',
  parse: (object, path) => put('variadic', optional(object, 'variadic', path, readBoolean)),
  serialize: (port: LoadPort) => put('variadic', port.variadic),
  outputRefusal: 'a load is produced by a Load node only — a catalogue formula cannot produce one',
});

registerDomainPort({
  kind: 'shaft',
  parse: () => ({}),
  serialize: () => ({}),
  outputRefusal: 'a shaft is produced by a Shaft node only — a catalogue formula cannot produce one',
});

registerDomainEvaluator({
  key: 'shaft',
  noun: 'a shaft diagram',
  parse: parseShaft,
  check: (shaft: FormulaShaft, ports, path) =>
    checkShaft(shaft, ports.inputs as readonly Port[], ports.outputs as readonly OutputPort[], path),
  serialize: serializeShaft,
});

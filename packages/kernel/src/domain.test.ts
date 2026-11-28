import { describe, expect, it } from 'vitest';
import {
  registerDomainEvaluator,
  registerDomainNode,
  registerDomainOutput,
  registerDomainPort,
  type JsonObject,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { registerKernelEvaluator, registerKernelNode, registerKernelOutput, registerKernelPortKind } from './domain.js';
import { evaluateDocument, valueAt, type OutputResult } from './evaluate.js';
import { isVariadicTarget, resolveGraph } from './graph.js';
import { ADD, catalogueOf, documentOf, formulaNode, input, outputNode, packNode, refTo, scalar, wire } from './invented.fixtures.js';
import { scalarSeries, type NumericSeries, type PortValue } from './series.js';

/*
 * The kernel's half of the registry, through an invented domain rather than
 * the shafts: a Dispenser node hands out a token (a structured value) of a
 * typed size, a Ruler node introduces an axis of its own, a `tally`
 * evaluator counts the tokens wired into a formula, and a Gauge output does
 * the same on the notebook side. What it pins is what every domain gets
 * from the core for free — routing, packing, refusing a stranded wire.
 */

interface Token {
  readonly kind: 'testToken';
  readonly size: NumericSeries;
}

const LENGTH_UNIT = parseUnit('mm');

registerDomainPort({
  kind: 'testToken',
  parse: (object) => (object['variadic'] === true ? { variadic: true } : {}),
  serialize: (port: { readonly variadic?: boolean }) => (port.variadic === true ? { variadic: true } : {}),
  outputRefusal: 'a token is made by a dispenser only',
});

registerDomainNode({
  kind: 'testDispenser',
  parse: (object) => ({ size: object['size'] }),
  serialize: (node: { readonly size: JsonObject }) => ({ size: node.size }),
});

registerDomainNode({
  kind: 'testRuler',
  parse: (object) => ({ marks: object['marks'] }),
  serialize: (node: { readonly marks: number }) => ({ marks: node.marks }),
  introducesAxis: () => true,
});

registerDomainOutput({ kind: 'testGauge', parse: () => ({}), serialize: () => ({}) });

registerDomainEvaluator({
  key: 'tally',
  noun: 'a tally',
  parse: (value) => value,
  check: () => undefined,
  serialize: (value: string) => value,
});

registerKernelPortKind({
  kind: 'testToken',
  noun: 'a token',
  packable: true,
  stranded: 'this wire carries a token, which only a tally takes',
  series: (value: Token) => [value.size],
});

registerKernelNode({
  kind: 'testDispenser',
  resolve: (node: { readonly size: { readonly unit: string } }, context) => {
    context.field('size', LENGTH_UNIT, parseUnit(node.size.unit));
    context.source('token', { kind: 'testToken' });
  },
  evaluate: (node: { readonly id: string; readonly size: { readonly value: number } }, { resolution, values }) => {
    const edge = resolution.incoming.get(`${node.id}.size`)?.[0];
    const size = (edge === undefined ? scalarSeries(node.size.value) : values.get(`${edge.from.node}.${edge.from.port}`)) as NumericSeries;
    return new Map<string, PortValue>([['token', { kind: 'testToken', size } as PortValue]]);
  },
});

registerKernelNode({
  kind: 'testRuler',
  resolve: (_node, context) => context.source('pos', { kind: 'numeric', dimension: LENGTH_UNIT.dimension, unit: LENGTH_UNIT }),
  evaluate: (node: { readonly id: string; readonly marks: number }, { resolution }) => {
    const axis = resolution.axes.get(node.id);
    const data = Array.from({ length: node.marks }, (_, i) => i * 10);
    return new Map<string, PortValue>([['pos', { kind: 'numeric', axes: axis === undefined ? [] : [axis], data }]]);
  },
  axis: {
    label: () => 'position',
    length: (node: { readonly marks: number }) => node.marks,
    coordinatePort: 'pos',
    collapse: (node: { readonly marks: number }) => ({ ...node, marks: 1 }) as never,
  },
});

/** How many tokens arrive at a port: one per wire, or one per channel of a pack. */
function tokensAt(port: string, nodeId: string, context: Parameters<Parameters<typeof registerKernelEvaluator>[0]['evaluate']>[3]): number {
  return (context.resolution.incoming.get(`${nodeId}.${port}`) ?? []).reduce((count, edge) => {
    const value = context.values.get(`${edge.from.node}.${edge.from.port}`);
    return count + (value?.kind === 'bundle' ? value.values.length : 1);
  }, 0);
}

registerKernelEvaluator({
  key: 'tally',
  evaluate: (node, formula, port: string, context) =>
    new Map<string, PortValue>([[formula.outputs[0]?.name ?? 'n', scalarSeries(tokensAt(port, node.id, context))]]),
});

registerKernelOutput({
  kind: 'testGauge',
  ports: () => ['tokens'],
  variadic: ['tokens'],
  resolve: (_node, context) => context.structuredInputs('tokens', 'testToken' as never),
  evaluate: (node, context) => ({ count: tokensAt('tokens', node.id, context) }),
});

const TALLY: JsonObject = {
  id: 'demo.tally',
  version: 1,
  output: { kind: 'numeric', name: 'n', unit: '' },
  inputs: [{ kind: 'testToken', name: 'tokens', variadic: true }],
  tally: 'tokens',
  description: 'How many tokens.',
  status: 'unverified',
};
const CATALOGUE = catalogueOf([TALLY, ADD]);

const at = { x: 0, y: 0 };
const dispenser = (id: string, size = 5): JsonObject => ({ kind: 'testDispenser', id, position: at, size: { value: size, unit: 'mm' } });
const tally = formulaNode('tally', refTo('demo.tally', CATALOGUE));

describe('a domain node', () => {
  it('types and evaluates its own ports', () => {
    const document = documentOf([dispenser('a', 7)], []);
    const token = valueAt(evaluateDocument(document, [CATALOGUE]), 'a', 'token') as unknown as Token;
    expect(token.kind).toBe('testToken');
    expect(token.size.data).toEqual([7]);
  });

  it('checks a wired field against its dimension', () => {
    const document = documentOf([input('F', scalar(10, 'N')), dispenser('a')], [wire('F.value', 'a.size')]);
    expect(() => resolveGraph(document, [CATALOGUE])).toThrow(/same kind of quantity|dimension|force|length/i);
  });

  it('introduces the axis its definition describes, read from its coordinate port', () => {
    const ruler: JsonObject = { kind: 'testRuler', id: 'r', position: at, marks: 4 };
    const evaluation = evaluateDocument(documentOf([ruler], []), [CATALOGUE]);
    expect(evaluation.resolution.axes.get('r')).toMatchObject({ label: 'position', length: 4 });
    expect((valueAt(evaluation, 'r', 'pos') as NumericSeries).data).toEqual([0, 10, 20, 30]);
  });
});

describe('a structured value', () => {
  it('is counted by a domain evaluator, one per wire', () => {
    const document = documentOf(
      [dispenser('a'), dispenser('b'), tally],
      [wire('a.token', 'tally.tokens'), wire('b.token', 'tally.tokens')],
    );
    expect(isVariadicTarget(document, [CATALOGUE], { node: 'tally', port: 'tokens' })).toBe(true);
    expect((valueAt(evaluateDocument(document, [CATALOGUE]), 'tally', 'n') as NumericSeries).data).toEqual([2]);
  });

  it('rides in a pack onto a variadic port of its kind', () => {
    const document = documentOf(
      [dispenser('a'), dispenser('b'), packNode('p'), tally],
      [wire('a.token', 'p.in0'), wire('b.token', 'p.in1'), wire('p.bundle', 'tally.tokens')],
    );
    expect((valueAt(evaluateDocument(document, [CATALOGUE]), 'tally', 'n') as NumericSeries).data).toEqual([2]);
  });

  it('is refused by a numeric port, in its own noun', () => {
    const document = documentOf(
      [dispenser('a'), formulaNode('sum', refTo('addTwo', CATALOGUE))],
      [wire('a.token', 'sum.a')],
    );
    expect(() => resolveGraph(document, [CATALOGUE])).toThrow(/this wire carries a token/);
  });

  it('is refused where nothing reads it, in its own words', () => {
    const document = documentOf([dispenser('a'), outputNode('o', { kind: 'print' })], [wire('a.token', 'o.value')]);
    expect(() => resolveGraph(document, [CATALOGUE])).toThrow(/this wire carries a token, which only a tally takes/);
  });
});

describe('a domain output', () => {
  it('takes several wires on its variadic port and evaluates', () => {
    const document = documentOf(
      [dispenser('a'), dispenser('b'), outputNode('g', { kind: 'testGauge' })],
      [wire('a.token', 'g.tokens'), wire('b.token', 'g.tokens')],
    );
    expect(isVariadicTarget(document, [CATALOGUE], { node: 'g', port: 'tokens' })).toBe(true);
    const [gauge] = evaluateDocument(document, [CATALOGUE]).outputs as readonly (OutputResult & { readonly count?: number })[];
    expect(gauge).toMatchObject({ kind: 'testGauge', nodeId: 'g', count: 2 });
  });
});

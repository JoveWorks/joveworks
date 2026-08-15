import { describe, expect, it } from 'vitest';
import { ANGLE, AREA, DIMENSIONLESS, FORCE, LENGTH, TORQUE, parseUnit } from '@mds/units';

import { KernelError } from './errors.js';
import {
  canConnect,
  endpointKey,
  resolveGraph,
  topologicalOrder,
  typesConnect,
  wouldCycle,
} from './graph.js';
import {
  CATALOGUE,
  documentOf,
  formulaNode,
  input,
  outputNode,
  refTo,
  scalar,
  wire,
} from './invented.fixtures.js';

const catalogues = [CATALOGUE];

/** w → area ← h, the smallest graph with a formula in it. */
function areaGraph(edges = [wire('w.value', 'area.w'), wire('h.value', 'area.h')]) {
  return documentOf(
    [
      input('w', scalar(20, 'mm')),
      input('h', scalar(5, 'mm')),
      formulaNode('area', refTo('area')),
    ],
    edges,
  );
}

describe('order (S18)', () => {
  it('puts a node after everything it reads from', () => {
    const order = topologicalOrder(areaGraph()).map((node) => node.id);
    expect(order.indexOf('area')).toBeGreaterThan(order.indexOf('w'));
    expect(order.indexOf('area')).toBeGreaterThan(order.indexOf('h'));
  });

  it('refuses a cycle rather than looping on it', () => {
    const cyclic = documentOf(
      [formulaNode('a', refTo('addTwo')), formulaNode('b', refTo('addTwo'))],
      [wire('a.sum', 'b.a'), wire('b.sum', 'a.a')],
    );
    expect(() => topologicalOrder(cyclic)).toThrow(/cycle/u);
  });

  it('sees a cycle before it is made', () => {
    const document = areaGraph();
    expect(wouldCycle(document, wire('area.A', 'area.w'))).toBe(true);
    expect(wouldCycle(document, wire('w.value', 'area.h'))).toBe(false);
  });
});

describe('resolution', () => {
  it('types every port of every node', () => {
    const resolution = resolveGraph(areaGraph(), catalogues);
    expect(resolution.sources.get(endpointKey('w', 'value'))?.dimension).toEqual(LENGTH);
    expect(resolution.sources.get(endpointKey('area', 'A'))?.dimension).toEqual(AREA);
    expect(resolution.targets.get(endpointKey('area', 'w'))?.dimension).toEqual(LENGTH);
  });

  it('tolerates an unwired input — a graph mid-build is not a broken one', () => {
    expect(() => resolveGraph(areaGraph([wire('w.value', 'area.w')]), catalogues)).not.toThrow();
  });

  it('refuses two edges into one input port', () => {
    const document = areaGraph([wire('w.value', 'area.w'), wire('h.value', 'area.w')]);
    expect(() => resolveGraph(document, catalogues)).toThrow(/one connection/u);
  });

  it('refuses an edge naming a port that does not exist', () => {
    expect(() => resolveGraph(areaGraph([wire('w.value', 'area.q')]), catalogues)).toThrow(
      /not an input port/u,
    );
    expect(() => resolveGraph(areaGraph([wire('w.result', 'area.w')]), catalogues)).toThrow(
      /not an output port/u,
    );
  });

  it('needs the catalogue a graph references (S23)', () => {
    expect(() => resolveGraph(areaGraph(), [])).toThrow(/needs its catalogue/u);
  });

  it('warns rather than recomputing silently when a formula has changed (S23)', () => {
    const stale = documentOf(
      [input('w', scalar(20, 'mm')), formulaNode('area', { id: 'area', version: 1, hash: 'stale' })],
      [wire('w.value', 'area.w')],
    );
    const { warnings } = resolveGraph(stale, catalogues);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe('formulaChanged');
  });
});

describe('connections (S6)', () => {
  const connect = (document: ReturnType<typeof areaGraph>, from: string, to: string) =>
    canConnect(document, catalogues, wire(from, to));

  it('accepts a length into a length port', () => {
    expect(connect(areaGraph([]), 'w.value', 'area.w')).toEqual({ ok: true });
  });

  it('will not put a force into a length port', () => {
    const document = documentOf(
      [input('F', scalar(100, 'N')), formulaNode('area', refTo('area'))],
      [],
    );
    const result = canConnect(document, catalogues, wire('F.value', 'area.w'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/cannot connect force/u);
  });

  it('will not close a cycle (S18)', () => {
    const result = connect(areaGraph(), 'area.A', 'area.w');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/cycle/u);
  });

  it('lets a wire re-dragged onto an already-wired port replace it, rather than refusing for arriving alongside it', () => {
    const document = documentOf(
      [
        input('w1', scalar(2, 'mm')),
        input('w2', scalar(3, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w1.value', 'area.w')],
    );
    expect(canConnect(document, catalogues, wire('w2.value', 'area.w'))).toEqual({ ok: true });
  });

  it('will not put a categorical value into a numeric port', () => {
    const document = documentOf(
      [
        input('fit', { kind: 'categorical', value: 'H7' }),
        formulaNode('area', refTo('area')),
      ],
      [],
    );
    const result = canConnect(document, catalogues, wire('fit.value', 'area.w'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/categorical value to a numeric port/u);
  });

  it('lets a pure number drive an angle port, and not the other way (S54)', () => {
    const intoAngle = documentOf(
      [input('x', scalar(0.5, '')), formulaNode('sine', refTo('sineOf'))],
      [],
    );
    expect(canConnect(intoAngle, catalogues, wire('x.value', 'sine.theta'))).toEqual({ ok: true });

    // The reverse: an angle into a port declared dimensionless. `combine`'s
    // ports are pure numbers, and a radian arriving there would be swallowed.
    const intoPure = documentOf(
      [input('a', scalar(30, 'deg')), formulaNode('combine', refTo('combine'))],
      [],
    );
    const result = canConnect(intoPure, catalogues, wire('a.value', 'combine.a'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/cannot connect angle/u);
  });

  it('answers the same question from two resolved port types', () => {
    expect(typesConnect({ kind: 'numeric', dimension: LENGTH }, { kind: 'numeric', dimension: LENGTH })).toBe(true);
    expect(typesConnect({ kind: 'numeric', dimension: FORCE }, { kind: 'numeric', dimension: LENGTH })).toBe(false);
    expect(
      typesConnect({ kind: 'numeric', dimension: DIMENSIONLESS }, { kind: 'numeric', dimension: ANGLE }),
    ).toBe(true);
    expect(
      typesConnect({ kind: 'numeric', dimension: ANGLE }, { kind: 'numeric', dimension: DIMENSIONLESS }),
    ).toBe(false);
    expect(typesConnect({ kind: 'numeric' }, { kind: 'categorical' })).toBe(false);
  });
});

describe('generic signatures bind per node instance (S59)', () => {
  it('gives a multiply node the product of what is wired to it', () => {
    const document = documentOf(
      [
        input('F', scalar(100, 'N')),
        input('d', scalar(20, 'mm')),
        formulaNode('m', refTo('multiplyTwo')),
      ],
      [wire('F.value', 'm.a'), wire('d.value', 'm.b')],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('m', 'product'))?.dimension).toEqual(TORQUE);
    expect(resolution.bindings.get('m')?.get('A')).toEqual(FORCE);
    expect(resolution.bindings.get('m')?.get('B')).toEqual(LENGTH);
  });

  it('binds two instances of one record independently', () => {
    const document = documentOf(
      [
        input('F', scalar(100, 'N')),
        input('d', scalar(20, 'mm')),
        formulaNode('forces', refTo('addTwo')),
        formulaNode('lengths', refTo('addTwo')),
      ],
      [
        wire('F.value', 'forces.a'),
        wire('F.value', 'forces.b'),
        wire('d.value', 'lengths.a'),
        wire('d.value', 'lengths.b'),
      ],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('forces', 'sum'))?.dimension).toEqual(FORCE);
    expect(resolution.sources.get(endpointKey('lengths', 'sum'))?.dimension).toEqual(LENGTH);
  });

  it('refuses to bind one variable to two dimensions', () => {
    const document = documentOf(
      [
        input('F', scalar(100, 'N')),
        input('d', scalar(20, 'mm')),
        formulaNode('sum', refTo('addTwo')),
      ],
      [wire('F.value', 'sum.a')],
    );
    const result = canConnect(document, catalogues, wire('d.value', 'sum.b'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/bound twice/u);
  });

  it('leaves an unbound generic port without a dimension, rather than guessing one', () => {
    const document = documentOf([formulaNode('sum', refTo('addTwo'))], []);
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('sum', 'sum'))?.dimension).toBeUndefined();
  });

  it('checks a check node against the value it is wired to (S58)', () => {
    const document = documentOf(
      [
        input('F', scalar(100, 'N')),
        outputNode('check', {
          kind: 'check',
          comparison: '>=',
          threshold: { value: 5, unit: 'mm' },
        }),
      ],
      [wire('F.value', 'check.value')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });
});

describe('what the unit package still owns', () => {
  it('reads a display unit into the dimension a port is typed by (S56)', () => {
    expect(parseUnit('N/mm²').dimension).toEqual({
      force: 1,
      length: -2,
      time: 0,
      angle: 0,
      temperature: 0,
    });
  });

  it('refuses an unresolvable graph with a KernelError, not a bare Error', () => {
    expect(() => resolveGraph(areaGraph([wire('w.value', 'area.q')]), catalogues)).toThrow(
      KernelError,
    );
  });
});

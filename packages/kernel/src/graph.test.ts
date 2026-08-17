import { describe, expect, it } from 'vitest';
import { ANGLE, AREA, DIMENSIONLESS, FORCE, FREQUENCY, LENGTH, TORQUE, parseUnit } from '@joveworks/units';
import type { GraphDocument, JsonObject } from '@joveworks/schema';

import { KernelError } from './errors.js';
import {
  adaptInputUnit,
  canConnect,
  canonicalUnit,
  endpointKey,
  resolveGraph,
  topologicalOrder,
  typesConnect,
  wouldCycle,
} from './graph.js';
import {
  CATALOGUE,
  catalogueOf,
  closureNode,
  compareNode,
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

describe('order', () => {
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

  it('needs the catalogue a graph references', () => {
    expect(() => resolveGraph(areaGraph(), [])).toThrow(/needs its catalogue/u);
  });

  it('warns rather than recomputing silently when a formula has changed', () => {
    const stale = documentOf(
      [input('w', scalar(20, 'mm')), formulaNode('area', { id: 'area', version: 1, hash: 'stale' })],
      [wire('w.value', 'area.w')],
    );
    const { warnings } = resolveGraph(stale, catalogues);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe('formulaChanged');
  });
});

describe('generic display units', () => {
  it('prefers Hz for a derived frequency without changing a fixed port\'s declaration', () => {
    // `namedUnit(FREQUENCY)` intentionally stays ambiguous (`Hz` or `rpm`).
    // Generic/derived nodes choose Hz as their display default; fixed formula
    // ports retain whatever display unit their catalogue declared.
    expect(canonicalUnit(FREQUENCY).symbol).toBe('Hz');
  });

  it('uses a concrete port preference without changing its connection type', () => {
    const preferred: JsonObject = {
      id: 'frequency',
      version: 1,
      output: { kind: 'numeric', name: 'f', unit: 's-1', preferredUnit: 'Hz' },
      inputs: [{ kind: 'numeric', name: 't', unit: 's' }],
      expression: '1 / t',
      description: 'Invented frequency formula.',
      status: 'unverified',
    };
    const catalogue = catalogueOf([preferred], 'preferred-unit-test');
    const document = documentOf(
      [input('t', scalar(2, 's')), formulaNode('f', refTo('frequency', catalogue))],
      [wire('t.value', 'f.t')],
    );
    const type = resolveGraph(document, [catalogue]).sources.get(endpointKey('f', 'f'));
    expect(type?.dimension).toEqual(FREQUENCY);
    expect(type?.unit?.symbol).toBe('Hz');
  });
});

describe('connections', () => {
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

  it('will not close a cycle', () => {
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

  it('lets a pure number drive an angle port, and not the other way', () => {
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

describe('adapting a freshly wired input node to its target', () => {
  it('relabels an unwired input to the target unit, keeping the magnitude', () => {
    // 'F' is typed in mm (wrong on purpose — nothing has read it yet) and
    // wired into 'area.w', an mm port too, just to isolate the relabel from
    // canConnect's own check; the dimension-mismatch case is exercised below.
    const document = documentOf(
      [input('F', scalar(100, 'N')), formulaNode('area', refTo('area'))],
      [],
    );
    const adapted = adaptInputUnit(document, wire('F.value', 'area.w'), parseUnit('mm'));
    expect(adapted).toBeDefined();
    const node = adapted?.nodes.find((entry) => entry.id === 'F');
    expect(node?.kind === 'input' && node.value.kind === 'scalar' && node.value.value).toBe(100);
    expect(
      node?.kind === 'input' && node.value.kind === 'scalar' && node.value.unit.symbol,
    ).toBe('mm');
  });

  it('turns a refused dimension mismatch into a connection', () => {
    const document = documentOf(
      [input('F', scalar(100, 'N')), formulaNode('area', refTo('area'))],
      [],
    );
    const candidate = wire('F.value', 'area.w');
    expect(canConnect(document, catalogues, candidate).ok).toBe(false);

    const target = resolveGraph(document, catalogues).targets.get(endpointKey('area', 'w'));
    expect(target?.unit).toBeDefined();
    const adapted = adaptInputUnit(document, candidate, target?.unit as NonNullable<typeof target>['unit']);
    expect(adapted).toBeDefined();
    expect(canConnect(adapted as GraphDocument, catalogues, candidate)).toEqual({ ok: true });
  });

  it('refuses to adapt a source that already has an outgoing wire', () => {
    const document = documentOf(
      [
        input('F', scalar(100, 'N')),
        formulaNode('pressure', refTo('pressure')),
        formulaNode('area', refTo('area')),
      ],
      [wire('F.value', 'pressure.F')],
    );
    const adapted = adaptInputUnit(document, wire('F.value', 'area.w'), parseUnit('mm'));
    expect(adapted).toBeUndefined();
  });

  it('does not adapt a non-input source', () => {
    const document = documentOf(
      [formulaNode('pressure', refTo('pressure')), formulaNode('area', refTo('area'))],
      [],
    );
    const adapted = adaptInputUnit(document, wire('pressure.p', 'area.w'), parseUnit('mm'));
    expect(adapted).toBeUndefined();
  });

  it('does not adapt a categorical value — nothing about it is a unit', () => {
    const document = documentOf(
      [input('fit', { kind: 'categorical', value: 'H7' }), formulaNode('area', refTo('area'))],
      [],
    );
    const adapted = adaptInputUnit(document, wire('fit.value', 'area.w'), parseUnit('mm'));
    expect(adapted).toBeUndefined();
  });

  it('still refuses a kind mismatch even once adaptation is tried', () => {
    // Adapting only ever relabels a unit — it cannot turn a categorical
    // source into a numeric one, so canConnect on the (unadapted, since
    // categorical has no unit) result still refuses exactly as before.
    const document = documentOf(
      [input('fit', { kind: 'categorical', value: 'H7' }), formulaNode('area', refTo('area'))],
      [],
    );
    const candidate = wire('fit.value', 'area.w');
    expect(canConnect(document, catalogues, candidate).ok).toBe(false);
    expect(adaptInputUnit(document, candidate, parseUnit('mm'))).toBeUndefined();
  });
});

describe('compare nodes', () => {
  function compareGraph(edges: readonly ReturnType<typeof wire>[]) {
    return documentOf(
      [input('w', scalar(20, 'mm')), compareNode('c', '>=', { value: 1.5, unit: 'mm' })],
      edges,
    );
  }

  it('types the verdict port as categorical', () => {
    const resolution = resolveGraph(compareGraph([wire('w.value', 'c.value')]), catalogues);
    expect(resolution.sources.get(endpointKey('c', 'verdict'))?.kind).toBe('categorical');
  });

  it("binds the threshold target to the value port's dimension once value is wired", () => {
    const resolution = resolveGraph(compareGraph([wire('w.value', 'c.value')]), catalogues);
    expect(resolution.targets.get(endpointKey('c', 'threshold'))?.dimension).toEqual(LENGTH);
  });

  it('leaves value and threshold unbound while nothing is wired to value', () => {
    const resolution = resolveGraph(compareGraph([]), catalogues);
    expect(resolution.targets.get(endpointKey('c', 'value'))?.dimension).toBeUndefined();
    expect(resolution.targets.get(endpointKey('c', 'threshold'))?.dimension).toBeUndefined();
  });

  it('refuses a typed threshold default of a different dimension than value', () => {
    const document = documentOf(
      [input('w', scalar(20, 'mm')), compareNode('c', '>=', { value: 1.5, unit: 'N' })],
      [wire('w.value', 'c.value')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });

  it('takes a bare, unitless threshold default in whatever dimension value resolves to', () => {
    // A freshly dropped compare node's threshold has no unit yet — wiring
    // `value` to something dimensioned must not be refused for that alone.
    const document = documentOf(
      [input('w', scalar(20, 'mm')), compareNode('c', '>=', { value: 1.5, unit: '' })],
      [wire('w.value', 'c.value')],
    );
    expect(() => resolveGraph(document, catalogues)).not.toThrow();
  });

  it('refuses a wired threshold of a different dimension than value', () => {
    const document = documentOf(
      [
        input('w', scalar(20, 'mm')),
        input('f', scalar(10, 'N')),
        compareNode('c', '>=', { value: 1.5, unit: 'mm' }),
      ],
      [wire('w.value', 'c.value'), wire('f.value', 'c.threshold')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });

  it('sees a cycle through a compare node before it is made', () => {
    const document = documentOf(
      [formulaNode('area', refTo('area')), compareNode('c', '>=', { value: 1, unit: '' })],
      [wire('area.A', 'c.value')],
    );
    expect(wouldCycle(document, wire('c.verdict', 'area.w'))).toBe(true);
  });
});

describe("a plot's threshold port", () => {
  function plotGraph(
    edges: readonly ReturnType<typeof wire>[],
    threshold?: { readonly value: number; readonly unit: string },
  ) {
    return documentOf(
      [
        input('w', scalar(20, 'mm')),
        input('h', scalar(5, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('plot', { kind: 'plot', ...(threshold === undefined ? {} : { threshold }) }),
      ],
      edges,
    );
  }

  const wiredToValue = [wire('w.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'plot.value')];

  it("binds the threshold target to the value port's dimension once value is wired", () => {
    const resolution = resolveGraph(plotGraph(wiredToValue), catalogues);
    expect(resolution.targets.get(endpointKey('plot', 'threshold'))?.dimension).toEqual(AREA);
  });

  it('leaves the threshold target unbound while nothing is wired to value', () => {
    const resolution = resolveGraph(plotGraph([]), catalogues);
    expect(resolution.targets.get(endpointKey('plot', 'threshold'))?.dimension).toBeUndefined();
  });

  it('takes a plot with no typed threshold at all without complaint — unlike compare, a plot may have no line', () => {
    expect(() => resolveGraph(plotGraph(wiredToValue), catalogues)).not.toThrow();
  });

  it('refuses a typed threshold default of a different dimension than value', () => {
    const document = plotGraph(wiredToValue, { value: 5, unit: 'N' });
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });

  it('refuses a wired threshold of a different dimension than value', () => {
    const document = documentOf(
      [
        input('w', scalar(20, 'mm')),
        input('h', scalar(5, 'mm')),
        input('f', scalar(10, 'N')),
        formulaNode('area', refTo('area')),
        outputNode('plot', { kind: 'plot' }),
      ],
      [...wiredToValue, wire('f.value', 'plot.threshold')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });
});

describe("a check's threshold port", () => {
  function checkGraph(
    edges: readonly ReturnType<typeof wire>[],
    threshold: { readonly value: number; readonly unit: string } = { value: 1, unit: '' },
  ) {
    return documentOf(
      [
        input('w', scalar(20, 'mm')),
        input('h', scalar(5, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('check', { kind: 'check', comparison: '>=', threshold }),
      ],
      edges,
    );
  }

  const wiredToValue = [wire('w.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'check.value')];

  it("binds the threshold target to the value port's dimension once value is wired", () => {
    const resolution = resolveGraph(checkGraph(wiredToValue), catalogues);
    expect(resolution.targets.get(endpointKey('check', 'threshold'))?.dimension).toEqual(AREA);
  });

  it('leaves the threshold target unbound while nothing is wired to value', () => {
    const resolution = resolveGraph(checkGraph([]), catalogues);
    expect(resolution.targets.get(endpointKey('check', 'threshold'))?.dimension).toBeUndefined();
  });

  it('takes a bare, unitless threshold default in whatever dimension value resolves to', () => {
    // A freshly dropped check node's threshold has no unit yet (Canvas.tsx's
    // default) — wiring `value` to something dimensioned must not be refused
    // for that alone.
    expect(() => resolveGraph(checkGraph(wiredToValue), catalogues)).not.toThrow();
  });

  it('refuses a typed threshold default of a different dimension than value', () => {
    const document = checkGraph(wiredToValue, { value: 5, unit: 'N' });
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });

  it('refuses a wired threshold of a different dimension than value', () => {
    const document = documentOf(
      [
        input('w', scalar(20, 'mm')),
        input('h', scalar(5, 'mm')),
        input('f', scalar(10, 'N')),
        formulaNode('area', refTo('area')),
        outputNode('check', { kind: 'check', comparison: '>=', threshold: { value: 1, unit: 'mm²' } }),
      ],
      [...wiredToValue, wire('f.value', 'check.threshold')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });
});

describe('generic signatures bind per node instance', () => {
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

  it('checks a check node against the value it is wired to', () => {
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

describe('closure nodes', () => {
  it('leaves the output unresolved until every free name it uses is wired', () => {
    const document = documentOf([closureNode('eq', 'a + b')], []);
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('eq', 'result'))?.dimension).toBeUndefined();
  });

  it('proves the output dimension live once wired, the way a hand-authored add does', () => {
    const document = documentOf(
      [input('F1', scalar(10, 'N')), input('F2', scalar(20, 'N')), closureNode('eq', 'a + b')],
      [wire('F1.value', 'eq.a'), wire('F2.value', 'eq.b')],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('eq', 'result'))?.dimension).toEqual(FORCE);
  });

  it('refuses to add two different dimensions', () => {
    const document = documentOf(
      [input('F', scalar(10, 'N')), input('d', scalar(20, 'mm')), closureNode('eq', 'a + b')],
      [wire('F.value', 'eq.a'), wire('d.value', 'eq.b')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/cannot add/u);
  });

  it("gets 'a*b + c*d' right — two independent products that only need to match", () => {
    // The case a static per-symbol template cannot express without wrongly
    // forcing a, b, c and d onto one shared dimension (see closure.ts).
    const document = documentOf(
      [
        input('w1', scalar(4, 'mm')),
        input('h1', scalar(3, 'mm')),
        input('w2', scalar(2, 'mm')),
        input('h2', scalar(6, 'mm')),
        closureNode('eq', 'a*b + c*d'),
      ],
      [
        wire('w1.value', 'eq.a'),
        wire('h1.value', 'eq.b'),
        wire('w2.value', 'eq.c'),
        wire('h2.value', 'eq.d'),
      ],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('eq', 'result'))?.dimension).toEqual(AREA);
  });

  it('requires an angle or a dimensionless argument to sin, like the base node does', () => {
    const document = documentOf(
      [input('d', scalar(20, 'mm')), closureNode('eq', 'sin(theta)')],
      [wire('d.value', 'eq.theta')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/takes an angle/u);
  });

  it('accepts an angle into sin and produces a dimensionless result', () => {
    const document = documentOf(
      [input('theta', scalar(1, 'rad')), closureNode('eq', 'sin(theta)')],
      [wire('theta.value', 'eq.theta')],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.sources.get(endpointKey('eq', 'result'))?.dimension).toEqual(DIMENSIONLESS);
  });

  it('derives a spectrum port from a bare reduction argument', () => {
    const document = documentOf([closureNode('eq', 'sum(xs)')], []);
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.targets.get(endpointKey('eq', 'xs'))?.kind).toBe('spectrum');
  });

  it('reports a bad expression at the node, not the whole graph silently', () => {
    const document = documentOf([closureNode('eq', 'a + * b')], []);
    expect(() => resolveGraph(document, catalogues)).toThrow(KernelError);
  });
});

describe('what the unit package still owns', () => {
  it('reads a display unit into the dimension a port is typed by', () => {
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

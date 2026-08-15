/**
 * The base node library and the kernel, end to end (S42).
 *
 * This is what the base library was built for: a graph that runs through the
 * whole stack — a catalogue loaded from JSON, ports typed by dimension, generic
 * signatures bound per node, a sweep, a check, a plot — **with no textbook
 * content anywhere in it**. Arithmetic is not R&M's.
 *
 * The graph is belt-*shaped* rather than belt: a rim speed `v = π·d·n` and a
 * tangential force `F = P/v` are the arithmetic a drive calculation is made of,
 * and they exercise the units that make belt the chosen slice — `kW`, `rpm`, a
 * velocity that only exists as a quotient. The belt formulas themselves, and
 * their golden values, are step 6 and live in the private catalogue.
 *
 * It lives at the workspace level rather than inside `packages/kernel` because
 * it is the only test that needs both the kernel and the node library, and the
 * kernel does not depend on the nodes (S22's direction).
 */

import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  formulaRef,
  loadCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type GraphDocument,
  type JsonObject,
} from '@mds/schema';
import { FORCE, VELOCITY, dimensionsEqual } from '@mds/units';
import { OPERATIONS, baseCatalogueJson } from '@mds/nodes';
import {
  canConnect,
  checkFormulaDimensions,
  endpointKey,
  evaluateDocument,
  resolveGraph,
  valueAt,
  type CheckResult,
  type NumericSeries,
  type PlotResult,
} from '@mds/kernel';

const BASE: Catalogue = loadCatalogue(baseCatalogueJson());
const catalogues = [BASE];

const node = (id: string, operation: string): JsonObject => {
  const formula = BASE.formulas.find((entry) => entry.id === operation);
  if (formula === undefined) throw new Error(`no base node '${operation}'`);
  return {
    kind: 'formula',
    id,
    position: { x: 0, y: 0 },
    formula: serializeFormulaRef(formulaRef(formula)),
  };
};

const input = (id: string, value: JsonObject, extra: JsonObject = {}): JsonObject => ({
  kind: 'input',
  id,
  position: { x: 0, y: 0 },
  value,
  ...extra,
});

const output = (id: string, out: JsonObject): JsonObject => ({
  kind: 'output',
  id,
  position: { x: 0, y: 0 },
  output: out,
});

const wire = (from: string, to: string): JsonObject => {
  const [fromNode = '', fromPort = ''] = from.split('.');
  const [toNode = '', toPort = ''] = to.split('.');
  return {
    id: `${from}->${to}`,
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort },
  };
};

const graph = (nodes: readonly JsonObject[], edges: readonly JsonObject[]): GraphDocument =>
  parseDocument({
    schemaVersion: SCHEMA_VERSION,
    id: 'drive',
    title: 'Rim speed and tangential force',
    nodes: [...nodes],
    edges: [...edges],
    frames: [],
  });

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

/**
 * `v = π·d·n`, `F = P/v`, with `d` swept over four stock diameters.
 *
 * Every node in it is a base node: two multiplies, one divide, one `pi`.
 */
function driveGraph(diameters: readonly number[]): GraphDocument {
  return graph(
    [
      input('d', { kind: 'list', values: [...diameters], unit: 'mm' }, { axisLabel: 'diameter' }),
      input('n', { kind: 'scalar', value: 1500, unit: 'rpm' }),
      input('P', { kind: 'scalar', value: 4, unit: 'kW' }),
      node('pi', 'pi'),
      node('piD', 'multiply'),
      node('v', 'multiply'),
      node('F', 'divide'),
      output('speed', { kind: 'print', unit: 'm/s' }),
      output('force', {
        kind: 'check',
        comparison: '<=',
        threshold: { value: 550, unit: 'N' },
      }),
      output('curve', { kind: 'plot', x: 'd', threshold: { value: 550, unit: 'N' } }),
    ],
    [
      wire('pi.value', 'piD.a'),
      wire('d.value', 'piD.b'),
      wire('piD.product', 'v.a'),
      wire('n.value', 'v.b'),
      wire('P.value', 'F.a'),
      wire('v.product', 'F.b'),
      wire('v.product', 'speed.value'),
      wire('F.quotient', 'force.value'),
      wire('F.quotient', 'curve.value'),
    ],
  );
}

describe('the base node library through the kernel', () => {
  it('checks every operation against its own expression', () => {
    // The nodes package could not do this: the dimension checker is the
    // kernel's. This is where `add` and `multiply` are shown to mean what they
    // declare, for every dimension at once (S59).
    for (const formula of OPERATIONS) {
      expect(() => checkFormulaDimensions(formula), formula.id).not.toThrow();
    }
  });

  it('binds each generic node to what it is wired to (S59)', () => {
    const resolution = resolveGraph(driveGraph([100]), catalogues);
    const speed = resolution.sources.get(endpointKey('v', 'product'))?.dimension;
    const force = resolution.sources.get(endpointKey('F', 'quotient'))?.dimension;
    expect(speed !== undefined && dimensionsEqual(speed, VELOCITY)).toBe(true);
    expect(force !== undefined && dimensionsEqual(force, FORCE)).toBe(true);
  });

  it('computes π·d·n and P/v, converting kW and rpm at the boundary (S5)', () => {
    const evaluation = evaluateDocument(driveGraph([100]), catalogues);
    const v = numeric(valueAt(evaluation, 'v', 'product')).data[0] as number;
    const F = numeric(valueAt(evaluation, 'F', 'quotient')).data[0] as number;

    // Worked out separately: 1500 rpm is 25 s⁻¹, 4 kW is 4e6 N·mm/s.
    const expectedV = Math.PI * 100 * 25;
    expect(v).toBeCloseTo(expectedV, 9);
    expect(F).toBeCloseTo(4e6 / expectedV, 9);
    // 7.85 m/s and 509 N — the magnitudes a drive calculation actually has.
    expect(v / 1000).toBeCloseTo(7.854, 3);
    expect(F).toBeCloseTo(509.3, 1);
  });

  it('displays the speed in the unit the output asked for', () => {
    const [speed] = evaluateDocument(driveGraph([100]), catalogues).outputs;
    expect(speed?.kind).toBe('print');
    expect(speed?.kind === 'print' && speed.unit.symbol).toBe('m/s');
  });

  it('turns one range into a study of the whole graph (S29, S43)', () => {
    const diameters = [90, 100, 112, 125];
    const evaluation = evaluateDocument(driveGraph(diameters), catalogues);

    const forces = numeric(valueAt(evaluation, 'F', 'quotient'));
    expect(forces.axes.map((axis) => axis.label)).toEqual(['diameter']);
    expect(forces.data).toHaveLength(diameters.length);
    for (const [i, d] of diameters.entries()) {
      expect(forces.data[i]).toBeCloseTo(4e6 / (Math.PI * d * 25), 9);
    }
  });

  it('reads the answer off the sweep: which diameters clear the threshold (S33)', () => {
    const evaluation = evaluateDocument(driveGraph([90, 100, 112, 125]), catalogues);
    const check = evaluation.outputs.find((entry) => entry.kind === 'check') as CheckResult;
    // F falls as d rises, so the smallest diameter is the one that fails.
    expect(check.results).toEqual([false, true, true, true]);
    expect(check.passed).toBe(false);
  });

  it('gives the plot its x axis, its coordinates and its threshold', () => {
    const evaluation = evaluateDocument(driveGraph([90, 100, 112, 125]), catalogues);
    const plot = evaluation.outputs.find((entry) => entry.kind === 'plot') as PlotResult;
    expect(plot.x.axis.id).toBe('d');
    expect(plot.x.coordinates.data).toEqual([90, 100, 112, 125]);
    expect(plot.threshold).toBe(550);
    expect(plot.series.data).toHaveLength(4);
  });

  it('evaluates a two-range study as a grid, with nothing rewired (S43)', () => {
    const document = graph(
      [
        input('d', { kind: 'list', values: [90, 100, 112], unit: 'mm' }),
        input('n', { kind: 'list', values: [1000, 1500], unit: 'rpm' }),
        node('pi', 'pi'),
        node('piD', 'multiply'),
        node('v', 'multiply'),
      ],
      [
        wire('pi.value', 'piD.a'),
        wire('d.value', 'piD.b'),
        wire('piD.product', 'v.a'),
        wire('n.value', 'v.b'),
      ],
    );
    const speeds = numeric(valueAt(evaluateDocument(document, catalogues), 'v', 'product'));
    expect(speeds.axes.map((axis) => axis.id)).toEqual(['d', 'n']);
    expect(speeds.data).toHaveLength(6);
    expect(speeds.data[0]).toBeCloseTo(Math.PI * 90 * (1000 / 60), 9);
    expect(speeds.data[5]).toBeCloseTo(Math.PI * 112 * 25, 9);
  });

  it('will not add a length to a force, even through a generic node (S6, S59)', () => {
    const document = graph(
      [
        input('d', { kind: 'scalar', value: 100, unit: 'mm' }),
        input('F', { kind: 'scalar', value: 500, unit: 'N' }),
        node('sum', 'add'),
      ],
      [wire('d.value', 'sum.a')],
    );
    const result = canConnect(document, catalogues, wire('F.value', 'sum.b'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/bound twice/u);
  });

  it('will not put a length into the angle port of a trig node, but will a pure number (S54)', () => {
    const document = graph(
      [
        input('d', { kind: 'scalar', value: 100, unit: 'mm' }),
        input('beta', { kind: 'scalar', value: 2.7, unit: '' }),
        node('sin', 'sine'),
      ],
      [],
    );
    expect(canConnect(document, catalogues, wire('d.value', 'sin.theta')).ok).toBe(false);
    // R&M tags belt's wrap angles `[]`, so a pure number must reach an angle port.
    expect(canConnect(document, catalogues, wire('beta.value', 'sin.theta'))).toEqual({ ok: true });
  });

  describe('a spectrum port joined by several discrete wires (S71)', () => {
    it('reduces any number of wired values, not just two', () => {
      const document = graph(
        [
          input('a', { kind: 'scalar', value: 30, unit: 'mm' }),
          input('b', { kind: 'scalar', value: 10, unit: 'mm' }),
          input('c', { kind: 'scalar', value: 20, unit: 'mm' }),
          node('m', 'minimum'),
        ],
        [wire('a.value', 'm.a'), wire('b.value', 'm.a'), wire('c.value', 'm.a')],
      );
      const smallest = numeric(valueAt(evaluateDocument(document, catalogues), 'm', 'smallest'));
      expect(smallest.data).toEqual([10]);
    });

    it('lets a second wire join the port instead of replacing the first (unlike every other port)', () => {
      const document = graph(
        [
          input('a', { kind: 'scalar', value: 30, unit: 'mm' }),
          input('b', { kind: 'scalar', value: 10, unit: 'mm' }),
          node('m', 'minimum'),
        ],
        [wire('a.value', 'm.a')],
      );
      const result = canConnect(document, catalogues, wire('b.value', 'm.a'));
      expect(result).toEqual({ ok: true });
      const resolved = resolveGraph(
        { ...document, edges: [...document.edges, wire('b.value', 'm.a')] },
        catalogues,
      );
      expect(resolved.incoming.get(endpointKey('m', 'a'))).toHaveLength(2);
    });

    it('refuses a value of the wrong dimension, exactly as a plain generic port would', () => {
      const document = graph(
        [
          input('a', { kind: 'scalar', value: 30, unit: 'mm' }),
          input('F', { kind: 'scalar', value: 500, unit: 'N' }),
          node('m', 'minimum'),
        ],
        [wire('a.value', 'm.a')],
      );
      const result = canConnect(document, catalogues, wire('F.value', 'm.a'));
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toMatch(/one dimension/u);
    });

    it('refuses a swept value — a spectrum is consumed whole, not per point', () => {
      const document = graph(
        [
          input('a', { kind: 'scalar', value: 30, unit: 'mm' }),
          input('d', { kind: 'list', values: [10, 20], unit: 'mm' }),
          node('m', 'minimum'),
        ],
        [wire('a.value', 'm.a'), wire('d.value', 'm.a')],
      );
      expect(() => evaluateDocument(document, catalogues)).toThrow(/not a swept series/u);
    });
  });
});

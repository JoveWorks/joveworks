/**
 * What the canvas shows while a graph is still being built.
 *
 * The formulas here are invented — `y = a + b`, and a quarantined twin of it —
 * because a real R&M record would be a citation in a public repository and
 * because none is needed: what is under test is readiness, not arithmetic.
 */

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, loadCatalogue, formulaRef, type Catalogue, type GraphDocument } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { analyse, lookup } from './analysis';

/** A `problems` entry is a rendered reason (symbol names get a real <sub>) — text out for assertions. */
function text(node: ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}
import { baseCatalogue } from './catalogues';
import { padPressure, platformFootprint } from './samples';

const INVENTED: Catalogue = loadCatalogue(
  JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    id: 'invented',
    name: 'Invented',
    restricted: false,
    formulas: [
      {
        id: 'inv.sum',
        version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'mm' },
        inputs: [
          { kind: 'numeric', name: 'a', unit: 'mm' },
          { kind: 'numeric', name: 'b', unit: 'mm' },
        ],
        expression: 'a + b',
        description: 'An invented sum, for testing the editor.',
        status: 'unverified',
      },
      {
        id: 'inv.quarantined',
        version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'mm' },
        inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
        expression: 'a * 2',
        description: 'An invented formula that may not be evaluated.',
        status: 'quarantined',
        quarantineReason: 'invented, and quarantined on purpose',
      },
    ],
  }),
);

const CATALOGUES: readonly Catalogue[] = [baseCatalogue(), INVENTED];

const scalar = (id: string, value: number) =>
  ({
    kind: 'input' as const,
    id,
    position: { x: 0, y: 0 },
    value: { kind: 'scalar' as const, value, unit: parseUnit('mm') },
  });

const formulaNode = (id: string, formulaId: string) => ({
  kind: 'formula' as const,
  id,
  position: { x: 0, y: 0 },
  formula: formulaRef(lookup(CATALOGUES, formulaId) as never),
});

const compareNode = (id: string, comparison: string, threshold: number, unit: string) => ({
  kind: 'compare' as const,
  id,
  position: { x: 0, y: 0 },
  comparison: comparison as never,
  threshold: { value: threshold, unit: parseUnit(unit) },
});

const closureNode = (id: string, expression: string) => ({
  kind: 'closure' as const,
  id,
  position: { x: 0, y: 0 },
  expression,
});

const waypointNode = (id: string) => ({ kind: 'waypoint' as const, id, position: { x: 0, y: 0 } });

const wire = (id: string, from: [string, string], to: [string, string]) => ({
  id,
  from: { node: from[0], port: from[1] },
  to: { node: to[0], port: to[1] },
});

function graph(nodes: GraphDocument['nodes'], edges: GraphDocument['edges']): GraphDocument {
  return { schemaVersion: SCHEMA_VERSION, id: 'test', title: 'Test', nodes, edges, frames: [] };
}

describe('analysing a graph mid-build', () => {
  it('evaluates what is ready and marks what is not', () => {
    const document = graph(
      [scalar('a', 2), scalar('b', 3), formulaNode('sum', 'inv.sum'), formulaNode('half', 'inv.sum')],
      [wire('e1', ['a', 'value'], ['sum', 'a']), wire('e2', ['b', 'value'], ['sum', 'b'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('sum')).toBe('ok');
    expect(analysis.evaluation?.values.get('sum.y')).toMatchObject({ data: [5] });

    // The half-wired node does not take the finished one down with it.
    expect(analysis.states.get('half')).toBe('incomplete');
    expect(text(analysis.problems.get('half'))).toContain('not connected');
  });

  it('counts a value typed on the node as supplying that port — no wire needed', () => {
    // `b` has no declared default, so before values could be typed on any
    // port this node had no way to be complete but a second input node.
    const document = graph(
      [
        scalar('a', 2),
        {
          ...formulaNode('sum', 'inv.sum'),
          inputValues: { b: { kind: 'scalar' as const, value: 3, unit: parseUnit('mm') } },
        },
      ],
      [wire('e1', ['a', 'value'], ['sum', 'a'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('sum')).toBe('ok');
    expect(analysis.evaluation?.values.get('sum.y')).toMatchObject({ data: [5] });
  });

  it('counts one typed on a closure node too, whose ports never have a declared default', () => {
    const document = graph(
      [
        {
          ...closureNode('eq', 'p + q'),
          inputValues: {
            p: { kind: 'scalar' as const, value: 2, unit: parseUnit('mm') },
            q: { kind: 'scalar' as const, value: 3, unit: parseUnit('mm') },
          },
        },
      ],
      [],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('eq')).toBe('ok');
    expect(analysis.evaluation?.values.get('eq.result')).toMatchObject({ data: [5] });
  });

  it('still marks a port with nothing wired and nothing typed', () => {
    const document = graph(
      [
        scalar('a', 2),
        {
          ...formulaNode('sum', 'inv.sum'),
          inputValues: { b: { kind: 'scalar' as const, value: 3, unit: parseUnit('mm') } },
        },
      ],
      [],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('sum')).toBe('incomplete');
    expect(text(analysis.problems.get('sum'))).toContain('a');
    expect(text(analysis.problems.get('sum'))).not.toContain('b');
  });

  it('carries the owning catalogue alongside each formula node, so the canvas can show provenance', () => {
    const document = graph(
      [scalar('a', 2), scalar('b', 3), formulaNode('sum', 'inv.sum'), closureNode('eq', 'a + b')],
      [wire('e1', ['a', 'value'], ['sum', 'a']), wire('e2', ['b', 'value'], ['sum', 'b'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.sources.get('sum')).toMatchObject({ id: 'invented', name: { en: 'Invented' }, restricted: false });
    // A closure's formula is synthesised from its expression, not drawn from
    // any catalogue, so it has no source to show.
    expect(analysis.sources.has('eq')).toBe(false);
  });

  it('refuses a quarantined formula and blocks what depends on it, not the rest', () => {
    const document = graph(
      [
        scalar('a', 2),
        scalar('b', 3),
        formulaNode('sum', 'inv.sum'),
        formulaNode('bad', 'inv.quarantined'),
        { kind: 'output', id: 'out', position: { x: 0, y: 0 }, output: { kind: 'print' } },
      ],
      [
        wire('e1', ['a', 'value'], ['sum', 'a']),
        wire('e2', ['b', 'value'], ['sum', 'b']),
        wire('e3', ['a', 'value'], ['bad', 'a']),
        wire('e4', ['bad', 'y'], ['out', 'value']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('bad')).toBe('quarantined');
    expect(analysis.problems.get('bad')).toBe('invented, and quarantined on purpose');
    expect(analysis.states.get('out')).toBe('blocked');
    expect(analysis.states.get('sum')).toBe('ok');
  });

  it('evaluates a wired waypoint channel', () => {
    const document = graph(
      [
        scalar('a', 2),
        waypointNode('via'),
        { kind: 'output', id: 'out', position: { x: 0, y: 0 }, output: { kind: 'print' } },
      ],
      [wire('e1', ['a', 'value'], ['via', 'in0']), wire('e2', ['via', 'out0'], ['out', 'value'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('via')).toBe('ok');
    expect(analysis.problems.get('via')).toBeUndefined();
    expect(analysis.states.get('out')).toBe('ok');
  });

  it('blocks a spectrum port on any unready source, not just the last edge recorded', () => {
    const document = graph(
      [
        scalar('a', 2),
        scalar('b', 3),
        formulaNode('bad', 'inv.quarantined'),
        formulaNode('m', 'minimum'),
      ],
      [
        wire('e1', ['a', 'value'], ['m', 'a']),
        // Wired between two ready sources — a map keyed by target alone would
        // let the third edge overwrite this one and never notice it is stuck
        // behind a quarantined node.
        wire('e2', ['bad', 'y'], ['m', 'a']),
        wire('e3', ['b', 'value'], ['m', 'a']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('bad')).toBe('quarantined');
    expect(analysis.states.get('m')).toBe('blocked');
  });

  it('says which node a graph without its catalogue is missing', () => {
    const document = graph([formulaNode('sum', 'inv.sum')], []);
    const analysis = analyse(document, [baseCatalogue()]);

    expect(analysis.states.get('sum')).toBe('error');
    expect(analysis.problems.get('sum')).toContain('inv.sum');
  });

  it('an unfinished closure node does not stop the rest of the graph from resolving and evaluating', () => {
    const document = graph(
      [scalar('a', 2), scalar('b', 3), formulaNode('sum', 'inv.sum'), closureNode('eq', '')],
      [wire('e1', ['a', 'value'], ['sum', 'a']), wire('e2', ['b', 'value'], ['sum', 'b'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('eq')).toBe('error');
    expect(text(analysis.problems.get('eq'))).toContain('type an equation');
    expect(analysis.states.get('sum')).toBe('ok');
    expect(analysis.evaluation?.values.get('sum.y')).toMatchObject({ data: [5] });
  });

  it('blocks what depends on a closure node that fails to resolve, not the rest of the graph', () => {
    const document = graph(
      [
        scalar('a', 2),
        scalar('b', 3),
        closureNode('bad', 'a +'),
        { kind: 'output' as const, id: 'out', position: { x: 0, y: 0 }, output: { kind: 'print' as const } },
        formulaNode('sum', 'inv.sum'),
      ],
      [
        wire('e1', ['a', 'value'], ['bad', 'a']),
        wire('e2', ['bad', 'result'], ['out', 'value']),
        wire('e3', ['a', 'value'], ['sum', 'a']),
        wire('e4', ['b', 'value'], ['sum', 'b']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('bad')).toBe('error');
    expect(analysis.states.get('out')).toBe('blocked');
    expect(analysis.states.get('sum')).toBe('ok');
    expect(analysis.evaluation?.values.get('sum.y')).toMatchObject({ data: [5] });
  });
});

describe('compare nodes', () => {
  it('is incomplete while its required value is unwired, and needs no threshold wire', () => {
    const document = graph([compareNode('c', '>=', 1, 'mm')], []);
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('c')).toBe('incomplete');
    expect(text(analysis.problems.get('c'))).toContain('not connected');
  });

  it('is ready once its value is wired, and produces a verdict from the typed threshold', () => {
    const document = graph(
      [scalar('a', 2), compareNode('c', '>=', 1, 'mm')],
      [wire('e1', ['a', 'value'], ['c', 'value'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('c')).toBe('ok');
    expect(analysis.evaluation?.values.get('c.verdict')).toMatchObject({
      kind: 'categorical',
      data: ['pass'],
    });
  });

  it('is blocked, not ready, when its value comes from a node that is not ready yet', () => {
    const document = graph(
      [scalar('a', 2), formulaNode('bad', 'inv.quarantined'), compareNode('c', '>=', 1, 'mm')],
      [wire('e1', ['a', 'value'], ['bad', 'a']), wire('e2', ['bad', 'y'], ['c', 'value'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('bad')).toBe('quarantined');
    expect(analysis.states.get('c')).toBe('blocked');
  });
});

const checkOutputNode = (id: string, comparison: string, threshold: number, unit: string) => ({
  kind: 'output' as const,
  id,
  position: { x: 0, y: 0 },
  output: {
    kind: 'check' as const,
    comparison: comparison as never,
    threshold: { value: threshold, unit: parseUnit(unit) },
  },
});

const feasibilityOutputNode = (id: string, checks: readonly string[]) => ({
  kind: 'output' as const,
  id,
  position: { x: 0, y: 0 },
  output: { kind: 'feasibility' as const, checks },
});

const range = (id: string, start: number, stop: number, points: number, unit: string) => ({
  kind: 'input' as const,
  id,
  position: { x: 0, y: 0 },
  value: { kind: 'linear' as const, start, stop, points, unit: parseUnit(unit) },
});

describe('feasibility outputs', () => {
  it('is ready once every referenced check is ready, however it is ordered relative to them', () => {
    // The Feasibility node's array position precedes the Check nodes it
    // references — the exact ordering regression the kernel's two-pass
    // evaluation closes (evaluate.ts). `readiness()` here walks the same
    // topological order to decide per-node state, so it needs the identical
    // second-pass deferral, or this node is trivially "blocked" forever: it
    // has no wire of its own, so nothing about it ever becomes ready in a
    // single forward pass unless the checks happen to already be marked.
    const document = graph(
      [
        feasibilityOutputNode('f', ['c1', 'c2']),
        range('a', 1, 5, 3, 'mm'),
        checkOutputNode('c1', '>=', 1, 'mm'),
        checkOutputNode('c2', '<=', 5, 'mm'),
      ],
      [
        wire('e1', ['a', 'value'], ['c1', 'value']),
        wire('e2', ['a', 'value'], ['c2', 'value']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('c1')).toBe('ok');
    expect(analysis.states.get('c2')).toBe('ok');
    expect(analysis.states.get('f')).toBe('ok');
  });

  it('is incomplete with no checks chosen yet', () => {
    const document = graph([feasibilityOutputNode('f', [])], []);
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('f')).toBe('incomplete');
  });

  it('is blocked while a referenced check is not ready itself', () => {
    const document = graph(
      [
        feasibilityOutputNode('f', ['c1']),
        range('a', 1, 5, 3, 'mm'),
        formulaNode('bad', 'inv.quarantined'),
        checkOutputNode('c1', '>=', 1, 'mm'),
      ],
      [
        wire('e1', ['a', 'value'], ['bad', 'a']),
        wire('e2', ['bad', 'y'], ['c1', 'value']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('c1')).toBe('blocked');
    expect(analysis.states.get('f')).toBe('blocked');
  });
});

const selectNode = (id: string, mode: string, extra: Record<string, unknown> = {}) =>
  ({ kind: 'select' as const, id, position: { x: 0, y: 0 }, mode: mode as never, ...extra });

const bestDesignOutputNode = (id: string, checks: readonly string[], direction = 'minimize') => ({
  kind: 'output' as const,
  id,
  position: { x: 0, y: 0 },
  output: { kind: 'bestDesign' as const, checks, direction: direction as never },
});

describe('select nodes', () => {
  const crossing = (id: string) =>
    selectNode(id, 'crossing', { threshold: { value: 3, unit: parseUnit('mm') }, direction: 'any' });

  it('is incomplete until both `value` and `along` are wired, naming what is missing', () => {
    const bare = analyse(graph([crossing('s'), range('a', 1, 5, 3, 'mm')], []), CATALOGUES);
    expect(bare.states.get('s')).toBe('incomplete');
    expect(text(bare.problems.get('s'))).toContain('not connected');

    // `value` alone is not enough: without `along` there is no axis to
    // search and no coordinate for the answer to be expressed in.
    const halfWired = analyse(
      graph([crossing('s'), range('a', 1, 5, 3, 'mm')], [wire('e1', ['a', 'value'], ['s', 'value'])]),
      CATALOGUES,
    );
    expect(halfWired.states.get('s')).toBe('incomplete');
    expect(text(halfWired.problems.get('s'))).toContain('along');
  });

  it('is ready with both wired, and answers on `at` in the axis’s own dimension', () => {
    const document = graph(
      [crossing('s'), range('a', 1, 5, 3, 'mm')],
      [wire('e1', ['a', 'value'], ['s', 'value']), wire('e2', ['a', 'value'], ['s', 'along'])],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('s')).toBe('ok');
    expect(analysis.evaluation?.values.get('s.at')).toMatchObject({ data: [3] });
  });

  it('is blocked while what is wired into it is not ready itself', () => {
    const document = graph(
      [crossing('s'), range('a', 1, 5, 3, 'mm'), formulaNode('bad', 'inv.quarantined')],
      [
        wire('e1', ['a', 'value'], ['bad', 'a']),
        wire('e2', ['bad', 'y'], ['s', 'value']),
        wire('e3', ['a', 'value'], ['s', 'along']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('s')).toBe('blocked');
  });
});

describe('Best Design outputs', () => {
  it('is ready with an objective wired and no checks at all — that is an unconstrained minimum', () => {
    const document = graph(
      [bestDesignOutputNode('b', []), range('a', 1, 5, 3, 'mm')],
      [wire('e1', ['a', 'value'], ['b', 'objective'])],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('b')).toBe('ok');
  });

  it('is incomplete without an objective, whatever checks it references', () => {
    const document = graph(
      [bestDesignOutputNode('b', ['c1']), range('a', 1, 5, 3, 'mm'), checkOutputNode('c1', '>=', 1, 'mm')],
      [wire('e1', ['a', 'value'], ['c1', 'value'])],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('b')).toBe('incomplete');
    expect(text(analysis.problems.get('b'))).toContain('objective');
  });

  it('is ready however it is ordered relative to the checks it references', () => {
    // Same deferral the Feasibility case above depends on: this node's array
    // position precedes its checks, and it must still resolve.
    const document = graph(
      [
        bestDesignOutputNode('b', ['c1']),
        range('a', 1, 5, 3, 'mm'),
        checkOutputNode('c1', '>=', 1, 'mm'),
      ],
      [wire('e1', ['a', 'value'], ['c1', 'value']), wire('e2', ['a', 'value'], ['b', 'objective'])],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('b')).toBe('ok');
  });

  it('is blocked while a referenced check is not ready itself', () => {
    const document = graph(
      [
        bestDesignOutputNode('b', ['c1']),
        range('a', 1, 5, 3, 'mm'),
        formulaNode('bad', 'inv.quarantined'),
        checkOutputNode('c1', '>=', 1, 'mm'),
      ],
      [
        wire('e1', ['a', 'value'], ['bad', 'a']),
        wire('e2', ['bad', 'y'], ['c1', 'value']),
        wire('e3', ['a', 'value'], ['b', 'objective']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('c1')).toBe('blocked');
    expect(analysis.states.get('b')).toBe('blocked');
  });
});

describe('check outputs', () => {
  it('is ready with only its value wired — the threshold has its own typed default', () => {
    const document = graph(
      [scalar('a', 2), checkOutputNode('c', '>=', 1, 'mm')],
      [wire('e1', ['a', 'value'], ['c', 'value'])],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('c')).toBe('ok');
  });

  it('is blocked when its threshold is wired to a node that is not ready yet', () => {
    const document = graph(
      [
        scalar('a', 2),
        formulaNode('bad', 'inv.quarantined'),
        checkOutputNode('c', '>=', 1, 'mm'),
      ],
      [
        wire('e1', ['a', 'value'], ['c', 'value']),
        wire('e2', ['a', 'value'], ['bad', 'a']),
        wire('e3', ['bad', 'y'], ['c', 'threshold']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('bad')).toBe('quarantined');
    expect(analysis.states.get('c')).toBe('blocked');
  });
});

describe('closure nodes', () => {
  it('is incomplete while a name its expression uses is unwired', () => {
    const document = graph([scalar('a', 2), closureNode('eq', 'a + b')], [
      wire('e1', ['a', 'value'], ['eq', 'a']),
    ]);
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('eq')).toBe('incomplete');
    expect(text(analysis.problems.get('eq'))).toContain('not connected');
  });

  it('evaluates once every name it uses is wired, and blocks what depends on a bad one', () => {
    const document = graph(
      [
        scalar('a', 2),
        scalar('b', 3),
        closureNode('eq', 'a + b'),
        { kind: 'output' as const, id: 'out', position: { x: 0, y: 0 }, output: { kind: 'print' as const } },
      ],
      [
        wire('e1', ['a', 'value'], ['eq', 'a']),
        wire('e2', ['b', 'value'], ['eq', 'b']),
        wire('e3', ['eq', 'result'], ['out', 'value']),
      ],
    );
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('eq')).toBe('ok');
    expect(analysis.evaluation?.values.get('eq.result')).toMatchObject({ data: [5] });
    expect(analysis.states.get('out')).toBe('ok');
  });

  it('reports a bad expression at the node, not silently across the whole graph', () => {
    const document = graph([closureNode('eq', 'a + * b')], []);
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.states.get('eq')).toBe('error');
    expect(analysis.formulas.get('eq')).toBeUndefined();
  });
});

describe('the pad-pressure sample', () => {
  it('sweeps, and every node of it evaluates', () => {
    const document = padPressure(CATALOGUES) as GraphDocument;
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    // 12 kN on a 40 mm × 10 mm pad is 30 N/mm², and canonical stress is N/mm².
    const pressure = analysis.evaluation?.values.get('pressure.quotient');
    expect(pressure?.kind).toBe('numeric');
    expect(pressure?.kind === 'numeric' && pressure.data).toHaveLength(26);
    expect(pressure?.kind === 'numeric' && pressure.data[0]).toBeCloseTo(30, 9);
  });

  it('produces the three outputs the notebook draws, including a failing check', () => {
    const document = padPressure(CATALOGUES) as GraphDocument;
    const { outputs } = analyse(document, CATALOGUES).evaluation as NonNullable<
      ReturnType<typeof analyse>['evaluation']
    >;

    const check = outputs.find((entry) => entry.nodeId === 'p_check');
    expect(check?.kind === 'check' && check.passed).toBe(false);

    const plot = outputs.find((entry) => entry.nodeId === 'p_plot');
    expect(plot?.kind === 'plot' && plot.x.axis.id).toBe('w');
    expect(plot?.kind === 'plot' && plot.threshold).toBeCloseTo(2, 9);
  });
});

describe('the platform-footprint example', () => {
  it('evaluates without a specialist catalogue', () => {
    const document = platformFootprint(CATALOGUES) as GraphDocument;
    const analysis = analyse(document, CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);
    expect(analysis.evaluation?.outputs.find((entry) => entry.nodeId === 'safe')).toMatchObject({
      kind: 'check',
      passed: false,
    });
  });
});

const paretoOutputNode = (id: string, checks: readonly string[]) => ({
  kind: 'output' as const,
  id,
  position: { x: 0, y: 0 },
  output: {
    kind: 'pareto' as const,
    checks,
    xDirection: 'minimize' as const,
    yDirection: 'minimize' as const,
  },
});

describe('Pareto outputs', () => {
  it('is ready with both objectives wired and no checks at all', () => {
    const document = graph(
      [paretoOutputNode('p', []), range('a', 1, 5, 3, 'mm')],
      [wire('e1', ['a', 'value'], ['p', 'x']), wire('e2', ['a', 'value'], ['p', 'y'])],
    );
    expect(analyse(document, CATALOGUES).states.get('p')).toBe('ok');
  });

  it('is incomplete with only one objective — a front needs two things to trade', () => {
    const document = graph(
      [paretoOutputNode('p', []), range('a', 1, 5, 3, 'mm')],
      [wire('e1', ['a', 'value'], ['p', 'x'])],
    );
    const analysis = analyse(document, CATALOGUES);
    expect(analysis.states.get('p')).toBe('incomplete');
    expect(text(analysis.problems.get('p'))).toContain('y');
  });

  it('is blocked while a check it references is not ready', () => {
    const document = graph(
      [paretoOutputNode('p', ['c1']), range('a', 1, 5, 3, 'mm'), checkOutputNode('c1', '>=', 1, 'mm')],
      [wire('e1', ['a', 'value'], ['p', 'x']), wire('e2', ['a', 'value'], ['p', 'y'])],
    );
    // `c1` has nothing wired to it, so it is incomplete — and this inherits that.
    expect(analyse(document, CATALOGUES).states.get('p')).toBe('blocked');
  });

  it('is ready however it is ordered relative to the checks it references', () => {
    // The same deferral Feasibility and Best Design rely on: this node sits
    // before its check in the array and must still resolve.
    const document = graph(
      [paretoOutputNode('p', ['c1']), range('a', 1, 5, 3, 'mm'), checkOutputNode('c1', '>=', 1, 'mm')],
      [
        wire('e1', ['a', 'value'], ['c1', 'value']),
        wire('e2', ['a', 'value'], ['p', 'x']),
        wire('e3', ['a', 'value'], ['p', 'y']),
      ],
    );
    expect(analyse(document, CATALOGUES).states.get('p')).toBe('ok');
  });
});

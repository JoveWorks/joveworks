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

import { SCHEMA_VERSION, loadCatalogue, formulaRef, type Catalogue, type GraphDocument } from '@mds/schema';
import { parseUnit } from '@mds/units';

import { analyse, lookup } from './analysis';

/** A `problems` entry is a rendered reason (symbol names get a real <sub>, S49) — text out for assertions. */
function text(node: ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}
import { baseCatalogue } from './catalogues';
import { padPressure } from './samples';

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

  it('refuses a quarantined formula and blocks what depends on it, not the rest (S19)', () => {
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

  it('blocks a spectrum port on any unready source, not just the last edge recorded (S71)', () => {
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

  it('says which node a graph without its catalogue is missing (S23)', () => {
    const document = graph([formulaNode('sum', 'inv.sum')], []);
    const analysis = analyse(document, [baseCatalogue()]);

    expect(analysis.states.get('sum')).toBe('error');
    expect(analysis.problems.get('sum')).toContain('inv.sum');
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

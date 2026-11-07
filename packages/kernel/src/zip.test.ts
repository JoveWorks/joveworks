/**
 * The zip node: several lists paired by position instead of crossed.
 *
 * Built around a hyperfocal distance, `H = f² / (N·c)`, over a few lenses —
 * each lens has its own focal length *and* its own minimum aperture, so a
 * 12 mm focal length must never meet the f/1.7 of the 25 mm lens. Plain
 * photographic optics, not textbook content.
 */

import { parseDocument, serializeDocument } from '@joveworks/schema';
import { describe, expect, it } from 'vitest';

import { evaluateDocument, valueAt } from './evaluate.js';
import { resolveGraph } from './graph.js';
import {
  closureNode,
  documentOf,
  input,
  list,
  outputNode,
  rangeNode,
  scalar,
  selectNode,
  wire,
} from './invented.fixtures.js';
import type { JsonObject } from '@joveworks/schema';
import type { NumericSeries, PortValue } from './series.js';

const FOCAL = [12, 25, 45, 75];
const APERTURE = [2.8, 1.7, 1.8, 1.8];
const LENSES = ['12-35', '25', '45', '75'];

const zipNode = (id: string, extra: JsonObject = {}): JsonObject => ({
  kind: 'zip',
  id,
  position: { x: 0, y: 0 },
  ...extra,
});

function numeric(value: PortValue | undefined): NumericSeries {
  if (value?.kind !== 'numeric') throw new Error(`expected a numeric series, got ${value?.kind}`);
  return value;
}

/** Focal lengths and apertures zipped, then into `H = f² / (N·c)`. */
function hyperfocal(options: {
  readonly c?: JsonObject;
  readonly extraNodes?: readonly JsonObject[];
  readonly extraWires?: readonly JsonObject[];
  readonly zipped?: boolean;
} = {}) {
  const zipped = options.zipped ?? true;
  return documentOf(
    [
      input('f', list(FOCAL, 'mm')),
      input('N', list(APERTURE, '')),
      input('c', options.c ?? scalar(0.015, 'mm')),
      zipNode('lens', { label: 'lens' }),
      closureNode('H', 'f ** 2 / (N * c)'),
      outputNode('show', { kind: 'print' }),
      ...(options.extraNodes ?? []),
    ],
    [
      wire('f.value', 'lens.in0'),
      wire('N.value', 'lens.in1'),
      wire(zipped ? 'lens.out0' : 'f.value', 'H.f'),
      wire(zipped ? 'lens.out1' : 'N.value', 'H.N'),
      wire('c.value', 'H.c'),
      wire('H.result', 'show.value'),
      ...(options.extraWires ?? []),
    ],
  );
}

const expected = FOCAL.map((f, i) => (f * f) / ((APERTURE[i] as number) * 0.015));

describe('zip', () => {
  it('pairs each focal length with its own aperture: one hyperfocal distance per lens', () => {
    const evaluation = evaluateDocument(hyperfocal(), []);
    const H = numeric(valueAt(evaluation, 'H', 'result'));
    expect(H.axes.map((axis) => axis.id)).toEqual(['lens']);
    expect(H.data).toHaveLength(4);
    H.data.forEach((value, i) => expect(value).toBeCloseTo(expected[i] as number, 6));
  });

  it('is what stops the two lists crossing into a 4 × 4 grid', () => {
    const evaluation = evaluateDocument(hyperfocal({ zipped: false }), []);
    expect(numeric(valueAt(evaluation, 'H', 'result')).data).toHaveLength(16);
  });

  it('passes each channel through unchanged, typed exactly as it arrived', () => {
    const evaluation = evaluateDocument(hyperfocal(), []);
    expect(numeric(valueAt(evaluation, 'lens', 'out0')).data).toEqual(FOCAL);
    expect(evaluation.resolution.sources.get('lens.out0')?.unit?.symbol).toBe('mm');
    expect(evaluation.resolution.sources.get('lens.out1')?.dimension).toEqual(
      evaluation.resolution.sources.get('N.value')?.dimension,
    );
  });

  it("still crosses with an ordinary sweep: lenses × circles of confusion", () => {
    const evaluation = evaluateDocument(hyperfocal({ c: list([0.015, 0.03], 'mm') }), []);
    const H = numeric(valueAt(evaluation, 'H', 'result'));
    expect(H.axes.map((axis) => axis.id).sort()).toEqual(['c', 'lens']);
    expect(H.data).toHaveLength(8);
  });

  it("reads its first channel as the axis coordinates, so a plot runs along focal length", () => {
    const readout = evaluateDocument(hyperfocal(), []).axisReadouts.get('lens');
    expect(readout?.axis.label).toBe('lens');
    expect(numeric(readout?.coordinates).data).toEqual(FOCAL);
    expect(readout?.unit?.symbol).toBe('mm');
  });

  it('can be a plot\'s x axis, read in its first channel', () => {
    const evaluation = evaluateDocument(
      hyperfocal({
        extraNodes: [outputNode('drawn', { kind: 'plot', x: 'lens' })],
        extraWires: [wire('H.result', 'drawn.value')],
      }),
      [],
    );
    const plot = evaluation.outputs.find((output) => output.nodeId === 'drawn');
    if (plot?.kind !== 'plot') throw new Error('expected a plot');
    expect(plot.x.axis.id).toBe('lens');
    expect(numeric(plot.x.coordinates).data).toEqual(FOCAL);
  });

  it('takes lens names as a channel too, and names the axis by them when they come first', () => {
    const document = documentOf(
      [
        input('name', { kind: 'categoricalList', values: LENSES }),
        input('f', list(FOCAL, 'mm')),
        zipNode('lens'),
      ],
      [wire('name.value', 'lens.in0'), wire('f.value', 'lens.in1')],
    );
    const evaluation = evaluateDocument(document, []);
    expect(evaluation.values.get('lens.out0')).toMatchObject({ kind: 'categorical', data: LENSES });
    expect(evaluation.axisReadouts.get('lens')?.coordinates).toMatchObject({ kind: 'categorical', data: LENSES });
  });

  it('lets a Select search along the zipped axis and answer with a focal length', () => {
    const evaluation = evaluateDocument(
      hyperfocal({
        extraNodes: [selectNode('nearest', 'argMin')],
        extraWires: [wire('H.result', 'nearest.value'), wire('lens.out0', 'nearest.along')],
      }),
      [],
    );
    const least = expected.indexOf(Math.min(...expected));
    expect(numeric(valueAt(evaluation, 'nearest', 'at')).data).toEqual([FOCAL[least]]);
  });

  it('refuses lists of different lengths, on the input that disagrees', () => {
    const document = documentOf(
      [input('f', list(FOCAL, 'mm')), input('N', list([2.8, 1.7, 1.8], '')), zipNode('lens')],
      [wire('f.value', 'lens.in0'), wire('N.value', 'lens.in1')],
    );
    expect(() => evaluateDocument(document, [])).toThrow(/'in1' has 3 values and 'in0' has 4.*same length/u);
  });

  it('refuses a single value beside a list, and says to wire it straight in', () => {
    const document = documentOf(
      [input('f', list(FOCAL, 'mm')), input('N', scalar(2.8, '')), zipNode('lens')],
      [wire('f.value', 'lens.in0'), wire('N.value', 'lens.in1')],
    );
    expect(() => evaluateDocument(document, [])).toThrow(/'in1' is a single value.*straight into the formula/u);
  });

  it('refuses an input that already varies along two axes', () => {
    const document = documentOf(
      [
        input('f', list(FOCAL, 'mm')),
        input('c', list([0.015, 0.03], 'mm')),
        closureNode('both', 'f * c'),
        zipNode('lens'),
      ],
      [wire('f.value', 'both.f'), wire('c.value', 'both.c'), wire('both.result', 'lens.in0')],
    );
    expect(() => evaluateDocument(document, [])).toThrow(/varies along 'f' and 'c'/u);
  });

  it('passes single values straight through with no axis, as a sensitivity study collapses them', () => {
    const document = documentOf(
      [input('f', scalar(12, 'mm')), input('N', scalar(2.8, '')), zipNode('lens')],
      [wire('f.value', 'lens.in0'), wire('N.value', 'lens.in1')],
    );
    const evaluation = evaluateDocument(document, []);
    expect(evaluation.resolution.axes.has('lens')).toBe(false);
    expect(numeric(valueAt(evaluation, 'lens', 'out0'))).toMatchObject({ axes: [], data: [12] });
  });

  it('refuses the raw list meeting its own zipped copy, where the two meet', () => {
    const document = hyperfocal({
      extraNodes: [closureNode('mixed', 'H / f')],
      extraWires: [wire('H.result', 'mixed.H'), wire('f.value', 'mixed.f')],
    });
    expect(() => evaluateDocument(document, [])).toThrow(/'f' meets its own zipped copy from 'lens'/u);
  });

  it('has no axis and no outputs while nothing is wired into it', () => {
    const document = documentOf([zipNode('lens')], []);
    expect(resolveGraph(document, []).axes.has('lens')).toBe(false);
    expect(evaluateDocument(document, []).values.has('lens.out0')).toBe(false);
  });

  it('measures a zip of a wired range, and a zip of a zip, in dependency order', () => {
    const document = documentOf(
      [
        input('n', scalar(4, '')),
        rangeNode('f', 'linear', 10, 40, 2, 'mm'),
        input('N', list(APERTURE, '')),
        zipNode('first'),
        input('name', { kind: 'categoricalList', values: LENSES }),
        zipNode('second'),
      ],
      [
        wire('n.value', 'f.count'),
        wire('f.value', 'first.in0'),
        wire('N.value', 'first.in1'),
        wire('first.out1', 'second.in0'),
        wire('name.value', 'second.in1'),
      ],
    );
    const evaluation = evaluateDocument(document, []);
    expect(evaluation.resolution.axes.get('first')?.length).toBe(4);
    expect(numeric(valueAt(evaluation, 'second', 'out0'))).toMatchObject({ data: APERTURE });
    expect(numeric(valueAt(evaluation, 'second', 'out0')).axes.map((axis) => axis.id)).toEqual(['second']);
  });

  it('round-trips through a saved document, axis label included', () => {
    const document = hyperfocal();
    const zipped = document.nodes.find((node) => node.id === 'lens');
    expect(zipped).toMatchObject({ kind: 'zip', label: 'lens' });
    const withLabel = parseDocument({
      ...serializeDocument(document),
      nodes: [...(serializeDocument(document).nodes as JsonObject[])].map((node) =>
        node.id === 'lens' ? { ...node, axisLabel: 'lens model' } : node,
      ),
    });
    expect(parseDocument(serializeDocument(withLabel))).toEqual(withLabel);
    expect(evaluateDocument(withLabel, []).resolution.axes.get('lens')?.label).toBe('lens model');
  });
});

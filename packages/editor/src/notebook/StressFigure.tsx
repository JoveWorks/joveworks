import { useEffect, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import { candidateMask, indexer, markLetter, type AxisReadout, type StressResult } from '@joveworks/kernel';
import type { GraphDocument } from '@joveworks/schema';
import type { NumberFormat } from '@joveworks/units';

import { display } from '../model/quantity';

interface Props {
  readonly result: StressResult;
  readonly document: GraphDocument;
  readonly readouts: ReadonlyMap<string, AxisReadout>;
  readonly checkLabels: Readonly<Record<string, string>>;
  readonly format: NumberFormat;
}

interface Design {
  readonly label: string;
  readonly cell: number;
}

function designs(result: StressResult, document: GraphDocument, readouts: ReadonlyMap<string, AxisReadout>): readonly Design[] {
  if (result.designAxes.length === 0) return [{ label: '', cell: 0 }];
  const seen = new Map<number, string[]>();
  for (const [i, mark] of (document.marks ?? []).entries()) {
    const { mask } = candidateMask(result.designAxes, mark, readouts);
    const cells = mask.flatMap((matches, cell) => (matches ? [cell] : []));
    if (cells.length !== 1) continue;
    const cell = cells[0] as number;
    const letters = seen.get(cell) ?? [];
    letters.push(markLetter(i));
    seen.set(cell, letters);
  }
  return [...seen.entries()].map(([cell, letters]) => ({ label: `Candidate ${letters.join('/')}`, cell }));
}

interface Point { readonly x: number; readonly margin: number; readonly check: string; }

function points(result: StressResult, design: number, labels: Readonly<Record<string, string>>): readonly Point[] {
  const ordered = [...result.designAxes, result.along.axis];
  const base = design * result.along.axis.length;
  return result.traces.flatMap((trace) => {
    if (!trace.rankable) return [];
    const read = indexer(trace.margins, ordered);
    return Array.from({ length: result.along.axis.length }, (_unused, i) => ({
      x: result.along.coordinates.data[i] as number,
      margin: trace.margins.data[read(base + i)] as number,
      check: labels[trace.checkId] ?? trace.checkId,
    })).filter((point) => Number.isFinite(point.margin));
  });
}

function earliestFailure(result: StressResult, design: number): { readonly checkId: string; readonly at: number } | undefined {
  const baseline = result.along.coordinates.data[0] as number;
  const end = result.along.coordinates.data.at(-1) as number;
  const direction = Math.sign(end - baseline);
  return result.traces
    .map((trace) => ({ checkId: trace.checkId, at: trace.firstFailure.data[design] as number }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => direction * (a.at - baseline) - direction * (b.at - baseline))[0];
}

function MarginPlot({ result, design, labels }: { readonly result: StressResult; readonly design: number; readonly labels: Readonly<Record<string, string>> }): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;
    const data = points(result, design, labels);
    if (data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'no referenced check has a normalised margin to plot';
      container.replaceChildren(empty);
      return undefined;
    }
    const chart = Plot.plot({
      width: 440,
      height: 250,
      marginLeft: 54,
      x: { label: result.along.unit.symbol.length === 0 ? result.along.axis.label : `${result.along.axis.label} (${result.along.unit.symbol})`, grid: true },
      y: { label: 'margin from limit', tickFormat: (value) => `${Math.round(value * 100)}%`, grid: true },
      color: { legend: true },
      marks: [Plot.ruleY([0], { stroke: '#c44e52' }), Plot.line(data, { x: 'x', y: 'margin', stroke: 'check', tip: true })],
    });
    container.replaceChildren(chart);
    return undefined;
  }, [result, design, labels]);
  return <div className="figure stress-figure" ref={host} />;
}

function TraceTable({ result, design, checkLabels, format }: Props & { readonly design: number }): ReactElement {
  const ordered = [...result.designAxes, result.along.axis];
  const base = design * result.along.axis.length;
  return <table className="stress-summary"><thead><tr><th>check</th><th>authored</th><th>at tested end</th><th>first failure</th></tr></thead><tbody>
    {result.traces.map((trace) => {
      const read = indexer(trace.series, ordered);
      const start = trace.series.data[read(base)] as number;
      const end = trace.series.data[read(base + result.along.axis.length - 1)] as number;
      const failure = trace.firstFailure.data[design] as number;
      return <tr key={trace.checkId}><td>{checkLabels[trace.checkId] ?? trace.checkId}</td><td>{display(start, trace.unit, 4, format)}</td><td>{display(end, trace.unit, 4, format)}</td><td>{Number.isFinite(failure) ? display(failure, result.along.unit, 4, format) : 'no sampled failure'}</td></tr>;
    })}
  </tbody></table>;
}

export function StressFigure({ result, document, readouts, checkLabels, format }: Props): ReactElement {
  const marked = designs(result, document, readouts);
  if (marked.length === 0) return <p className="stress-empty">Mark a design to stress-test it.</p>;
  const baseline = result.along.coordinates.data[0] as number;
  const end = result.along.coordinates.data.at(-1) as number;
  return <div className="stress-report">
    {marked.map((design) => {
      const failure = earliestFailure(result, design.cell);
      const headroom = failure === undefined ? undefined : failure.at - baseline;
      const headroomPercent = headroom === undefined || baseline === 0 ? undefined : headroom / Math.abs(baseline);
      const label = failure === undefined
        ? `${design.label.length === 0 ? 'The design' : design.label} has no sampled failure through ${display(end, result.along.unit, 4, format)}.`
        : `${design.label.length === 0 ? 'The design' : design.label} reaches ${checkLabels[failure.checkId] ?? failure.checkId} at ${display(failure.at, result.along.unit, 4, format)}${headroom === undefined ? '' : ` (${headroom >= 0 ? '+' : ''}${display(headroom, result.along.unit, 3, format)}${headroomPercent === undefined ? '' : `, ${(headroomPercent * 100).toFixed(1)}%`})`}.`;
      return <section className="stress-design" key={design.cell}><p className="stress-headline">{label}</p><MarginPlot result={result} design={design.cell} labels={checkLabels} /><TraceTable result={result} design={design.cell} document={document} readouts={readouts} checkLabels={checkLabels} format={format} /></section>;
    })}
  </div>;
}

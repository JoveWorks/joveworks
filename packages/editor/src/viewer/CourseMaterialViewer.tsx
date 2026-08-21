/**
 * A deliberately small first NodeBook viewer.
 *
 * It is not an alternate editor: its inputs are bundled example documents,
 * its only state is the chosen course example, and it renders finished output
 * rather than formula nodes or wires. That makes it useful as shareable course
 * material now without deciding how student work will later be packaged or
 * shared between devices.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { OutputResult } from '@joveworks/kernel';
import type { GraphDocument, OutputNode } from '@joveworks/schema';

import { analyse } from '../model/analysis';
import { baseCatalogue, bundledCatalogues } from '../model/catalogues';
import { DEFAULT_NUMBER_FORMAT_SETTINGS, toUnitsFormat } from '../model/numberFormat';
import {
  cantileverHollowSections,
  millingPowerEnvelope,
  padPressure,
  platformFootprint,
} from '../model/samples';
import { display, displayNumber } from '../model/quantity';
import { checkVerdict, summarise, summariseCheck } from '../model/values';
import { CheckReading } from '../CheckReading';
import { FeasibilityFigure } from '../notebook/FeasibilityFigure';
import { PlotFigure } from '../notebook/PlotFigure';
import { SensitivityFigure } from '../notebook/SensitivityFigure';
import { SettingsContext, type SettingsContextValue } from '../settings-context';
import { analytics, type CourseMaterial } from '../analytics/analytics';

interface CourseExample {
  readonly id: CourseMaterial;
  readonly title: string;
  readonly summary: string;
  readonly document: GraphDocument;
}

const comparisonText: Readonly<Record<string, string>> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

function readingOrder(a: { readonly position: { readonly x: number; readonly y: number } }, b: { readonly position: { readonly x: number; readonly y: number } }): number {
  const vertical = a.position.y - b.position.y;
  return Math.abs(vertical) > 100 ? vertical : a.position.x - b.position.x;
}

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes
    .filter((node): node is OutputNode => node.kind === 'output' && node.frameId === frameId)
    .slice()
    .sort(readingOrder);
}

function Result({ result, node, document }: { readonly result: OutputResult; readonly node: OutputNode; readonly document: GraphDocument }): ReactElement | null {
  const format = toUnitsFormat(DEFAULT_NUMBER_FORMAT_SETTINGS);
  const title = node.label ?? node.id;

  if (result.kind === 'print') {
    return <p className="viewer-result viewer-print"><strong>{title}</strong>{summarise(result, result.figures, format)}</p>;
  }

  if (result.kind === 'check') {
    const failures = result.results.filter((passed) => !passed).length;
    const verdict = checkVerdict(result.results);
    const mark = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✗' : '!';
    return (
      <div className={`viewer-result viewer-check ${verdict}`}>
        <strong><span aria-hidden="true">{mark}</span> {title}</strong>
        <span>
          <CheckReading
            segments={summariseCheck({ series: result.series, unit: result.unit }, result.results, 4, format)}
          />{' '}
          <span className="check-threshold">
            {comparisonText[result.comparison] ?? result.comparison} {display(result.threshold, result.unit, 4, format)}
          </span>
          {result.results.length > 1 && verdict !== 'pass' ? ` · fails at ${failures} of ${result.results.length} points` : ''}
        </span>
      </div>
    );
  }

  if (result.kind === 'table') {
    const rows = Math.max(...result.columns.map((column) => column.series.data.length));
    return (
      <div className="viewer-result viewer-table">
        <strong>{title}</strong>
        <div className="viewer-table-scroll">
          <table>
            <thead><tr>{result.columns.map((column) => <th key={column.name}>{column.name} <small>{column.unit.symbol}</small></th>)}</tr></thead>
            <tbody>{Array.from({ length: rows }, (_unused, row) => (
              <tr key={row}>{result.columns.map((column) => {
                const cell = column.series.data[row];
                return <td key={column.name}>{cell === undefined ? '' : typeof cell === 'number' ? displayNumber(cell, column.unit, 4, format) : cell}</td>;
              })}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );
  }

  // Equation outputs are deliberately absent: a public course viewer should
  // show the conclusion and citation, never expose a catalogue expression.
  if (result.kind === 'equation') return null;

  if (result.kind === 'feasibility') {
    return (
      <div className="viewer-result viewer-plot">
        <strong>{title}</strong>
        <FeasibilityFigure result={result} />
      </div>
    );
  }

  if (result.kind === 'sensitivity') {
    return (
      <div className="viewer-result viewer-plot">
        <strong>{title}</strong>
        <SensitivityFigure result={result} />
      </div>
    );
  }

  return (
    <div className="viewer-result viewer-plot">
      <strong>{title}</strong>
      <PlotFigure result={result} document={document} format={format} />
      {result.threshold === undefined ? null : <p>Threshold at {display(result.threshold, result.unit, 4, format)}</p>}
    </div>
  );
}

function ExampleReport({ example }: { readonly example: CourseExample }): ReactElement {
  const analysis = useMemo(() => analyse(example.document, [baseCatalogue(), ...bundledCatalogues()]), [example.document]);
  const results = new Map((analysis.evaluation?.outputs ?? []).map((result) => [result.nodeId, result] as const));

  return (
    <article className="course-report">
      <header className="course-report-header">
        <p className="course-report-kicker">Course material · read-only NodeBook</p>
        <h1>{example.document.title}</h1>
      </header>
      {example.document.frames.map((frame) => {
        const outputs = outputsOf(example.document, frame.id);
        if (outputs.length === 0) return null;
        return (
          <section className="course-section" key={frame.id}>
            <h2>{frame.title}</h2>
            {frame.note === undefined ? null : <p className="course-note">{frame.note}</p>}
            {outputs.map((node) => {
              const result = results.get(node.id);
              return (
                <div className="course-output" key={node.id}>
                  {result === undefined ? <p className="viewer-pending">This result is not available.</p> : <Result result={result} node={node} document={example.document} />}
                  {node.caption === undefined ? null : <p className="course-caption">{node.caption}</p>}
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

export function CourseMaterialViewer(): ReactElement {
  const settings: SettingsContextValue = {
    locale: 'en',
    setLocale: () => {},
    numberFormat: DEFAULT_NUMBER_FORMAT_SETTINGS,
    setNumberFormat: () => {},
    minimapVisible: false,
    setMinimapVisible: () => {},
    snapToGrid: false,
    setSnapToGrid: () => {},
    titleMathRendering: true,
    setTitleMathRendering: () => {},
    themePreference: 'system',
    setThemePreference: () => {},
    contourPalette: 'viridis',
    setContourPalette: () => {},
  };
  const examples = useMemo<readonly CourseExample[]>(() => {
    const catalogues = [baseCatalogue(), ...bundledCatalogues()];
    const candidates = [
      ['platform', 'Choose a safe platform size', 'A decision-focused sweep and threshold.', platformFootprint],
      ['pad', 'Pad pressure sweep', 'See a range propagate to a design limit.', padPressure],
      ['cantilever', 'Cantilever — hollow sections', 'Compare a public mechanics catalogue study.', cantileverHollowSections],
      ['milling', 'Pocket milling — power envelope', 'A multi-output machining study.', millingPowerEnvelope],
    ] as const;
    return candidates.flatMap(([id, title, summary, make]) => {
      const document = make(catalogues, 'en');
      return document === undefined ? [] : [{ id, title, summary, document }];
    });
  }, []);
  const [selectedId, setSelectedId] = useState(examples[0]?.id);
  const selected = examples.find((example) => example.id === selectedId) ?? examples[0];

  useEffect(() => {
    analytics.track({
      name: 'course_viewer_opened',
      props: { viewport: window.matchMedia('(max-width: 899px)').matches ? 'narrow' : 'wide' },
    });
  }, []);

  useEffect(() => {
    if (selected === undefined) return;
    analytics.track({ name: 'course_material_selected', props: { material: selected.id } });
  }, [selected]);

  if (selected === undefined) return <main className="course-viewer"><p>No course material is available.</p></main>;

  return (
    <SettingsContext.Provider value={settings}>
    <main className="course-viewer">
      <header className="course-viewer-header">
        <a className="course-viewer-brand" href="./">JoveWorks</a>
        <a className="course-viewer-editor" href="./">Open the desktop editor</a>
      </header>
      <div className="course-viewer-intro">
        <p className="course-report-kicker">Explore</p>
        <h1>Course material, made for reading.</h1>
        <p>These examples are live NodeBook reports: conclusions, checks, and plots without the graph-editing workspace.</p>
      </div>
      <nav className="course-example-list" aria-label="Course examples">
        {examples.map((example) => (
          <button type="button" key={example.id} className={example.id === selected.id ? 'selected' : ''} onClick={() => setSelectedId(example.id)}>
            <strong>{example.title}</strong><span>{example.summary}</span>
          </button>
        ))}
      </nav>
      <ExampleReport example={selected} />
    </main>
    </SettingsContext.Provider>
  );
}

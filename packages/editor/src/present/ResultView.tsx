/**
 * One renderer for one evaluated result, wherever it is read.
 *
 * The NodeBook panel, the course-material viewer and a published NodeBook all
 * used to draw results themselves, and the three drifted: the same check read
 * three ways, and a published plot arrived as a hand-rolled SVG that shared
 * nothing with the chart the author had signed off on. This is that renderer,
 * once (ROADMAP item 38).
 *
 * It is presentation-only. It takes an evaluated `OutputResult`, a title
 * already decided by its caller, and the display facts a figure cannot read
 * off its own result (`display.ts`) — never a document, a node, a catalogue or
 * an editing context. Everything the editor can do *to* a result and a reader
 * cannot arrives as `editing`: absent, and the same markup renders read-only.
 *
 * Expressions stay behind their own gate. Only an `equation` result carries
 * one, only an `equation` output node produces one, and the compiler that
 * builds a published NodeBook refuses to emit that kind at all — so the rule
 * that expressions never leak (OVERVIEW.md, "Exporting") is enforced by what
 * is compiled, not by what is drawn.
 */

import { Fragment, useState, type ReactElement, type ReactNode } from 'react';

import {
  candidateAt,
  parseExpression,
  toLatex,
  type Axis,
  type OutputResult,
} from '@joveworks/kernel';

import { Equation } from '../Equation';
import { ParameterLabel } from '../ParameterLabel';
import { TitleText } from '../canvas/TitleField';
import { CheckReading } from '../CheckReading';
import { display, displayNumber } from '../model/quantity';
import { checkVerdict, summarise, summariseCheck } from '../model/values';
import { phrase } from '../i18n';
import { BestDesignCard } from './BestDesignCard';
import { CandidateReadings } from './CandidateReadings';
import { DistributionFigure } from './DistributionFigure';
import { FeasibilityFigure, feasibilityGrid } from './FeasibilityFigure';
import { IntelligentPlotFigure } from './IntelligentPlotFigure';
import { NO_MARKS, type FigureMarking, type MarkIndex } from './marks';
import { ParetoFigure } from './ParetoFigure';
import { PlotFigure, plotGrid } from './PlotFigure';
import { ReliabilityCard } from './ReliabilityCard';
import { SensitivityFigure } from './SensitivityFigure';
import { StressFigure } from './StressFigure';
import { useDisplay } from './display';

const COMPARISON_TEXT: Readonly<Record<string, string>> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

/** Digits after the decimal point for a table column that has not been given a preference. */
export const DEFAULT_COLUMN_FIGURES = 4;

/**
 * What the editor can do to a result that a reader cannot. Every field is
 * optional and every one of them is a gesture, not data: a published NodeBook
 * passes nothing and the same markup renders, minus the handles.
 */
export interface ResultEditing {
  /** The per-column significant-figures field drawn inside a table heading. */
  readonly columnField?: (columnName: string) => ReactNode;
  readonly onReorderColumn?: (source: string, target: string, position: 'before' | 'after') => void;
  /**
   * Plot configuration, drawn under an intelligent plot's panels and inside
   * its own block so the two read as one figure. Authoring, so a published
   * NodeBook has none.
   */
  readonly plotControls?: ReactNode;
}

export interface ResultViewProps {
  readonly result: OutputResult;
  /**
   * The result's own title, already decided: an editable field in the editor,
   * typeset text everywhere else.
   */
  readonly title: ReactNode;
  /** Digits after the decimal point per table column, as the author set them. */
  readonly columnFigures?: Readonly<Record<string, number>>;
  /**
   * How this surface takes part in marking. A published NodeBook passes a
   * read-only marking so the marks it was published with still draw; a figure
   * rendered before any evaluation passes nothing and draws none.
   */
  readonly markingOver?: (axes: readonly Axis[]) => FigureMarking;
  readonly editing?: ResultEditing;
}

const NO_MARKING: FigureMarking = {
  marks: NO_MARKS,
  readouts: new Map(),
  toggle: () => undefined,
  hover: () => undefined,
};

export function ResultView({
  result,
  title,
  columnFigures = {},
  markingOver,
  editing,
}: ResultViewProps): ReactElement | null {
  const { format, locale } = useDisplay();
  const t = (english: string): string => phrase(locale, english);
  // A table's own drag state — one table at a time can be mid-reorder, and
  // each view owns just its own.
  const [columnDrag, setColumnDrag] = useState<
    { readonly over: string; readonly position: 'before' | 'after' } | undefined
  >(undefined);

  const markingFor = (axes: readonly Axis[]): FigureMarking => markingOver?.(axes) ?? NO_MARKING;
  const marksOver = (axes: readonly Axis[]): MarkIndex => markingFor(axes).marks;

  /** This result's readings for each mark that pins one of its cells — see `CandidateReadings`. */
  const candidateReadings = (
    axes: readonly Axis[],
    read: (cell: number) => ReactElement | string,
  ): ReactElement | null => <CandidateReadings marks={marksOver(axes)} read={read} />;

  const label = <span className="label">{title}</span>;

  if (result.kind === 'print') {
    return (
      <p className="result print">
        {label}
        <span className="number">{summarise(result, result.figures, format)}</span>
        {candidateReadings(result.series.axes, (cell) => {
          const value = result.series.data[cell];
          return value === undefined
            ? ''
            : typeof value === 'number'
              ? displayNumber(value, result.unit, result.figures, format)
              : value;
        })}
      </p>
    );
  }

  if (result.kind === 'check') {
    const shown = display(result.threshold, result.unit, 4, format);
    // A scalar check has exactly one verdict, so ✓/✗ already says everything.
    // A swept one has one verdict per point — pass, fail, or (unlike a
    // scalar) genuinely partial, which gets its own mark rather than
    // reading as a total failure. The count says which points and how
    // many, matching the wording the compact node's own badge already uses
    // (OutputNodeView.tsx), and moves below the row so the reading itself
    // never has to compete with it for width.
    const swept = result.results.length > 1;
    const failures = result.results.filter((passed) => !passed).length;
    const verdict = checkVerdict(result.results);
    const mark = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✗' : '!';
    return (
      <p className={`result check ${verdict}`}>
        <span className="check-row">
          {label}
          <span className="mark">{mark}</span>
          <span className="number">
            <CheckReading
              segments={summariseCheck({ series: result.series, unit: result.unit }, result.results, 4, format)}
            />{' '}
            <span className="check-threshold">
              {COMPARISON_TEXT[result.comparison] ?? result.comparison} {shown}
            </span>
          </span>
        </span>
        {candidateReadings(result.series.axes, (cell) => (
          <>
            {displayNumber(result.series.data[cell] as number, result.unit, 4, format)}{' '}
            <span className="mark">{result.results[cell] === true ? '✓' : '✗'}</span>
          </>
        ))}
        {swept && verdict !== 'pass' ? (
          <span className="count">
            {locale === 'nl'
              ? `faalt op ${failures} van ${result.results.length} punten`
              : `fails at ${failures} of ${result.results.length} points`}
          </span>
        ) : null}
      </p>
    );
  }

  if (result.kind === 'equation') {
    return (
      <div className="result equation">
        {label}
        <Equation latex={toLatex(parseExpression(result.expression))} />
      </div>
    );
  }

  if (result.kind === 'table') {
    const rows = Math.max(...result.columns.map((column) => column.series.data.length));
    // Row index *is* cell index: every column is broadcast onto `result.axes`,
    // row-major, before it gets here. So a row is a design, and marking one is
    // marking that design everywhere.
    const marking = markingFor(result.axes);
    const marks = marking.marks;
    const reorder = editing?.onReorderColumn;
    return (
      <div className="result table">
        {label}
        <table>
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column.name}
                  className={columnDrag?.over === column.name ? `drag-over-${columnDrag.position}` : undefined}
                  {...(reorder === undefined ? {} : {
                    draggable: true,
                    onDragStart: (event) => {
                      event.dataTransfer.setData('text/plain', column.name);
                      event.dataTransfer.effectAllowed = 'move';
                    },
                    onDragOver: (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const position = event.clientX - bounds.left < bounds.width / 2 ? 'before' : 'after';
                      setColumnDrag({ over: column.name, position });
                    },
                    onDragLeave: () => setColumnDrag(undefined),
                    onDrop: (event) => {
                      event.preventDefault();
                      const position = columnDrag?.position;
                      setColumnDrag(undefined);
                      if (position === undefined) return;
                      const source = event.dataTransfer.getData('text/plain');
                      if (source.length === 0) return;
                      reorder(source, column.name, position);
                    },
                  })}
                >
                  <ParameterLabel name={column.name} unit={column.unit} unitClassName="unit" />
                  {editing?.columnField?.(column.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_unused, row) => (
              <tr
                key={row}
                className={marks.at(row).length > 0 ? 'marked' : undefined}
                {...(markingOver === undefined ? {} : {
                  title: 'Click to mark this design — it is called out on every figure.',
                  onClick: () => marking.toggle(candidateAt(result.axes, row, marking.readouts)),
                })}
              >
                {result.columns.map((column, columnIndex) => {
                  const cell = column.series.data[row];
                  const figures = columnFigures[column.name] ?? DEFAULT_COLUMN_FIGURES;
                  const letters = columnIndex === 0 ? marks.at(row) : [];
                  return (
                    <td key={column.name}>
                      {letters.map((entry) => (
                        <span className="mark-letter" key={entry.index}>
                          {entry.letter}
                        </span>
                      ))}
                      {cell === undefined
                        ? ''
                        : typeof cell === 'number'
                          ? displayNumber(cell, column.unit, figures, format)
                          : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (result.kind === 'feasibility') {
    return (
      <div className="result plot">
        {label}
        <FeasibilityFigure result={result} marking={markingFor(feasibilityGrid(result))} />
      </div>
    );
  }

  if (result.kind === 'sensitivity') {
    return <div className="result plot">{label}<SensitivityFigure result={result} /></div>;
  }

  if (result.kind === 'stress') {
    return (
      <div className="result plot">
        {label}
        <StressFigure result={result} marks={marksOver(result.designAxes)} />
      </div>
    );
  }

  if (result.kind === 'bestDesign') {
    return <div className="result plot">{label}<BestDesignCard result={result} /></div>;
  }

  if (result.kind === 'pareto') {
    return (
      <div className="result plot">
        {label}
        <ParetoFigure result={result} marking={markingFor(result.axes)} />
        <p className="threshold">
          {result.frontCount} {t('of')} {result.feasibleCount}{' '}
          {t('candidates are on the front — the rest are beaten on both objectives')}
        </p>
      </div>
    );
  }

  if (result.kind === 'distribution') {
    return <div className="result plot">{label}<DistributionFigure result={result} /></div>;
  }

  if (result.kind === 'reliability') {
    return <div className="result plot">{label}<ReliabilityCard result={result} /></div>;
  }

  return (
    <div className="result plot">
      {label}
      {result.measures === undefined ? (
        <PlotFigure result={result} marking={markingFor(plotGrid(result))} />
      ) : (
        <IntelligentPlotFigure result={result} markingFor={markingFor} />
      )}
      {result.measures === undefined ? null : editing?.plotControls}
      {result.measures === undefined && result.threshold !== undefined ? (
        <p className="threshold">
          {t('threshold at')} {display(result.threshold, result.unit, 4, format)}{' '}
          {t('— where the curve crosses it is the size that works')}
        </p>
      ) : result.measures?.every((measure) => measure.threshold === undefined) ?? true ? null : (
        <p className="threshold">
          {/* A measure's label is a symbol like `M_c`, authored in the same
              notation as every node title — so it is typeset here the same
              way (`TitleText`, honouring the title-math setting) rather than
              printed with its subscript's underscore showing. The reading
              beside it stays plain text: it is a formatted number and unit,
              not notation. */}
          {(result.measures ?? [])
            .flatMap((measure) => measure.threshold === undefined
              ? []
              : [{
                  id: measure.id,
                  label: measure.label,
                  reading: display(measure.threshold, measure.unit, 4, format),
                }])
            .map((measure, index) => (
              <Fragment key={measure.id}>
                {index === 0 ? null : ' · '}
                <TitleText value={measure.label} />
                {`: ${measure.reading}`}
              </Fragment>
            ))}
        </p>
      )}
    </div>
  );
}

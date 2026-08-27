/**
 * The notebook: a view over the graph, not a second document.
 *
 * Group frames are its sections, in the order the document carries them, and the
 * output nodes inside a frame are that section's results — so arranging the
 * canvas arranges the report. Prose lives at two levels: a section note
 * here, and a caption on each output, both edited where they are read.
 *
 * Export is the browser's own print-to-PDF, aimed at just this panel by
 * `@media print` rules in styles.css — no PDF library, no second renderer to
 * keep in sync with this one. The rule that citation and values show by
 * default, with expressions only behind a marked toggle, now has exactly one
 * exception, and it is the toggle itself: an `equation` output node renders
 * its wired formula's expression as typeset math, opt-in by construction —
 * a student adds this specific node type to show an equation, rather than
 * expressions leaking out from a global setting.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type TextareaHTMLAttributes,
} from 'react';

import {
  candidateAt,
  parseExpression,
  toLatex,
  type Axis,
  type AxisReadout,
  type OutputResult,
} from '@joveworks/kernel';
import type {
  Candidate,
  Frame,
  GraphDocument,
  MonteCarloReceiverNode,
  OutputNode,
} from '@joveworks/schema';

import type { NumberFormat } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { analytics } from '../analytics/analytics';
import { useSettings } from '../settings-context';
import { ContextMenu, type MenuItem } from '../canvas/ContextMenu';
import { TitleField, typesetTitle } from '../canvas/TitleField';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import {
  moveFrame,
  reframe,
  removeNodes,
  renameNode,
  reorderColumn,
  reorderFrame,
  setColumnFigures,
  toggleCandidate,
  updateFrame,
  updateNode,
} from '../model/document';
import { NumberField } from '../canvas/fields';
import { toUnitsFormat } from '../model/numberFormat';
import { display, displayNumber } from '../model/quantity';
import { checkVerdict, summarise, summariseCheck } from '../model/values';
import { CheckReading } from '../CheckReading';
import { MonteCarloReceiverPlayback } from '../canvas/MonteCarloReceiverPlayback';
import { BestDesignCard } from './BestDesignCard';
import { FeasibilityFigure, feasibilityGrid } from './FeasibilityFigure';
import { marksOver as resolveMarksOver, type FigureMarking, type MarkIndex } from './marks';
import { CandidateReadings } from './CandidateReadings';
import { ParetoFigure } from './ParetoFigure';
import { PlotFigure, plotGrid } from './PlotFigure';
import { IntelligentPlotFigure } from './IntelligentPlotFigure';
import { IntelligentPlotControls } from './IntelligentPlotControls';
import { SensitivityFigure } from './SensitivityFigure';
import { DistributionFigure } from './DistributionFigure';
import { ReliabilityCard } from './ReliabilityCard';
import { NotebookSliderControl } from './NotebookSliderControl';
import { phrase, ui } from '../i18n';
import { exposedSlidersFor, readingOrder, withSliderValue } from '../model/notebook';

/**
 * Enter finishes the field (blurs it, same as `fields.tsx`'s `TextField`);
 * Shift+Enter is what actually types a line break. Both notebook textareas
 * already save on every keystroke, so "finishes" has nothing left to commit
 * — it only ever means "I'm done here," the same signal Enter already gives
 * everywhere else in the app.
 */
function commitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.blur();
}

interface NotebookTextFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> {
  readonly value: string;
}

function NotebookTextField({
  value,
  className,
  onBlur,
  ...props
}: NotebookTextFieldProps): ReactElement {
  const { locale, titleMathRendering } = useSettings();
  const [editing, setEditing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const typeset = titleMathRendering ? typesetTitle(value) : undefined;
  const showingTypeset = !editing && typeset !== undefined;

  const resize = (): void => {
    const element = textarea.current;
    if (element === null) return;

    // Clear the explicit height first so deleting text can shrink the field as
    // well as adding text can grow it.
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value, showingTypeset]);

  useEffect(() => {
    const element = textarea.current;
    if (element === null) return;

    // Resizing the notebook changes line wrapping without changing `value`.
    // Only react to width changes: our own height update also notifies a
    // ResizeObserver and must not start an observation loop.
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth === undefined || nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [showingTypeset]);

  if (showingTypeset) {
    return (
      <div
        className={`notebook-text-display${className === undefined ? '' : ` ${className}`}`}
        role="textbox"
        tabIndex={0}
        aria-label={value}
        title={phrase(locale, 'Click to edit the raw text')}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setEditing(true);
        }}
      >
        {typeset}
      </div>
    );
  }

  return (
    <textarea
      {...props}
      ref={textarea}
      className={className}
      value={value}
      autoFocus={editing}
      onBlur={(event) => {
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}

const COMPARISON_TEXT: Readonly<Record<string, string>> = {
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
};

/** An output's title belongs to the graph node, even when it is edited from
 * the NodeBook.  Use the ordinary rename operation so table columns that
 * still follow this output's old title follow it here too. */
function OutputTitle({ node }: { readonly node: OutputNode | MonteCarloReceiverNode }): ReactElement {
  const { edit, editLive, commitEdit } = useGraph();
  return (
    <TitleField
      value={node.label ?? node.id}
      onCommit={(label) => edit((current) => renameNode(current, node.id, label))}
      onChange={(label) => editLive((current) => renameNode(current, node.id, label))}
      onBlur={() => commitEdit()}
    />
  );
}

function Result({ result, node }: { readonly result: OutputResult; readonly node: OutputNode }): ReactElement | null {
  const { document, edit, analysis, setHoveredCandidate } = useGraph();
  const { numberFormat, locale } = useSettings();
  const notebookLocale = document.notebookLocale ?? locale;
  const t = (english: string): string => phrase(notebookLocale, english);
  const format: NumberFormat = toUnitsFormat(numberFormat);
  // A table's own drag state — one table at a time can be mid-reorder, and
  // each Result instance owns just its own (same locality as the node
  // panel's original column list before this moved here).
  const [columnDrag, setColumnDrag] = useState<
    { readonly over: string; readonly position: 'before' | 'after' } | undefined
  >(undefined);

  // The one place a figure and a mark meet. Every surface below resolves the
  // document's marks against *its own* axes through this, so a candidate that
  // pins one cell of a scatter and a whole column of a map is the same
  // candidate, decided by one rule rather than five renderers' guesses.
  const readouts: ReadonlyMap<string, AxisReadout> = analysis.evaluation?.axisReadouts ?? new Map();
  const marksOver = (axes: readonly Axis[]): MarkIndex => resolveMarksOver(document, axes, readouts);
  const markCandidate = (candidate: Candidate): void => edit((current) => toggleCandidate(current, candidate));
  const markingOver = (axes: readonly Axis[]): FigureMarking => ({
    marks: marksOver(axes),
    readouts,
    toggle: markCandidate,
    hover: setHoveredCandidate,
  });

  /** This result's readings for each mark that pins one of its cells — see `CandidateReadings`. */
  const candidateReadings = (
    axes: readonly Axis[],
    read: (cell: number) => ReactElement | string,
  ): ReactElement | null => <CandidateReadings marks={marksOver(axes)} read={read} />;

  if (result.kind === 'print') {
    return (
      <p className="result print">
        <span className="label">
          <OutputTitle node={node} />
        </span>
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
          <span className="label">
            <OutputTitle node={node} />
          </span>
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
            {notebookLocale === 'nl' ? `faalt op ${failures} van ${result.results.length} punten` : `fails at ${failures} of ${result.results.length} points`}
          </span>
        ) : null}
      </p>
    );
  }

  if (result.kind === 'equation') {
    return (
      <div className="result equation">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <Equation latex={toLatex(parseExpression(result.expression))} />
      </div>
    );
  }

  if (result.kind === 'table') {
    // In sync with result.kind by construction — the kernel only produces a
    // 'table' OutputResult from a 'table' Output.
    const output = node.output;
    if (output.kind !== 'table') return null;
    const rows = Math.max(...result.columns.map((column) => column.series.data.length));
    // Row index *is* cell index: every column is broadcast onto `result.axes`,
    // row-major, before it gets here. So a row is a design, and marking one is
    // marking that design everywhere — which is the whole reason this stopped
    // being a list of row numbers on the node.
    const marks = marksOver(result.axes);
    return (
      <div className="result table">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <table>
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column.name}
                  className={columnDrag?.over === column.name ? `drag-over-${columnDrag.position}` : undefined}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', column.name);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const position = event.clientX - bounds.left < bounds.width / 2 ? 'before' : 'after';
                    setColumnDrag({ over: column.name, position });
                  }}
                  onDragLeave={() => setColumnDrag(undefined)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const position = columnDrag?.position;
                    setColumnDrag(undefined);
                    if (position === undefined) return;
                    const source = event.dataTransfer.getData('text/plain');
                    if (source.length === 0) return;
                    edit((current) => reorderColumn(current, node.id, source, column.name, position));
                  }}
                >
                  <ParameterLabel name={column.name} unit={column.unit} unitClassName="unit" />
                  <NumberField
                    className="column-figures"
                    value={output.figures?.[column.name] ?? 4}
                    integer
                    minimum={0}
                    autoSize={1}
                    title={`digits after the decimal point for ${column.name}`}
                    onCommit={(figures) =>
                      edit((current) => setColumnFigures(current, node.id, column.name, figures))
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_unused, row) => (
              <tr
                key={row}
                className={marks.at(row).length > 0 ? 'marked' : undefined}
                title="Click to mark this design — it is called out on every figure."
                onClick={() => markCandidate(candidateAt(result.axes, row, readouts))}
                onPointerEnter={() => setHoveredCandidate(candidateAt(result.axes, row, readouts))}
                onPointerLeave={() => setHoveredCandidate(undefined)}
              >
                {result.columns.map((column, columnIndex) => {
                  const cell = column.series.data[row];
                  const figures = output.figures?.[column.name] ?? 4;
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
    // Same fallback `OutputTitle` uses for an unlabelled node — the tip's
    // failed-check breakdown should read the way the check's own row does.
    const checkLabels = Object.fromEntries(
      result.checks.map((id) => [id, document.nodes.find((candidate) => candidate.id === id)?.label ?? id]),
    );
    return (
      <div className="result plot">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <FeasibilityFigure
          result={result}
          checkLabels={checkLabels}
          marking={markingOver(feasibilityGrid(result))}
        />
      </div>
    );
  }

  if (result.kind === 'sensitivity') {
    return (
      <div className="result plot">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <SensitivityFigure result={result} />
      </div>
    );
  }

  if (result.kind === 'bestDesign') {
    // Same label fallback the feasibility tip uses — a check's own row and
    // this card should name it identically.
    const checkLabels = Object.fromEntries(
      result.checks.map((id) => [id, document.nodes.find((candidate) => candidate.id === id)?.label ?? id]),
    );
    return (
      <div className="result plot">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <BestDesignCard result={result} checkLabels={checkLabels} format={format} />
      </div>
    );
  }

  if (result.kind === 'pareto') {
    return (
      <div className="result plot">
        <span className="label">
          <OutputTitle node={node} />
        </span>
        <ParetoFigure result={result} format={format} marking={markingOver(result.axes)} />
        <p className="threshold">
          {result.frontCount} {t('of')} {result.feasibleCount}{' '}
          {t('candidates are on the front — the rest are beaten on both objectives')}
        </p>
      </div>
    );
  }

  if (result.kind === 'distribution') {
    return <div className="result plot"><span className="label"><OutputTitle node={node} /></span><DistributionFigure result={result} /></div>;
  }

  if (result.kind === 'reliability') {
    const checkLabels = Object.fromEntries(result.checks.map(({ checkId }) => [checkId, document.nodes.find((candidate) => candidate.id === checkId)?.label ?? checkId]));
    return <div className="result plot"><span className="label"><OutputTitle node={node} /></span><ReliabilityCard result={result} checkLabels={checkLabels} /></div>;
  }

  return (
    <div className="result plot">
      <span className="label">
        <OutputTitle node={node} />
      </span>
      {result.measures === undefined ? (
        <PlotFigure
          result={result}
          document={document}
          format={format}
          marking={markingOver(plotGrid(result))}
        />
      ) : (
        <IntelligentPlotFigure
          result={result}
          document={document}
          format={format}
          markingFor={markingOver}
        />
      )}
      {result.measures === undefined ? null : <IntelligentPlotControls node={node} result={result} />}
      {result.measures === undefined && result.threshold !== undefined ? (
        <p className="threshold">
          {t('threshold at')} {display(result.threshold, result.unit, 4, format)} {t('— where the curve crosses it is the size that works')}
        </p>
      ) : result.measures?.every((measure) => measure.threshold === undefined) ?? true ? null : (
        <p className="threshold">
          {result.measures?.flatMap((measure) => measure.threshold === undefined
            ? []
            : [`${measure.label}: ${display(measure.threshold, measure.unit, 4, format)}`]).join(' · ')}
        </p>
      )}
    </div>
  );
}

function Caption({
  node,
  defaultCaption,
}: {
  readonly node: OutputNode;
  readonly defaultCaption?: string;
}): ReactElement {
  const { editLive, commitEdit } = useGraph();
  const { locale } = useSettings();
  return (
    <NotebookTextField
      className="caption"
      value={node.caption ?? ''}
      placeholder={defaultCaption ?? phrase(locale, 'caption — what this result says')}
      rows={1}
      onKeyDown={commitOnEnter}
      onChange={(event) => {
        const caption = event.target.value;
        editLive((current) =>
          updateNode<OutputNode>(current, node.id, (entry) => {
            const { caption: _cleared, ...rest } = entry;
            return caption.length === 0 ? rest : { ...rest, caption };
          }),
        );
      }}
      onBlur={() => commitEdit()}
    />
  );
}

/**
 * One set of controls for a whole section, not one per result: a slider that
 * drives three of a section's results used to appear three times, and the
 * reader had to guess whether those were the same input or different ones.
 */
function ControlsFor({ nodeIds }: { readonly nodeIds: readonly string[] }): ReactElement | null {
  const { document, edit, editLive, commitEdit, setHovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const controls = exposedSlidersFor(document, nodeIds);
  if (controls.length === 0) return null;

  const change = (sliderId: string, value: number, live: boolean): void => {
    const apply = (current: GraphDocument): GraphDocument => withSliderValue(current, sliderId, value);
    if (live) editLive(apply);
    else edit(apply);
  };

  return (
    <div className="notebook-controls">
      {controls.map((slider) => (
        <div
          key={slider.id}
          onMouseEnter={() => setHovered(() => new Set([slider.id]))}
          onMouseLeave={() => setHovered(() => new Set())}
        >
          <NotebookSliderControl
            node={slider}
            format={format}
            onLiveChange={(value) => change(slider.id, value, true)}
            onCommit={commitEdit}
            onExactChange={(value) => change(slider.id, value, false)}
          />
        </div>
      ))}
    </div>
  );
}

/** The key `frame === undefined`'s pseudo-section collapses under — no frame id to key it by. */
const UNGROUPED = '__ungrouped__';

function Section({
  frame,
  outputs,
  receivers,
  collapsed,
  onToggle,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  readonly frame?: Frame;
  readonly outputs: readonly OutputNode[];
  /** Monte Carlo receivers in this frame — not outputs (a receiver is a
   * sink with its own node kind, not `output.kind`), but presentable in a
   * notebook section the same way: watched live, not a second document. */
  readonly receivers: readonly MonteCarloReceiverNode[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** Set by the notebook (a single, shared value — see its own comment) rather than owned locally. */
  readonly dragOver: 'before' | 'after' | undefined;
  readonly onDragOver: (position: 'before' | 'after') => void;
  readonly onDragLeave: () => void;
  /**
   * The notebook decides what a drop actually does — it knows the canonical
   * drop target (`dragOver`'s state), which after normalising "after A" into
   * "before B" isn't necessarily *this* section even when the pointer is
   * physically over it. Resolving the reorder here, against this section's
   * own `frame.id`, would silently no-op on exactly the boundary that
   * normalising was meant to fix.
   */
  readonly onDrop: (sourceId: string) => void;
  /**
   * Fires on the drag *source* when the operation ends for any reason —
   * dropped on a valid target, dropped outside one, or cancelled (Escape).
   * dragover/dragleave/drop on a *target* aren't guaranteed to fire in every
   * one of those cases, so this is the only reliable place to clear the
   * indicator — without it, ending a drag outside a valid target (or right
   * back over the section being dragged) could leave the line stuck.
   */
  readonly onDragEnd: () => void;
}): ReactElement | null {
  const { document, analysis, edit, editLive, commitEdit, setHovered } = useGraph();
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  if (outputs.length === 0 && receivers.length === 0) return null;

  const clearHover = (): void => setHovered(() => new Set());

  const results = new Map(
    (analysis.evaluation?.outputs ?? []).map((result) => [result.nodeId, result] as const),
  );

  const menuItems: readonly MenuItem[] =
    frame === undefined
      ? []
      : [
          {
            label: t('Move up'),
            disabled: document.frames[0]?.id === frame.id,
            onClick: () => edit((current) => moveFrame(current, frame.id, 'up')),
          },
          {
            label: t('Move down'),
            disabled: document.frames.at(-1)?.id === frame.id,
            onClick: () => edit((current) => moveFrame(current, frame.id, 'down')),
          },
          {
            label: t('Delete section'),
            danger: true,
            onClick: () => edit((current) => reframe(removeNodes(current, new Set([frame.id])))),
          },
        ];

  return (
    <section
      className={`notebook-section${dragOver === undefined ? '' : ` drag-over-${dragOver}`}`}
      onDragOver={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // Which half of the section the pointer is over decides whether the
        // drop lands before or after it — not always "before", which read as
        // arbitrary when the drop target's own bottom half was still "above".
        const bounds = event.currentTarget.getBoundingClientRect();
        onDragOver(event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        if (frame === undefined) return;
        // Unconditional, regardless of whether `dragOver` (this section's own,
        // possibly-normalised-away slice of the shared state) says this is
        // the drop target — without it, the browser's default action for a
        // text/plain drop onto a descendant text field (inserting it as
        // literal text) goes through instead of being suppressed.
        event.preventDefault();
        onDrop(event.dataTransfer.getData('text/plain'));
      }}
      onContextMenu={(event) => {
        if (frame === undefined) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <h2
        {...(frame === undefined
          ? {}
          : {
              onMouseEnter: () => setHovered(() => new Set([frame.id])),
              onMouseLeave: clearHover,
            })}
      >
        {frame === undefined ? null : (
          <span className="grip" aria-hidden="true">
            ⠿
          </span>
        )}
        {frame === undefined ? (
          <button type="button" className="section-toggle" onClick={onToggle}>
            <span className="section-toggle-title">{t('Not in a section')}</span>
            <span className="chevron" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
          </button>
        ) : (
          <>
            <input
              className="section-title"
              value={frame.title}
              size={Math.max(frame.title.length, 1)}
              onChange={(event) => {
                const title = event.target.value;
                editLive((current) => updateFrame(current, frame.id, (entry) => ({ ...entry, title })));
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.currentTarget.blur();
              }}
              onBlur={() => commitEdit()}
            />
            <button
              type="button"
              className="section-toggle"
              onClick={onToggle}
              aria-label={t(collapsed ? 'Expand section' : 'Collapse section')}
              // The whole flex-filled gap between the title and the chevron is
              // both the toggle click target and the drag-to-reorder handle —
              // a single element can be both, since the browser only starts a
              // drag once the pointer moves past a threshold, a click never
              // does. Keeping this off the section's title/note/caption
              // fields (not the section itself) is what keeps their own
              // double-click text selection working — see the commit that
              // moved dragging off the whole section.
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', frame.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={onDragEnd}
            >
              {collapsed ? (
                <span className="section-toggle-count">
                  {outputs.length + receivers.length}{' '}
                  {t(outputs.length + receivers.length === 1 ? 'result' : 'results')}
                </span>
              ) : null}
              <span className="chevron" aria-hidden="true">
                {collapsed ? '▸' : '▾'}
              </span>
            </button>
          </>
        )}
      </h2>
      {menu === undefined ? null : (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(undefined)} />
      )}
      {collapsed ? null : (
        <>
          {frame === undefined ? null : (
            <NotebookTextField
              className="note"
              value={frame.note ?? ''}
              placeholder={t('what this section establishes')}
              rows={3}
              onKeyDown={commitOnEnter}
              onChange={(event) => {
                const note = event.target.value;
                editLive((current) =>
                  updateFrame(current, frame.id, (entry) => {
                    const { note: _cleared, ...rest } = entry;
                    return note.length === 0 ? rest : { ...rest, note };
                  }),
                );
              }}
              onBlur={() => commitEdit()}
            />
          )}

          <ControlsFor nodeIds={[...outputs, ...receivers].map((node) => node.id)} />

          {outputs.map((node) => {
            const result = results.get(node.id);
            const captionProps =
              result?.kind === 'equation'
                ? { defaultCaption: result.citation ?? node.label ?? node.id }
                : {};
            return (
              <div
                key={node.id}
                className="entry"
                onMouseEnter={() => setHovered(() => new Set([node.id]))}
                onMouseLeave={clearHover}
              >
                {result === undefined ? (
                  <p className="result pending">
                    <span className="label">
                      <OutputTitle node={node} />
                    </span>
                    <span className="number">
                      {analysis.problems.get(node.id) ?? t('not yet computed')}
                    </span>
                  </p>
                ) : (
                  <Result result={result} node={node} />
                )}
                <Caption node={node} {...captionProps} />
              </div>
            );
          })}

          {receivers.map((node) => (
            <div
              key={node.id}
              className="entry"
              onMouseEnter={() => setHovered(() => new Set([node.id]))}
              onMouseLeave={clearHover}
            >
              <div className="result monte-carlo">
                <span className="label">
                  <OutputTitle node={node} />
                </span>
                <MonteCarloReceiverPlayback receiverId={node.id} size="large" />
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export { readingOrder } from '../model/notebook';

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes
    .filter((node): node is OutputNode => node.kind === 'output' && node.frameId === frameId)
    .slice()
    .sort(readingOrder);
}

function receiversOf(document: GraphDocument, frameId: string | undefined): readonly MonteCarloReceiverNode[] {
  return document.nodes
    .filter((node): node is MonteCarloReceiverNode => node.kind === 'monteCarloReceiver' && node.frameId === frameId)
    .slice()
    .sort(readingOrder);
}

export function Notebook({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { document, analysis, edit, editLive, commitEdit } = useGraph();
  const { locale } = useSettings();
  const copy = ui(locale);
  const t = (english: string): string => phrase(locale, english);
  // Session UI state, not a document field (same call as Palette.tsx) —
  // a section's collapse reopens on reload, same as a pinned node.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Shared across every section, rather than each Section owning its own —
  // two adjacent sections independently tracking "am I the drop target" could
  // both end up drawing a line (theirs at the shared edge doesn't reliably
  // clear on dragleave before the neighbour's dragover sets its own), which
  // read as two drop targets at once instead of one line at the boundary.
  // A single value can only ever belong to one section.
  const [dragOver, setDragOver] = useState<{ frameId: string; position: 'before' | 'after' } | undefined>(
    undefined,
  );
  // "After section N" and "before section N+1" are the same drop point, so
  // hovering the bottom half of a section is normalised to "before the next
  // one" below — one canonical state per boundary instead of two sections
  // each able to claim it, which was the actual source of the two-line bug
  // (dragOver being shared only fixed staleness within a single
  // representation, not this duplicate one). That normalisation means the
  // section whose *own* dragover last fired isn't always the section whose
  // id ends up in `dragOver` — so onDragLeave can't just compare frame ids.
  // This ref tracks which section most recently won the write, so a leave
  // event only clears the state it's actually still responsible for, not one
  // a neighbour has since (validly) taken over.
  const dragSource = useRef<string | undefined>(undefined);
  const clearDragOver = (): void => {
    dragSource.current = undefined;
    setDragOver(undefined);
  };

  // A collapsed section renders nothing (Section returns before its body), so
  // a printed PDF would silently drop whatever was folded up on screen.
  // Printing forces every section open for the print, then restores whatever
  // was collapsed — collapse state is session UI, not something export changes.
  const [printing, setPrinting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = (): void => setPrinting(false);
    window.addEventListener('afterprint', done);
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  return (
    <div
      className="notebook"
      // A dragged section's own drop targets (the sections themselves) call
      // this already; this catch-all is for everywhere else in the panel —
      // the title, the export button, the warnings list — none of which has
      // a drop handler of its own, so without this the browser falls back to
      // its default action for a text/plain drop onto a text field: inserting
      // it as literal text.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="notebook-header">
        <input
          className="notebook-title"
          value={document.title}
          onChange={(event) => {
            const title = event.target.value;
            editLive((current) => ({ ...current, title }));
          }}
          onBlur={() => commitEdit()}
        />
        <button
          type="button"
          className="notebook-icon-button"
          aria-expanded={showSettings}
          aria-label={copy.nodeBookSettings}
          title={copy.nodeBookSettings}
          onClick={() => setShowSettings((visible) => !visible)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M19.14 12.94a7.1 7.1 0 0 0 .05-.94 7.1 7.1 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.05 7.05 0 0 0-1.63-.94L14.87 3h-3.84l-.36 3.08c-.58.24-1.12.55-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.1 7.1 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.51.39 1.05.7 1.63.94l.36 3.08h3.84l.36-3.08c.58-.24 1.12-.55 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM12.95 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
          </svg>
        </button>
        {showSettings ? (
          <label className="notebook-language">
            {copy.notebookLanguage}
            <select
              value={document.notebookLocale ?? 'app'}
              onChange={(event) => edit((current) => {
                if (event.target.value === 'app') {
                  const { notebookLocale: _notebookLocale, ...withoutOverride } = current;
                  return withoutOverride;
                }
                return { ...current, notebookLocale: event.target.value as 'en' | 'nl' };
              })}
            >
              <option value="app">{copy.appLanguage}</option>
              <option value="en">{copy.english}</option>
              <option value="nl">{copy.dutch}</option>
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="notebook-icon-button"
          disabled={printing}
          aria-label={copy.exportPdf}
          title={copy.exportPdf}
          onClick={() => {
            setPrinting(true);
            analytics.track({ name: 'notebook_exported' });
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M18 3H6a3 3 0 0 0-3 3v9h4v6h10v-6h4V6a3 3 0 0 0-3-3Zm-3 16H9v-5h6v5Zm3-8H6V6h12v5Zm-3-4H9V5h6v2Z" />
          </svg>
        </button>
        <button
          type="button"
          className="panel-close-button"
          aria-label={t('Close notebook')}
          title={t('Close notebook — reopen it from the View menu')}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {document.frames.map((frame, index) => (
        <Section
          key={frame.id}
          frame={frame}
          outputs={outputsOf(document, frame.id)}
          receivers={receiversOf(document, frame.id)}
          collapsed={printing ? false : collapsed.has(frame.id)}
          onToggle={() => toggle(frame.id)}
          dragOver={dragOver?.frameId === frame.id ? dragOver.position : undefined}
          onDragOver={(position) => {
            dragSource.current = frame.id;
            const next = position === 'after' ? document.frames[index + 1] : undefined;
            setDragOver(
              next === undefined ? { frameId: frame.id, position } : { frameId: next.id, position: 'before' },
            );
          }}
          onDragLeave={() => {
            if (dragSource.current !== frame.id) return;
            clearDragOver();
          }}
          // Uses whatever `dragOver` currently holds — the canonical target,
          // not necessarily this section's own frame.id (see the prop's own
          // comment) — rather than resolving the reorder against `frame`
          // directly, which would silently no-op on a normalised boundary.
          onDrop={(sourceId) => {
            const target = dragOver;
            clearDragOver();
            if (target === undefined || sourceId.length === 0) return;
            edit((current) => reorderFrame(current, sourceId, target.frameId, target.position));
          }}
          onDragEnd={clearDragOver}
        />
      ))}
      <Section
        outputs={outputsOf(document, undefined)}
        receivers={receiversOf(document, undefined)}
        collapsed={printing ? false : collapsed.has(UNGROUPED)}
        onToggle={() => toggle(UNGROUPED)}
        dragOver={undefined}
        onDragOver={() => {}}
        onDragLeave={() => {}}
        onDrop={() => {}}
        onDragEnd={() => {}}
      />

      {analysis.message === undefined ? null : (
        <p className="notebook-problem">{analysis.message}</p>
      )}
      {analysis.warnings.length === 0 ? null : (
        <section className="notebook-warnings">
          <h2>{phrase(locale, 'Worth a look')}</h2>
          <ul>
            {analysis.warnings.map((warning) => (
              <li key={`${warning.kind}-${warning.nodeId ?? ''}-${warning.message}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

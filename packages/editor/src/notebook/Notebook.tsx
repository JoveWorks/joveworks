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
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type TextareaHTMLAttributes,
} from 'react';

import type { Axis, AxisReadout, OutputResult } from '@joveworks/kernel';
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
import { MonteCarloReceiverPlayback } from '../canvas/MonteCarloReceiverPlayback';
import { marksOver as resolveMarksOver, type FigureMarking } from '../present/marks';
import { DEFAULT_COLUMN_FIGURES, ResultView } from '../present/ResultView';
import { DisplayProvider } from '../present/display';
import { IntelligentPlotControls } from './IntelligentPlotControls';
import { NotebookSliderControl } from './NotebookSliderControl';
import { phrase, ui } from '../i18n';
import { exposedSlidersFor, notebookDisplayOf, notebookSectionId, readingOrder, withSliderValue } from '../model/notebook';

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
    //
    // The baseline is taken from the observer's own first callback rather
    // than measured up front, so both sides of the comparison describe the
    // same box: `getBoundingClientRect` reports the border box and
    // `contentRect` the content box, and with any padding or border on the
    // field those never compare equal — every mount then ran one pointless
    // resize. That first callback is the initial observation, which reports
    // the width the layout effect above has just sized the field for.
    let width: number | undefined;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth === undefined || nextWidth === width) return;
      if (width !== undefined) resize();
      width = nextWidth;
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
    <>
      {/* A `<textarea>` is monolithic to the fragmentation engine: it cannot
          be split across a column or page boundary at all, however tall it
          grows. That is invisible on screen and fatal in the two-column print
          layout — a note longer than one printed column fits no column, so
          the browser pushes it to the next page and *balances what is left*,
          which is what left a page with two half-empty columns and the rest
          of the report shunted onto later pages (reported twice: once for a
          section ending in a table, once for one ending in a plot — same
          cause both times, the prose that followed). A plain block of the
          same text fragments normally, so print that and hide the field.
          `aria-hidden` because the field beside it carries the same text,
          labelled and editable. An empty note or caption collapses rather
          than printing its placeholder, which is an editing prompt and has
          no place in a hand-in. */}
      <div
        className={`notebook-text-print${className === undefined ? '' : ` ${className}`}`}
        aria-hidden="true"
      >
        {value}
      </div>
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
    </>
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

/**
 * The NodeBook's own adapter onto the shared result renderer.
 *
 * Everything drawn here is drawn by `present/ResultView`, which the published
 * NodeBook and the cloud viewer use too. What this adds is the editing the
 * editor alone offers: an output's title is renamed where it is read, a
 * table's columns are reordered and given their digits, a marked design is
 * toggled by clicking its row, and an intelligent plot carries its
 * configuration.
 *
 * Still exported for `Notebook.expressions.test.tsx` — the seam that proves
 * the expressions-hidden-by-default rule (OVERVIEW.md's "Exporting") holds:
 * only `result.kind === 'equation'` may ever reach `<Equation>`.
 */
export function Result({ result, node }: { readonly result: OutputResult; readonly node: OutputNode }): ReactElement | null {
  const { document, edit, analysis } = useGraph();

  // The one place a figure and a mark meet. Every surface below resolves the
  // document's marks against *its own* axes through this, so a candidate that
  // pins one cell of a scatter and a whole column of a map is the same
  // candidate, decided by one rule rather than five renderers' guesses.
  const readouts: ReadonlyMap<string, AxisReadout> = analysis.evaluation?.axisReadouts ?? new Map();
  const markingOver = (axes: readonly Axis[]): FigureMarking => ({
    marks: resolveMarksOver(document.marks ?? [], axes, readouts),
    readouts,
    toggle: (candidate: Candidate) => edit((current) => toggleCandidate(current, candidate)),
    // Candidate hover was stored in the application-wide graph context, but
    // no surface consumed that state. Updating it on every plot pointer move
    // therefore rebuilt every notebook figure just to throw the value away.
    // Marks remain document state; hover stays intentionally ephemeral.
    hover: () => undefined,
  });

  // In sync with result.kind by construction — the kernel only produces a
  // 'table' OutputResult from a 'table' Output.
  const table = node.output.kind === 'table' ? node.output : undefined;

  return (
    <ResultView
      result={result}
      title={<OutputTitle node={node} />}
      columnFigures={table?.figures ?? {}}
      markingOver={markingOver}
      editing={{
        columnField: (name) => (
          <NumberField
            className="column-figures"
            value={table?.figures?.[name] ?? DEFAULT_COLUMN_FIGURES}
            integer
            minimum={0}
            autoSize={1}
            title={`digits after the decimal point for ${name}`}
            onCommit={(figures) => edit((current) => setColumnFigures(current, node.id, name, figures))}
          />
        ),
        onReorderColumn: (source, target, position) =>
          edit((current) => reorderColumn(current, node.id, source, target, position)),
        ...(result.kind === 'plot' && result.measures !== undefined
          ? { plotControls: <IntelligentPlotControls node={node} result={result} /> }
          : {}),
      }}
    />
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
            disabled: document.frames.find((entry) => entry.kind !== 'group')?.id === frame.id,
            onClick: () => edit((current) => moveFrame(current, frame.id, 'up')),
          },
          {
            label: t('Move down'),
            disabled: document.frames.filter((entry) => entry.kind !== 'group').at(-1)?.id === frame.id,
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
    .filter((node): node is OutputNode => node.kind === 'output' && notebookSectionId(document, node) === frameId)
    .slice()
    .sort(readingOrder);
}

function receiversOf(document: GraphDocument, frameId: string | undefined): readonly MonteCarloReceiverNode[] {
  return document.nodes
    .filter((node): node is MonteCarloReceiverNode => node.kind === 'monteCarloReceiver' && notebookSectionId(document, node) === frameId)
    .slice()
    .sort(readingOrder);
}

export function Notebook({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { document, analysis, edit, editLive, commitEdit } = useGraph();
  const { locale } = useSettings();
  const copy = ui(locale);
  const t = (english: string): string => phrase(locale, english);
  const sections = document.frames.filter((frame) => frame.kind !== 'group');
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
      // The prose in here is the NodeBook's own language, which is not
      // necessarily the app UI's (`document.notebookLocale`, chosen in the
      // header's settings popover). Declaring it on the panel is what lets
      // the print stylesheet's `hyphens: auto` hyphenate by the right
      // dictionary — a browser with no language to go on does not hyphenate
      // at all, and justified text in an ~81mm column without hyphenation is
      // exactly where the rivers and gaping word spaces show up.
      lang={document.notebookLocale ?? locale}
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
        <div className="notebook-heading">
          {/* An `<input>` is a single unwrappable line: on screen a long
              title stays reachable by scrolling inside the field, which a
              printed page cannot do — it would simply cut the title off at
              the page edge. Print a plain heading carrying the same text and
              hide the field instead (styles.css, `@media print`); on screen
              it is the other way round. `aria-hidden` because the field
              beside it already exposes this text, labelled and editable. */}
          <h1 className="notebook-title-print" aria-hidden="true">{document.title}</h1>
          <p className="notebook-author-print" aria-hidden="true">{document.author ?? ''}</p>
          <input
            className="notebook-title"
            value={document.title}
            aria-label={t('Notebook title')}
            onChange={(event) => {
              const title = event.target.value;
              editLive((current) => ({ ...current, title }));
            }}
            onBlur={() => commitEdit()}
          />
          <input
            className="notebook-author"
            value={document.author ?? ''}
            placeholder={t('Author')}
            aria-label={t('Author')}
            onChange={(event) => {
              const author = event.target.value;
              editLive((current) => {
                if (author.length > 0) return { ...current, author };
                const { author: _author, ...withoutAuthor } = current;
                return withoutAuthor;
              });
            }}
            onBlur={() => commitEdit()}
          />
        </div>
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

      {sections.map((frame, index) => (
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
            const next = position === 'after' ? sections[index + 1] : undefined;
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

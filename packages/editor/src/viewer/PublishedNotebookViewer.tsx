/**
 * A published NodeBook, drawn by the NodeBook's own components.
 *
 * This page carries no graph, no formula, no catalogue and no editing state:
 * everything on it comes from the compiled report the Hub serves
 * (`schema/compiledNotebook.ts`), decoded in `present/compiled.ts` and drawn
 * by `present/ResultView` — the same component the editor's NodeBook panel
 * draws through. So a plot here is the author's plot, not a second renderer's
 * impression of it, and the typography is the NodeBook's because the markup
 * and the stylesheet are the NodeBook's (ROADMAP item 38).
 *
 * What differs is only what a reader has no business doing: nothing is
 * renamed, no caption is written, no plot is reconfigured, and the marks draw
 * but cannot be changed. The one gesture a reader does get is the slider —
 * and touching it loads the calculation on demand, which is the whole of
 * `interactiveRuntime.ts`.
 */

// The editor's own stylesheet, then what only a standalone page needs. A
// published NodeBook is not styled to resemble the NodeBook panel — it *is*
// the NodeBook panel's markup and rules, down to the print block, which is the
// only way "exact" survives the next change to either. Imported here rather
// than from the entry module so this route's cascade is its own; see the note
// in `main.tsx`.
import '../styles.css';
import '../viewer.css';

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { Axis } from '@joveworks/kernel';
import { parseCompiledNotebook, type CompiledNotebook, type CompiledOutput, type JsonValue } from '@joveworks/schema';

import { TitleText } from '../canvas/TitleField';
import { phrase } from '../i18n';
import {
  compiledDisplay,
  decodeAxisReadouts,
  decodeMarks,
  decodeResult,
  decodeSlider,
} from '../present/compiled';
import { DisplayProvider, type NotebookDisplay } from '../present/display';
import { readOnlyMarking, type FigureMarking } from '../present/marks';
import { ResultView } from '../present/ResultView';
import { SliderControl } from '../present/SliderControl';
import { hubOrigin, navigate, routeHref, type AppRoute } from '../router';
import type { InteractiveNotebook } from './interactiveRuntime';

type ViewerRoute = Exclude<AppRoute, { readonly kind: 'home' }>;
type Activation = 'static' | 'loading' | 'active' | 'failed';

/**
 * One published result. Exported for `PublishedNotebookViewer.test.tsx`,
 * which is the seam that proves a compiled payload reaches the shared
 * renderer — and that a kind it cannot draw degrades to a note rather than a
 * blank.
 */
export function CompiledOutputView({
  output,
  markingOver,
}: {
  readonly output: CompiledOutput;
  readonly markingOver?: (axes: readonly Axis[]) => FigureMarking;
}): ReactElement {
  const result = decodeResult(output.result);
  if (!output.available || result === undefined) {
    return (
      <p className="result pending">
        <span className="label"><TitleText value={output.label} /></span>
        <span className="number">{output.unavailableReason ?? 'This result is not available.'}</span>
      </p>
    );
  }
  return (
    <ResultView
      result={result}
      title={<TitleText value={output.label} />}
      columnFigures={output.columnFigures ?? {}}
      {...(markingOver === undefined ? {} : { markingOver })}
    />
  );
}

export default function PublishedNotebookViewer({ route }: { readonly route: ViewerRoute }): ReactElement {
  const hub = hubOrigin(new URL(window.location.href));
  const [notebook, setNotebook] = useState<CompiledNotebook>();
  const [error, setError] = useState<string>();
  const [activation, setActivation] = useState<Activation>('static');
  const [interactive, setInteractive] = useState<InteractiveNotebook>();
  useEffect(() => {
    const endpoint = `${hub}/api/v1/${route.kind === 'publication' ? 'publications' : 'shares'}/${encodeURIComponent(route.id)}/notebook`;
    void fetch(endpoint).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? 'This compiled NodeBook is not available. It may need to be saved or republished.' : `The NodeBook could not be loaded (${response.status}).`);
      setNotebook(parseCompiledNotebook(await response.json() as JsonValue));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'The NodeBook could not be loaded.'));
  }, [hub, route.id, route.kind]);

  const activate = async (): Promise<void> => {
    if (activation === 'loading' || activation === 'active') return;
    setActivation('loading'); setError(undefined);
    try {
      const runtime = await import('./interactiveRuntime');
      let loaded: InteractiveNotebook;
      try {
        loaded = await runtime.activateNotebook(route.kind, route.id, hub, undefined, notebook);
      } catch (reason) {
        if (!(reason instanceof runtime.CloudAccessRequired)) throw reason;
        const token = window.prompt('Enter the cloud access token');
        if (token === null || token === '') throw new Error('Interactive controls were not activated.');
        loaded = await runtime.activateNotebook(route.kind, route.id, hub, token, notebook);
      }
      setInteractive(loaded); setNotebook(loaded.notebook); setActivation('active');
    } catch (reason) {
      setActivation('failed'); setError(reason instanceof Error ? reason.message : 'Interactive controls could not be activated.');
    }
  };
  const replace = (next: InteractiveNotebook): void => { setInteractive(next); setNotebook(next.notebook); };

  // The marks are part of what was published — a report whose prose argues for
  // candidate B has to arrive with B drawn on it. Nothing here can change
  // them, which is what `readOnlyMarking` says.
  const display: NotebookDisplay | undefined = useMemo(
    () => (notebook === undefined ? undefined : compiledDisplay(notebook)),
    [notebook],
  );
  const markingOver = useMemo(() => {
    if (notebook === undefined) return undefined;
    const marks = decodeMarks(notebook);
    const readouts = decodeAxisReadouts(notebook);
    return (axes: readonly Axis[]): FigureMarking => readOnlyMarking(marks, axes, readouts);
  }, [notebook]);

  if (error !== undefined && notebook === undefined) return <main className="viewer-status"><h1>NodeBook unavailable</h1><p>{error}</p></main>;
  if (notebook === undefined || display === undefined) return <main className="viewer-status">Loading NodeBook…</main>;
  const t = (english: string): string => phrase(display.locale, english);

  return (
    <DisplayProvider value={display}>
      {/* `notebook` is the class every result and figure rule in styles.css is
          scoped to. Sharing it is what makes this the NodeBook's own
          typography rather than a lookalike — including its print rules, so a
          reader's Ctrl-P produces the same PDF the author's export does. */}
      <main className="notebook compiled-page" lang={display.locale}>
        <header className="compiled-header">
          <div>
            <p className="compiled-kicker">JoveWorks · shared NodeBook</p>
            <h1 className="compiled-title">{notebook.title}</h1>
            {notebook.author === undefined ? null : <p className="compiled-author">{notebook.author}</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate(routeHref({ ...route, edit: true }, hub === window.location.origin ? undefined : hub))}
          >
            Open in editor
          </button>
        </header>

        {notebook.sections.map((section) => (
          <section className="notebook-section" key={section.id}>
            <h2>{section.title}</h2>
            {section.prose === undefined ? null : <p className="note">{section.prose}</p>}
            {section.sliders.length === 0 ? null : (
              <div className="notebook-controls">
                {section.sliders.map((slider) => (
                  <SliderControl
                    key={slider.id}
                    slider={decodeSlider(slider)}
                    format={display.format}
                    onInteract={(event) => {
                      if (activation === 'active') return;
                      event.preventDefault();
                      void activate();
                    }}
                    onLiveChange={(value) => { if (interactive !== undefined) replace(interactive.change(slider.id, value)); }}
                    onExactChange={(value) => { if (interactive !== undefined) replace(interactive.change(slider.id, value)); }}
                    onCommit={() => {}}
                  />
                ))}
                {activation === 'loading' ? <p className="viewer-activation">Loading interactive calculation… Use the control again when ready.</p> : null}
                {activation === 'failed' ? <button type="button" onClick={() => void activate()}>Retry interactive controls</button> : null}
                {activation === 'active' ? <button type="button" onClick={() => { if (interactive !== undefined) replace(interactive.reset()); }}>{t('Reset inputs')}</button> : null}
              </div>
            )}
            {section.outputs.map((output) => (
              <div className="entry" key={output.id}>
                <CompiledOutputView output={output} {...(markingOver === undefined ? {} : { markingOver })} />
                {output.caption === undefined ? null : <p className="caption">{output.caption}</p>}
              </div>
            ))}
          </section>
        ))}

        {error === undefined ? null : <p className="viewer-inline-error">{error}</p>}
      </main>
    </DisplayProvider>
  );
}

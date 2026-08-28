import { useEffect, useState, type ReactElement } from 'react';
import { decodeCompiledNumber, parseCompiledNotebook, type CompiledNotebook, type CompiledOutput, type CompiledSlider, type JsonValue } from '@joveworks/schema';

import { hubOrigin, navigate, routeHref, type AppRoute } from '../router';
import type { InteractiveNotebook } from './interactiveRuntime';
import { CompiledPlotFigure } from './CompiledPlotFigure';

type ViewerRoute = Exclude<AppRoute, { readonly kind: 'home' }>;
type Activation = 'static' | 'loading' | 'active' | 'failed';

function object(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === 'object' ? value : undefined;
}

function values(result: Readonly<Record<string, JsonValue>>): readonly JsonValue[] {
  const series = object(result.series);
  return Array.isArray(series?.data) ? series.data : [];
}

function shown(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return '';
}

export function CompiledOutputView({ output }: { readonly output: CompiledOutput }): ReactElement | null {
  if (!output.available || output.result === undefined) return <div className="compiled-output unavailable"><h3>{output.label}</h3><p>{output.unavailableReason ?? 'This result is not available.'}</p></div>;
  const result = output.result;
  const unit = shown(object(result.unit)?.symbol);
  if (output.kind === 'print') return <div className="compiled-output value"><p><strong>{output.label}</strong><span>{values(result).map(shown).join(', ')} <small>{unit}</small></span></p>{output.caption && <p className="caption">{output.caption}</p>}</div>;
  if (output.kind === 'check') return <div className={`compiled-output check ${result.passed === true ? 'pass' : 'fail'}`}><h3>{result.passed === true ? '✓' : '✗'} {output.label}</h3><p>{values(result).map(shown).join(', ')} {unit} {shown(result.comparison)} {shown(result.threshold)}</p></div>;
  if (output.kind === 'table' && Array.isArray(result.columns)) {
    const columns = result.columns.map(object).filter((column): column is Readonly<Record<string, JsonValue>> => column !== undefined);
    const rows = Math.max(0, ...columns.map((column) => values(column).length));
    return <div className="compiled-output"><h3>{output.label}</h3><div className="compiled-table"><table><thead><tr>{columns.map((column, i) => <th key={i}>{shown(column.name)} <small>{shown(object(column.unit)?.symbol)}</small></th>)}</tr></thead><tbody>{Array.from({ length: rows }, (_, row) => <tr key={row}>{columns.map((column, col) => <td key={col}>{shown(values(column)[row])}</td>)}</tr>)}</tbody></table></div></div>;
  }
  if (output.kind === 'plot') return <figure className="compiled-output visual"><figcaption>{output.label}</figcaption><CompiledPlotFigure result={result} label={output.label} />{output.caption && <p className="caption">{output.caption}</p>}</figure>;
  const summary = values(result);
  const details = summary.length > 0 ? `${summary.slice(0, 8).map(shown).join(', ')}${summary.length > 8 ? '…' : ''}` : output.kind;
  return <div className="compiled-output visual"><h3>{output.label}</h3><div className="compiled-visual" role="img" aria-label={`${output.kind} output`}>{details}</div>{output.caption && <p className="caption">{output.caption}</p>}</div>;
}

function Slider({ slider, activation, activate, change }: { readonly slider: CompiledSlider; readonly activation: Activation; readonly activate: () => void; readonly change: (value: number) => void }): ReactElement {
  const value = decodeCompiledNumber(slider.value);
  const min = decodeCompiledNumber(slider.min);
  const max = decodeCompiledNumber(slider.max);
  const begin = (event: React.SyntheticEvent): void => {
    if (activation === 'active') return;
    event.preventDefault();
    activate();
  };
  return <label className="compiled-slider"><span>{slider.label}</span><input aria-label={slider.label} type="range" min={min} max={max} step={(max - min) / 1000 || 1} value={value} onPointerDown={begin} onKeyDown={begin} onChange={(event) => activation === 'active' && change(Number(event.currentTarget.value))} /><output>{Number.isFinite(value) ? value.toFixed(slider.figures) : String(value)} {slider.unit}</output></label>;
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
        loaded = await runtime.activateNotebook(route.kind, route.id, hub);
      } catch (reason) {
        if (!(reason instanceof runtime.CourseAccessRequired)) throw reason;
        const token = window.prompt('Enter the course access token');
        if (token === null || token === '') throw new Error('Interactive controls were not activated.');
        loaded = await runtime.activateNotebook(route.kind, route.id, hub, token);
      }
      setInteractive(loaded); setNotebook(loaded.notebook); setActivation('active');
    } catch (reason) {
      setActivation('failed'); setError(reason instanceof Error ? reason.message : 'Interactive controls could not be activated.');
    }
  };
  const replace = (next: InteractiveNotebook): void => { setInteractive(next); setNotebook(next.notebook); };
  if (error !== undefined && notebook === undefined) return <main className="viewer-status"><h1>NodeBook unavailable</h1><p>{error}</p></main>;
  if (notebook === undefined) return <main className="viewer-status">Loading NodeBook…</main>;
  return <main className="compiled-page"><header className="compiled-header"><div><p>JoveWorks · shared NodeBook</p><h1>{notebook.title}</h1>{notebook.author && <p>By {notebook.author}</p>}</div><button type="button" onClick={() => navigate(routeHref({ ...route, edit: true }, hub === window.location.origin ? undefined : hub))}>Open in editor</button></header>
    {notebook.sections.map((section) => <section key={section.id}><h2>{section.title}</h2>{section.prose && <p className="prose">{section.prose}</p>}{section.sliders.length > 0 && <div className="compiled-controls">{section.sliders.map((slider) => <Slider key={slider.id} slider={slider} activation={activation} activate={() => void activate()} change={(value) => interactive && replace(interactive.change(slider.id, value))} />)}{activation === 'loading' && <p>Loading interactive calculation… Use the control again when ready.</p>}{activation === 'failed' && <button type="button" onClick={() => void activate()}>Retry interactive controls</button>}{activation === 'active' && <button type="button" onClick={() => interactive && replace(interactive.reset())}>Reset</button>}</div>}{section.outputs.map((output) => <CompiledOutputView key={output.id} output={output} />)}</section>)}
    {error && <p className="viewer-inline-error">{error}</p>}
  </main>;
}

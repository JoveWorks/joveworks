/**
 * A deliberately small first NodeBook viewer.
 *
 * It is not an alternate editor: its inputs are bundled example documents,
 * its only state is the chosen cloud example, and it renders finished output
 * rather than formula nodes or wires. That makes it useful as shareable cloud
 * material now without deciding how student work will later be packaged or
 * shared between devices.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { Axis, AxisReadout } from '@joveworks/kernel';
import type { GraphDocument, OutputNode } from '@joveworks/schema';

import { analyse } from '../model/analysis';
import { baseCatalogue, bundledCatalogues } from '../model/catalogues';
import { DEFAULT_NUMBER_FORMAT_SETTINGS, toUnitsFormat } from '../model/numberFormat';
import {
  cantileverHollowSections,
  millingPowerEnvelope,
  padPressure,
  platformFootprint,
  reliabilityLoadStrength,
} from '../model/samples';
import { TitleText } from '../canvas/TitleField';
import { readOnlyMarking, type FigureMarking } from '../present/marks';
import { ResultView } from '../present/ResultView';
import { DisplayProvider } from '../present/display';
import { SettingsContext, type SettingsContextValue } from '../settings-context';
import { analytics, type CloudMaterial } from '../analytics/analytics';
import { exposedSlidersFor, notebookDisplayOf, notebookSectionId, readingOrder, withSliderValue } from '../model/notebook';
import { NotebookSliderControl } from '../notebook/NotebookSliderControl';
import { phrase } from '../i18n';

interface CloudExample {
  readonly id: CloudMaterial;
  readonly title: string;
  readonly summary: string;
  readonly document: GraphDocument;
}

function outputsOf(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes
    .filter((node): node is OutputNode => node.kind === 'output' && notebookSectionId(document, node) === frameId)
    .slice()
    .sort(readingOrder);
}

/**
 * The cloud viewer draws results through the same component the editor's
 * NodeBook does (`present/ResultView`) — this is the whole of what it adds:
 * a read-only title, and marks that draw but cannot be changed.
 *
 * Equation outputs are deliberately absent: a public cloud viewer shows the
 * conclusion and the citation, never a catalogue expression.
 */
function Result({
  result,
  node,
  document,
  readouts,
}: {
  readonly result: import('@joveworks/kernel').OutputResult;
  readonly node: OutputNode;
  readonly document: GraphDocument;
  /** Axis id → coordinates, for resolving the marks this NodeBook was published with. */
  readonly readouts: ReadonlyMap<string, AxisReadout>;
}): ReactElement | null {
  if (result.kind === 'equation') return null;
  // The marks are part of what was published — a report whose prose argues for
  // candidate B has to arrive with B drawn on it. Nothing here can *change*
  // them, which is what `readOnlyMarking` says and the figures never have to
  // ask about.
  const marking = (axes: readonly Axis[]): FigureMarking =>
    readOnlyMarking(document.marks ?? [], axes, readouts);
  const columnFigures = node.output.kind === 'table' ? node.output.figures ?? {} : {};
  return (
    <ResultView
      result={result}
      title={<TitleText value={node.label ?? node.id} />}
      columnFigures={columnFigures}
      markingOver={marking}
    />
  );
}

/** One set of controls per section, above its results — not one per result. */
function ViewerControls({
  document,
  resultNodeIds,
  onChange,
}: {
  readonly document: GraphDocument;
  readonly resultNodeIds: readonly string[];
  readonly onChange: (sliderId: string, value: number) => void;
}): ReactElement | null {
  const controls = exposedSlidersFor(document, resultNodeIds);
  if (controls.length === 0) return null;
  const format = toUnitsFormat(DEFAULT_NUMBER_FORMAT_SETTINGS);
  return (
    <div className="notebook-controls viewer-controls">
      {controls.map((slider) => (
        <NotebookSliderControl
          key={slider.id}
          node={slider}
          format={format}
          onLiveChange={(value) => onChange(slider.id, value)}
          onCommit={() => {}}
          onExactChange={(value) => onChange(slider.id, value)}
        />
      ))}
    </div>
  );
}

function ExampleReport({
  document,
  dirty,
  onSliderChange,
  onReset,
}: {
  readonly document: GraphDocument;
  readonly dirty: boolean;
  readonly onSliderChange: (sliderId: string, value: number) => void;
  readonly onReset: () => void;
}): ReactElement {
  const analysis = useMemo(() => analyse(document, [baseCatalogue(), ...bundledCatalogues()]), [document]);
  const display = useMemo(() => notebookDisplayOf(document, {
    numberFormat: DEFAULT_NUMBER_FORMAT_SETTINGS,
    contourPalette: 'viridis',
    titleMathRendering: true,
    locale: 'en',
  }), [document]);
  const results = new Map((analysis.evaluation?.outputs ?? []).map((result) => [result.nodeId, result] as const));
  const readouts = analysis.evaluation?.axisReadouts ?? new Map<string, AxisReadout>();
  const hasControls = document.nodes.some(
    (node) => node.kind === 'input' && node.value.kind === 'slider' && node.exposeInNotebook === true,
  );

  return (
    // `notebook` is what makes this the NodeBook's own typography rather than
    // a lookalike: every result rule in styles.css is scoped to it, and this
    // viewer draws the same components inside it (ROADMAP item 38).
    <DisplayProvider value={display}>
    <article className="notebook cloud-report">
      <header className="cloud-report-header">
        <p className="cloud-report-kicker">Cloud material · interactive NodeBook</p>
        <div className="cloud-report-title-row">
          <h1>{document.title}</h1>
          {hasControls ? (
            <button type="button" disabled={!dirty} onClick={onReset}>{phrase('en', 'Reset inputs')}</button>
          ) : null}
        </div>
      </header>
      {document.frames.filter((frame) => frame.kind !== 'group').map((frame) => {
        const outputs = outputsOf(document, frame.id);
        if (outputs.length === 0) return null;
        return (
          <section className="cloud-section" key={frame.id}>
            <h2>{frame.title}</h2>
            {frame.note === undefined ? null : <p className="cloud-note">{frame.note}</p>}
            <ViewerControls
              document={document}
              resultNodeIds={outputs.map((node) => node.id)}
              onChange={onSliderChange}
            />
            {outputs.map((node) => {
              const result = results.get(node.id);
              return (
                <div className="cloud-output" key={node.id}>
                  {result === undefined
                    ? <p className="result pending"><span className="number">This result is not available.</span></p>
                    : <Result result={result} node={node} document={document} readouts={readouts} />}
                  {node.caption === undefined ? null : <p className="caption">{node.caption}</p>}
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
    </DisplayProvider>
  );
}

export function CloudMaterialViewer(): ReactElement {
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
    // This viewer never renders the Palette, so the value is inert — kept at
    // the same off-by-default value as the editor for consistency.
    advancedNodesEnabled: false,
    setAdvancedNodesEnabled: () => {},
  };
  const examples = useMemo<readonly CloudExample[]>(() => {
    const catalogues = [baseCatalogue(), ...bundledCatalogues()];
    const candidates = [
      ['platform', 'Choose a safe platform size', 'A decision-focused sweep and threshold.', platformFootprint],
      ['pad', 'Pad pressure sweep', 'See a range propagate to a design limit.', padPressure],
      ['cantilever', 'Cantilever — hollow sections', 'Compare a public mechanics catalogue study.', cantileverHollowSections],
      ['milling', 'Pocket milling — power envelope', 'A multi-output machining study.', millingPowerEnvelope],
      ['reliability', 'Load against strength', 'Pf, interval, beta, distribution, and convergence.', reliabilityLoadStrength],
    ] as const;
    return candidates.flatMap(([id, title, summary, make]) => {
      const document = make(catalogues, 'en');
      return document === undefined ? [] : [{ id, title, summary, document }];
    });
  }, []);
  const [selectedId, setSelectedId] = useState(examples[0]?.id);
  const [editedDocuments, setEditedDocuments] = useState<Partial<Record<CloudMaterial, GraphDocument>>>({});
  const selected = examples.find((example) => example.id === selectedId) ?? examples[0];
  const selectedDocument = selected === undefined ? undefined : editedDocuments[selected.id] ?? selected.document;

  useEffect(() => {
    analytics.track({
      name: 'cloud_viewer_opened',
      props: { viewport: window.matchMedia('(max-width: 899px)').matches ? 'narrow' : 'wide' },
    });
  }, []);

  useEffect(() => {
    if (selected === undefined) return;
    analytics.track({ name: 'cloud_material_selected', props: { material: selected.id } });
  }, [selected]);

  if (selected === undefined) return <main className="cloud-viewer"><p>No cloud material is available.</p></main>;

  return (
    <SettingsContext.Provider value={settings}>
    <main className="cloud-viewer">
      <header className="cloud-viewer-header">
        <a className="cloud-viewer-brand" href="./">JoveWorks</a>
        <a className="cloud-viewer-editor" href="./">Open the desktop editor</a>
      </header>
      <div className="cloud-viewer-intro">
        <p className="cloud-report-kicker">Explore</p>
        <h1>Cloud material, made for reading.</h1>
        <p>These examples are live NodeBook reports: conclusions, checks, and plots without the graph-editing workspace.</p>
      </div>
      <nav className="cloud-example-list" aria-label="Cloud examples">
        {examples.map((example) => (
          <button type="button" key={example.id} className={example.id === selected.id ? 'selected' : ''} onClick={() => setSelectedId(example.id)}>
            <strong>{example.title}</strong><span>{example.summary}</span>
          </button>
        ))}
      </nav>
      <ExampleReport
        document={selectedDocument as GraphDocument}
        dirty={editedDocuments[selected.id] !== undefined}
        onSliderChange={(sliderId, value) => {
          setEditedDocuments((current) => {
            const source = current[selected.id] ?? selected.document;
            return {
              ...current,
              [selected.id]: withSliderValue(source, sliderId, value),
            };
          });
        }}
        onReset={() => setEditedDocuments((current) => {
          const next = { ...current };
          delete next[selected.id];
          return next;
        })}
      />
    </main>
    </SettingsContext.Provider>
  );
}

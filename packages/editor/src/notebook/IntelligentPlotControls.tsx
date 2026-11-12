import type { ReactElement } from 'react';

import type { PlotResult } from '@joveworks/kernel';
import {
  PLOT_TYPES,
  plotMeasures,
  plotThresholdPort,
  type OutputNode,
  type PlotMeasure,
  type PlotScale,
  type PlotType,
  type PlotViewOverride,
  type GraphDocument,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import {
  axisIdSetSignature,
  axisNaturesOf,
  cosmeticOf,
  inferPlotPanels,
  inferPlotView,
  plotWiringSignature,
  structuralViewOf,
  assignRole,
  retype,
  type PlotRole,
} from '../model/plot';
import { removeCandidates, updateNode } from '../model/document';
import { plotMarkGrid } from '../present/IntelligentPlotFigure';
import { drawnMarks, marksOver } from '../present/marks';
import { toUnitsFormat } from '../model/numberFormat';
import { display, formatAuthored, parseAuthored } from '../model/quantity';
import { NumberField, TextField } from '../canvas/fields';

function withoutUndefined<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries) as T;
}

export function IntelligentPlotControls({
  node,
  result,
}: {
  readonly node: OutputNode;
  readonly result: PlotResult;
}): ReactElement | null {
  const { document, edit, analysis } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const evaluated = result.measures ?? [];
  if (node.output.kind !== 'plot' || evaluated.length === 0) return null;
  const output = node.output;
  const natures = axisNaturesOf(document);
  const panels = inferPlotPanels(natures, evaluated);

  const withMeasures = (
    current: GraphDocument,
    ids: ReadonlySet<string>,
    change: (measure: PlotMeasure) => PlotMeasure,
  ): GraphDocument => updateNode<OutputNode>(current, node.id, (entry) => {
    if (entry.output.kind !== 'plot') return entry;
    const measures = plotMeasures(entry.output).map((measure) => (ids.has(measure.id) ? change(measure) : measure));
    return { ...entry, output: { kind: 'plot', measures } };
  });

  const withView = (measure: PlotMeasure, view: PlotViewOverride | undefined): PlotMeasure => {
    const { view: _old, ...rest } = measure;
    return view === undefined || Object.keys(view).length === 0 ? rest : { ...rest, view };
  };

  /** A label or a height: edits the stored view only, so an inference stays in place. */
  const changeCosmetic = (
    ids: ReadonlySet<string>,
    change: (view: PlotViewOverride) => PlotViewOverride | undefined,
  ): void => edit((current) => withMeasures(current, ids, (measure) => withView(measure, change(measure.view ?? {}))));

  /**
   * A type, a role or a scale: the student has now configured this panel, so
   * everything it is drawn with is frozen into each measure's view with the
   * change applied, and any inference is dropped. Each measure keeps its own
   * labels and height.
   */
  const changeStructure = (
    panel: (typeof panels)[number],
    change: (view: PlotViewOverride) => PlotViewOverride,
  ): void => {
    const ids = new Set(panel.measures.map((measure) => measure.id));
    const frozen = change(structuralViewOf(natures, panel));
    edit((current) => withMeasures(current, ids, (measure) => {
      const { inferred: _inferred, ...rest } = measure;
      return withView(rest, { ...frozen, ...cosmeticOf(measure.view) });
    }));
  };

  // "Reset to Auto" puts the plot back as it first drew, and that includes
  // the designs marked by clicking it: the marks this plot draws go in the
  // same edit, so one undo restores both. It infers afresh for every measure
  // sweeping the same axes, not only this panel's: a configured measure left
  // behind in the group would keep its siblings in a panel of their own.
  const resetPanel = (panel: (typeof panels)[number]): void => {
    const lead = panel.measures[0];
    if (lead === undefined) return;
    const axesOf = (measure: typeof lead): string => axisIdSetSignature(measure.axes.map(({ axis }) => axis.id));
    const group = evaluated.filter((measure) => axesOf(measure) === axesOf(lead));
    const inferred = { signature: plotWiringSignature(lead, group), view: inferPlotView(natures, group) };
    const ids = new Set(group.map((measure) => measure.id));
    const readouts = analysis.evaluation?.axisReadouts ?? new Map();
    const shown = drawnMarks(marksOver(document.marks ?? [], plotMarkGrid(result), readouts));
    edit((current) => removeCandidates(
      withMeasures(current, ids, (measure) => {
        const { view: _view, inferred: _inferred, ...rest } = measure;
        return { ...rest, inferred };
      }),
      shown.map((mark) => mark.candidate),
    ));
  };

  const changeMeasure = (id: string, change: (measure: PlotMeasure) => PlotMeasure): void =>
    edit((current) => updateNode<OutputNode>(current, node.id, (entry) => {
      if (entry.output.kind !== 'plot') return entry;
      return {
        ...entry,
        output: {
          kind: 'plot',
          measures: plotMeasures(entry.output).map((measure) => measure.id === id ? change(measure) : measure),
        },
      };
    }));

  return (
    <details className="plot-controls">
      <summary>Plot settings</summary>
      {panels.map((panel) => {
        const ids = new Set(panel.measures.map((measure) => measure.id));
        const lead = panel.measures[0];
        if (lead === undefined) return null;
        // Labels and height as drawn (the result's view is the effective one);
        // the selects below show what the panel is drawn with instead.
        const view = lead.view ?? {};
        const drawn = structuralViewOf(natures, panel);
        const axisOptions = panel.axes.map(({ axis }) => ({ id: axis.id, label: axis.label }));
        const setCosmetic = <K extends 'valueLabel' | 'height',>(key: K, value: PlotViewOverride[K]): void =>
          changeCosmetic(ids, (current) => withoutUndefined({ ...current, [key]: value }));
        const setRole = (key: PlotRole, value: string): void =>
          changeStructure(panel, (current) => assignRole(current, key, value === '' ? undefined : value));
        const setScale = (key: string, scale: PlotScale): void =>
          changeStructure(panel, (current) => ({ ...current, scales: { ...current.scales, [key]: scale } }));
        const axisLabel = (key: string, label: string): void => changeCosmetic(ids, (current) => {
          const labels = { ...current.axisLabels };
          if (label.trim() === '') delete labels[key];
          else labels[key] = label;
          const { axisLabels: _old, ...rest } = current;
          return Object.keys(labels).length === 0 ? withoutUndefined(rest) : { ...rest, axisLabels: labels };
        });
        // Every swept axis has a role, so there is no "none" to pick unless
        // the panel already has an empty one.
        const role = (name: PlotRole, visible: boolean): ReactElement | null =>
          !visible ? null : (
            <label>
              {name}
              <select value={panel.roles[name] ?? ''} onChange={(event) => setRole(name, event.target.value)}>
                {panel.roles[name] === undefined ? <option value="" disabled>none</option> : null}
                {axisOptions.map((axis) => <option key={axis.id} value={axis.id}>{axis.label}</option>)}
              </select>
            </label>
          );
        return (
          <fieldset key={panel.id} className="plot-panel-controls">
            <legend>{panel.measures.map((measure) => measure.label).join(', ')}</legend>
            <p>{panel.reason}</p>
            {panel.error === undefined ? null : <p className="plot-configuration-error">{panel.error}</p>}
            {panel.measures.map((measure) => {
              const configured = plotMeasures(output).find((entry) => entry.id === measure.id);
              const thresholdPort = plotThresholdPort(measure.id);
              const wired = document.edges.some((edge) => edge.to.node === node.id && edge.to.port === thresholdPort);
              const thresholdText = wired
                ? (measure.threshold === undefined ? '' : display(measure.threshold, measure.unit, 4, format))
                : (configured?.threshold === undefined ? '' : formatAuthored(configured.threshold, format));
              return (
                <span className="plot-measure-controls" key={measure.id}>
                  <label>
                    measure
                    <TextField
                      value={configured?.label ?? ''}
                      placeholder={measure.label}
                      onCommit={(label) => changeMeasure(measure.id, (entry) => {
                        const { label: _old, ...rest } = entry;
                        return label.trim() === '' ? rest : { ...rest, label };
                      })}
                    />
                  </label>
                  <label>
                    reference
                    <TextField
                      value={thresholdText}
                      placeholder="none"
                      disabled={wired}
                      {...(wired ? { title: 'Set by the wire — unplug it to type one by hand again.' } : {})}
                      onCommit={(text) => changeMeasure(measure.id, (entry) => {
                        const { threshold: _old, ...rest } = entry;
                        return text.trim() === '' ? rest : { ...rest, threshold: parseAuthored(text, format) };
                      })}
                    />
                  </label>
                </span>
              );
            })}
            <label>
              type
              <select
                value={panel.type}
                onChange={(event) => changeStructure(panel, (current) => retype(current, event.target.value as PlotType))}
              >
                {PLOT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {role('x', panel.axes.length > 0)}
            {role('y', panel.type === 'heatmap' || panel.type === 'contour')}
            {role('series', (panel.type === 'line' || panel.type === 'dot') && panel.axes.length > 1)}
            {role('facet', panel.axes.length > 2)}
            {axisOptions.map((axis) => (
              <span className="plot-axis-controls" key={axis.id}>
                <TextField
                  value={view.axisLabels?.[axis.id] ?? ''}
                  placeholder={`${axis.label} label`}
                  onCommit={(label) => axisLabel(axis.id, label)}
                />
                <select
                  aria-label={`${axis.label} scale`}
                  value={drawn.scales?.[axis.id] ?? 'linear'}
                  onChange={(event) => setScale(axis.id, event.target.value as PlotScale)}
                >
                  <option value="linear">linear</option>
                  <option value="log">log</option>
                </select>
              </span>
            ))}
            <label>
              value label
              <TextField
                value={view.valueLabel ?? ''}
                placeholder="Auto"
                onCommit={(label) => setCosmetic('valueLabel', label.trim() === '' ? undefined : label)}
              />
            </label>
            <label>
              value scale
              <select
                value={panel.valueScale}
                onChange={(event) => changeStructure(panel, (current) => ({ ...current, valueScale: event.target.value as PlotScale }))}
              >
                <option value="linear">linear</option>
                <option value="log">log</option>
              </select>
            </label>
            <label>
              height
              <NumberField
                value={view.height ?? 240}
                integer
                minimum={160}
                onCommit={(height) => {
                  const bounded = Math.min(720, height);
                  setCosmetic('height', bounded === 240 ? undefined : bounded);
                }}
              />
            </label>
            <button type="button" onClick={() => resetPanel(panel)}>Reset to Auto</button>
          </fieldset>
        );
      })}
    </details>
  );
}

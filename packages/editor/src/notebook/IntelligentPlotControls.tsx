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
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { axisNaturesOf, inferPlotPanels } from '../model/plot';
import { updateNode } from '../model/document';
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
  const { document, edit } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const evaluated = result.measures ?? [];
  if (node.output.kind !== 'plot' || evaluated.length === 0) return null;
  const output = node.output;
  const panels = inferPlotPanels(axisNaturesOf(document), evaluated);

  const changePanel = (
    ids: ReadonlySet<string>,
    change: (view: PlotViewOverride) => PlotViewOverride | undefined,
  ): void => edit((current) => updateNode<OutputNode>(current, node.id, (entry) => {
    if (entry.output.kind !== 'plot') return entry;
    const measures = plotMeasures(entry.output).map((measure): PlotMeasure => {
      if (!ids.has(measure.id)) return measure;
      const view = change(measure.view ?? {});
      const { view: _old, ...rest } = measure;
      return view === undefined ? rest : { ...rest, view };
    });
    return { ...entry, output: { kind: 'plot', measures } };
  }));

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
        const view = lead.view ?? {};
        const axisOptions = panel.axes.map(({ axis }) => ({ id: axis.id, label: axis.label }));
        const setField = <K extends keyof PlotViewOverride,>(key: K, value: PlotViewOverride[K]): void =>
          changePanel(ids, (current) => withoutUndefined({ ...current, [key]: value }));
        const setRole = (key: 'x' | 'y' | 'series' | 'facet', value: string): void =>
          setField(key, value === '' ? undefined : value);
        const setScale = (key: string, scale: '' | PlotScale): void => changePanel(ids, (current) => {
          const scales = { ...current.scales };
          if (scale === '') delete scales[key];
          else scales[key] = scale;
          const { scales: _old, ...rest } = current;
          return Object.keys(scales).length === 0 ? withoutUndefined(rest) : { ...rest, scales };
        });
        const axisLabel = (key: string, label: string): void => changePanel(ids, (current) => {
          const labels = { ...current.axisLabels };
          if (label.trim() === '') delete labels[key];
          else labels[key] = label;
          const { axisLabels: _old, ...rest } = current;
          return Object.keys(labels).length === 0 ? withoutUndefined(rest) : { ...rest, axisLabels: labels };
        });
        const role = (name: 'x' | 'y' | 'series' | 'facet', visible: boolean): ReactElement | null =>
          !visible ? null : (
            <label>
              {name}
              <select value={view[name] ?? ''} onChange={(event) => setRole(name, event.target.value)}>
                <option value="">Auto ({panel.roles[name] ?? 'none'})</option>
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
                value={view.type ?? ''}
                onChange={(event) => setField('type', event.target.value === '' ? undefined : event.target.value as PlotType)}
              >
                <option value="">Auto ({panel.type})</option>
                {PLOT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {role('x', panel.axes.length > 0)}
            {role('y', panel.type === 'heatmap' || panel.type === 'contour')}
            {role('series', panel.type === 'line' || panel.type === 'dot')}
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
                  value={view.scales?.[axis.id] ?? ''}
                  onChange={(event) => setScale(axis.id, event.target.value as '' | PlotScale)}
                >
                  <option value="">Auto scale</option>
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
                onCommit={(label) => setField('valueLabel', label.trim() === '' ? undefined : label)}
              />
            </label>
            <label>
              value scale
              <select
                value={view.valueScale ?? ''}
                onChange={(event) => setField('valueScale', event.target.value === '' ? undefined : event.target.value as PlotScale)}
              >
                <option value="">Auto (linear)</option>
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
                  setField('height', bounded === 240 ? undefined : bounded);
                }}
              />
            </label>
            <button type="button" onClick={() => changePanel(ids, () => undefined)}>Reset to Auto</button>
          </fieldset>
        );
      })}
    </details>
  );
}

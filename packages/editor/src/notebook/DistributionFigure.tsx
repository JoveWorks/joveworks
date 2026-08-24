import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import type { DistributionPanel, DistributionResult } from '@joveworks/kernel';
import { fromCanonical } from '@joveworks/units';

interface DistributionPanelFigureProps {
  readonly panel: DistributionPanel;
  readonly result: DistributionResult;
}

function DistributionPanelFigure({ panel, result }: DistributionPanelFigureProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const percentiles = useMemo(
    () => Object.entries(panel.percentiles).map(([percentile, value]) => ({ percentile, value: fromCanonical(value, result.unit) })),
    [panel.percentiles, result.unit],
  );

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    const fit = panel.fit?.points.map((point) => ({
      value: fromCanonical(point.value, result.unit),
      density: point.density,
      probability: point.probability,
    })) ?? [];
    const marks = result.view === 'histogram'
      ? [
          Plot.rectY(panel.bins.map((bin) => ({
            x1: fromCanonical(bin.x1, result.unit),
            x2: fromCanonical(bin.x2, result.unit),
            density: bin.density,
          })), { x1: 'x1', x2: 'x2', y: 'density', fill: 'currentColor', fillOpacity: 0.55, inset: 0.5 }),
          ...(fit.length === 0 ? [] : [Plot.lineY(fit, { x: 'value', y: 'density', stroke: '#c2410c' })]),
        ]
      : [
          Plot.lineY(panel.cdf.map((point) => ({ value: fromCanonical(point.value, result.unit), probability: point.probability })), {
            x: 'value', y: 'probability', curve: 'step-after',
          }),
          ...(fit.length === 0 ? [] : [Plot.lineY(fit, { x: 'value', y: 'probability', stroke: '#c2410c' })]),
        ];
    if (percentiles.length > 0) marks.push(Plot.ruleX(percentiles, { x: 'value', stroke: '#7c3aed', strokeDasharray: '4 3' }));
    const chart = Plot.plot({
      width: 360,
      height: 240,
      marginLeft: 52,
      marginBottom: 40,
      x: { label: result.unit.symbol },
      y: { label: result.view === 'histogram' ? 'density' : 'cumulative probability', grid: true },
      marks,
    });
    element.replaceChildren(chart);
    return () => chart.remove();
  }, [panel, percentiles, result.unit, result.view]);

  return (
    <section className="distribution-panel">
      {result.facet === undefined ? null : <h4>{result.facet.label} {panel.facetIndex}</h4>}
      <div
        ref={host}
        role="img"
        aria-label={result.view === 'histogram' ? 'sample histogram' : 'empirical cumulative distribution'}
      />
      <p>{percentiles.map(({ percentile, value }) => `P${percentile} ${value.toPrecision(4)}`).join(' · ')}</p>
      {panel.fit === undefined ? null : <p>normal fit μ {fromCanonical(panel.fit.mean, result.unit).toPrecision(4)}, s {fromCanonical(panel.fit.stddev, result.unit).toPrecision(4)}</p>}
    </section>
  );
}

export function DistributionFigure({ result }: { readonly result: DistributionResult }): ReactElement {
  return (
    <div className="distribution-figure">
      {result.panels.map((panel, index) => <DistributionPanelFigure key={index} panel={panel} result={result} />)}
    </div>
  );
}

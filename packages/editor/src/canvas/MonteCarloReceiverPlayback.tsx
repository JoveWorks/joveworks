/**
 * The Monte Carlo receiver's playback widget (`ROADMAP.md` #27): a
 * histogram with the running mean labelled above its own line, and
 * transport controls below it — shared verbatim between the receiver's
 * canvas node (`MonteCarloReceiverNodeView.tsx`, wrapped in `NodeShell`
 * chrome, `size="compact"`) and its notebook entry (`Notebook.tsx`, wrapped
 * in the notebook's own result markup, `size="large"`, sized like a plot),
 * so a student sees the same live playback from either place.
 *
 * Playback *position* lives in `GraphContextValue` (`model/monteCarloPlayback.ts`),
 * one level above either view, and both views' widgets drive and read that
 * same position — pressing play on the canvas node advances the notebook
 * entry for the same receiver too, and vice versa, rather than each view
 * quietly keeping its own copy.
 *
 * What *is* local to this component is the resulting sample series itself:
 * each mounted widget re-evaluates the document at the shared `revealed`
 * count on its own. That scratch evaluation runs over the same ready-only
 * subgraph `model/analysis.tsx`'s own evaluation does (`readySubgraph`
 * below), so a broken node elsewhere in the document can't make a tick throw.
 */

import { useMemo, type ReactElement } from 'react';

import { canonicalUnit, evaluateDocument, receiverSampleValue } from '@joveworks/kernel';
import { DIMENSIONLESS } from '@joveworks/units';
import { DEFAULT_MONTE_CARLO_SAMPLE_LIMIT, MONTE_CARLO_SAMPLE_PORT, type GraphDocument } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import type { Analysis } from '../model/analysis';
import { MONTE_CARLO_BATCH_SIZE, isReceiverWired, upstreamGenerators, withGeneratorCounts } from '../model/monteCarlo';
import { display, displayed } from '../model/quantity';
import { toUnitsFormat } from '../model/numberFormat';

type Size = 'compact' | 'large';

const DIMENSIONS: Readonly<Record<Size, { readonly width: number; readonly height: number }>> = {
  compact: { width: 132, height: 40 },
  // Matches `PlotFigure.tsx`'s own default plot size (360×240) closely
  // enough to read as "the same kind of chart" in the notebook, not a
  // shrunk-down copy of the node's inline sparkline-scale widget.
  large: { width: 360, height: 220 },
};

/**
 * The same ready-only subset `model/analysis.tsx`'s own `evaluateDocument`
 * call runs over — reconstructed from `analysis.states` (a node absent from
 * that map, or explicitly `'ok'`, is exactly what that module's internal
 * `ready` set holds) rather than exported, since nothing else needs it.
 */
function readySubgraph(document: GraphDocument, analysis: Analysis): GraphDocument {
  const keep = new Set(
    document.nodes
      .filter((node) => (analysis.states.get(node.id) ?? 'ok') === 'ok')
      .map((node) => node.id),
  );
  return {
    ...document,
    nodes: document.nodes.filter((node) => keep.has(node.id)),
    edges: document.edges.filter((edge) => keep.has(edge.from.node) && keep.has(edge.to.node)),
  };
}

/** Keeps a centred label from clipping past the chart's own edges. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The mean's label is a plain HTML element positioned by percentage, not
 * SVG `<text>` inside the chart's viewBox — the fluid ("large"/notebook)
 * size stretches that viewBox non-uniformly to fill the panel's width
 * (`preserveAspectRatio="none"` below), which is fine for bars and lines
 * but visibly distorts glyphs, since text scales with the same transform.
 * A CSS-positioned label keeps its own font-size in real pixels regardless
 * of how the chart underneath it stretches.
 */
function Histogram({
  values,
  meanLabel,
  mean,
  showHistogram,
  showMeanBand,
  width,
  height,
  fluid,
}: {
  readonly values: readonly number[];
  readonly meanLabel: string | undefined;
  readonly mean: number | undefined;
  readonly showHistogram: boolean;
  readonly showMeanBand: boolean;
  readonly width: number;
  readonly height: number;
  /** Stretches to fill its container's width instead of rendering at a
   * fixed pixel width — `width` still drives the internal geometry (bin
   * count, viewBox), only the rendered size becomes fluid. */
  readonly fluid: boolean;
}): ReactElement | null {
  if (values.length === 0 || (!showHistogram && !showMeanBand)) return null;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const x = (value: number): number => ((value - low) / span) * width;

  // Roughly one bin per 8px, so the compact and large sizes each get a bin
  // count that suits their own width instead of sharing one fixed count.
  const bins = Math.min(60, Math.max(10, Math.round(width / 8)));
  const counts = new Array(bins).fill(0) as number[];
  for (const value of values) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor(((value - low) / span) * bins)));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const maxCount = Math.max(...counts, 1);
  const barWidth = width / bins;

  const showLabel = showMeanBand && mean !== undefined && meanLabel !== undefined;
  // Fixed pixel rows, in real CSS pixels via the wrapper below — not a
  // fraction of `height` or anything inside the (possibly stretched)
  // viewBox — so the label always has exactly enough clearance regardless
  // of chart size.
  const labelHeight = showLabel ? 18 : 0;

  return (
    <div className="mc-histogram-wrap" style={{ paddingTop: labelHeight }}>
      {showLabel ? (
        <span
          className="mc-mean-label"
          style={{ left: `${clamp((x(mean as number) / width) * 100, 12, 88)}%` }}
        >
          {meanLabel}
        </span>
      ) : null}
      <svg
        className="mc-histogram"
        width={fluid ? '100%' : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {showHistogram
          ? counts.map((count, index) => {
              const barHeight = (count / maxCount) * (height - 2);
              return (
                <rect
                  key={index}
                  x={index * barWidth}
                  y={height - barHeight}
                  width={Math.max(barWidth - 1, 0.5)}
                  height={barHeight}
                />
              );
            })
          : null}
        {showMeanBand && mean !== undefined ? (
          <line className="mc-mean-line" x1={x(mean)} x2={x(mean)} y1={0} y2={height} />
        ) : null}
      </svg>
    </div>
  );
}

export function MonteCarloReceiverPlayback({
  receiverId,
  size = 'compact',
}: {
  readonly receiverId: string;
  readonly size?: Size;
}): ReactElement | null {
  const {
    document,
    catalogues,
    analysis,
    monteCarloPlayback,
    toggleMonteCarloPlayback,
    stepMonteCarloPlayback,
    resetMonteCarloPlayback,
  } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);

  const node = document.nodes.find((candidate) => candidate.id === receiverId);
  const receiver = node?.kind === 'monteCarloReceiver' ? node : undefined;

  const wired = receiver !== undefined && isReceiverWired(document, receiver);
  const ready = (analysis.states.get(receiverId) ?? 'ok') === 'ok';
  const generatorIds = useMemo(() => upstreamGenerators(document, receiverId), [document, receiverId]);
  const sampleLimit = receiver?.sampleLimit ?? DEFAULT_MONTE_CARLO_SAMPLE_LIMIT;
  const showMeanBand = receiver?.showMeanBand ?? true;
  const showHistogram = receiver?.showHistogram ?? true;
  const state = monteCarloPlayback.get(receiverId);
  const revealed = Math.min(state?.revealed ?? MONTE_CARLO_BATCH_SIZE, sampleLimit);
  const playing = state?.playing ?? false;

  const sample = useMemo(() => {
    if (receiver === undefined || !ready || !wired || generatorIds.length === 0) return undefined;
    try {
      const scratch = withGeneratorCounts(readySubgraph(document, analysis), generatorIds, revealed);
      const evaluation = evaluateDocument(scratch, catalogues);
      const value = receiverSampleValue(receiver, evaluation.resolution, evaluation.values);
      return value?.kind === 'numeric' ? value : undefined;
    } catch {
      return undefined;
    }
  }, [receiver, ready, wired, generatorIds, document, analysis, revealed, catalogues]);

  const targetType = analysis.resolution?.targets.get(`${receiverId}.${MONTE_CARLO_SAMPLE_PORT}`);
  const unit = targetType?.unit ?? canonicalUnit(targetType?.dimension ?? DIMENSIONLESS);
  const values = sample === undefined ? [] : displayed(sample.data, unit);
  const meanCanonical =
    sample === undefined || sample.data.length === 0
      ? undefined
      : sample.data.reduce((sum, value) => sum + value, 0) / sample.data.length;
  const mean = values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanLabel = meanCanonical === undefined ? undefined : display(meanCanonical, unit, 4, format);

  const canPlay = ready && wired && revealed < sampleLimit;
  const { width, height } = DIMENSIONS[size];

  if (receiver === undefined) return null;

  return (
    <>
      {values.length === 0 ? (
        <div className="mc-reading-row">
          <span className="mc-reading">—</span>
        </div>
      ) : (
        <Histogram
          values={values}
          meanLabel={meanLabel}
          mean={mean}
          showHistogram={showHistogram}
          showMeanBand={showMeanBand}
          width={width}
          height={height}
          fluid={size === 'large'}
        />
      )}

      <div className="mc-transport nodrag">
        <button
          type="button"
          disabled={!canPlay && !playing}
          onClick={() => toggleMonteCarloPlayback(receiverId)}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" disabled={!canPlay} onClick={() => stepMonteCarloPlayback(receiverId)}>
          ⏭
        </button>
        <button type="button" onClick={() => resetMonteCarloPlayback(receiverId)}>
          ↺
        </button>
        <span className="mc-progress">
          {values.length} / {sampleLimit}
        </span>
      </div>
    </>
  );
}

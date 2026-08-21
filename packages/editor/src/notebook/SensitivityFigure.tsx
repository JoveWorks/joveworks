/**
 * Sensitivity: a tornado diagram — every candidate input, ranked by how much
 * the target output moves across its own bracket, values converted out of
 * canonical for display.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import type { SensitivityResult } from '@joveworks/kernel';
import { fromCanonical } from '@joveworks/units';

interface Row {
  readonly label: string;
  readonly low: number;
  readonly high: number;
}

function rows(result: SensitivityResult): readonly Row[] {
  return result.rankings.map((ranking: SensitivityResult['rankings'][number]) => {
    const low = fromCanonical(ranking.lowValue, result.targetUnit);
    const high = fromCanonical(ranking.highValue, result.targetUnit);
    return { label: ranking.label, low: Math.min(low, high), high: Math.max(low, high) };
  });
}

interface Props {
  readonly result: SensitivityResult;
}

export function SensitivityFigure({ result }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result);
    if (data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'no candidate inputs to rank';
      container.append(empty);
      return () => empty.remove();
    }

    const yLabel = result.targetUnit.symbol.trim().length === 0 ? '' : `(${result.targetUnit.symbol})`;
    const chart = Plot.plot({
      width: 420,
      height: Math.max(60, 28 * data.length + 40),
      marginLeft: 140,
      marginBottom: 40,
      x: { label: yLabel, grid: true },
      y: { label: null, domain: data.map((row) => row.label) },
      marks: [
        Plot.barX(data as Row[], { y: 'label', x1: 'low', x2: 'high', fill: '#4269d0' }),
        Plot.ruleX([0]),
      ],
    });

    container.append(chart);
    return () => chart.remove();
  }, [result]);

  return <div className="figure" ref={host} />;
}

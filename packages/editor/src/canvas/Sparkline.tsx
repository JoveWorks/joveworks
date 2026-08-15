/**
 * A swept value, where a scalar shows a number (S50).
 *
 * The point of drawing it on the *node* rather than only in a plot is to make a
 * sweep visible propagating: you set one input to a range and every node
 * downstream of it grows a line, which is S43 made visible. It is not a chart —
 * no axes, no ticks, no interaction. The plot node is the chart.
 *
 * A grid over more than one axis is drawn as one line per row rather than one
 * flattened line — data is row-major with the last axis contiguous (series.ts),
 * so a "row" fixes every axis but the last and sweeps that one. Flattening
 * every row into a single path reads as a sawtooth of noise; a family of
 * curves, all sharing this small svg's x/y scale, reads as what it actually
 * is — the same shape repeated at each value of the outer axis (or axes).
 * Reading the surface itself is still what the contour plot is for.
 */

import type { ReactElement } from 'react';

import { fromCanonical } from '@mds/units';

import type { Reading } from '../model/values';

const WIDTH = 132;
const HEIGHT = 26;

/**
 * `values` split at the last axis — row-major with the last axis contiguous
 * (series.ts), so each row fixes every other axis and sweeps that one. A
 * zero-axis (scalar) or single-axis series is one row, unchanged.
 */
export function sparkRows(values: readonly number[], innerLength: number): readonly (readonly number[])[] {
  const rowCount = Math.round(values.length / innerLength);
  return Array.from({ length: rowCount }, (_unused, row) =>
    values.slice(row * innerLength, (row + 1) * innerLength),
  );
}

export function Sparkline({ reading }: { readonly reading: Reading }): ReactElement | null {
  if (reading.series.kind !== 'numeric' || reading.series.data.length < 2) return null;

  const { axes, data } = reading.series;
  const values = data.map((value) => fromCanonical(value, reading.unit));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  const innerLength = axes.length === 0 ? values.length : (axes.at(-1)?.length as number);
  const rows = sparkRows(values, innerLength);
  const rowCount = rows.length;

  const x = (i: number): number => (i / Math.max(innerLength - 1, 1)) * (WIDTH - 2) + 1;
  // A flat series would divide by zero; it draws down the middle instead.
  const y = (value: number): number =>
    span === 0 ? HEIGHT / 2 : HEIGHT - 3 - ((value - low) / span) * (HEIGHT - 6);

  const paths = rows.map((rowValues) =>
    rowValues.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(value)}`).join(' '),
  );

  return (
    <svg className="sparkline" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {paths.map((path, row) => (
        <path
          key={row}
          d={path}
          fill="none"
          strokeWidth={1.5}
          {...(rowCount > 1 ? { opacity: 0.4 } : {})}
        />
      ))}
    </svg>
  );
}

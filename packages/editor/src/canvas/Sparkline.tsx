/**
 * A swept value, where a scalar shows a number (S50).
 *
 * The point of drawing it on the *node* rather than only in a plot is to make a
 * sweep visible propagating: you set one input to a range and every node
 * downstream of it grows a line, which is S43 made visible. It is not a chart —
 * no axes, no ticks, no interaction. The plot node is the chart.
 *
 * A grid over two axes is drawn as its data in row-major order, which reads as
 * the curve repeating once per row. That is honest about the shape of the value,
 * and reading a surface is what the contour plot is for.
 */

import type { ReactElement } from 'react';

import { fromCanonical } from '@mds/units';

import type { Reading } from '../model/values';

const WIDTH = 132;
const HEIGHT = 26;

export function Sparkline({ reading }: { readonly reading: Reading }): ReactElement | null {
  if (reading.series.kind !== 'numeric' || reading.series.data.length < 2) return null;

  const values = reading.series.data.map((value) => fromCanonical(value, reading.unit));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const x = (i: number): number => (i / (values.length - 1)) * (WIDTH - 2) + 1;
  // A flat series would divide by zero; it draws down the middle instead.
  const y = (value: number): number =>
    span === 0 ? HEIGHT / 2 : HEIGHT - 3 - ((value - low) / span) * (HEIGHT - 6);

  const path = values.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(value)}`).join(' ');

  return (
    <svg className="sparkline" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <path d={path} fill="none" strokeWidth={1.5} />
    </svg>
  );
}

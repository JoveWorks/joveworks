/**
 * Array nodes: reductions over every value wired into a port — a total, a
 * count, a spread — rather than a per-cell arithmetic operation. `sum` and
 * `product` were the first two (ROADMAP.md item 26); `count`, `mean`,
 * `median`, `standardDeviation` and `valueAt` are the rest of that item,
 * added as a catalogue of their own rather than folded into `operations.ts`'s
 * arithmetic — "reduce a whole set of wires" is a different shape of node
 * than ordinary arithmetic, even though both are equally citation-free, so
 * it earns its own palette section the way `operations.ts`'s own docstring
 * predicted it would need to.
 *
 * `minimum`/`maximum` stay in `operations.ts`: they also take a variadic
 * port, but read as arithmetic — comparing an open set of same-dimension
 * values — rather than as a property of the wired-in set itself.
 *
 * Every reduction here is dimension-preserving except `count`, which is
 * always dimensionless, and `product`, whose values are dimensionless going
 * in for the reason its own description states.
 */

import type { Formula } from '@joveworks/schema';
import { buildFormulas, generic, genericVariadic, plain, plainVariadic, type Draft } from './draft.js';

const DRAFTS: readonly Draft[] = [
  {
    id: 'sum',
    description: 'Total of every value wired in, not a swept range.',
    expression: 'sum(xs)',
    output: generic('total', 'A', 'Σ xᵢ'),
    inputs: [genericVariadic('xs', 'A', 'Values to total')],
  },
  {
    id: 'product',
    description:
      'Product of every value wired in. Dimensionless only: the dimension of a product of n terms ' +
      'depends on n, which is a value rather than a type.',
    expression: 'prod(xs)',
    output: plain('total', '', 'Π xᵢ'),
    inputs: [plainVariadic('xs', '', 'Values to multiply')],
  },
  {
    id: 'count',
    description: 'How many values are wired in. Dimensionless, whatever they hold.',
    expression: 'count(xs)',
    output: plain('n', '', '|xs|'),
    inputs: [genericVariadic('xs', 'A', 'Values to count')],
  },
  {
    id: 'mean',
    description: 'Average of every value wired in, not a swept range.',
    expression: 'mean(xs)',
    output: generic('average', 'A', 'x̄'),
    inputs: [genericVariadic('xs', 'A', 'Values to average')],
  },
  {
    id: 'median',
    description:
      'Middle value of the wired-in values once sorted — the mean of the two middle values when ' +
      'there is an even number of them.',
    expression: 'median(xs)',
    output: generic('median', 'A', 'x̃'),
    inputs: [genericVariadic('xs', 'A', 'Values to find the median of')],
  },
  {
    id: 'standardDeviation',
    description:
      'Sample standard deviation of the wired-in values (n − 1 in the denominator — the usual ' +
      'estimator when they are a sample of measurements, as a tolerance is built from).',
    expression: 'sdev(xs)',
    output: generic('deviation', 'A', 's'),
    inputs: [genericVariadic('xs', 'A', 'Values to find the spread of')],
  },
  {
    id: 'valueAt',
    description: 'The value at a given position among the wired-in values. 0 is the first one.',
    expression: 'at(xs, i)',
    output: generic('value', 'A', 'xsᵢ'),
    inputs: [genericVariadic('xs', 'A', 'Values to index into'), plain('i', '', 'Position, counting from 0')],
  },
];

const DUTCH_LABELS: Readonly<Record<string, string>> = {
  sum: 'Som', product: 'Product', count: 'Aantal', mean: 'Gemiddelde', median: 'Mediaan',
  standardDeviation: 'Standaardafwijking', valueAt: 'Waarde op positie',
};

export const ARRAY_OPERATIONS: readonly Formula[] = buildFormulas(DRAFTS, DUTCH_LABELS);

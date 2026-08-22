/**
 * Array nodes: reductions over a whole series — a load spectrum, consumed at
 * once rather than swept. `sum` and `product` were the first two
 * (ROADMAP.md item 26); `count`, `mean`, `median`, `standardDeviation` and
 * `valueAt` are the rest of that item, added as a catalogue of their own
 * rather than folded into `operations.ts`'s arithmetic — "operate over a
 * whole series" is a different shape of node than ordinary arithmetic, even
 * though both are equally citation-free, so it earns its own palette section
 * the way `operations.ts`'s own docstring predicted it would need to.
 *
 * `minimum`/`maximum` stay in `operations.ts`: they also take a spectrum
 * port, but read as arithmetic — comparing an open set of same-dimension
 * values — rather than as a property of the series itself.
 *
 * Every reduction here is dimension-preserving except `count`, which is
 * always dimensionless, and `product`, whose spectrum is dimensionless going
 * in for the reason its own description states.
 */

import type { Formula } from '@joveworks/schema';
import { buildFormulas, generic, genericSpectrum, plain, plainSpectrum, type Draft } from './draft.js';

const DRAFTS: readonly Draft[] = [
  {
    id: 'sum',
    description: 'Total of a whole series — a load spectrum consumed at once, not a swept range.',
    expression: 'sum(xs)',
    output: generic('total', 'A', 'Σ xᵢ'),
    inputs: [genericSpectrum('xs', 'A', 'Series to total')],
  },
  {
    id: 'product',
    description:
      'Product of a whole series. Dimensionless only: the dimension of a product of n terms ' +
      'depends on n, which is a value rather than a type.',
    expression: 'prod(xs)',
    output: plain('total', '', 'Π xᵢ'),
    inputs: [plainSpectrum('xs', '', 'Series to multiply')],
  },
  {
    id: 'count',
    description: 'How many values a whole series holds. Dimensionless, whatever the series holds.',
    expression: 'count(xs)',
    output: plain('n', '', '|xs|'),
    inputs: [genericSpectrum('xs', 'A', 'Series to count')],
  },
  {
    id: 'mean',
    description: 'Average of a whole series — a load spectrum consumed at once, not a swept range.',
    expression: 'mean(xs)',
    output: generic('average', 'A', 'x̄'),
    inputs: [genericSpectrum('xs', 'A', 'Series to average')],
  },
  {
    id: 'median',
    description:
      'Middle value of a whole series once sorted — the mean of the two middle values when ' +
      'the series has an even length.',
    expression: 'median(xs)',
    output: generic('median', 'A', 'x̃'),
    inputs: [genericSpectrum('xs', 'A', 'Series to find the median of')],
  },
  {
    id: 'standardDeviation',
    description:
      'Sample standard deviation of a whole series (n − 1 in the denominator — the usual ' +
      'estimator when the series is a sample of measurements, as a tolerance is built from).',
    expression: 'sdev(xs)',
    output: generic('deviation', 'A', 's'),
    inputs: [genericSpectrum('xs', 'A', 'Series to find the spread of')],
  },
  {
    id: 'valueAt',
    description: 'The value at a given position in a whole series. 1 is the first value.',
    expression: 'at(xs, i)',
    output: generic('value', 'A', 'xsᵢ'),
    inputs: [genericSpectrum('xs', 'A', 'Series to index into'), plain('i', '', 'Position, counting from 1')],
  },
];

const DUTCH_LABELS: Readonly<Record<string, string>> = {
  sum: 'Som', product: 'Product', count: 'Aantal', mean: 'Gemiddelde', median: 'Mediaan',
  standardDeviation: 'Standaardafwijking', valueAt: 'Waarde op positie',
};

export const ARRAY_OPERATIONS: readonly Formula[] = buildFormulas(DRAFTS, DUTCH_LABELS);

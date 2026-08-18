import { describe, expect, it } from 'vitest';

import { monteCarloSamples } from './random.js';

describe('Monte Carlo sampling', () => {
  it('reproduces the same prefix when count grows — playback only ever appends', () => {
    const draw = { distribution: 'uniform', min: 0, max: 1 } as const;
    const short = monteCarloSamples('doc-1', 'draw', draw, 10);
    const long = monteCarloSamples('doc-1', 'draw', draw, 25);
    expect(long.slice(0, 10)).toEqual(short);
  });

  it('does the same for a normal distribution, across an odd/even count boundary', () => {
    const draw = { distribution: 'normal', mean: 0, stddev: 1 } as const;
    const odd = monteCarloSamples('doc-1', 'draw', draw, 7);
    const even = monteCarloSamples('doc-1', 'draw', draw, 8);
    expect(even.slice(0, 7)).toEqual(odd);
  });

  it('is deterministic given the same document and node id', () => {
    const draw = { distribution: 'uniform', min: 0, max: 1 } as const;
    expect(monteCarloSamples('doc-1', 'draw', draw, 25)).toEqual(
      monteCarloSamples('doc-1', 'draw', draw, 25),
    );
  });

  it('gives two generators in the same document independent streams', () => {
    const draw = { distribution: 'uniform', min: 0, max: 1 } as const;
    const a = monteCarloSamples('doc-1', 'draw-a', draw, 25);
    const b = monteCarloSamples('doc-1', 'draw-b', draw, 25);
    expect(a).not.toEqual(b);
  });

  it('gives the same generator id in two different documents independent streams', () => {
    const draw = { distribution: 'uniform', min: 0, max: 1 } as const;
    const a = monteCarloSamples('doc-1', 'draw', draw, 25);
    const b = monteCarloSamples('doc-2', 'draw', draw, 25);
    expect(a).not.toEqual(b);
  });

  it('draws a uniform sample within its bounds', () => {
    const samples = monteCarloSamples('doc-1', 'draw', { distribution: 'uniform', min: 10, max: 20 }, 500);
    expect(samples.every((value) => value >= 10 && value <= 20)).toBe(true);
  });

  it('draws a normal distribution with roughly the right mean and spread', () => {
    const samples = monteCarloSamples(
      'doc-1',
      'draw',
      { distribution: 'normal', mean: 100, stddev: 5 },
      2000,
    );
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance =
      samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
    expect(mean).toBeGreaterThan(95);
    expect(mean).toBeLessThan(105);
    expect(Math.sqrt(variance)).toBeGreaterThan(3);
    expect(Math.sqrt(variance)).toBeLessThan(7);
  });
});

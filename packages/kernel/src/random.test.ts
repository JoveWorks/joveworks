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

  for (const draw of [
    { distribution: 'triangular', min: 0, mode: 4, max: 10 } as const,
    { distribution: 'lognormal', mean: 10, stddev: 2 } as const,
    { distribution: 'discrete', values: [1, 2, 5], weights: [1, 2, 1] } as const,
  ]) {
    it(`keeps sample i stable for ${draw.distribution}`, () => {
      expect(monteCarloSamples('doc-1', 'draw', draw, 30).slice(0, 11)).toEqual(
        monteCarloSamples('doc-1', 'draw', draw, 11),
      );
    });
  }

  it('draws triangular moments within sampling tolerance', () => {
    const samples = monteCarloSamples('doc-1', 'triangle', { distribution: 'triangular', min: 0, mode: 4, max: 10 }, 20_000);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(mean).toBeCloseTo(14 / 3, 1);
  });

  it('parameterises lognormal by the variable mean and standard deviation', () => {
    const samples = monteCarloSamples('doc-1', 'lognormal', { distribution: 'lognormal', mean: 10, stddev: 2 }, 20_000);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const spread = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
    expect(mean).toBeCloseTo(10, 1);
    expect(spread).toBeCloseTo(2, 1);
  });

  it('draws a weighted discrete distribution', () => {
    const samples = monteCarloSamples('doc-1', 'discrete', { distribution: 'discrete', values: [0, 10], weights: [3, 1] }, 20_000);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(mean).toBeCloseTo(2.5, 1);
  });
});

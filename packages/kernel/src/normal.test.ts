import { describe, expect, it } from 'vitest';
import { inverseNormal } from './normal.js';

describe('inverse normal', () => {
  it('matches known quantiles', () => {
    expect(inverseNormal(0.95)).toBeCloseTo(1.6448536269514722, 8);
    expect(inverseNormal(0.99)).toBeCloseTo(2.3263478740408408, 8);
  });
  it('is symmetric about one half', () => {
    expect(inverseNormal(0.1)).toBeCloseTo(-inverseNormal(0.9), 12);
  });
});

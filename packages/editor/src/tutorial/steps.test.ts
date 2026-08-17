import { describe, expect, it } from 'vitest';

import { EXAMPLE_IDS } from '../exampleUrl';
import { exampleTutorialSteps, TUTORIAL_STEPS } from './steps';

describe('example tutorials', () => {
  it.each(EXAMPLE_IDS)('gives %s a longer tutorial with a notebook explanation', (id) => {
    const steps = exampleTutorialSteps(id);

    expect(steps.length).toBeGreaterThan(TUTORIAL_STEPS.length);
    expect(steps.some((step) => step.target === '[data-tour="notebook"]')).toBe(true);
    expect(steps.some((step) => step.body.toLowerCase().includes('notebook'))).toBe(true);
  });
});

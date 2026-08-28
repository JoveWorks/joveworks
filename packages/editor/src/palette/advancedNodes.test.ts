import { describe, expect, it } from 'vitest';

import { ADVANCED_ACTION_IDS, filterAdvancedActions, isAdvancedAction, isAdvancedFormula } from './advancedNodes';

describe('advanced-nodes gating', () => {
  it('gates exactly the beta-hidden built-in actions and selection nodes', () => {
    expect([...ADVANCED_ACTION_IDS].sort()).toEqual(
      [
        'builtin:input:file',
        'builtin:general:pack',
        'builtin:general:unpack',
        'builtin:general:waypoint',
        'builtin:output:pareto',
        'builtin:output:stress',
        'builtin:output:bestDesign',
        'builtin:output:sensitivity',
        'builtin:select:firstPassing',
        'builtin:select:argMin',
        'builtin:select:argMax',
      ].sort(),
    );
  });

  it('leaves feasibility and threshold-crossing alone — the course keeps needing both', () => {
    expect(isAdvancedAction('builtin:output:feasibility')).toBe(false);
    expect(isAdvancedAction('builtin:select:crossing')).toBe(false);
  });

  it('does not (yet) gate any catalogue formula — the mechanics nodes are an open decision', () => {
    expect(isAdvancedFormula('mechanics.shaft.torque')).toBe(false);
    expect(isAdvancedFormula('mechanics.shaft.shear')).toBe(false);
  });

  describe('filterAdvancedActions', () => {
    const actions = [
      { id: 'builtin:output:feasibility' },
      { id: 'builtin:select:crossing' },
      { id: 'builtin:output:pareto' },
      { id: 'builtin:select:argMin' },
    ];

    it('drops gated entries when off, keeping the ones that must stay visible', () => {
      const visible = filterAdvancedActions(actions, false);
      expect(visible.map((a) => a.id)).toEqual(['builtin:output:feasibility', 'builtin:select:crossing']);
    });

    it('restores gated entries when the preference is on', () => {
      const visible = filterAdvancedActions(actions, true);
      expect(visible).toEqual(actions);
    });
  });
});

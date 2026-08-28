/**
 * Which palette entries the "advanced nodes" preference hides (see
 * `model/editorSettings.ts`'s `loadAdvancedNodes`/`saveAdvancedNodes`). This
 * only controls what the palette *offers* — evaluation, rendering, and the
 * document schema never consult this list, so a NodeBook that already uses a
 * gated node keeps working with the setting off, per beta requirement #1.
 *
 * Two id spaces are gated:
 *  - `PaletteAction` ids (`builtin:...`), matched exactly.
 *  - Catalogue formula ids (`ADVANCED_FORMULA_IDS`), matched by `Formula.id`.
 *    Empty today — the mechanics nodes (mechanics.shaft.torque,
 *    mechanics.shaft.shear, mechanics.shaft.moment,
 *    mechanics.shaft.deflection, the distributed-load formulas in
 *    packages/nodes/src/mechanicsNodes.ts) are an open product decision for
 *    beta (see task notes). Gating them later is exactly one line: add their
 *    formula ids to this set.
 */

/** The whole stochastic-analysis section (Monte Carlo generator/receiver,
 * distribution, reliability, and every `STATISTICS` entry) is gated as a
 * unit in Palette.tsx rather than listed here id-by-id — see `Palette.tsx`'s
 * `stochasticActions`. */
export const ADVANCED_ACTION_IDS: ReadonlySet<string> = new Set([
  // Built-in actions.
  'builtin:input:file',
  'builtin:general:pack',
  'builtin:general:unpack',
  'builtin:general:waypoint',
  // Analysis outputs. `feasibility` stays visible — it is the multi-check
  // counterpart of Check and is what "dimensioning" means in this course.
  'builtin:output:pareto',
  'builtin:output:stress',
  'builtin:output:bestDesign',
  'builtin:output:sensitivity',
  // Selection nodes. `crossing` stays visible — "at what diameter does the
  // safety factor cross 1.5" is the course's central question.
  'builtin:select:firstPassing',
  'builtin:select:argMin',
  'builtin:select:argMax',
]);

// See the module docstring: add mechanics formula ids here (e.g.
// 'mechanics.shaft.torque', 'mechanics.shaft.shear', 'mechanics.shaft.moment', 'mechanics.shaft.deflection', ...) to gate
// them behind the same preference. Left empty — shipping them in beta is an
// open product decision, not part of this change.
export const ADVANCED_FORMULA_IDS: ReadonlySet<string> = new Set([]);

export function isAdvancedAction(id: string): boolean {
  return ADVANCED_ACTION_IDS.has(id);
}

export function isAdvancedFormula(formulaId: string): boolean {
  return ADVANCED_FORMULA_IDS.has(formulaId);
}

/**
 * Drops gated entries from an action list when the preference is off, in
 * place — everything not in `ADVANCED_ACTION_IDS` (e.g. `feasibility`,
 * `crossing`) always passes through untouched. Shared by the General/Input/
 * Output actions and by the Analysis section in `Palette.tsx`, and reused to
 * build `favouriteActions` there so a favourited-but-gated entry drops out of
 * Favourites too without touching the stored favourite.
 */
export function filterAdvancedActions<T extends { readonly id: string }>(
  actions: readonly T[],
  advancedNodesEnabled: boolean,
): readonly T[] {
  return advancedNodesEnabled ? actions : actions.filter((action) => !isAdvancedAction(action.id));
}

import { parseUnit } from '@joveworks/units';
import {
  ALONG_PORT,
  AT_PORT,
  CLOSURE_RESULT_PORT,
  formulaRef,
  MONTE_CARLO_SAMPLE_PORT,
  OBJECTIVE_PORT,
  X_PORT,
  START_PORT,
  STOP_PORT,
  COUNT_PORT,
  STATISTIC_RESULT_PORT,
  VALUE_PORT,
  VERDICT_PORT,
  type Formula,
  type GraphDocument,
  type GraphNode,
  type Position,
  type SelectMode,
} from '@joveworks/schema';

import { defaultOutput, NEW_COLUMN } from '../model/document';
import { monteCarloSampleCount, monteCarloSampleLimit } from '../model/monteCarlo';

export type QuickAddChoice =
  | { readonly kind: 'formula'; readonly formula: Formula; readonly port: string }
  | { readonly kind: 'input' }
  | { readonly kind: 'range' }
  | {
      readonly kind: 'output';
      readonly outputKind:
        | 'print'
        | 'check'
        | 'plot'
        | 'table'
        | 'sensitivity'
        | 'bestDesign'
        | 'pareto'
        | 'distribution';
    }
  | { readonly kind: 'compare' }
  | { readonly kind: 'select'; readonly mode: SelectMode }
  | { readonly kind: 'statistic' }
  | { readonly kind: 'closure' }
  | { readonly kind: 'waypoint' }
  | { readonly kind: 'pack' }
  | { readonly kind: 'unpack' }
  | { readonly kind: 'monteCarloGenerator' }
  | { readonly kind: 'monteCarloReceiver' }
  | { readonly kind: 'existing'; readonly nodeId: string; readonly port: string };

export type QuickAddCandidate =
  | { readonly kind: 'formula'; readonly formula: Formula }
  | Exclude<QuickAddChoice, { readonly kind: 'formula' | 'existing' }>;

export type QuickAddDragType = 'source' | 'target';

interface QuickAddNodeSpec {
  readonly idPrefix: string;
  readonly ports: Readonly<Record<QuickAddDragType, readonly string[]>>;
  make(id: string, position: Position, label?: string): GraphNode;
}

/** `exactOptionalPropertyTypes` wants `label` absent rather than explicitly undefined. */
function labelField(label: string | undefined): { readonly label?: string } {
  return label === undefined ? {} : { label };
}

/**
 * The one registry for a fresh Quick Add node's id, default document shape,
 * and the ports it presents to either direction of a dragged wire.
 *
 * `dragType: 'source'` means the existing dragged endpoint is a source, so
 * the fresh node must offer target ports; `target` means the reverse. Keeping
 * that slightly counter-intuitive mapping here prevents the compatibility
 * preview and the actual placement path from growing separate switches.
 */
export function quickAddNodeSpec(document: GraphDocument, choice: QuickAddCandidate): QuickAddNodeSpec {
  switch (choice.kind) {
    case 'formula':
      return {
        idPrefix: choice.formula.id.replace(/[^\w.]/gu, '_'),
        ports: {
          source: choice.formula.inputs.map((port) => port.name),
          target: choice.formula.outputs.map((port) => port.name),
        },
        make: (id, position, label) => ({
          kind: 'formula',
          id,
          formula: formulaRef(choice.formula),
          position,
          ...labelField(label),
        }),
      };
    case 'input':
      return {
        idPrefix: 'input',
        ports: { source: [], target: [VALUE_PORT] },
        make: (id, position, label) => ({
          kind: 'input',
          id,
          value: { kind: 'scalar', value: 1, unit: parseUnit('') },
          position,
          ...labelField(label),
        }),
      };
    case 'range':
      return {
        idPrefix: 'range',
        // A range's own `VALUE_PORT` output is what a dragged *target*
        // completes onto (the reverse mapping every spec here uses); a
        // dragged *source* lands on whichever of its three input ports —
        // `start`, `stop`, `count` — the kernel's own compatibility check
        // in `compatibleQuickAddPort` picks as connectable.
        ports: { source: [START_PORT, STOP_PORT, COUNT_PORT], target: [VALUE_PORT] },
        make: (id, position, label) => ({
          kind: 'range',
          id,
          spacing: 'linear',
          start: 0,
          stop: 1,
          count: 5,
          unit: parseUnit(''),
          position,
          ...labelField(label),
        }),
      };
    case 'output': {
      const port =
        choice.outputKind === 'table'
          ? NEW_COLUMN
          : choice.outputKind === 'bestDesign'
            ? OBJECTIVE_PORT
            : // A dragged wire lands on `x`, the first objective — `y` is drawn
              // after, once there is something to trade against.
              choice.outputKind === 'pareto'
              ? X_PORT
              : VALUE_PORT;
      return {
        idPrefix:
          choice.outputKind === 'print'
            ? 'result'
            : choice.outputKind === 'bestDesign'
              ? 'best'
              : choice.outputKind,
        ports: { source: [port], target: [] },
        make: (id, position, label) => ({
          kind: 'output',
          id,
          output: defaultOutput(choice.outputKind),
          position,
          ...labelField(label),
        }),
      };
    }
    case 'compare':
      return {
        idPrefix: 'compare',
        ports: { source: [VALUE_PORT], target: [VERDICT_PORT] },
        make: (id, position, label) => ({
          kind: 'compare',
          id,
          comparison: '>=',
          threshold: { value: 1, unit: parseUnit('') },
          position,
          ...labelField(label),
        }),
      };
    case 'select':
      return {
        idPrefix: choice.mode === 'firstPassing' ? 'first' : choice.mode === 'crossing' ? 'crossing' : choice.mode,
        // A dragged source lands on `value`, the thing being searched, or on
        // `along` where it cannot — dragging a swept range at a
        // `firstPassing` node, whose `value` only takes a verdict, is exactly
        // that case. A dragged target takes `at`, the coordinate, which is
        // the headline answer and the only output every mode has.
        ports: { source: [VALUE_PORT, ALONG_PORT], target: [AT_PORT] },
        make: (id, position, label) =>
          choice.mode === 'crossing'
            ? {
                kind: 'select',
                id,
                mode: choice.mode,
                threshold: { value: 1, unit: parseUnit('') },
                direction: 'any',
                position,
                ...labelField(label),
              }
            : { kind: 'select', id, mode: choice.mode, position, ...labelField(label) },
      };
    case 'statistic':
      return {
        idPrefix: 'mean',
        ports: { source: [VALUE_PORT, ALONG_PORT], target: [STATISTIC_RESULT_PORT] },
        make: (id, position, label) => ({ kind: 'statistic', id, statistic: 'mean', position, ...labelField(label) }),
      };
    case 'closure':
      return {
        idPrefix: 'equation',
        ports: { source: ['value'], target: [CLOSURE_RESULT_PORT] },
        make: (id, position, label) => ({
          kind: 'closure',
          id,
          expression: 'value',
          position,
          ...labelField(label),
        }),
      };
    case 'waypoint':
      return {
        idPrefix: 'waypoint',
        ports: { source: ['in0'], target: ['out0'] },
        make: (id, position, label) => ({ kind: 'waypoint', id, position, ...labelField(label) }),
      };
    case 'pack':
      return {
        idPrefix: 'pack',
        ports: { source: ['in0'], target: ['bundle'] },
        make: (id, position, label) => ({ kind: 'pack', id, position, ...labelField(label) }),
      };
    case 'unpack':
      return {
        idPrefix: 'unpack',
        ports: { source: ['bundle'], target: ['out0'] },
        make: (id, position, label) => ({ kind: 'unpack', id, position, ...labelField(label) }),
      };
    case 'monteCarloGenerator':
      return {
        idPrefix: 'draw',
        ports: { source: [], target: [VALUE_PORT] },
        make: (id, position, label) => ({
          kind: 'monteCarloGenerator',
          id,
          distribution: 'uniform',
          min: 0,
          max: 1,
          count: monteCarloSampleCount(document),
          unit: parseUnit(''),
          position,
          ...labelField(label),
        }),
      };
    case 'monteCarloReceiver':
      return {
        idPrefix: 'watch',
        ports: { source: [MONTE_CARLO_SAMPLE_PORT], target: [] },
        make: (id, position, label) => ({
          kind: 'monteCarloReceiver',
          id,
          sampleLimit: monteCarloSampleLimit(document),
          position,
          ...labelField(label),
        }),
      };
  }
}

/** The port selected by an actual menu choice, after compatibility has picked a formula port. */
export function quickAddChoicePort(
  document: GraphDocument,
  choice: Exclude<QuickAddChoice, { readonly kind: 'existing' }>,
  dragType: QuickAddDragType,
): string | undefined {
  if (choice.kind === 'formula') return choice.port;
  return quickAddNodeSpec(document, choice).ports[dragType][0];
}

/** Public ISO 286 limit-deviation lookup nodes. */

import { type Formula, type FormulaLookup, type LocalizedText } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import {
  IT_C,
  IT_C_DIM,
  IT_C_NR,
  IT_Hole,
  IT_Hole_NR,
  IT_HS_DIM,
  IT_Shaft,
  IT_Shaft_NR,
} from './iso286-data.js';

export const ISO286_GRADES = IT_C_NR;
export const ISO286_HOLE_LETTERS = [
  'A', 'B', 'C', 'CD', 'D', 'E', 'EF', 'F', 'FG', 'G', 'H', 'JS', 'J', 'K', 'M', 'N',
  'P', 'R', 'S', 'T', 'U', 'V', 'Y', 'Z', 'ZA',
] as const;
export const ISO286_SHAFT_LETTERS = [
  'a', 'b', 'c', 'cd', 'd', 'e', 'ef', 'f', 'fg', 'g', 'h', 'js', 'j', 'k', 'm', 'n',
  'p', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z', 'za',
] as const;

const text = (en: string): LocalizedText => ({ en });

function tolerance(diameterBound: number, grade: string): number | undefined {
  const row = IT_C_DIM.findIndex((bound) => diameterBound <= bound);
  const column = IT_C_NR.indexOf(grade as never);
  if (row < 0 || column < 0) throw new Error(`unsupported ISO 286 diameter/grade ${diameterBound}/${grade}`);
  const values = IT_C[row]!;
  const value = values[column]!;
  // The supplied 2,000–2,500 mm row contains an isolated IT16 value of 1100
  // between IT15=7000 and IT17=17500. That cannot be a widening IT sequence;
  // quarantine the cell instead of guessing whether a zero was dropped.
  if ((column > 0 && value < values[column - 1]!) || (column + 1 < values.length && value > values[column + 1]!)) {
    return undefined;
  }
  return value;
}

function holeColumn(letter: string, grade: string): string | undefined {
  if (letter === 'J') return ['6', '7', '8'].includes(grade) ? `J${grade}` : undefined;
  if (letter === 'N') return ['8', '9'].includes(grade) ? `N${grade}` : undefined;
  return letter;
}

function shaftColumn(letter: string, grade: string): string | undefined {
  if (letter === 'j') return ['5', '6', '7'].includes(grade) ? `j${grade}` : undefined;
  if (letter === 'k') return grade === '8' ? 'k8' : ['4', '5', '6', '7'].includes(grade) ? 'k4_7' : undefined;
  return letter;
}

function bounds(feature: 'hole' | 'shaft', diameterIndex: number, letter: string, grade: string): readonly [number, number] | undefined {
  const width = tolerance(IT_HS_DIM[diameterIndex]!, grade);
  if (width === undefined) return undefined;
  if (feature === 'hole') {
    if (letter === 'JS') return [-width / 2, width / 2];
    const columnName = holeColumn(letter, grade);
    const column = columnName === undefined ? -1 : IT_Hole_NR.indexOf(columnName as never);
    const fundamental = column < 0 ? undefined : IT_Hole[diameterIndex]![column];
    if (fundamental === null || fundamental === undefined) return undefined;
    return ['A', 'B', 'C', 'CD', 'D', 'E', 'EF', 'F', 'FG', 'G', 'H', 'J'].includes(letter)
      ? [fundamental, fundamental + width]
      : [fundamental - width, fundamental];
  }
  if (letter === 'js') return [-width / 2, width / 2];
  const columnName = shaftColumn(letter, grade);
  const column = columnName === undefined ? -1 : IT_Shaft_NR.indexOf(columnName as never);
  const fundamental = column < 0 ? undefined : IT_Shaft[diameterIndex]![column];
  if (fundamental === null || fundamental === undefined) return undefined;
  return ['a', 'b', 'c', 'cd', 'd', 'e', 'ef', 'f', 'fg', 'g', 'h'].includes(letter)
    ? [fundamental - width, fundamental]
    : [fundamental, fundamental + width];
}

/** Lower and upper limit deviations in micrometres. */
export function iso286Limits(
  feature: 'hole' | 'shaft',
  diameter: number,
  letter: string,
  grade: string,
): readonly [number, number] | undefined {
  const index = IT_HS_DIM.findIndex((bound) => diameter <= bound);
  return index < 0 || diameter <= 0 ? undefined : bounds(feature, index, letter, grade);
}

function lookup(feature: 'hole' | 'shaft', letters: readonly string[]): FormulaLookup {
  const lower: Array<number | null> = [];
  const upper: Array<number | null> = [];
  for (let diameter = 0; diameter < IT_HS_DIM.length; diameter += 1) {
    for (const letter of letters) {
      for (const grade of IT_C_NR) {
        const limits = bounds(feature, diameter, letter, grade);
        lower.push(limits?.[0] ?? null);
        upper.push(limits?.[1] ?? null);
      }
    }
  }
  return {
    axes: [
      { input: 'diameter', kind: 'numeric', values: IT_HS_DIM, lowerExclusive: 0 },
      { input: 'letter', kind: 'categorical', values: letters },
      { input: 'grade', kind: 'categorical', values: IT_C_NR },
    ],
    columns: { lower, upper },
  };
}

function formula(feature: 'hole' | 'shaft', letters: readonly string[]): Formula {
  const capital = feature[0]!.toUpperCase() + feature.slice(1);
  return {
    id: `base.iso286.${feature}-deviation`,
    // Bumped from the single-`deviation`-output shape (picked by a `limit`
    // dropdown) to both limit deviations at once — a fit's lower and upper
    // bound feed two different downstream nodes and were never really one
    // answer a dropdown should have gated (ROADMAP.md: "ISO fit nodes ...
    // instead of dropdown").
    version: 2,
    label: text(`ISO 286 ${feature} deviation`),
    description: text(`${capital} lower and upper limit deviation for a nominal diameter, tolerance letter and IT grade.`),
    outputs: [
      { kind: 'numeric', name: 'lower', unit: parseUnit('µm'), description: text('Lower limit deviation') },
      { kind: 'numeric', name: 'upper', unit: parseUnit('µm'), description: text('Upper limit deviation') },
    ],
    inputs: [
      { kind: 'numeric', name: 'diameter', unit: parseUnit('mm'), default: 100, description: text('Nominal size') },
      { kind: 'categorical', name: 'letter', domain: letters, default: feature === 'hole' ? 'H' : 'h', description: text('Tolerance position') },
      { kind: 'categorical', name: 'grade', domain: IT_C_NR, default: feature === 'hole' ? '7' : '6', description: text('IT tolerance grade') },
    ],
    // The lookup is the evaluator; these expressions exist only to state and
    // statically prove each output's dimension in the existing formula contract.
    expressions: { lower: '0 * diameter', upper: '0 * diameter' },
    lookup: lookup(feature, letters),
    status: 'unverified',
  };
}

export const ISO286_FORMULAS = [
  formula('hole', ISO286_HOLE_LETTERS),
  formula('shaft', ISO286_SHAFT_LETTERS),
] as const;

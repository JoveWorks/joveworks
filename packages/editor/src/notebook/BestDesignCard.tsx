/**
 * The decision card: which candidate won, what it sits at, and which
 * constraint is the reason it cannot go further.
 *
 * Prose and a short table rather than a figure — the point of this output is
 * that a sweep finally becomes *a decision recorded in the report*, and a
 * decision reads as a sentence. `FeasibilityFigure` already shows the shape
 * of the feasible region; this says what to build.
 *
 * "No feasible candidate" is a first-class answer here, not an error state: a
 * study that fails everywhere is a real finding, and naming the check that
 * fails at the most points is what tells a student where to look next.
 */

import type { ReactElement } from 'react';

import type { BestDesignCoordinate, BestDesignResult } from '@joveworks/kernel';
import type { NumberFormat } from '@joveworks/units';

import { display } from '../model/quantity';

interface Props {
  readonly result: BestDesignResult;
  /** Check node id → what that node calls itself, the same fallback `OutputTitle` uses. */
  readonly checkLabels: Readonly<Record<string, string>>;
  readonly format: NumberFormat;
}

/** `38 mm` for a numeric coordinate, the bare choice for a categorical one. */
function coordinate(entry: BestDesignCoordinate, format: NumberFormat): string {
  return typeof entry.value === 'number' ? display(entry.value, entry.unit, 4, format) : entry.value;
}

/** A margin as a percentage of the check's own bound — what "governing" is ranked by. */
function margin(value: number): string {
  return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

/**
 * The one sentence the card exists to write: what to build, and how good it
 * is. Exported for its own test — the prose *is* the output here, the way
 * `FeasibilityFigure`'s `rows` is there.
 */
export function headline(result: BestDesignResult, format: NumberFormat): string {
  const goal = result.direction === 'minimize' ? 'smallest' : 'largest';
  if (result.winner === undefined) return 'No candidate satisfies every check at once.';
  const { winner } = result;
  const objective = display(winner.objective, result.unit, 4, format);
  if (winner.at.length === 0) return `The ${goal} feasible value is ${objective}.`;
  const where = winner.at.map((entry) => `${entry.axis.label} ${coordinate(entry, format)}`).join(', ');
  return `${where} — ${goal} at ${objective}.`;
}

/** The second line: how many candidates survived, and what is holding the winner back. */
export function detail(
  result: BestDesignResult,
  checkLabels: Readonly<Record<string, string>>,
  format: NumberFormat,
): string {
  const label = (id: string): string => checkLabels[id] ?? id;
  const points = `${result.feasible.length} candidate${result.feasible.length === 1 ? '' : 's'}`;
  if (result.winner === undefined) {
    return result.blocking === undefined
      ? 'There is nothing to choose from.'
      : `${label(result.blocking.checkId)} fails at ${result.blocking.failures} of ${points} — ` +
          'the most of any check here.';
  }
  const governing = result.winner.governing;
  return (
    `${result.feasibleCount} of ${points} feasible` +
    (result.checks.length === 0 ? ' (nothing constrains this)' : '') +
    (governing === undefined
      ? '.'
      : `, governed by ${label(governing.checkId)} at ${margin(governing.margin)} margin.`)
  );
}

export function BestDesignCard({ result, checkLabels, format }: Props): ReactElement {
  const label = (id: string): string => checkLabels[id] ?? id;

  if (result.winner === undefined) {
    return (
      <div className="best-design infeasible">
        <p className="best-design-headline">{headline(result, format)}</p>
        <p className="best-design-detail">{detail(result, checkLabels, format)}</p>
      </div>
    );
  }

  const { winner } = result;
  return (
    <div className="best-design">
      <p className="best-design-headline">{headline(result, format)}</p>
      <p className="best-design-detail">{detail(result, checkLabels, format)}</p>
      {winner.margins.length === 0 ? null : (
        <table className="best-design-margins">
          <thead>
            <tr>
              <th>check</th>
              <th>margin at the winner</th>
            </tr>
          </thead>
          <tbody>
            {winner.margins.map((entry, i) => (
              <tr key={entry.checkId} className={i === 0 ? 'governing' : undefined}>
                <td>{label(entry.checkId)}</td>
                <td>{margin(entry.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

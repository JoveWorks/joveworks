import type { ReactElement } from 'react';
import type { ReliabilityDesign, ReliabilityEstimate, ReliabilityResult } from '@joveworks/kernel';
import type { NumberFormat } from '@joveworks/units';

import { display } from '../model/quantity';
import { useDisplay } from './display';

function Estimate({ estimate, label }: { readonly estimate: ReliabilityEstimate; readonly label: string }): ReactElement {
  const probability = estimate.unresolved ? `< ${(1 / estimate.trials).toPrecision(3)}` : estimate.probability.toPrecision(3);
  const beta = `${estimate.unresolved ? '> ' : ''}${estimate.beta.toPrecision(3)}`;
  return (
    <tr>
      <th>{label}</th><td>{estimate.failures}/{estimate.trials}</td><td>{probability}</td>
      <td>{estimate.interval[0].toPrecision(3)}–{estimate.interval[1].toPrecision(3)}</td><td>{beta}</td>
      <td>{estimate.converged ? 'converged' : 'more trials needed'}</td>
    </tr>
  );
}

/** `offset 0.5, d 40 mm` — where one design sits on the study's design axes. */
export function designLabel(design: ReliabilityDesign, format: NumberFormat): string {
  return design.at
    .map((entry) => `${entry.axis.label} ${typeof entry.value === 'number' ? display(entry.value, entry.unit, 4, format) : entry.value}`)
    .join(', ');
}

function Estimates({
  checks,
  combined,
  checkLabels,
}: {
  readonly checks: readonly ReliabilityEstimate[];
  readonly combined: ReliabilityEstimate | undefined;
  readonly checkLabels: Readonly<Record<string, string>>;
}): ReactElement {
  return (
    <>
      {checks.map((estimate) => <Estimate key={estimate.checkId} estimate={estimate} label={checkLabels[estimate.checkId] ?? estimate.checkId} />)}
      {combined === undefined || checks.length < 2 ? null : <Estimate estimate={combined} label="all checks" />}
    </>
  );
}

/**
 * Over a design sweep, one block per design: pooled across designs, the
 * failure probability would describe none of them.
 */
export function ReliabilityCard({ result }: { readonly result: ReliabilityResult }): ReactElement {
  const { checkLabels, format } = useDisplay();
  return (
    <div className="reliability-card">
      <table><thead><tr><th>check</th><th>failures</th><th>Pf</th><th>{Math.round(result.confidence * 100)}% interval</th><th>β</th><th>estimate</th></tr></thead>
        {result.designs === undefined ? (
          <tbody>
            <Estimates checks={result.checks} combined={result.combined} checkLabels={checkLabels} />
          </tbody>
        ) : (
          result.designs.map((design, i) => (
            <tbody key={i}>
              <tr className="reliability-design"><th colSpan={6}>{designLabel(design, format)}</th></tr>
              <Estimates checks={design.checks} combined={design.combined} checkLabels={checkLabels} />
            </tbody>
          ))
        )}
      </table>
    </div>
  );
}

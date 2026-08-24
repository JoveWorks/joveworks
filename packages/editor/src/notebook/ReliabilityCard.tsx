import type { ReactElement } from 'react';
import type { ReliabilityEstimate, ReliabilityResult } from '@joveworks/kernel';

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

export function ReliabilityCard({ result, checkLabels = {} }: { readonly result: ReliabilityResult; readonly checkLabels?: Readonly<Record<string, string>> }): ReactElement {
  return (
    <div className="reliability-card">
      <table><thead><tr><th>check</th><th>failures</th><th>Pf</th><th>{Math.round(result.confidence * 100)}% interval</th><th>β</th><th>estimate</th></tr></thead>
        <tbody>
          {result.checks.map((estimate) => <Estimate key={estimate.checkId} estimate={estimate} label={checkLabels[estimate.checkId] ?? estimate.checkId} />)}
          {result.combined === undefined || result.checks.length < 2 ? null : <Estimate estimate={result.combined} label="all checks" />}
        </tbody>
      </table>
    </div>
  );
}

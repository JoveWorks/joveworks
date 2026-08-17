import type { ReactElement } from 'react';

import { compatibleDisplayUnits, type Unit } from '@joveworks/units';

/** A deliberately finite menu: only units matching this port's dimension appear. */
export function DisplayUnitPicker({
  unit,
  onChange,
}: {
  readonly unit: Unit;
  readonly onChange: (unit: Unit) => void;
}): ReactElement {
  const compatible = compatibleDisplayUnits(unit.dimension);
  // Catalogue ports may use a valid specialised spelling outside the compact
  // menu (for example a velocity expression). Keep that current spelling
  // visible; the remaining choices still all have the same dimension.
  const options = compatible.some((candidate) => candidate.symbol === unit.symbol)
    ? compatible
    : [unit, ...compatible];
  return (
    <select
      className="port-unit-picker nodrag"
      aria-label="Display unit"
      value={unit.symbol}
      onChange={(event) => {
        const next = options.find((candidate) => candidate.symbol === event.target.value);
        if (next !== undefined) onChange(next);
      }}
    >
      {options.map((option) => (
        <option key={option.symbol} value={option.symbol}>
          {option.symbol === '' ? '—' : option.symbol}
        </option>
      ))}
    </select>
  );
}

import type { ReactElement } from 'react';

import { compatibleDisplayUnits, siPrefixSteps, type Unit } from '@joveworks/units';

import { unitLabel } from '../model/quantity';

/**
 * The picker's choices for a port currently shown in `unit`: the compact
 * menu for its dimension, preceded — when `prefixes` asks for them — by the
 * SI steps of every unit in it that takes a prefix, so `Pa` can become `MPa`
 * and so can a column the catalogue wrote in `N/mm²`.
 * The compact menu leaves prefixed spellings out on purpose; a catalogue
 * table's column is where one is wanted anyway, because the table is read
 * against a book that prints it that way.
 */
export function displayUnitChoices(unit: Unit, prefixes = false): readonly Unit[] {
  const compact = compatibleDisplayUnits(unit.dimension);
  if (!prefixes) return compact;
  const choices = new Map<string, Unit>();
  for (const candidate of [unit, ...compact]) {
    for (const step of siPrefixSteps(candidate.symbol)) choices.set(step.symbol, step);
  }
  for (const candidate of compact) if (!choices.has(candidate.symbol)) choices.set(candidate.symbol, candidate);
  return [...choices.values()];
}

/** A deliberately finite menu: only units matching this port's dimension appear. */
export function DisplayUnitPicker({
  unit,
  onChange,
  prefixes = false,
}: {
  readonly unit: Unit;
  readonly onChange: (unit: Unit) => void;
  /** Also offer the SI-prefixed spellings of the current unit. */
  readonly prefixes?: boolean;
}): ReactElement {
  const compatible = displayUnitChoices(unit, prefixes);
  // Catalogue ports may use a valid specialised spelling outside the compact
  // menu (for example a velocity expression). Keep that current spelling
  // visible; the remaining choices still all have the same dimension.
  const options = compatible.some((candidate) => candidate.symbol === unit.symbol)
    ? compatible
    : [unit, ...compatible];

  // A port with no compatible alternative should read like every other static
  // port label, not pretend it is an editable control.
  if (options.length < 2) return <span className="port-unit">({unitLabel(unit)})</span>;

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

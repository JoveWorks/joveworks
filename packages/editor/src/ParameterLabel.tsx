import type { ReactElement } from 'react';

import type { Unit } from '@mds/units';

import { unitLabel } from './model/quantity';
import { Symbol } from './Symbol';

interface UnitInLabelProps {
  readonly unit: Unit | undefined;
  readonly className?: string;
}

/** A unit that belongs to an interface label, including its punctuation. */
export function UnitInLabel({
  unit,
  className = 'interface-unit',
}: UnitInLabelProps): ReactElement | null {
  if (unit === undefined) return null;
  return (
    <>
      {' '}
      <span className={className}>({unitLabel(unit)})</span>
    </>
  );
}

interface ParameterLabelProps {
  readonly name: string;
  readonly unit?: Unit | undefined;
  readonly title?: string;
  readonly nameClassName?: string;
  readonly unitClassName?: string;
}

/** The shared presentation for a parameter and the unit that qualifies it. */
export function ParameterLabel({
  name,
  unit,
  title,
  nameClassName = 'parameter-name',
  unitClassName,
}: ParameterLabelProps): ReactElement {
  return (
    <>
      <span className={nameClassName} {...(title === undefined ? {} : { title })}>
        <Symbol name={name} />
      </span>
      <UnitInLabel
        unit={unit}
        {...(unitClassName === undefined ? {} : { className: unitClassName })}
      />
    </>
  );
}

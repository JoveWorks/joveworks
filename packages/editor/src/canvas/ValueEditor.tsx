/**
 * Turning an input into a range, on the node (S29, S47).
 *
 * This is the control the whole tool is about: the same node holds `250 kW` and
 * `linspace(20, 60, 21)`, and switching between them is what turns a calculation
 * into a design study. Nothing downstream is rewired, because a scalar is a
 * series with no axes (S43).
 *
 * Four kinds are offered. `tableColumn` is absent because tables arrive with the
 * second slice (S37) and the kernel says so rather than half-working, and the
 * categorical kinds are absent because nothing in milestone 1 has a categorical
 * port to receive one (S38, S41's accepted gap) — offering them would be a field
 * whose every value is refused at the next connection.
 */

import type { ReactElement } from 'react';

import { parseUnit, type Unit } from '@mds/units';
import type { ValueSpec } from '@mds/schema';

import { NumberField, TextField } from './fields';

type Kind = 'scalar' | 'linear' | 'logarithmic' | 'list';

const KIND_LABELS: Readonly<Record<Kind, string>> = {
  scalar: 'value',
  linear: 'linear range',
  logarithmic: 'log range',
  list: 'list',
};

function unitOf(value: ValueSpec): Unit {
  return 'unit' in value ? value.unit : parseUnit('');
}

/** The smallest bound already on the value, so a switch never throws away the one number worth keeping. */
function smallest(value: ValueSpec): number {
  if (value.kind === 'scalar') return value.value;
  if (value.kind === 'list') return Math.min(...value.values);
  if (value.kind === 'linear' || value.kind === 'logarithmic') return Math.min(value.start, value.stop);
  return 1;
}

/**
 * A first guess when the kind changes, so a switch never lands on nothing.
 *
 * Range → value takes the smallest limit, since a single number has to come
 * from somewhere and the low end is the one a range always has. Value →
 * range goes the other way: the value becomes the low end, and the high end
 * is double it — a starting range to narrow from, not a guess at where the
 * student's real bound is.
 */
export function converted(value: ValueSpec, kind: Kind): ValueSpec {
  const unit = unitOf(value);
  const sample = smallest(value);
  switch (kind) {
    case 'scalar':
      return { kind, value: sample, unit };
    case 'linear':
    case 'logarithmic': {
      const start = kind === 'logarithmic' && sample <= 0 ? 1 : sample;
      return { kind, start, stop: start * 2, points: 21, unit };
    }
    case 'list':
      return { kind, values: [sample, sample * 2], unit };
  }
}

interface Props {
  readonly value: ValueSpec;
  readonly onChange: (value: ValueSpec) => void;
}

/**
 * The kind switch alone — scalar, linear range, log range, list. Split out
 * from `ValueFields` because it changes rarely enough to stay behind the
 * hover/pin detail, while the fields below it are what a student is quickly
 * re-typing during iteration and belong on the card at all times.
 */
export function ValueKindSelect({ value, onChange }: Props): ReactElement {
  const kind = (['scalar', 'linear', 'logarithmic', 'list'] as const).includes(value.kind as Kind)
    ? (value.kind as Kind)
    : 'scalar';

  return (
    <select
      className="kind"
      value={kind}
      onChange={(event) => onChange(converted(value, event.target.value as Kind))}
    >
      {Object.entries(KIND_LABELS).map(([option, label]) => (
        <option key={option} value={option}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** The value itself — always visible on the card, not just on hover (S47). */
export function ValueFields({ value, onChange }: Props): ReactElement {
  const unit = unitOf(value);

  const setUnit = (text: string): void => {
    const parsed = parseUnit(text); // throws, and the field shows why
    switch (value.kind) {
      case 'scalar':
      case 'spectrum':
      case 'linear':
      case 'logarithmic':
      case 'list':
        onChange({ ...value, unit: parsed });
        break;
      default:
        // The categorical kinds carry no unit, and neither does a table column.
        break;
    }
  };

  return (
    <div className="value-editor">
      {value.kind === 'scalar' ? (
        // Split so the number — what changes on every iteration — is never
        // retyped alongside a unit that almost never does; getting the unit
        // wrong used to fail the whole edit (S5), not just the value.
        <div className="quantity-split">
          <NumberField
            value={value.value}
            title="The value. The unit is the field beside it, and does not need retyping."
            onCommit={(next) => onChange({ ...value, value: next })}
          />
          <TextField
            className="unit"
            value={unit.symbol}
            placeholder="mm"
            title="An undeclared unit is an error, never a guess (S5)."
            onCommit={setUnit}
          />
        </div>
      ) : null}

      {value.kind === 'linear' || value.kind === 'logarithmic' ? (
        <div className="range-fields">
          <label>
            from
            <NumberField value={value.start} onCommit={(start) => onChange({ ...value, start })} />
          </label>
          <label>
            to
            <NumberField value={value.stop} onCommit={(stop) => onChange({ ...value, stop })} />
          </label>
          <label>
            points
            <NumberField
              value={value.points}
              integer
              minimum={2}
              title="Point count is the control, not step size (S29)."
              onCommit={(points) => onChange({ ...value, points })}
            />
          </label>
          <label>
            unit
            <TextField className="unit" value={unit.symbol} onCommit={setUnit} />
          </label>
        </div>
      ) : null}

      {value.kind === 'list' ? (
        <div className="range-fields">
          <label className="wide">
            values
            <TextField
              className="list"
              value={value.values.join(', ')}
              placeholder="25, 30, 35, 40"
              title="Standard sizes — the range that answers which part to buy (S29)."
              onCommit={(text) => {
                const values = text
                  .split(/[,;\s]+/u)
                  .filter((entry) => entry.length > 0)
                  .map((entry) => {
                    const parsed = Number(entry);
                    if (!Number.isFinite(parsed)) throw new Error(`'${entry}' is not a number`);
                    return parsed;
                  });
                if (values.length === 0) throw new Error('a list needs at least one value');
                onChange({ ...value, values });
              }}
            />
          </label>
          <label>
            unit
            <TextField className="unit" value={unit.symbol} onCommit={setUnit} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

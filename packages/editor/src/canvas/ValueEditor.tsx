/**
 * Turning an input into a range, on the node.
 *
 * This is the control the whole tool is about: the same node holds `250 kW` and
 * `linspace(20, 60, 10)`, and switching between them is what turns a calculation
 * into a design study. Nothing downstream is rewired, because a scalar is a
 * series with no axes.
 *
 * Five kinds are offered. `tableColumn` is absent because tables arrive with the
 * second slice and the kernel says so rather than half-working, and the
 * categorical kinds are absent because nothing in milestone 1 has a categorical
 * port to receive one — an accepted gap, since belt uses neither tables nor
 * categoricals — offering them would be a field whose every value is refused
 * at the next connection.
 */

import type { ReactElement } from 'react';

import { dimensionsEqual, parseUnit, type NumberFormat, type Unit } from '@mds/units';
import { RENARD_SERIES, type RenardSeries, type ValueSpec } from '@mds/schema';

import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { NumberField, TextField } from './fields';

type Kind = 'scalar' | 'linear' | 'logarithmic' | 'list' | 'renard';

/**
 * A unit field's placeholder when empty — matching `unitLabel`'s own
 * convention for "no unit" elsewhere in the app. Blank is a real,
 * unambiguous state here (dimensionless, S5), not an unfinished field, but
 * with no border until hover (styles.css) and no text an empty box has
 * nothing to make it visible at all — a placeholder is what keeps it
 * findable rather than looking gone.
 */
const EMPTY_UNIT = '—';

const KIND_LABELS: Readonly<Record<Kind, string>> = {
  scalar: 'value',
  linear: 'linear range',
  logarithmic: 'log range',
  list: 'list',
  renard: 'Renard series',
};

function unitOf(value: ValueSpec): Unit {
  return 'unit' in value ? value.unit : parseUnit('');
}

/** The smallest bound already on the value, so a switch never throws away the one number worth keeping. */
function smallest(value: ValueSpec): number {
  if (value.kind === 'scalar') return value.value;
  if (value.kind === 'list') return Math.min(...value.values);
  if (value.kind === 'linear' || value.kind === 'logarithmic' || value.kind === 'renard') {
    return Math.min(value.start, value.stop);
  }
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
      return { kind, start, stop: start * 2, points: 10, unit };
    }
    case 'list':
      return { kind, values: [sample, sample * 2], unit };
    case 'renard': {
      const start = sample <= 0 ? 1 : sample;
      return { kind, series: 'R20', start, stop: start * 2, unit };
    }
  }
}

type Range = ValueSpec & { readonly kind: 'linear' | 'logarithmic' | 'renard' };

/**
 * A bound's own unit box, typed as a convenience — "10 mm ... 1 m" reads
 * naturally, but the range still stores one unit, not two. Typing a new one
 * here re-expresses *both* bounds under it, canonical value unchanged,
 * rather than actually splitting the range across units, whenever the new
 * unit measures the same thing as the old one.
 *
 * Nothing here refuses a *different* dimension, though — same as a scalar's
 * `setUnit`, which never has (connection-time is where a wrong dimension
 * gets caught, S64, and a range must stay correctable there too: a student
 * who mistypes a force input's unit as `m` needs a way back to `N` that
 * doesn't route through deleting the field). Retyping across dimensions has
 * no meaningful factor to convert by, so it is adopted outright rather than
 * rescaled — the same "just relabel it" behaviour a blank field already got,
 * of which this is the general case.
 */
export function rescaleRange(range: Range, text: string): Range {
  const parsed = parseUnit(text);
  if (!dimensionsEqual(parsed.dimension, range.unit.dimension)) return { ...range, unit: parsed };
  const rescale = (n: number): number => (n * range.unit.factor) / parsed.factor;
  return { ...range, start: rescale(range.start), stop: rescale(range.stop), unit: parsed };
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
  const kind = (['scalar', 'linear', 'logarithmic', 'list', 'renard'] as const).includes(
    value.kind as Kind,
  )
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

/**
 * Point count, alone — the one range control that changes rarely enough to
 * live behind the hover/pin detail rather than on the card at all times,
 * unlike the bounds above it.
 */
export function ValuePointsField({ value, onChange }: Props): ReactElement | null {
  if (value.kind !== 'linear' && value.kind !== 'logarithmic') return null;
  return (
    <label className="points-field">
      points
      <NumberField
        value={value.points}
        integer
        minimum={2}
        title="Point count is the control, not step size (S29)."
        onCommit={(points) => onChange({ ...value, points })}
      />
    </label>
  );
}

/** Values here are a student's magnitudes — always in the settings' punctuation. */
function useValueFormat(): NumberFormat {
  const { numberFormat } = useSettings();
  return toUnitsFormat(numberFormat);
}

/** The value itself — always visible on the card, not just on hover. */
export function ValueFields({ value, onChange }: Props): ReactElement {
  const unit = unitOf(value);
  const format = useValueFormat();

  const setUnit = (text: string): void => {
    const parsed = parseUnit(text); // throws, and the field shows why
    switch (value.kind) {
      case 'scalar':
      case 'spectrum':
      case 'linear':
      case 'logarithmic':
      case 'list':
      case 'renard':
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
        // wrong used to fail the whole edit, not just the value.
        <div className="quantity-split">
          <NumberField
            value={value.value}
            autoSize={1}
            format={format}
            title="The value. The unit is the field beside it, and does not need retyping."
            onCommit={(next) => onChange({ ...value, value: next })}
          />
          <TextField
            className="unit"
            value={unit.symbol}
            autoSize={1}
            placeholder={EMPTY_UNIT}
            title="Blank is dimensionless (S5) — that is a value, not a gap to fill in."
            onCommit={setUnit}
          />
        </div>
      ) : null}

      {value.kind === 'linear' || value.kind === 'logarithmic' ? (
        <div className="range-split">
          <div className="quantity-split">
            <NumberField
              value={value.start}
              autoSize={1}
              format={format}
              title="The low end. Type a unit here too (10 mm ... 1 m) to re-express both bounds in it."
              onCommit={(start) => onChange({ ...value, start })}
            />
            <TextField
              className="unit"
              value={unit.symbol}
              autoSize={1}
              placeholder={EMPTY_UNIT}
              onCommit={(text) => onChange(rescaleRange(value, text))}
            />
          </div>
          <span className="range-sep">…</span>
          <div className="quantity-split">
            <NumberField
              value={value.stop}
              autoSize={1}
              format={format}
              title="The high end."
              onCommit={(stop) => onChange({ ...value, stop })}
            />
            <TextField
              className="unit"
              value={unit.symbol}
              autoSize={1}
              placeholder={EMPTY_UNIT}
              onCommit={(text) => onChange(rescaleRange(value, text))}
            />
          </div>
        </div>
      ) : null}

      {value.kind === 'renard' ? (
        <div className="range-split">
          <select
            className="renard-series"
            value={value.series}
            title="Preferred numbers (ISO 3) — the standard sizes a part actually comes in."
            onChange={(event) => onChange({ ...value, series: event.target.value as RenardSeries })}
          >
            {RENARD_SERIES.map((series) => (
              <option key={series} value={series}>
                {series}
              </option>
            ))}
          </select>
          <div className="quantity-split">
            <NumberField
              value={value.start}
              autoSize={1}
              format={format}
              title="The low end. Type a unit here too (10 mm ... 1 m) to re-express both bounds in it."
              onCommit={(start) => onChange({ ...value, start })}
            />
            <TextField
              className="unit"
              value={unit.symbol}
              autoSize={1}
              placeholder={EMPTY_UNIT}
              onCommit={(text) => onChange(rescaleRange(value, text))}
            />
          </div>
          <span className="range-sep">…</span>
          <div className="quantity-split">
            <NumberField
              value={value.stop}
              autoSize={1}
              format={format}
              title="The high end."
              onCommit={(stop) => onChange({ ...value, stop })}
            />
            <TextField
              className="unit"
              value={unit.symbol}
              autoSize={1}
              placeholder={EMPTY_UNIT}
              onCommit={(text) => onChange(rescaleRange(value, text))}
            />
          </div>
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
            <TextField
              className="unit"
              value={unit.symbol}
              placeholder={EMPTY_UNIT}
              onCommit={setUnit}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

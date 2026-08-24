/**
 * The value typed on a port, in place of a wire into it.
 *
 * Every numeric input port has one, not only the ones a catalogue happened to
 * give a default: connecting a node is then a deliberate choice rather than the
 * only way to say what a quantity is, and a canvas stops filling with input
 * nodes that exist solely to carry one constant. The wire still wins wherever
 * there is one — this is the same edge-then-typed-then-declared order the
 * kernel resolves in (`kernel/src/evaluate.ts`, `inputPortValue`).
 *
 * A range is deliberately *not* typeable here. Sweeping is what an input node
 * is for: it carries the axis, its label, and the range kind, and none of that
 * belongs on a borrowed row of another node's port list.
 */

import type { ReactElement } from 'react';

import { isDimensionless, type NumberFormat, type Unit } from '@joveworks/units';
import { isGenericPort, type NumericPort, type ValueSpec } from '@joveworks/schema';

import { formatAuthored, parseAuthored } from '../model/quantity';
import { TextField } from './fields';

/** What a port row's field says it is for, on hover. */
export const PORT_VALUE_HINT = 'Typed here — unless a wire supplies it.';

/**
 * The categorical counterpart's "nothing chosen yet" entry. A NUL is not a
 * domain entry anyone can author through the catalogue schema, so it cannot
 * collide with a real choice the way an empty string could.
 */
export const UNCHOSEN = '\u0000';

interface Props {
  readonly port: NumericPort;
  /** What this graph has typed for the port, if anything. */
  readonly authored: ValueSpec | undefined;
  /**
   * The port's resolved unit — what a bare number is taken to be in. Undefined
   * for a generic port nothing has bound yet, where a bare number really is
   * dimensionless and there is nothing to adopt.
   */
  readonly unit: Unit | undefined;
  readonly format: NumberFormat;
  readonly title: string;
  /** `undefined` clears the typed value, falling back to the declared default. */
  readonly onCommit: (value: ValueSpec | undefined) => void;
}

/** The text the field shows: what was typed, else the catalogue's default, else nothing. */
export function portFieldText(
  port: NumericPort,
  authored: ValueSpec | undefined,
  format: NumberFormat,
): string {
  if (authored?.kind === 'scalar' || authored?.kind === 'slider') {
    return formatAuthored({ value: authored.value, unit: authored.unit }, format);
  }
  if (authored !== undefined) return '';
  if (port.default === undefined || isGenericPort(port)) return '';
  return formatAuthored({ value: port.default, unit: port.unit as Unit }, format);
}

/**
 * What typing `text` into a port's field means. Empty is not a value: it
 * clears, so the catalogue's own default applies again — a field that could
 * only ever be overwritten would leave a graph carrying a number nobody
 * chose and nobody can see.
 */
export function portFieldValue(
  text: string,
  unit: Unit | undefined,
  format: NumberFormat,
): ValueSpec | undefined {
  if (text.trim().length === 0) return undefined;
  const parsed = parseAuthored(text, format);
  // A bare number takes the unit the port itself declares, and the field
  // redraws carrying it — the same adoption `CompareNodeView`'s threshold
  // makes. "An undeclared unit is never a guess" (`model/quantity.ts`) still
  // holds: the port declared this one, the field did not infer it.
  const adopted =
    isDimensionless(parsed.unit.dimension) && unit !== undefined && !isDimensionless(unit.dimension)
      ? { ...parsed, unit }
      : parsed;
  return { kind: 'scalar', ...adopted };
}

export function PortValueField({
  port,
  authored,
  unit,
  format,
  title,
  onCommit,
}: Props): ReactElement {
  return (
    <TextField
      className="quantity port-default"
      autoSize={5}
      // An em-dash, not "0": the port has no value, which is a different
      // statement from a value that happens to be zero.
      placeholder="—"
      title={title}
      value={portFieldText(port, authored, format)}
      onCommit={(text) => onCommit(portFieldValue(text, unit, format))}
    />
  );
}

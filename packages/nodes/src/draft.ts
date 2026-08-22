/**
 * The shared authoring shape for a hand-written base node: a `Draft` plus the
 * port helpers and the label/build machinery that turns a list of them into
 * `Formula` records. `operations.ts` and `arrayNodes.ts` both build their
 * catalogue this way; `iso286.ts` is lookup-based and does not need it.
 */

import type { Formula, LocalizedText, NumericPort, OutputPort, Port, SpectrumPort } from '@joveworks/schema';
import { parseGenericDimension, parseUnit } from '@joveworks/units';

export function text(en: string): LocalizedText {
  return { en };
}

/** A port that adopts the dimension of whatever is wired to it. */
export function generic(name: string, variable: string, description: string): NumericPort {
  return { kind: 'numeric', name, unit: parseGenericDimension(`$${variable}`), description: text(description) };
}

/**
 * A spectrum port that adopts the dimension of whatever is wired to it.
 * Unlike a plain generic port it may be joined by more than one wire —
 * `minimum`/`maximum` are the two `operations.ts` nodes that need that; every
 * `arrayNodes.ts` reduction needs it for the single series it consumes.
 */
export function genericSpectrum(name: string, variable: string, description: string): SpectrumPort {
  return { kind: 'spectrum', name, unit: parseGenericDimension(`$${variable}`), description: text(description) };
}

/** A port with a fixed unit. `''` is dimensionless — declared, not absent. */
export function plain(name: string, unit: string, description: string): NumericPort {
  return { kind: 'numeric', name, unit: parseUnit(unit), description: text(description) };
}

/** A spectrum port bound to a fixed unit rather than a generic one — `product`'s series argument. */
export function plainSpectrum(name: string, unit: string, description: string): SpectrumPort {
  return { kind: 'spectrum', name, unit: parseUnit(unit), description: text(description) };
}

export interface Draft {
  readonly id: string;
  readonly description: string;
  readonly expression: string;
  readonly output: OutputPort;
  readonly inputs: readonly Port[];
}

function draftLabel(id: string, dutchLabels: Readonly<Record<string, string>>): LocalizedText {
  const en = id.replace(/([A-Z])/gu, ' $1').replace(/^./u, (letter) => letter.toUpperCase());
  return { en, nl: dutchLabels[id] ?? en };
}

/**
 * Every one of these comes out `unverified`, and honestly so: no golden value
 * exercises them yet. The kernel's own tests are what will move them, and
 * until then "we wrote it, so it is right" is exactly the assumption
 * `unverified` exists to refuse.
 */
export function buildFormulas(
  drafts: readonly Draft[],
  dutchLabels: Readonly<Record<string, string>>,
): readonly Formula[] {
  return drafts.map((draft) => ({
    id: draft.id,
    version: 1,
    output: draft.output as Formula['output'],
    inputs: draft.inputs,
    expression: draft.expression,
    label: draftLabel(draft.id, dutchLabels),
    description: text(draft.description),
    status: 'unverified' as const,
  }));
}

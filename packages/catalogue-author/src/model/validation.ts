/**
 * Turns a draft into the real, validated thing — or a list of every problem
 * stopping it from being one.
 *
 * Two passes, deliberately not fail-fast, mirroring the "see every problem
 * at once" convention `test/catalogue-check.test.ts` already established for
 * a migrated catalogue:
 *
 * 1. Each formula is parsed independently via the real `parseFormula`, so one
 *    broken record never hides the next one's error.
 * 2. Every formula that parsed and isn't `quarantined` is run through the
 *    real `checkFormulaDimensions` — the same dimension check a migrated
 *    catalogue goes through.
 *
 * `catalogue` on the result is only ever set once every formula (and the
 * catalogue's own metadata) is clean — that is the export-readiness gate.
 */

import {
  parseCatalogue,
  parseFormula,
  parseLocalizedText,
  SchemaError,
  SCHEMA_VERSION,
  type Catalogue,
  type Formula,
  type JsonObject,
  type JsonValue,
} from '@joveworks/schema';
import { checkFormulaDimensions, KernelError } from '@joveworks/kernel';

import type { DraftCatalogue, DraftFormula, DraftLocalizedText, DraftPort } from './draft';

export interface ValidationMessage {
  readonly message: string;
}

export interface FormulaValidation {
  readonly key: string;
  readonly errors: readonly ValidationMessage[];
  /** Set when a quarantined formula's dimensions actually check out. */
  readonly quarantineNote?: string;
}

export interface CatalogueValidation {
  readonly catalogueErrors: readonly ValidationMessage[];
  readonly formulas: readonly FormulaValidation[];
  /** Present only when every check above passed — ready to export. */
  readonly catalogue?: Catalogue;
}

function describeError(error: unknown): string {
  if (error instanceof SchemaError || error instanceof KernelError) return error.message;
  return String(error);
}

function localizedTextJson(text: DraftLocalizedText): JsonObject {
  const out: Record<string, string> = {};
  for (const [locale, value] of Object.entries(text)) {
    if (value.trim().length > 0) out[locale] = value;
  }
  return out;
}

/**
 * A number field as authored: absent when blank, the raw string when it
 * doesn't parse (so the schema's own "expected a finite number" message is
 * what the author sees, at the right field path), otherwise a number.
 */
function numberField(raw: string): JsonValue | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : raw;
}

function validRangeJson(range: DraftPort['validRange']): JsonObject | undefined {
  const min = numberField(range.min);
  const max = numberField(range.max);
  if (min === undefined && max === undefined) return undefined;
  const out: Record<string, JsonValue> = {};
  if (min !== undefined) out['min'] = min;
  if (max !== undefined) out['max'] = max;
  return out;
}

function portJson(port: DraftPort): JsonObject {
  const out: Record<string, JsonValue> = { kind: port.kind, name: port.name };
  const description = localizedTextJson(port.description);
  if (Object.keys(description).length > 0) out['description'] = description;

  if (port.kind === 'categorical') {
    out['domain'] = port.domain
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (port.defaultValue.trim().length > 0) out['default'] = port.defaultValue;
    return out;
  }

  out['unit'] = port.unit;
  if (port.preferredUnit.trim().length > 0) out['preferredUnit'] = port.preferredUnit;
  if (port.kind === 'spectrum') return out;

  const fallback = numberField(port.defaultValue);
  if (fallback !== undefined) out['default'] = fallback;
  const validRange = validRangeJson(port.validRange);
  if (validRange !== undefined) out['validRange'] = validRange;
  if (port.monotonic.length > 0) out['monotonic'] = port.monotonic;
  return out;
}

function formulaJson(formula: DraftFormula): JsonObject {
  const out: Record<string, JsonValue> = {
    // One output stays the bare object a catalogue has always been written
    // with; several are written as a list (see schema/src/formula.ts).
    output: formula.outputs.length === 1 ? portJson(formula.outputs[0] as DraftPort) : formula.outputs.map(portJson),
    inputs: formula.inputs.map(portJson),
    expression: formula.expression,
    status: formula.status,
    description: localizedTextJson(formula.description),
  };
  if (formula.id.trim().length > 0) out['id'] = formula.id;
  const version = numberField(formula.version);
  if (version !== undefined) out['version'] = version;
  const label = localizedTextJson(formula.label);
  if (Object.keys(label).length > 0) out['label'] = label;
  if (formula.citation.trim().length > 0) out['citation'] = formula.citation;
  if (formula.variantOf.trim().length > 0) out['variantOf'] = formula.variantOf;
  if (formula.appliesWhen.trim().length > 0) out['appliesWhen'] = formula.appliesWhen;
  const quarantineReason = localizedTextJson(formula.quarantineReason);
  if (Object.keys(quarantineReason).length > 0) out['quarantineReason'] = quarantineReason;
  if (formula.lookupJson !== undefined) out['lookup'] = formula.lookupJson;
  return out;
}

function catalogueMetaJson(draft: DraftCatalogue): JsonObject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: draft.id,
    name: localizedTextJson(draft.name),
    restricted: draft.restricted,
    formulas: [],
  };
}

export function validateCatalogue(draft: DraftCatalogue): CatalogueValidation {
  const catalogueErrors: ValidationMessage[] = [];

  try {
    parseCatalogue(catalogueMetaJson(draft));
  } catch (error) {
    catalogueErrors.push({ message: describeError(error) });
  }

  const parsedFormulas: (Formula | undefined)[] = [];
  const formulaValidations: FormulaValidation[] = draft.formulas.map((formula, index) => {
    const errors: ValidationMessage[] = [];
    let parsed: Formula | undefined;
    try {
      parsed = parseFormula(formulaJson(formula), `formulas[${index}]`);
    } catch (error) {
      errors.push({ message: describeError(error) });
    }

    let quarantineNote: string | undefined;
    if (parsed !== undefined) {
      if (parsed.status === 'quarantined') {
        try {
          checkFormulaDimensions(parsed);
          quarantineNote = 'Dimensions check out — this quarantine may no longer be needed.';
        } catch {
          // Still broken, which is exactly what a quarantine is for.
        }
      } else {
        try {
          checkFormulaDimensions(parsed);
        } catch (error) {
          errors.push({ message: describeError(error) });
        }
      }
    }

    parsedFormulas.push(errors.length === 0 ? parsed : undefined);
    return {
      key: formula.key,
      errors,
      ...(quarantineNote === undefined ? {} : { quarantineNote }),
    };
  });

  for (const [index, formula] of parsedFormulas.entries()) {
    if (formula === undefined) continue;
    const seenBefore = parsedFormulas.slice(0, index).some((other) => other?.id === formula.id);
    if (seenBefore) {
      catalogueErrors.push({
        message: `formulas[${index}].id: '${formula.id}' appears twice in this catalogue`,
      });
    }
  }

  const ready = catalogueErrors.length === 0 && formulaValidations.every((f) => f.errors.length === 0);

  let catalogue: Catalogue | undefined;
  if (ready) {
    catalogue = {
      schemaVersion: SCHEMA_VERSION,
      id: draft.id,
      name: parseLocalizedText(localizedTextJson(draft.name), 'name'),
      restricted: draft.restricted,
      formulas: parsedFormulas.filter((formula): formula is Formula => formula !== undefined),
    };
  }

  return {
    catalogueErrors,
    formulas: formulaValidations,
    ...(catalogue === undefined ? {} : { catalogue }),
  };
}

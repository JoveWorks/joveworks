/**
 * Reading a published NodeBook back into the shapes its figures draw.
 *
 * The compiler writes an evaluated result out as presentation JSON — the same
 * object the kernel produced, minus everything the boundary forbids, with the
 * numbers JSON destroys encoded as strings (`schema/compiledNotebook.ts`).
 * This is the other end of that: revive the numbers, refuse anything that is
 * not a result the shared components can draw, and hand back the display
 * facts they need alongside it.
 *
 * Two refusals matter, and both are cheap here:
 *
 * - **An equation never draws.** The compiler does not emit `equation`
 *   outputs at all, so a payload carrying one did not come from a NodeBook
 *   this app published, and its expression is not going on screen.
 * - **A result of an unknown kind is unavailable**, not a crash. A reader
 *   opening a report written by a newer editor sees the results it can draw
 *   and a plain note where it cannot, rather than a blank page.
 */

import type { AxisReadout, OutputResult } from '@joveworks/kernel';
import {
  decodeCompiledNumber,
  type Candidate,
  type CompiledNotebook,
  type CompiledSlider,
  type JsonObject,
  type JsonValue,
} from '@joveworks/schema';

import type { AppLocale, ContourPalette } from '../model/editorSettings';
import { CONTOUR_PALETTES } from '../model/editorSettings';
import { toUnitsFormat, type NumberFormatSettings, type ThousandsStyle } from '../model/numberFormat';
import type { SliderReading } from './SliderControl';
import type { NotebookDisplay } from './display';

/** Every result kind the shared renderer draws. `equation` is deliberately absent. */
const DRAWABLE_KINDS: ReadonlySet<string> = new Set([
  'print', 'check', 'table', 'plot', 'feasibility', 'sensitivity',
  'stress', 'bestDesign', 'pareto', 'distribution', 'reliability',
]);

const THOUSANDS_STYLES: ReadonlySet<string> = new Set([
  'plain', 'comma-thousands', 'dot-thousands', 'space-thousands',
]);

const NOTATIONS: ReadonlySet<string> = new Set(['auto', 'fixed', 'scientific', 'engineering', 'si']);

/** Encoded numbers back to numbers, everywhere they appear, however deep. */
function revive(value: JsonValue): unknown {
  if (value === 'NaN' || value === '+Infinity' || value === '-Infinity') return decodeCompiledNumber(value);
  if (Array.isArray(value)) return value.map(revive);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
  }
  return value;
}

/**
 * A compiled result as the shared components take it, or `undefined` when it
 * is not something they can draw.
 *
 * The check is the discriminant and the fields every branch dereferences
 * without asking, not a field-by-field re-validation of the kernel's types:
 * this payload is a report the app itself compiled, and a deep schema here
 * would be a second copy of `@joveworks/kernel` to keep in step.
 */
export function decodeResult(result: JsonObject | undefined): OutputResult | undefined {
  if (result === undefined) return undefined;
  const kind = result.kind;
  if (typeof kind !== 'string' || !DRAWABLE_KINDS.has(kind)) return undefined;
  const revived = revive(result) as OutputResult;
  if (kind === 'table') return Array.isArray((revived as { columns?: unknown }).columns) ? revived : undefined;
  if (kind === 'print' || kind === 'check' || kind === 'plot') {
    const series = (revived as { series?: { data?: unknown } }).series;
    return Array.isArray(series?.data) ? revived : undefined;
  }
  return revived;
}

/** The axis coordinates a mark was pinned to, keyed the way the figures ask. */
export function decodeAxisReadouts(notebook: CompiledNotebook): ReadonlyMap<string, AxisReadout> {
  return new Map(notebook.axisReadouts.flatMap(({ id, readout }) => {
    const revived = revive(readout) as AxisReadout;
    return revived.coordinates === undefined ? [] : [[id, revived] as const];
  }));
}

/** The marks the report was published with. */
export function decodeMarks(notebook: CompiledNotebook): readonly Candidate[] {
  return notebook.marks.map((mark) => ({
    at: Object.fromEntries(Object.entries(mark).map(([id, value]) => [
      id,
      typeof value === 'string' && value !== 'NaN' && value !== '+Infinity' && value !== '-Infinity'
        ? value
        : decodeCompiledNumber(value),
    ])),
  }));
}

export function decodeSlider(slider: CompiledSlider): SliderReading {
  return {
    label: slider.label,
    value: decodeCompiledNumber(slider.value),
    min: decodeCompiledNumber(slider.min),
    max: decodeCompiledNumber(slider.max),
    // Compiled sliders carry the symbol they read in, not a convertible unit:
    // the value beside it is already in that unit, so nothing here converts.
    unit: { symbol: slider.unit, factor: 1, dimension: {} } as SliderReading['unit'],
    figures: slider.figures,
  };
}

/**
 * The settings the report was authored under, as the editor states them —
 * so re-evaluating a published NodeBook interactively keeps writing numbers
 * and drawing surfaces the way its author did.
 */
export function compiledDisplaySettings(notebook: CompiledNotebook): {
  readonly numberFormat: NumberFormatSettings;
  readonly contourPalette: ContourPalette;
  readonly titleMathRendering: boolean;
  readonly locale: AppLocale;
} {
  const { display } = notebook;
  return {
    numberFormat: {
      style: (THOUSANDS_STYLES.has(display.numberStyle) ? display.numberStyle : 'plain') as ThousandsStyle,
      notation: (NOTATIONS.has(display.numberNotation) ? display.numberNotation : 'si') as NumberFormatSettings['notation'],
    },
    contourPalette: (display.contourPalette in CONTOUR_PALETTES ? display.contourPalette : 'viridis') as ContourPalette,
    titleMathRendering: display.titleMath,
    locale: notebook.locale ?? 'en',
  };
}

/** Everything the shared figures need, read off the published report alone. */
export function compiledDisplay(notebook: CompiledNotebook): NotebookDisplay {
  const settings = compiledDisplaySettings(notebook);
  return {
    format: toUnitsFormat(settings.numberFormat),
    contourPalette: settings.contourPalette,
    titleMath: settings.titleMathRendering,
    locale: settings.locale,
    axes: notebook.axes,
    checkLabels: notebook.checkLabels,
  };
}

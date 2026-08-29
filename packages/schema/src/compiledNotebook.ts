import type { JsonObject, JsonValue } from './json.js';

/**
 * The compiled report is intentionally versioned independently of graph
 * documents.
 *
 * Carries everything the shared presentation components need to draw a
 * NodeBook exactly as its author saw it (ROADMAP item 38): the display
 * settings it was written under, how each swept axis was authored, and the
 * titles of the Check nodes composite results reference.
 */
export const COMPILED_NOTEBOOK_SCHEMA_VERSION = 1;

export type EncodedNumber = number | 'NaN' | '+Infinity' | '-Infinity';

export interface CompiledSlider {
  readonly id: string;
  readonly label: string;
  readonly value: EncodedNumber;
  readonly min: EncodedNumber;
  readonly max: EncodedNumber;
  readonly unit: string;
  readonly figures: number;
}

/**
 * How the author's editor was writing numbers and drawing surfaces. A report
 * reads the same on a reader's screen as it did on the author's, rather than
 * picking up whatever that reader happens to prefer.
 */
export interface CompiledDisplaySettings {
  readonly numberStyle: string;
  readonly numberNotation: string;
  readonly contourPalette: string;
  readonly titleMath: boolean;
}

/** How one swept axis was authored — all a figure needs of the range behind it. */
export interface CompiledAxisNature {
  readonly continuous: boolean;
  readonly logarithmic: boolean;
}

export interface CompiledOutput {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly caption?: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  /** Presentation data for the output kind. It never contains an equation expression. */
  readonly result?: JsonObject;
  /** Digits after the decimal point per table column, as the author set them. */
  readonly columnFigures?: Readonly<Record<string, number>>;
}

export interface CompiledSection {
  readonly id: string;
  readonly title: string;
  readonly prose?: string;
  readonly sliders: readonly CompiledSlider[];
  readonly outputs: readonly CompiledOutput[];
}

/**
 * One swept axis as the marks were resolved against it: the axis, its
 * coordinates and its unit, exactly as the kernel produced them. A published
 * NodeBook draws the marks it was published with, and matching a mark to a
 * cell needs the coordinates it was pinned to — a bare list of values is not
 * enough, because the match is per grid.
 */
export interface CompiledAxisReadout {
  readonly id: string;
  readonly readout: JsonObject;
}

export interface CompiledNotebook {
  readonly schemaVersion: typeof COMPILED_NOTEBOOK_SCHEMA_VERSION;
  readonly title: string;
  readonly author?: string;
  readonly locale?: 'en' | 'nl';
  readonly display: CompiledDisplaySettings;
  /** Swept axis id → how it was authored. */
  readonly axes: Readonly<Record<string, CompiledAxisNature>>;
  /** Check node id → its title, for the composite results that reference it. */
  readonly checkLabels: Readonly<Record<string, string>>;
  readonly sections: readonly CompiledSection[];
  readonly marks: readonly Readonly<Record<string, EncodedNumber | string>>[];
  readonly axisReadouts: readonly CompiledAxisReadout[];
}

export function encodeCompiledNumber(value: number): EncodedNumber {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Infinity';
  if (value === -Infinity) return '-Infinity';
  return value;
}

export function decodeCompiledNumber(value: EncodedNumber): number {
  if (value === 'NaN') return Number.NaN;
  if (value === '+Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  return value;
}

function object(value: JsonValue, name: string): Readonly<Record<string, JsonValue>> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`${name} must be an object`);
  return value;
}

function string(value: JsonValue | undefined, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function optionalString(value: JsonValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringMap(value: JsonValue | undefined): Readonly<Record<string, string>> {
  if (value === null || value === undefined || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'string' ? [[key, entry]] : [])));
}

function figuresMap(value: JsonValue | undefined): Readonly<Record<string, number>> {
  if (value === null || value === undefined || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'number' && Number.isInteger(entry) ? [[key, entry]] : [])));
}

function axisNatures(value: JsonValue | undefined): Readonly<Record<string, CompiledAxisNature>> {
  if (value === null || value === undefined || Array.isArray(value) || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== 'object') return [];
    return [[key, { continuous: entry.continuous === true, logarithmic: entry.logarithmic === true }] as const];
  }));
}

function displaySettings(value: JsonValue | undefined): CompiledDisplaySettings {
  const raw = value === null || value === undefined || Array.isArray(value) || typeof value !== 'object' ? {} : value;
  return {
    numberStyle: optionalString(raw.numberStyle, 'plain'),
    numberNotation: optionalString(raw.numberNotation, 'si'),
    contourPalette: optionalString(raw.contourPalette, 'viridis'),
    titleMath: raw.titleMath !== false,
  };
}

function encoded(value: JsonValue | undefined, name: string): EncodedNumber {
  if (typeof value === 'number' || value === 'NaN' || value === '+Infinity' || value === '-Infinity') return value;
  throw new Error(`${name} must be an encoded number`);
}

/** Validate untrusted Hub JSON without accepting graph-shaped data by accident. */
export function parseCompiledNotebook(value: JsonValue): CompiledNotebook {
  const root = object(value, 'compiled notebook');
  if (root.schemaVersion !== COMPILED_NOTEBOOK_SCHEMA_VERSION) throw new Error('unsupported compiled notebook version');
  if (!Array.isArray(root.sections) || !Array.isArray(root.marks) || !Array.isArray(root.axisReadouts)) throw new Error('compiled notebook arrays are missing');
  const sections = root.sections.map((raw, sectionIndex): CompiledSection => {
    const section = object(raw, `sections[${sectionIndex}]`);
    if (!Array.isArray(section.sliders) || !Array.isArray(section.outputs)) throw new Error('compiled section arrays are missing');
    return {
      id: string(section.id, 'section id'),
      title: string(section.title, 'section title'),
      ...(typeof section.prose === 'string' ? { prose: section.prose } : {}),
      sliders: section.sliders.map((rawSlider, sliderIndex) => {
        const slider = object(rawSlider, `sliders[${sliderIndex}]`);
        return {
          id: string(slider.id, 'slider id'), label: string(slider.label, 'slider label'),
          value: encoded(slider.value, 'slider value'), min: encoded(slider.min, 'slider min'),
          max: encoded(slider.max, 'slider max'), unit: string(slider.unit, 'slider unit'),
          figures: typeof slider.figures === 'number' && Number.isInteger(slider.figures) ? slider.figures : 3,
        };
      }),
      outputs: section.outputs.map((rawOutput, outputIndex) => {
        const output = object(rawOutput, `outputs[${outputIndex}]`);
        if (typeof output.available !== 'boolean') throw new Error('output availability must be boolean');
        const result = output.result === undefined ? undefined : object(output.result, 'output result') as JsonObject;
        return {
          id: string(output.id, 'output id'), kind: string(output.kind, 'output kind'),
          label: string(output.label, 'output label'), available: output.available,
          ...(typeof output.caption === 'string' ? { caption: output.caption } : {}),
          ...(typeof output.unavailableReason === 'string' ? { unavailableReason: output.unavailableReason } : {}),
          ...(result === undefined ? {} : { result }),
          ...(output.columnFigures === undefined ? {} : { columnFigures: figuresMap(output.columnFigures) }),
        };
      }),
    };
  });
  return {
    schemaVersion: COMPILED_NOTEBOOK_SCHEMA_VERSION,
    title: string(root.title, 'title'),
    ...(typeof root.author === 'string' ? { author: root.author } : {}),
    ...(root.locale === 'en' || root.locale === 'nl' ? { locale: root.locale } : {}),
    display: displaySettings(root.display),
    axes: axisNatures(root.axes),
    checkLabels: stringMap(root.checkLabels),
    sections,
    marks: root.marks.map((raw) => Object.fromEntries(Object.entries(object(raw, 'mark')).map(([key, coordinate]) => [key, typeof coordinate === 'string' && !['NaN', '+Infinity', '-Infinity'].includes(coordinate) ? coordinate : encoded(coordinate, 'mark coordinate')]))),
    axisReadouts: root.axisReadouts.map((raw) => {
      const axis = object(raw, 'axis readout');
      return { id: string(axis.id, 'axis id'), readout: object(axis.readout ?? null, 'axis readout data') as JsonObject };
    }),
  };
}

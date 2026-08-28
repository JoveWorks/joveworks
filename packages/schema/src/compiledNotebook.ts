import type { JsonObject, JsonValue } from './json.js';

/** The compiled report is intentionally versioned independently of graph documents. */
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

export interface CompiledOutput {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly caption?: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  /** Presentation data for the output kind. It never contains an equation expression. */
  readonly result?: JsonObject;
}

export interface CompiledSection {
  readonly id: string;
  readonly title: string;
  readonly prose?: string;
  readonly sliders: readonly CompiledSlider[];
  readonly outputs: readonly CompiledOutput[];
}

export interface CompiledAxisReadout {
  readonly id: string;
  readonly unit: string;
  readonly coordinates: readonly (EncodedNumber | string)[];
}

export interface CompiledNotebook {
  readonly schemaVersion: typeof COMPILED_NOTEBOOK_SCHEMA_VERSION;
  readonly title: string;
  readonly author?: string;
  readonly locale?: 'en' | 'nl';
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
        };
      }),
    };
  });
  return {
    schemaVersion: COMPILED_NOTEBOOK_SCHEMA_VERSION,
    title: string(root.title, 'title'),
    ...(typeof root.author === 'string' ? { author: root.author } : {}),
    ...(root.locale === 'en' || root.locale === 'nl' ? { locale: root.locale } : {}),
    sections,
    marks: root.marks.map((raw) => Object.fromEntries(Object.entries(object(raw, 'mark')).map(([key, coordinate]) => [key, typeof coordinate === 'string' && !['NaN', '+Infinity', '-Infinity'].includes(coordinate) ? coordinate : encoded(coordinate, 'mark coordinate')]))),
    axisReadouts: root.axisReadouts.map((raw) => {
      const axis = object(raw, 'axis readout');
      if (!Array.isArray(axis.coordinates)) throw new Error('axis coordinates must be an array');
      return { id: string(axis.id, 'axis id'), unit: string(axis.unit, 'axis unit'), coordinates: axis.coordinates.map((coordinate) => typeof coordinate === 'string' && !['NaN', '+Infinity', '-Infinity'].includes(coordinate) ? coordinate : encoded(coordinate, 'axis coordinate')) };
    }),
  };
}

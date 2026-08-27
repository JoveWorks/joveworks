/**
 * The bundled photography catalogue, end to end.
 *
 * The property tables are the reason this file exists: they are the first
 * records to answer with several outputs at once, so what is checked here is
 * that one dropdown really does drive every property of the thing picked, that
 * each arrives in its own unit, and that the numbers agree with each other
 * (megapixels against pixel counts, pitch against sensor width, diagonal
 * against width and height) rather than having been transcribed separately.
 *
 * Nothing here is R&M content — camera and lens specifications are the
 * manufacturers' own published figures.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkFormulaDimensions, evaluateDocument, valueAt } from '@joveworks/kernel';
import {
  DOCUMENT_SCHEMA_VERSION,
  formulaRef,
  loadCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Formula,
  type JsonObject,
  type NumericPort,
} from '@joveworks/schema';
import { fromCanonical } from '@joveworks/units';

const catalogue = loadCatalogue(
  readFileSync(new URL('../packages/editor/src/catalogues/photography.json', import.meta.url), 'utf8'),
);

function formula(id: string): Formula {
  const found = catalogue.formulas.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no photography formula '${id}'`);
  return found;
}

/** One node, one pick, read back in each output's own declared unit. */
function properties(id: string, port: string, choice: string): Readonly<Record<string, number>> {
  const record = formula(id);
  const document = parseDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'study',
    title: 'Study',
    nodes: [
      {
        kind: 'formula',
        id: 'spec',
        position: { x: 0, y: 0 },
        formula: serializeFormulaRef(formulaRef(record)),
        inputValues: { [port]: { kind: 'categorical', value: choice } },
      },
    ],
    edges: [],
    frames: [],
  } as JsonObject);

  const evaluation = evaluateDocument(document, [catalogue]);
  return Object.fromEntries(
    record.outputs.map((output) => {
      const value = valueAt(evaluation, 'spec', output.name);
      if (value?.kind !== 'numeric') throw new Error(`'${output.name}' produced no number`);
      return [output.name, fromCanonical(value.data[0] as number, (output as NumericPort).unit as never)];
    }),
  );
}

describe('the bundled photography catalogue', () => {
  it('is public, namespaced, and mechanically valid', () => {
    expect(catalogue.id).toBe('public-photography');
    expect(catalogue.restricted).toBe(false);
    for (const entry of catalogue.formulas) {
      expect(entry.id).toMatch(/^photography\./u);
      expect(() => checkFormulaDimensions(entry), entry.id).not.toThrow();
    }
  });

  it('answers with every property of the camera picked, each in its own unit', () => {
    const r6iii = properties('photography.camera.properties', 'camera', 'Canon EOS R6 Mark III');
    expect(r6iii['w']).toBeCloseTo(35.9, 9);
    expect(r6iii['h']).toBeCloseTo(23.9, 9);
    expect(r6iii['px']).toBe(6960);
    // Pitch is declared in µm while length is canonically mm, so a wrong
    // conversion here would be off by a factor of a thousand, not a rounding.
    expect(r6iii['p']).toBeCloseTo(5.16, 9);

    const crop = properties('photography.camera.properties', 'camera', 'Canon EOS 1200D');
    expect(crop['w']).toBeCloseTo(22.3, 9);
    expect(crop['MP']).toBeCloseTo(17.9, 9);
    expect(crop['p']).toBeCloseTo(4.3, 9);
  });

  it('keeps each camera’s figures consistent with one another', () => {
    const record = formula('photography.camera.properties');
    const models = (record.inputs[0] as { readonly domain: readonly string[] }).domain;
    for (const model of models) {
      const spec = properties('photography.camera.properties', 'camera', model);
      const { MP, w, h, d, p, px, py } = spec as Record<string, number>;
      expect((px * py) / 1e6, `${model} megapixels`).toBeCloseTo(MP, 1);
      expect((w / px) * 1000, `${model} pixel pitch`).toBeCloseTo(p, 2);
      expect(Math.hypot(w, h), `${model} diagonal`).toBeCloseTo(d, 2);
    }
  });

  it('reports a zoom’s aperture at both ends, and a constant-aperture zoom’s twice', () => {
    const variable = properties('photography.lens.properties', 'lens', 'Canon RF 100-500mm F4.5-7.1 L IS USM');
    expect(variable['f_min']).toBeCloseTo(100, 9);
    expect(variable['f_max']).toBeCloseTo(500, 9);
    expect(variable['N_wide']).toBeCloseTo(4.5, 9);
    expect(variable['N_tele']).toBeCloseTo(7.1, 9);
    expect(variable['d_min']).toBeCloseTo(0.9, 9);
    expect(variable['mass']).toBeCloseTo(1365, 6);

    const constant = properties('photography.lens.properties', 'lens', 'Canon RF 24-105mm F4 L IS USM');
    expect(constant['N_wide']).toBeCloseTo(4, 9);
    expect(constant['N_tele']).toBeCloseTo(4, 9);
  });

  it('shows a circle of confusion in µm, the scale the numbers actually live at', () => {
    const coc = formula('photography.dof.circle-of-confusion');
    expect((coc.outputs[0] as NumericPort).unit).toMatchObject({ symbol: 'µm' });
  });
});

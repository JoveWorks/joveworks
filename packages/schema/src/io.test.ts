import { describe, expect, it } from 'vitest';

import { SchemaError } from './errors.js';
import { formulaHash } from './formula.js';
import {
  catalogueFormatFromFileName,
  loadCatalogue,
  saveCatalogue,
} from './io.js';

const yaml = `
schemaVersion: 1
id: invented
name:
  en: Invented catalogue
restricted: false
formulas:
  - id: invented.product
    version: 1
    output:
      kind: numeric
      name: y
      unit: N
    inputs:
      - kind: numeric
        name: a
        unit: N
      - kind: numeric
        name: b
        unit: ""
    expression: a * b
    description:
      en: An invented product.
    status: unverified
`;

describe('catalogue text formats', () => {
  it('loads equivalent YAML and canonical JSON into the same catalogue record', () => {
    const fromYaml = loadCatalogue(yaml, 'yaml');
    const fromJson = loadCatalogue(saveCatalogue(fromYaml));

    expect(fromJson).toEqual(fromYaml);
    expect(formulaHash(fromJson.formulas[0]!)).toBe(formulaHash(fromYaml.formulas[0]!));
  });

  it('keeps strict JSON as the default rather than silently treating it as YAML', () => {
    expect(() => loadCatalogue(yaml)).toThrow(/not valid JSON/);
  });

  it('saves JSON by default, unchanged, for callers that do not ask for YAML', () => {
    const catalogue = loadCatalogue(yaml, 'yaml');

    expect(saveCatalogue(catalogue)).toBe(saveCatalogue(catalogue, 'json'));
    expect(() => JSON.parse(saveCatalogue(catalogue))).not.toThrow();
  });

  it('round-trips a catalogue through saved YAML, including repeated identical port shapes', () => {
    // Two formulas sharing the exact same port object reference (same output
    // shape, same input) is exactly the case `yaml`'s stringifier would
    // otherwise anchor/alias by default — the trap `saveCatalogue('yaml')`
    // must avoid, since the loader rejects any anchor. Reusing already-parsed
    // ports (rather than hand-built literals) keeps `unit` a real `Unit`
    // object, matching what a genuine catalogue record contains.
    const original = loadCatalogue(yaml, 'yaml');
    const sharedOutput = original.formulas[0]!.outputs[0]!;
    const sharedInput = original.formulas[0]!.inputs[0]!;
    const withRepeatedPorts = {
      ...original,
      formulas: [
        {
          ...original.formulas[0]!,
          id: 'invented.first',
          outputs: [sharedOutput],
          inputs: [sharedInput],
        },
        {
          ...original.formulas[0]!,
          id: 'invented.second',
          outputs: [sharedOutput],
          inputs: [sharedInput],
        },
      ],
    };

    const savedYaml = saveCatalogue(withRepeatedPorts, 'yaml');

    expect(savedYaml.endsWith('\n')).toBe(true);

    // `loadCatalogue` itself throws on any anchor (see the "rejects YAML
    // anchors" tests below), so a successful reload is proof the writer did
    // not fall back to `yaml`'s default aliasing behaviour for these
    // duplicate objects.
    const reloaded = loadCatalogue(savedYaml, 'yaml');
    expect(reloaded).toEqual(withRepeatedPorts);
  });

  it.each([
    ['catalogue.yaml', 'yaml'],
    ['catalogue.YML', 'yaml'],
    ['catalogue.json', 'json'],
    ['catalogue', 'json'],
  ] as const)('chooses %s as %s', (fileName, format) => {
    expect(catalogueFormatFromFileName(fileName)).toBe(format);
  });

  it('rejects duplicate YAML mapping keys', () => {
    expect(() => loadCatalogue(`${yaml}\nrestricted: true\n`, 'yaml')).toThrow(SchemaError);
  });

  it('rejects YAML aliases', () => {
    const withAlias = yaml.replace(
      'name:\n  en: Invented catalogue',
      'name: &catalogueName\n  en: Invented catalogue',
    ).replace('description:\n      en: An invented product.', 'description: *catalogueName');

    expect(() => loadCatalogue(withAlias, 'yaml')).toThrow(/anchor|alias/i);
  });

  it('rejects an unused YAML anchor too', () => {
    const withAnchor = yaml.replace('name:', 'name: &catalogueName');

    expect(() => loadCatalogue(withAnchor, 'yaml')).toThrow(/anchor/i);
  });

  it('rejects custom YAML tags', () => {
    expect(() => loadCatalogue(yaml.replace('id: invented', 'id: !course invented'), 'yaml')).toThrow(
      SchemaError,
    );
  });
});

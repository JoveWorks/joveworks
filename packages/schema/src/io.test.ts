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

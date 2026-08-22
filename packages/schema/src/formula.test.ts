import { describe, expect, it } from 'vitest';

/**
 * Every fixture here is invented. Reaching for a real R&M formula is the natural
 * move and the wrong one — the restriction is a repository boundary,
 * and `y = a*b + c` exercises a parser exactly as well while carrying nothing
 * anyone could copy.
 */

import {
  findFormula,
  formulaHash,
  formulaRef,
  isEvaluable,
  matchRef,
  parseCatalogue,
  parseFormula,
  ports,
  serializeCatalogue,
  serializeFormula,
  type Formula,
} from './formula.js';
import { localize } from './localization.js';
import { canonicalJson, type JsonObject } from './json.js';
import { SCHEMA_VERSION } from './version.js';

const product: JsonObject = {
  id: 'demo.product',
  version: 1,
  output: { kind: 'numeric', name: 'y', unit: 'N' },
  inputs: [
    { kind: 'numeric', name: 'a', unit: 'N', default: 10, validRange: { min: 0, max: 1000 } },
    { kind: 'numeric', name: 'b', unit: '' },
    { kind: 'numeric', name: 'c', unit: 'N' },
  ],
  expression: 'a*b + c',
  description: { en: 'An invented formula, used because a real one may not be redistributed.' },
  status: 'unverified',
};

const parse = (json: JsonObject = product) => parseFormula(json, 'formulas[0]');

describe('the formula record', () => {
  it('round-trips every field it carries', () => {
    const json: JsonObject = {
      ...product,
      citation: 'Invented 1.2B',
      variantOf: 'demo.product-relation',
      appliesWhen: 'b > 0',
      inputs: [
        {
          kind: 'numeric',
          name: 'a',
          unit: 'N',
          description: { en: 'the first factor' },
          default: 10,
          validRange: { min: 0, max: 1000 },
          monotonic: 'increasing',
        },
        { kind: 'categorical', name: 'grade', domain: ['soft', 'hard'], default: 'soft' },
        { kind: 'spectrum', name: 'c_i', unit: 'N' },
      ],
    };
    expect(serializeFormula(parse(json))).toEqual(json);
  });

  it('leaves the expression a string for the kernel to parse', () => {
    expect(parse().expression).toBe('a*b + c');
  });

  it('lists its ports output first', () => {
    expect(ports(parse()).map((port) => port.name)).toEqual(['y', 'a', 'b', 'c']);
  });

  it('rejects a port name declared twice', () => {
    const inputs = product['inputs'] as JsonObject[];
    const json = {
      ...product,
      inputs: [...inputs.slice(0, 2), { kind: 'numeric', name: 'a', unit: 'N' }],
    };
    expect(() => parse(json)).toThrow(/formulas\[0\]\.inputs\[2\]\.name: 'a' is declared twice/);
  });

  it('rejects an output that shadows an input name', () => {
    const json = { ...product, output: { kind: 'numeric', name: 'a', unit: 'N' } };
    expect(() => parse(json)).toThrow(/'a' is declared twice/);
  });

  it('rejects an empty expression', () => {
    expect(() => parse({ ...product, expression: '   ' })).toThrow(
      'formulas[0].expression: is empty',
    );
  });
});

describe('status and quarantine', () => {
  it('cannot be evaluated when quarantined', () => {
    const quarantined = parse({
      ...product,
      status: 'quarantined',
      quarantineReason: { en: 'unit tag [__O] could not be resolved' },
    });
    expect(isEvaluable(quarantined)).toBe(false);
    expect(isEvaluable(parse())).toBe(true);
    expect(isEvaluable(parse({ ...product, status: 'verified' }))).toBe(true);
  });

  it('insists on a reason, so quarantine is visible rather than silent', () => {
    expect(() => parse({ ...product, status: 'quarantined' })).toThrow(
      /quarantineReason: is required/,
    );
  });

  it('defaults to nothing — status is declared, never assumed', () => {
    const { status: _ignored, ...rest } = product;
    expect(() => parse(rest)).toThrow('formulas[0].status: is required');
  });
});

describe('references by id, version and hash', () => {
  it('does not embed the formula', () => {
    const ref = formulaRef(parse());
    expect(Object.keys(ref).sort()).toEqual(['hash', 'id', 'version']);
    expect(canonicalJson(ref as unknown as JsonObject)).not.toContain('a*b');
  });

  it('hashes the same record identically whatever order it was written in', () => {
    const shuffled: JsonObject = {
      status: product['status'] as string,
      description: product['description'] as JsonObject,
      expression: product['expression'] as string,
      inputs: product['inputs'] as JsonObject[],
      output: product['output'] as JsonObject,
      version: product['version'] as number,
      id: product['id'] as string,
    };
    expect(formulaHash(parse(shuffled))).toBe(formulaHash(parse()));
  });

  it('notices a changed expression, and tells it apart from a missing formula', () => {
    const formula = parse();
    const ref = formulaRef(formula);
    const edited: Formula = { ...formula, expression: 'a*b - c' };

    expect(matchRef(ref, formula)).toBe('match');
    expect(matchRef(ref, edited)).toBe('changed');
    expect(matchRef(ref, { ...formula, version: 2 })).toBe('changed');
    expect(matchRef(ref, undefined)).toBe('missing');
    expect(matchRef(ref, { ...formula, id: 'demo.other' })).toBe('missing');
  });

  it('memoizes the hash per formula object — a lookup formula’s table is not re-serialized on every call', () => {
    const formula = parse();
    const first = formulaHash(formula);
    // Real code never mutates a `Formula` in place — a changed catalogue is
    // always a fresh object — so this in-place edit exists only to prove the
    // second call below reads the cache rather than re-hashing: an
    // un-memoized `formulaHash` would notice this and return a different
    // string, exactly as `matchRef`'s own `edited` fixture above expects it
    // to for a genuinely new object.
    (formula as { expression: string }).expression = 'a*b - c';
    expect(formulaHash(formula)).toBe(first);
  });

  it('does not change a reference when only translated display text changes', () => {
    const formula = parse();
    const translated: Formula = {
      ...formula,
      description: { en: formula.description.en ?? '', nl: 'Een verzonnen formule.' },
    };
    expect(formulaHash(translated)).toBe(formulaHash(formula));
    expect(matchRef(formulaRef(formula), translated)).toBe('match');
  });
});

describe('localized text', () => {
  it('uses the selected language, then its base tag, then English', () => {
    const text = { en: 'Add', nl: 'Optellen', 'nl-BE': 'Optellen (BE)' };
    expect(localize(text, 'nl-BE')).toBe('Optellen (BE)');
    expect(localize(text, 'nl-NL')).toBe('Optellen');
    expect(localize(text, 'fr')).toBe('Add');
  });
});

describe('catalogues', () => {
  const catalogue: JsonObject = {
    schemaVersion: SCHEMA_VERSION,
    id: 'demo',
    name: { en: 'Invented demonstration formulas' },
    restricted: false,
    formulas: [product],
  };

  it('round-trips', () => {
    expect(serializeCatalogue(parseCatalogue(catalogue))).toEqual(catalogue);
  });

  it('finds a formula by id', () => {
    expect(findFormula(parseCatalogue(catalogue), 'demo.product')?.expression).toBe('a*b + c');
    expect(findFormula(parseCatalogue(catalogue), 'demo.missing')).toBeUndefined();
  });

  it('carries the restricted flag a catalogue needs', () => {
    expect(parseCatalogue({ ...catalogue, restricted: true }).restricted).toBe(true);
    const { restricted: _ignored, ...rest } = catalogue;
    expect(() => parseCatalogue(rest)).toThrow('restricted: is required');
  });

  it('rejects the same id twice', () => {
    expect(() => parseCatalogue({ ...catalogue, formulas: [product, product] })).toThrow(
      /formulas\[1\]\.id: 'demo.product' appears twice/,
    );
  });

  it('refuses a version it does not read, rather than guessing', () => {
    expect(() => parseCatalogue({ ...catalogue, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /schemaVersion: is 2, but this build reads version 1 only/,
    );
  });
});

describe('generic formulas', () => {
  const generic = (unit: string) => ({ kind: 'numeric', name: 'a', unit });

  it('accepts an output monomial built from the variables its inputs bind', () => {
    const formula = parseFormula(
      {
        id: 'multiply',
        version: 1,
        output: { kind: 'numeric', name: 'product', unit: '$A*$B' },
        inputs: [generic('$A'), { kind: 'numeric', name: 'b', unit: '$B' }],
        expression: 'a * b',
        description: 'Product.',
        status: 'unverified',
      },
      '',
    );
    expect(formula.output.kind).toBe('numeric');
    expect(serializeFormula(formula)['output']).toMatchObject({ unit: '$A*$B' });
  });

  it('rejects an output variable no input binds', () => {
    expect(() =>
      parseFormula(
        {
          id: 'nonsense',
          version: 1,
          output: { kind: 'numeric', name: 'out', unit: '$A*$B' },
          inputs: [generic('$A')],
          expression: 'a',
          description: 'Unbound.',
          status: 'unverified',
        },
        '',
      ),
    ).toThrow(/'\$B' is not bound by any input port/);
  });

  it('rejects a compound signature on an input', () => {
    expect(() =>
      parseFormula(
        {
          id: 'nonsense',
          version: 1,
          output: { kind: 'numeric', name: 'out', unit: '$A' },
          inputs: [generic('$A*$B')],
          expression: 'a',
          description: 'Unsolvable.',
          status: 'unverified',
        },
        '',
      ),
    ).toThrow(/not a bare variable/);
  });
});

describe('piecewise formulas', () => {
  const running: JsonObject = {
    id: 'demo.running-total',
    version: 1,
    output: { kind: 'numeric', name: 'y', unit: 'N' },
    inputs: [
      { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
      { kind: 'spectrum', name: 'position', unit: 'mm' },
      { kind: 'spectrum', name: 'value', unit: 'N' },
    ],
    expression: 'sum(value)',
    piecewise: { kind: 'cumulativeStep', axis: 'z', breakpoints: ['position'], values: ['value'] },
    description: { en: 'An invented running-total-vs-position formula.' },
    status: 'unverified',
  };

  it('round-trips the piecewise field', () => {
    expect(serializeFormula(parseFormula(running, ''))['piecewise']).toEqual(running['piecewise']);
  });

  it('rejects piecewise alongside lookup', () => {
    expect(() =>
      parseFormula(
        {
          ...running,
          lookup: { axes: [{ input: 'z', kind: 'numeric', values: [1] }], values: [1] },
        },
        '',
      ),
    ).toThrow(/cannot accompany a lookup/);
  });

  it("rejects an axis that isn't a concrete numeric input", () => {
    expect(() =>
      parseFormula(
        { ...running, piecewise: { ...(running['piecewise'] as JsonObject), axis: 'position' } },
        '',
      ),
    ).toThrow(/must be a declared input with a concrete numeric unit/);
  });

  it('rejects breakpoints whose dimension does not match the axis', () => {
    expect(() =>
      parseFormula(
        { ...running, piecewise: { ...(running['piecewise'] as JsonObject), breakpoints: ['value'] } },
        '',
      ),
    ).toThrow(/must share 'z''s dimension/);
  });

  it("rejects values whose dimension does not match the output's", () => {
    expect(() =>
      parseFormula(
        { ...running, piecewise: { ...(running['piecewise'] as JsonObject), values: ['position'] } },
        '',
      ),
    ).toThrow(/must share the output's dimension/);
  });

  it('rejects a piecewise output with no concrete unit', () => {
    expect(() =>
      parseFormula(
        { ...running, output: { kind: 'numeric', name: 'y', unit: '$A' }, inputs: [...(running['inputs'] as JsonObject[]), { kind: 'numeric', name: 'dummy', unit: '$A' }], expression: 'dummy' },
        '',
      ),
    ).toThrow(/needs a concrete numeric output/);
  });

  it('accepts a plain numeric port alongside a spectrum in the same breakpoints/values list', () => {
    const withExtra: JsonObject = {
      ...running,
      inputs: [
        ...(running['inputs'] as JsonObject[]),
        { kind: 'numeric', name: 'extraPosition', unit: 'mm', default: 0 },
        { kind: 'numeric', name: 'extraValue', unit: 'N', default: 0 },
      ],
      piecewise: { kind: 'cumulativeStep', axis: 'z', breakpoints: ['position', 'extraPosition'], values: ['value', 'extraValue'] },
    };
    expect(serializeFormula(parseFormula(withExtra, ''))['piecewise']).toEqual(withExtra['piecewise']);
  });

  it('rejects an empty breakpoints/values list', () => {
    expect(() =>
      parseFormula({ ...running, piecewise: { ...(running['piecewise'] as JsonObject), breakpoints: [] } }, ''),
    ).toThrow(/is empty/);
  });

  it('rejects a name in breakpoints/values that is not a declared input', () => {
    expect(() =>
      parseFormula({ ...running, piecewise: { ...(running['piecewise'] as JsonObject), values: ['nope'] } }, ''),
    ).toThrow(/'nope' must be a declared spectrum or numeric input/);
  });

  it('round-trips the cumulativeMoment kind', () => {
    // Nmm out, N in, mm axis: the output is `values`' dimension times `axis`'s.
    const moment: JsonObject = {
      ...running,
      output: { kind: 'numeric', name: 'y', unit: 'Nmm' },
      piecewise: { kind: 'cumulativeMoment', axis: 'z', breakpoints: ['position'], values: ['value'] },
    };
    expect(serializeFormula(parseFormula(moment, ''))['piecewise']).toEqual(moment['piecewise']);
  });

  it("rejects cumulativeMoment values whose dimension isn't the output's divided by the axis's", () => {
    expect(() =>
      parseFormula(
        {
          ...running,
          // Nmm output ÷ mm axis wants an N-dimensioned `values` port; `position`
          // is mm, not N.
          output: { kind: 'numeric', name: 'y', unit: 'Nmm' },
          piecewise: { kind: 'cumulativeMoment', axis: 'z', breakpoints: ['position'], values: ['position'] },
          expression: 'sum(position) * z',
        },
        '',
      ),
    ).toThrow(/must have the output's dimension divided by 'z''s/);
  });

  describe('distributed loads', () => {
    const distributed: JsonObject = {
      ...running,
      inputs: [
        ...(running['inputs'] as JsonObject[]),
        { kind: 'spectrum', name: 'start', unit: 'mm' },
        { kind: 'spectrum', name: 'end', unit: 'mm' },
        { kind: 'spectrum', name: 'rate', unit: 'N/mm' },
      ],
      piecewise: {
        kind: 'cumulativeStep', axis: 'z',
        breakpoints: ['position'], values: ['value'],
        distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'],
      },
    };

    it('round-trips distributedStart/End/Rate alongside breakpoints/values', () => {
      expect(serializeFormula(parseFormula(distributed, ''))['piecewise']).toEqual(distributed['piecewise']);
    });

    it('accepts a distributed load with no point breakpoints at all', () => {
      const onlyDistributed: JsonObject = {
        ...distributed,
        piecewise: {
          kind: 'cumulativeStep', axis: 'z',
          distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'],
        },
      };
      expect(serializeFormula(parseFormula(onlyDistributed, ''))['piecewise']).toEqual(onlyDistributed['piecewise']);
    });

    it('rejects a piecewise formula with neither breakpoints nor a distributed load', () => {
      expect(() =>
        parseFormula({ ...distributed, piecewise: { kind: 'cumulativeStep', axis: 'z' } }, ''),
      ).toThrow(/needs breakpoints\/values, distributedStart\/End\/Rate, or both/);
    });

    it('rejects breakpoints without a matching values (and vice versa)', () => {
      expect(() =>
        parseFormula(
          { ...distributed, piecewise: { kind: 'cumulativeStep', axis: 'z', breakpoints: ['position'] } },
          '',
        ),
      ).toThrow(/breakpoints and values must be declared together/);
    });

    it('rejects a partial distributed-load declaration', () => {
      expect(() =>
        parseFormula(
          {
            ...distributed,
            piecewise: {
              kind: 'cumulativeStep', axis: 'z',
              distributedStart: ['start'], distributedEnd: ['end'],
            },
          },
          '',
        ),
      ).toThrow(/distributedStart, distributedEnd and distributedRate must be declared together/);
    });

    it("rejects a distributedRate whose dimension isn't the output's per axis unit", () => {
      expect(() =>
        parseFormula(
          {
            ...distributed,
            piecewise: {
              kind: 'cumulativeStep', axis: 'z',
              distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['value'],
            },
          },
          '',
        ),
      ).toThrow(/must have the output's dimension divided by 'z''s/);
    });
  });
});

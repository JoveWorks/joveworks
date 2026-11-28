import { describe, expect, it } from 'vitest';

import { axes, parseDocument, serializeDocument } from './document.js';
import {
  isDomainNode,
  registerDomainEvaluator,
  registerDomainNode,
  registerDomainOutput,
  registerDomainPort,
} from './domain.js';
import { formulaHash, parseFormula, serializeFormula } from './formula.js';
import { fail, readInteger, readString, required, join, type JsonObject } from './json.js';
import { asOutputPort, parsePort } from './port.js';
import { DOCUMENT_SCHEMA_VERSION } from './version.js';

/*
 * The registry on its own, through an invented domain — a counter that steps
 * along an axis, and a `tally` evaluator — rather than the shafts, so the
 * test says what any domain gets and nothing about one in particular.
 */

registerDomainNode({
  domain: 'test',
  kind: 'testCounter',
  parse: (object, path) => ({
    steps: readInteger(required(object, 'steps', path), join(path, 'steps'), 1),
  }),
  serialize: (node: { readonly steps: number }) => ({ steps: node.steps }),
  introducesAxis: (node: { readonly steps: number }) => node.steps > 1,
});

registerDomainOutput({
  domain: 'test',
  kind: 'testGauge',
  parse: (object, path) => ({ colour: readString(required(object, 'colour', path), join(path, 'colour')) }),
  serialize: (output: { readonly colour: string }) => ({ colour: output.colour }),
});

registerDomainPort({
  domain: 'test',
  kind: 'testToken',
  parse: () => ({}),
  serialize: () => ({}),
  outputRefusal: 'a token is made by a counter only',
});

registerDomainEvaluator({
  domain: 'test',
  key: 'tally',
  noun: 'a tally',
  parse: (value, path) => {
    if (typeof value !== 'string') fail(path, 'must name an input');
    return value;
  },
  check: (input: string, ports, path) => {
    if (!(ports.inputs as readonly { readonly name: string }[]).some((port) => port.name === input)) {
      fail(join(path, 'tally'), `'${input}' is not a declared input`);
    }
  },
  serialize: (input: string) => input,
});

function documentWith(nodes: readonly JsonObject[]): JsonObject {
  return { schemaVersion: DOCUMENT_SCHEMA_VERSION, id: 'd', title: 'Domains', nodes: [...nodes], edges: [], frames: [] };
}

const counter: JsonObject = { kind: 'testCounter', id: 'c', position: { x: 0, y: 0 }, label: 'counter', steps: 3 };

describe('a domain node kind', () => {
  it('reads and writes its own fields beside the common ones', () => {
    const document = parseDocument(documentWith([counter]));
    const [node] = document.nodes;
    expect(node).toMatchObject({ kind: 'testCounter', id: 'c', label: 'counter', steps: 3 });
    expect(node !== undefined && isDomainNode(node)).toBe(true);
    expect(serializeDocument(document)['nodes']).toEqual([counter]);
  });

  it('is checked by its own reader', () => {
    expect(() => parseDocument(documentWith([{ ...counter, steps: 0 }]))).toThrow(/steps/);
  });

  it('introduces an axis when its definition says so', () => {
    expect(axes(parseDocument(documentWith([counter]))).map(({ id }) => id)).toEqual(['c']);
    expect(axes(parseDocument(documentWith([{ ...counter, steps: 1 }])))).toEqual([]);
  });

  it('leaves a kind nobody registered refused as unknown', () => {
    expect(() => parseDocument(documentWith([{ ...counter, kind: 'testUnregistered' }]))).toThrow(
      /'testUnregistered', a node kind this build of JoveWorks does not know/,
    );
  });
});

describe('a domain output kind', () => {
  it('reads and writes its own fields', () => {
    const output: JsonObject = {
      kind: 'output',
      id: 'o',
      position: { x: 200, y: 0 },
      output: { kind: 'testGauge', colour: 'teal' },
    };
    const document = parseDocument(documentWith([output]));
    expect(serializeDocument(document)['nodes']).toEqual([output]);
  });
});

describe('a domain port kind', () => {
  it('reads as an input with no unit', () => {
    expect(parsePort({ kind: 'testToken', name: 't' }, 'port')).toEqual({ kind: 'testToken', name: 't' });
  });

  it('is refused as a formula output, in its own words', () => {
    const port = parsePort({ kind: 'testToken', name: 't' }, 'port');
    expect(() => asOutputPort(port, 'output')).toThrow(/a token is made by a counter only/);
  });
});

describe('a domain evaluator', () => {
  const record: JsonObject = {
    id: 'demo.tally',
    version: 1,
    output: { kind: 'numeric', name: 'n', unit: '' },
    inputs: [{ kind: 'testToken', name: 't' }],
    tally: 't',
    description: 'How many tokens.',
    status: 'unverified',
  };

  it('answers for every output, so the record needs no expression', () => {
    const formula = parseFormula(record, 'formula');
    expect((formula as unknown as Record<string, unknown>)['tally']).toBe('t');
    expect(serializeFormula(formula)['tally']).toBe('t');
  });

  it('is part of the hash', () => {
    expect(formulaHash(parseFormula(record, 'formula'))).not.toBe(
      formulaHash(parseFormula({ ...record, inputs: [...(record['inputs'] as JsonObject[]), { kind: 'testToken', name: 'u' }], tally: 'u' }, 'formula')),
    );
  });

  it('is checked against the formula’s ports', () => {
    expect(() => parseFormula({ ...record, tally: 'missing' }, 'formula')).toThrow(/'missing' is not a declared input/);
  });

  it('stands alone: no expression beside it', () => {
    expect(() => parseFormula({ ...record, expression: '1' }, 'formula')).toThrow(/has no meaning beside a tally/);
  });
});

describe('who owns a kind', () => {
  const definition = { kind: 'testOwned', parse: () => ({}), serialize: () => ({}) };

  it('lets the domain that owns a kind register it again', () => {
    registerDomainNode({ ...definition, domain: 'test' });
    expect(() => registerDomainNode({ ...definition, domain: 'test' })).not.toThrow();
  });

  it('refuses a second domain the same kind, naming both', () => {
    registerDomainNode({ ...definition, domain: 'test' });
    expect(() => registerDomainNode({ ...definition, domain: 'copy' })).toThrow(
      /'testOwned' is a node kind of both the 'test' and the 'copy' domains/,
    );
  });

  it("refuses a domain one of JoveWorks' own kinds", () => {
    expect(() => registerDomainNode({ ...definition, kind: 'formula', domain: 'test' })).toThrow(/already one of JoveWorks' own node kinds/);
    expect(() => registerDomainPort({ kind: 'numeric', domain: 'test', parse: () => ({}), serialize: () => ({}), outputRefusal: '' })).toThrow(
      /own port kinds/,
    );
    expect(() =>
      registerDomainEvaluator({ key: 'lookup', noun: 'x', domain: 'test', parse: () => 1, check: () => undefined, serialize: () => 1 }),
    ).toThrow(/own formula evaluators/);
  });
});

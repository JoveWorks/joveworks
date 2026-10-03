/**
 * The Jupyter compiler, read as the Python it writes.
 *
 * Every formula here is invented (`y = a*b + c`), per AGENTS.md. Whether the
 * Python *runs* and reproduces the kernel's numbers is checked by executing a
 * compiled notebook, which a Vitest run cannot do; what is pinned here is the
 * shape of the translation and the two promises the file header makes — a
 * restricted catalogue is named, and whatever is not translated is carried
 * over rather than dropped.
 */

import { describe, expect, it } from 'vitest';

import {
  CATALOGUE_SCHEMA_VERSION,
  DOCUMENT_SCHEMA_VERSION,
  formulaRef,
  parseCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type GraphDocument,
  type JsonObject,
} from '@joveworks/schema';

import { analyse } from './analysis';
import { baseCatalogue } from './catalogues';
import { compileJupyter, jupyterText, type JupyterExport } from './jupyter';

const port = (name: string, unit: string, extra: JsonObject = {}): JsonObject => ({
  kind: 'numeric',
  name,
  unit,
  description: `the ${name} of it`,
  ...extra,
});

const invented: Catalogue = parseCatalogue({
  schemaVersion: CATALOGUE_SCHEMA_VERSION,
  id: 'invented',
  name: 'Invented course pack',
  restricted: true,
  formulas: [
    {
      id: 'inv.1',
      version: 1,
      output: port('y', 'mm'),
      inputs: [port('a', 'mm'), port('b', ''), port('c', 'mm', { default: 5 })],
      expression: 'a*b + c',
      description: 'An invented length',
      citation: 'INV 1.1',
      status: 'verified',
    },
    {
      id: 'inv.2',
      version: 1,
      output: [port('p', 'mm2'), port('q', 'mm')],
      inputs: [port('lambda', 'mm')],
      expression: { p: 'lambda**2', q: 'p / lambda + sqrt(p) - round(1/2)' },
      description: 'Two invented answers',
      citation: 'INV 1.2',
      status: 'unverified',
    },
    {
      id: 'inv.table',
      version: 1,
      output: port('k', ''),
      inputs: [port('size', 'mm')],
      lookup: { axes: [{ input: 'size', kind: 'numeric', values: [10, 20, 40] }], values: [1, 2, 3] },
      description: 'An invented table',
      citation: 'INV T1',
      status: 'verified',
    },
  ],
});

const CATALOGUES = [baseCatalogue(), invented];

const ref = (id: string): JsonObject => {
  const formula = CATALOGUES.flatMap((catalogue) => catalogue.formulas).find((candidate) => candidate.id === id);
  if (formula === undefined) throw new Error(`no formula ${id}`);
  return serializeFormulaRef(formulaRef(formula));
};

const at = (y: number): JsonObject => ({ x: 0, y });
const wire = (from: string, to: string): JsonObject => {
  const [fromNode, fromPort] = from.split('.');
  const [toNode, toPort] = to.split('.');
  return { id: `${from}->${to}`, from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } };
};

function compile(nodes: readonly JsonObject[], edges: readonly JsonObject[], frames: readonly JsonObject[] = []): JupyterExport {
  const document: GraphDocument = parseDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'graph',
    title: 'Invented study',
    nodes: [...nodes],
    edges: [...edges],
    frames: [...frames],
  });
  return compileJupyter(document, analyse(document, CATALOGUES), { generatedOn: '2026-10-03' });
}

const python = (result: JupyterExport): string =>
  result.notebook.cells.filter((cell) => cell.cell_type === 'code').map((cell) => cell.source.join('')).join('\n\n');

const study = (): JupyterExport =>
  compile(
    [
      { kind: 'input', id: 'a', position: at(0), frameId: 'one', label: 'a', value: { kind: 'linear', start: 20, stop: 60, points: 5, unit: 'mm' } },
      { kind: 'input', id: 'b', position: at(200), frameId: 'one', label: 'load factor', value: { kind: 'list', values: [1, 2], unit: '' } },
      { kind: 'formula', id: 'f', position: at(400), frameId: 'one', formula: ref('inv.1') },
      { kind: 'formula', id: 'half', position: at(600), frameId: 'two', formula: ref('base.math.half') },
      { kind: 'output', id: 'shown', position: at(800), frameId: 'two', label: 'Half of it', output: { kind: 'print', unit: 'm' } },
      { kind: 'output', id: 'ok', position: at(1000), frameId: 'two', output: { kind: 'check', comparison: '<=', threshold: { value: 60, unit: '' } } },
      { kind: 'output', id: 'drawn', position: at(1200), frameId: 'two', output: { kind: 'plot' }, caption: 'It rises.' },
      { kind: 'output', id: 'rows', position: at(1400), frameId: 'two', output: { kind: 'table', columns: ['c0', 'c1'] } },
    ],
    [
      wire('a.value', 'f.a'),
      wire('b.value', 'f.b'),
      wire('f.y', 'half.a'),
      wire('half.halved', 'shown.value'),
      wire('half.halved', 'ok.value'),
      wire('half.halved', 'drawn.value'),
      wire('a.value', 'rows.c0'),
      wire('half.halved', 'rows.c1'),
    ],
    [
      { id: 'two', title: 'Results', position: at(500), size: { width: 10, height: 10 } },
      { id: 'one', title: 'Givens', note: 'What we start from.', position: at(0), size: { width: 10, height: 10 } },
    ],
  );

describe('compiling a graph to a Jupyter notebook', () => {
  it('writes a cited formula symbolically, MechDesign style, and evaluates it with its wires', () => {
    const code = python(study());
    expect(code).toContain('import MechDesign.Helpers as HM');
    expect(code).toContain('# INV 1.1 — An invented length');
    expect(code).toContain('sym = symbols(a="[mm] the a of it", b="[] the b of it", c="[mm] the c of it", y="[mm] the y of it")');
    expect(code).toContain('y_eq = sym.a*sym.b + sym.c');
    expect(code).toContain('HM.EqPrint("y", y_eq)');
    // An input is called what the port it feeds calls it; unwired `c` takes the catalogue's default.
    expect(code).toContain('y = evaluate(y_eq, sym, a=a, b=b, c=5*mm_)');
  });

  it('gives each swept input its own array axis, in the unit it was typed in', () => {
    const code = python(study());
    expect(code).toContain('GRID = [5, 2] ');
    expect(code).toContain('a = sweep(np.linspace(20, 60, 5), 0)*mm_');
    expect(code).toContain('b = sweep([1, 2], 1)  # load factor');
    expect(code).toContain('mm_ = Unit(1, "mm")');
    expect(code).toContain('m_ = Unit(1000, "m")');
  });

  it('writes an uncited base node as the plain arithmetic it is', () => {
    expect(python(study())).toContain('halved = y/2');
  });

  it('translates print, check, plot and table outputs, reading a bare threshold in the shown unit', () => {
    const code = python(study());
    expect(code).toContain('show("Half of it", halved, m_)');
    expect(code).toContain('check("halved", halved, "<=", 60*mm_, mm_)');
    expect(code).toContain("for j, c in enumerate(along(b, 1)):");
    expect(code).toContain('ax.plot(along(a, 0)/mm_, along(halved/mm_, 0, 1)[:, j], label=f\'load factor = {c}\')');
    expect(code).toContain('"a (mm)": a/mm_,');
  });

  it('follows the NodeBook: sections in frame order, prose and captions as markdown, inputs before first use', () => {
    const { notebook } = study();
    const outline = notebook.cells.map((cell) => `${cell.cell_type}:${cell.source[0]?.trim()}`);
    const givens = outline.indexOf('markdown:## Givens');
    const results = outline.indexOf('markdown:## Results');
    // "Results" is the first frame, so it leads — and pulls in the inputs it needs.
    expect(results).toBeGreaterThan(0);
    expect(givens).toBeGreaterThan(results);
    expect(outline.indexOf('code:a = sweep(np.linspace(20, 60, 5), 0)*mm_')).toBeGreaterThan(results);
    expect(outline).toContain('markdown:It rises.');
    expect(notebook.cells[givens]?.source.join('')).toContain('What we start from.');
    expect(notebook.cells[0]?.source.join('')).toContain('# Invented study');
  });

  it('names every restricted catalogue whose expressions the notebook contains, and says so inside it', () => {
    const result = study();
    expect(result.restricted).toEqual(['Invented course pack']);
    expect(result.notebook.cells[0]?.source.join('')).toContain('**Restricted content.**');
    expect(python(result)).toContain('# Restricted content');
    const open = compile(
      [
        { kind: 'input', id: 'a', position: at(0), value: { kind: 'scalar', value: 3, unit: 'mm' } },
        { kind: 'formula', id: 'twice', position: at(200), formula: ref('base.math.double') },
      ],
      [wire('a.value', 'twice.a')],
    );
    expect(open.restricted).toEqual([]);
    expect(jupyterText(open.notebook)).not.toContain('Restricted');
  });

  it('lets a later output of one formula name an earlier one, and survives a port Python cannot spell', () => {
    const code = python(
      compile(
        [
          { kind: 'input', id: 'l', position: at(0), value: { kind: 'scalar', value: 4, unit: 'mm' } },
          { kind: 'formula', id: 'two', position: at(200), formula: ref('inv.2') },
        ],
        [wire('l.value', 'two.lambda')],
      ),
    );
    expect(code).toContain('p_eq = getattr(sym, "lambda")**2');
    // An integer ratio stays exact, and `round` keeps JavaScript's half-up rule.
    expect(code).toContain('q_eq = sym.p/getattr(sym, "lambda") + sp.sqrt(sym.p) - sp.floor(sp.Rational(1, 2) + 0.5)');
    expect(code).toContain('p = evaluate(p_eq, sym, **{"lambda": lambda_2})');
    expect(code).toContain('q = evaluate(q_eq, sym, **{"lambda": lambda_2, "p": p})');
    expect(code).toContain('# No golden value exercises this formula yet.');
  });

  it('carries a table lookup over as the value the kernel computed instead of re-implementing it', () => {
    const result = compile(
      [
        { kind: 'input', id: 's', position: at(0), value: { kind: 'scalar', value: 15, unit: 'mm' } },
        { kind: 'formula', id: 'look', position: at(200), formula: ref('inv.table') },
        { kind: 'output', id: 'out', position: at(400), output: { kind: 'print' } },
      ],
      [wire('s.value', 'look.size'), wire('look.k', 'out.value')],
    );
    expect(result.carried).toEqual(['INV T1']);
    expect(python(result)).toContain('# INV T1 — a catalogue table lookup; carried over from JoveWorks as a value.\nk = 2');
    expect(result.notebook.cells[0]?.source.join('')).toContain('**Carried over as values:** INV T1');
    // The table's own cells stay in the catalogue.
    expect(result.restricted).toEqual([]);
  });

  it('writes a variadic reduction out over its wires, and a student equation in plain NumPy', () => {
    const code = python(
      compile(
        [
          { kind: 'input', id: 'u', position: at(0), label: 'u', value: { kind: 'scalar', value: 3, unit: 'N' } },
          { kind: 'input', id: 'v', position: at(100), label: 'v', value: { kind: 'scalar', value: 4, unit: 'N' } },
          { kind: 'formula', id: 'least', position: at(200), formula: ref('base.math.minimum') },
          { kind: 'closure', id: 'own', position: at(300), label: 'r', expression: 'sqrt(m**2 + n**2) * 2[kN]' },
          { kind: 'output', id: 'eq', position: at(400), output: { kind: 'equation' } },
          { kind: 'closure', id: 'shown', position: at(500), expression: 'g / 2' },
        ],
        [
          wire('u.value', 'least.a'),
          wire('v.value', 'least.a'),
          wire('u.value', 'own.m'),
          wire('least.smallest', 'own.n'),
          wire('own.result', 'shown.g'),
          wire('shown.result', 'eq.value'),
        ],
      ),
    );
    expect(code).toContain('smallest = np.minimum(u, v)');
    expect(code).toContain('r = np.sqrt(u**2 + smallest**2)*(2*kN_)');
    // Wired to an equation output, so this one is built symbolically after all.
    expect(code).toContain('result_eq = sym.g/2');
    expect(code.trim().endsWith('HM.EqPrint("result", result_eq)')).toBe(true);
  });

  it('is a well-formed nbformat 4.5 file', () => {
    const notebook = JSON.parse(jupyterText(study().notebook)) as { nbformat: number; cells: { id: string; cell_type: string; outputs?: unknown[] }[] };
    expect(notebook.nbformat).toBe(4);
    expect(new Set(notebook.cells.map((cell) => cell.id)).size).toBe(notebook.cells.length);
    for (const cell of notebook.cells) expect(cell.cell_type === 'code' ? cell.outputs : undefined).toEqual(cell.cell_type === 'code' ? [] : undefined);
  });
});

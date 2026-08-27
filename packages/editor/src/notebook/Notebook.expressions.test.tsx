/**
 * The print/export path's single most important rule (OVERVIEW.md,
 * "Exporting"): the NodeBook shows citations and numbers by default, never a
 * formula's own expression, unless a student explicitly drops an `equation`
 * output node to reveal one. Every other output kind renders through the
 * same `Result` function (`Notebook.tsx`), so that is the seam to prove it
 * from — not a CSS assertion (untestable) but the actual rendered markup.
 *
 * Uses a closure node's invented expression (`a*b + c`), never a real R&M
 * one, per AGENTS.md.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, VALUE_PORT, type GraphDocument, type OutputNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { GraphContext, type GraphContextValue } from '../graph-context';
import { SettingsContext, type SettingsContextValue } from '../settings-context';
import { analyse } from '../model/analysis';
import { DEFAULT_NUMBER_FORMAT_SETTINGS } from '../model/numberFormat';
import { Result } from './Notebook';

const scalar = (id: string, value: number) => ({
  kind: 'input' as const,
  id,
  position: { x: 0, y: 0 },
  value: { kind: 'scalar' as const, value, unit: parseUnit('') },
});

const wire = (from: readonly [string, string], to: readonly [string, string]) => ({
  id: `${from[0]}.${from[1]}->${to[0]}.${to[1]}`,
  from: { node: from[0], port: from[1] },
  to: { node: to[0], port: to[1] },
});

// One closure feeding both a 'print' output (the default, numbers-only view)
// and an 'equation' output (the opt-in escape hatch) — same underlying
// formula, so any difference in what shows is purely the output kind's doing.
const document: GraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'expr-hidden',
  title: 'Expressions hidden by default',
  nodes: [
    scalar('a', 2),
    scalar('b', 3),
    scalar('c', 1),
    { kind: 'closure', id: 'eq', position: { x: 0, y: 0 }, expression: 'a*b + c' },
    { kind: 'output', id: 'printOut', position: { x: 0, y: 0 }, output: { kind: 'print' } },
    { kind: 'output', id: 'equationOut', position: { x: 0, y: 0 }, output: { kind: 'equation' } },
  ],
  edges: [
    wire(['a', 'value'], ['eq', 'a']),
    wire(['b', 'value'], ['eq', 'b']),
    wire(['c', 'value'], ['eq', 'c']),
    wire(['eq', 'result'], ['printOut', VALUE_PORT]),
    wire(['eq', 'result'], ['equationOut', VALUE_PORT]),
  ],
  frames: [],
};

const analysis = analyse(document, []);
const outputs = analysis.evaluation?.outputs ?? [];
const printResult = outputs.find((entry) => entry.nodeId === 'printOut');
const equationResult = outputs.find((entry) => entry.nodeId === 'equationOut');

const printNode = document.nodes.find((node): node is OutputNode => node.id === 'printOut')!;
const equationNode = document.nodes.find((node): node is OutputNode => node.id === 'equationOut')!;

// Everything `Result` can reach through context but does not exercise in a
// static render — filled with inert stand-ins so the real `GraphContextValue`
// and `SettingsContextValue` shapes stay honest rather than casting past them.
const graphContext: GraphContextValue = {
  document,
  catalogues: [],
  lockedCatalogues: [],
  unlockCatalogue: async () => {},
  userEquations: [],
  saveUserEquation: () => {},
  removeUserEquation: () => {},
  analysis,
  edit: () => {},
  editLive: () => {},
  commitEdit: () => {},
  expanded: new Set(),
  toggleExpanded: () => {},
  collapsedGroups: new Set(),
  toggleGroupCollapsed: () => {},
  selected: new Set(),
  setSelected: () => {},
  hovered: new Set(),
  setHovered: () => {},
  hoveredCandidate: undefined,
  setHoveredCandidate: () => {},
  marqueeActive: false,
  setMarqueeActive: () => {},
  monteCarloPlayback: { revealed: 0, playing: false },
  toggleMonteCarloPlayback: () => {},
  stepMonteCarloPlayback: () => {},
  resetMonteCarloPlayback: () => {},
};

const settingsContext: SettingsContextValue = {
  locale: 'en',
  setLocale: () => {},
  numberFormat: DEFAULT_NUMBER_FORMAT_SETTINGS,
  setNumberFormat: () => {},
  minimapVisible: false,
  setMinimapVisible: () => {},
  snapToGrid: false,
  setSnapToGrid: () => {},
  titleMathRendering: false,
  setTitleMathRendering: () => {},
  themePreference: 'system',
  setThemePreference: () => {},
  contourPalette: 'viridis',
  setContourPalette: () => {},
  advancedNodesEnabled: false,
  setAdvancedNodesEnabled: () => {},
};

function renderResult(result: NonNullable<typeof printResult>, node: OutputNode): string {
  return renderToStaticMarkup(
    <GraphContext.Provider value={graphContext}>
      <SettingsContext.Provider value={settingsContext}>
        <Result result={result} node={node} />
      </SettingsContext.Provider>
    </GraphContext.Provider>,
  );
}

describe('expressions hidden by default', () => {
  it('renders the equation output as typeset math, the one opt-in escape hatch', () => {
    expect(equationResult).toBeDefined();
    const html = renderResult(equationResult!, equationNode);
    // `Equation.tsx` wraps KaTeX's markup in exactly this class.
    expect(html).toContain('class="equation"');
  });

  it('never exposes the katex/equation renderer from a plain value output over the same formula', () => {
    expect(printResult).toBeDefined();
    const html = renderResult(printResult!, printNode);
    expect(html).not.toContain('class="equation"');
    expect(html).not.toContain('katex');
    // The number is still there — it's the expression that's withheld, not the result.
    expect(html).toContain('7'); // 2*3 + 1
  });
});

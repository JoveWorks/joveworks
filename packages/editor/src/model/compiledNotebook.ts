import {
  COMPILED_NOTEBOOK_SCHEMA_VERSION,
  DEFAULT_SLIDER_FIGURES,
  encodeCompiledNumber,
  type CompiledNotebook,
  type CompiledOutput,
  type CompiledSection,
  type GraphDocument,
  type JsonObject,
  type JsonValue,
  type OutputNode,
} from '@joveworks/schema';
import type { OutputResult } from '@joveworks/kernel';

import type { NotebookDisplay } from '../present/display';
import type { Analysis } from './analysis';
import { exposedSlidersFor, notebookSectionId, readingOrder } from './notebook';

const OMITTED_RESULT_KEYS = new Set(['expression', 'citation', 'catalogue', 'catalogues', 'edges', 'position', 'layout']);

/** Convert runtime data to JSON while preserving values JSON normally destroys. */
function presentationJson(value: unknown): JsonValue | undefined {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
  if (typeof value === 'number') return encodeCompiledNumber(value);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((entry) => presentationJson(entry) ?? null);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, entry]) => [String(key), presentationJson(entry) ?? null]));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      if (OMITTED_RESULT_KEYS.has(key)) return [];
      const encoded = presentationJson(entry);
      return encoded === undefined ? [] : [[key, encoded]];
    }));
  }
  return undefined;
}

function outputNodes(document: GraphDocument, frameId: string | undefined): readonly OutputNode[] {
  return document.nodes
    .filter((node): node is OutputNode => node.kind === 'output' && node.output.kind !== 'equation' && notebookSectionId(document, node) === frameId)
    .slice()
    .sort(readingOrder);
}

/** Check node ids a composite result names, so only those labels are published. */
function referencedChecks(result: OutputResult): readonly string[] {
  if (result.kind === 'feasibility' || result.kind === 'stress' || result.kind === 'bestDesign') return result.checks;
  if (result.kind === 'reliability') return result.checks.map(({ checkId }) => checkId);
  return [];
}

function compiledOutput(node: OutputNode, result: OutputResult | undefined): CompiledOutput {
  if (result === undefined) {
    return {
      id: node.id,
      kind: node.output.kind,
      label: node.label ?? node.id,
      ...(node.caption === undefined ? {} : { caption: node.caption }),
      available: false,
      unavailableReason: 'This result is not available yet.',
    };
  }
  const encoded = presentationJson(result);
  return {
    id: node.id,
    kind: result.kind,
    label: node.label ?? result.label ?? node.id,
    ...(node.caption === undefined ? {} : { caption: node.caption }),
    available: true,
    result: encoded as JsonObject,
    ...(node.output.kind === 'table' && node.output.figures !== undefined
      ? { columnFigures: node.output.figures }
      : {}),
  };
}

/**
 * Compile evaluated editor state into a report with no source graph or
 * catalogue content.
 *
 * The presentation components draw from an `OutputResult` plus a handful of
 * display facts they cannot read off one (`present/display.ts`). Both are
 * resolved here, so a published NodeBook draws through exactly the components
 * the editor draws through — and still carries no graph, no expression, no
 * catalogue and no editing state. `display` is what the author saw: a report
 * keeps its own number format and palette rather than picking up its reader's.
 */
export function compileNotebook(
  document: GraphDocument,
  analysis: Analysis,
  display: NotebookDisplay,
): CompiledNotebook {
  const results = new Map((analysis.evaluation?.outputs ?? []).map((result) => [result.nodeId, result] as const));
  const section = (id: string, title: string, prose: string | undefined, nodes: readonly OutputNode[]): CompiledSection => ({
    id,
    title,
    ...(prose === undefined ? {} : { prose }),
    sliders: exposedSlidersFor(document, nodes.map((node) => node.id)).map((node) => ({
      id: node.id,
      label: node.label ?? node.axisLabel ?? node.id,
      value: encodeCompiledNumber(node.value.value),
      min: encodeCompiledNumber(node.value.min),
      max: encodeCompiledNumber(node.value.max),
      unit: node.value.unit.symbol,
      figures: node.value.figures ?? DEFAULT_SLIDER_FIGURES,
    })),
    outputs: nodes.map((node) => compiledOutput(node, results.get(node.id))),
  });
  const unframed = outputNodes(document, undefined);
  const sections = [
    ...document.frames.filter((frame) => frame.kind !== 'group').map((frame) => section(frame.id, frame.title, frame.note, outputNodes(document, frame.id))).filter((entry) => entry.outputs.length > 0),
    ...(unframed.length === 0 ? [] : [section('__unframed', 'Results', undefined, unframed)]),
  ];
  // Only the checks a published result actually names — a reader has no use
  // for the titles of nodes that never reach the report, and the boundary is
  // narrower for keeping them out.
  const published = new Set(sections.flatMap((entry) => entry.outputs.map((output) => output.id)));
  const checkLabels = Object.fromEntries(
    [...results.values()]
      .filter((result) => published.has(result.nodeId))
      .flatMap(referencedChecks)
      .map((id) => [id, display.checkLabels[id] ?? id] as const),
  );
  return {
    schemaVersion: COMPILED_NOTEBOOK_SCHEMA_VERSION,
    title: document.title,
    ...(document.author === undefined ? {} : { author: document.author }),
    ...(document.notebookLocale === undefined ? {} : { locale: document.notebookLocale }),
    display: {
      numberStyle: display.format.thousands === ',' ? 'comma-thousands'
        : display.format.thousands === '.' ? 'dot-thousands'
          : display.format.thousands === ' ' ? 'space-thousands' : 'plain',
      numberNotation: display.format.notation,
      contourPalette: display.contourPalette,
      titleMath: display.titleMath,
    },
    axes: display.axes,
    checkLabels,
    sections,
    marks: (document.marks ?? []).map((mark) => Object.fromEntries(Object.entries(mark.at).map(([id, value]) => [id, typeof value === 'number' ? encodeCompiledNumber(value) : value]))),
    axisReadouts: [...(analysis.evaluation?.axisReadouts ?? new Map())].map(([id, readout]) => ({
      id,
      readout: presentationJson(readout) as JsonObject,
    })),
  };
}

export function compiledNotebookIsComplete(notebook: CompiledNotebook): boolean {
  return notebook.sections.some((section) => section.outputs.length > 0)
    && notebook.sections.every((section) => section.outputs.every((output) => output.available));
}

export function compiledNotebookBytes(notebook: CompiledNotebook): number {
  return new TextEncoder().encode(JSON.stringify(notebook)).byteLength;
}

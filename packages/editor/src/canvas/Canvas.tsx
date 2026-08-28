/**
 * The canvas: React Flow drawing the document, and the kernel deciding what may
 * be wired.
 *
 * The division of labour is the whole point of this file:
 *
 * - **`typesConnect` while a wire is being dragged.** Cheap, local, and
 *   explicitly not the authority — it greys out what obviously cannot attach.
 * - **`canConnect` when the wire is dropped.** It resolves the entire graph with
 *   the candidate edge added, so the editor cannot let through something the
 *   kernel would later refuse. A refusal is shown in the kernel's own words.
 *
 * React Flow holds no state of its own here: it is handed a projection of the
 * document and hands back intentions, which become document edits. Selection is
 * the one exception — it is a property of looking at a graph, not of the graph.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react';

import { adaptInputUnit, canConnect, isVariadicTarget, resolveGraph, selectPortNames, statisticPortNames, typesConnect } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import {
  ALONG_PORT,
  AT_PORT,
  axes as documentAxes,
  CLOSURE_RESULT_PORT,
  hasUnit,
  localize,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  THRESHOLD_PORT,
  VALUE_PORT,
  VERDICT_PORT,
  type Edge,
  type Catalogue,
  type Formula,
  type GraphDocument,
  type GraphNode,
  type NodeKind,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { phrase, type AppLocale } from '../i18n';
import {
  addNamedColumn,
  addPlotMeasure,
  addNode,
  connect,
  duplicateNode,
  duplicateSelection,
  edgeId,
  frameDescendantIds,
  groupIntoGroup,
  groupIntoSection,
  moveNode,
  moveFrameContents,
  NEW_COLUMN,
  NEW_PLOT_MEASURE,
  nodeLabel,
  reframe,
  removeEdges,
  removeNodes,
  uniqueId,
  updateFrame,
} from '../model/document';
import { GAP as CANVAS_GRID_SIZE } from '../model/layout-constants';
import { autoArrange } from '../model/layout';
import type { NodeSizes } from '../model/node-sizes';
import { primaryModifierLabel } from '../model/platform';
import { fuzzySearch } from '../model/fuzzy';
import { alignSelection, arrangeSelection, spaceSelectionEvenly } from '../model/selection-layout';
import {
  collapsedGroupForNode,
  collapsedGroupSize,
  groupPortHandle,
  groupPorts,
  hiddenByCollapsedGroups,
} from '../model/collapsedGroups';
import { BundleEdge } from './BundleEdge';
import { CanvasFind } from './CanvasFind';
import { ClosureNodeView } from './ClosureNodeView';
import { CompareNodeView } from './CompareNodeView';
import { connectResolvingTableColumn } from './connect';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { FileNodeView } from './FileNodeView';
import { FormulaNodeView } from './FormulaNodeView';
import { FrameView } from './FrameView';
import { InputNodeView } from './InputNodeView';
import { MonteCarloGeneratorNodeView } from './MonteCarloGeneratorNodeView';
import { RangeNodeView } from './RangeNodeView';
import { StatisticNodeView } from './StatisticNodeView';
import { MonteCarloReceiverNodeView } from './MonteCarloReceiverNodeView';
import type { CanvasNodeData, HoveredCanvasPort } from './node-data';
import { OutputNodeView } from './OutputNodeView';
import { PackNodeView } from './PackNodeView';
import { QuickAddMenu, type ExistingCandidate } from './QuickAddMenu';
import { SelectNodeView } from './SelectNodeView';
import {
  quickAddChoicePort,
  quickAddNodeSpec,
  type QuickAddCandidate,
  type QuickAddChoice,
} from './quickAdd';
import { UnpackNodeView } from './UnpackNodeView';
import { WaypointNodeView } from './WaypointNodeView';
import { basePortName, slotHandleId } from './portSlots';

/**
 * Whatever is already wired into `node.port`, by label — undefined if it is
 * free. A target port normally takes one edge (a variadic port's many-slot
 * exception does not apply to any port `existingCandidates` below offers,
 * which are always a formula's or output's *first* ordinary input), so
 * picking a candidate with something already here silently replaces it —
 * exactly the trap a reported quick-add bug turned out to be: an uncited base
 * formula's subtitle (its bare id, "multiply") reads identically to what a
 * *fresh* instance of that formula would show, so a click meant as "give me
 * a new node" can land on "rewire this existing one instead" with nothing
 * on screen to say a wire just got displaced three nodes downstream.
 */
function occupantOf(
  document: GraphDocument,
  formulas: ReadonlyMap<string, Formula>,
  node: { readonly node: string; readonly port: string },
): string | undefined {
  const edge = document.edges.find((entry) => entry.to.node === node.node && entry.to.port === node.port);
  if (edge === undefined) return undefined;
  const source = document.nodes.find((entry) => entry.id === edge.from.node);
  if (source === undefined) return undefined;
  if (source.kind === 'formula') {
    const formula = formulas.get(source.id);
    // Name the port the wire actually leaves from, which on a multi-output
    // node is the only thing that tells two of its wires apart.
    return formula === undefined ? nodeLabel(source) : `${nodeLabel(source)} (${edge.from.port})`;
  }
  return nodeLabel(source);
}

/** `exactOptionalPropertyTypes` wants the key absent, not present as `undefined`. */
function replacesField(occupant: string | undefined): { readonly replaces?: string } {
  return occupant === undefined ? {} : { replaces: occupant };
}

function searchTitle(node: GraphNode, formulas: ReadonlyMap<string, Formula>, locale: AppLocale): string {
  if (node.kind !== 'formula') return nodeLabel(node);
  const formula = formulas.get(node.id);
  if (node.label !== undefined) return node.label;
  if (formula?.label !== undefined) return localize(formula.label, locale);
  return formula?.citation ?? formula?.id ?? node.id;
}

function searchPorts(document: GraphDocument, formulas: ReadonlyMap<string, Formula>, node: GraphNode): readonly string[] {
  if (node.kind === 'input') return [VALUE_PORT];
  if (node.kind === 'file') return node.fields.map((field) => field.name);
  if (node.kind === 'formula') {
    const formula = formulas.get(node.id);
    return formula === undefined ? [] : [...formula.inputs, ...formula.outputs].map((port) => port.name);
  }
  if (node.kind === 'output') {
    const valuePorts =
      node.output.kind === 'table'
        ? node.output.columns
        : node.output.kind === 'bestDesign'
          ? [OBJECTIVE_PORT]
          : node.output.kind === 'pareto'
            ? [X_PORT, Y_PORT]
            : node.output.kind === 'feasibility' || node.output.kind === 'reliability'
              ? []
              : [VALUE_PORT];
    return node.output.kind === 'plot' || node.output.kind === 'check'
      ? [...valuePorts, THRESHOLD_PORT]
      : valuePorts;
  }
  if (node.kind === 'compare') return [VALUE_PORT, THRESHOLD_PORT, VERDICT_PORT];
  if (node.kind === 'select') {
    const { inputs, outputs } = selectPortNames(node);
    return [...inputs, ...outputs];
  }
  if (node.kind === 'statistic') {
    const { inputs, outputs } = statisticPortNames(node);
    return [...inputs, ...outputs];
  }
  if (node.kind === 'closure') {
    const formula = formulas.get(node.id);
    return formula === undefined ? [CLOSURE_RESULT_PORT] : [...formula.inputs, ...formula.outputs].map((port) => port.name);
  }
  if (node.kind === 'pack') {
    const inputs = document.edges
      .filter((edge) => edge.to.node === node.id)
      .map((edge) => edge.to.port);
    return [...inputs, 'bundle'];
  }
  if (node.kind === 'unpack') {
    const outputs = document.edges
      .filter((edge) => edge.from.node === node.id)
      .map((edge) => edge.from.port);
    return ['bundle', ...outputs];
  }
  const waypointInputs = document.edges
    .filter((edge) => edge.to.node === node.id)
    .map((edge) => edge.to.port);
  const waypointOutputs = document.edges
    .filter((edge) => edge.from.node === node.id)
    .map((edge) => edge.from.port);
  return [...waypointInputs, ...waypointOutputs];
}

function nodeClasses(classes: readonly (string | undefined)[]): string | undefined {
  const joined = classes.filter((value) => value !== undefined).join(' ');
  return joined.length === 0 ? undefined : joined;
}

/**
 * Every already-placed node with a port fitting the drag's direction —
 * QuickAddMenu.tsx's "find one already on the canvas" list. `from.type`
 * names the *dragged* endpoint's own kind, so a dragged source needs a
 * candidate with a free target port, and vice versa (mirrors `pickQuickAdd`
 * below, which wires a fresh node the same way).
 */
function existingCandidates(
  document: GraphDocument,
  formulas: ReadonlyMap<string, Formula>,
  from: { readonly nodeId: string; readonly type: 'source' | 'target' },
): readonly ExistingCandidate[] {
  const candidates: ExistingCandidate[] = [];
  for (const node of document.nodes) {
    if (node.id === from.nodeId) continue;

    if (from.type === 'source') {
      if (node.kind === 'formula') {
        const formula = formulas.get(node.id);
        const port = formula?.inputs[0]?.name;
        if (formula === undefined || port === undefined) continue;
        candidates.push({
          nodeId: node.id,
          label: nodeLabel(node),
          subtitle: formula.citation ?? formula.id,
          port,
          ...replacesField(occupantOf(document, formulas, { node: node.id, port })),
        });
      } else if (node.kind === 'output') {
        // A table's several named ports have no single obvious one to
        // land on — offer its ghost slot instead (NEW_COLUMN), the same
        // "wire it and the column names itself" a direct drag onto the
        // node gets (OutputNodeView.tsx). A ghost slot is never occupied —
        // that is what makes it a ghost slot — so `replaces` stays unset.
        const port =
          node.output.kind === 'table'
            ? NEW_COLUMN
            : node.output.kind === 'plot'
              ? NEW_PLOT_MEASURE
            : node.output.kind === 'bestDesign'
              ? OBJECTIVE_PORT
              : // `x` first, then `y` — a Pareto node is the one output that
                // wants two wires, and offering `x` again once it is taken
                // would make the second one look like a replacement.
                node.output.kind === 'pareto'
                ? occupantOf(document, formulas, { node: node.id, port: X_PORT }) === undefined
                  ? X_PORT
                  : Y_PORT
                : node.output.kind === 'feasibility' || node.output.kind === 'reliability'
                  ? undefined
                  : VALUE_PORT;
        if (port === undefined) continue;
        candidates.push({
          nodeId: node.id,
          label: nodeLabel(node),
          subtitle: node.output.kind,
          port,
          ...(port === NEW_COLUMN || port === NEW_PLOT_MEASURE
            ? {}
            : replacesField(occupantOf(document, formulas, { node: node.id, port }))),
        });
      } else if (node.kind === 'compare') {
        candidates.push({
          nodeId: node.id,
          label: nodeLabel(node),
          subtitle: 'compare',
          port: VALUE_PORT,
          ...replacesField(occupantOf(document, formulas, { node: node.id, port: VALUE_PORT })),
        });
      } else if (node.kind === 'select') {
        // Both required inputs are offered, because they are not
        // interchangeable: `value` is what is searched, `along` is what the
        // answer is expressed in, and a student dragging a swept range means
        // the second one.
        for (const port of [VALUE_PORT, ALONG_PORT]) {
          candidates.push({
            nodeId: node.id,
            label: nodeLabel(node),
            subtitle: `${node.mode} (${port})`,
            port,
            ...replacesField(occupantOf(document, formulas, { node: node.id, port })),
          });
        }
      } else if (node.kind === 'statistic') {
        for (const port of [VALUE_PORT, ALONG_PORT]) {
          candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: `${node.statistic} (${port})`, port, ...replacesField(occupantOf(document, formulas, { node: node.id, port })) });
        }
      }
      continue;
    }

    if (node.kind === 'input') {
      candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: 'input', port: VALUE_PORT });
    } else if (node.kind === 'file') {
      // Each field is its own thing to wire from, the same way a formula
      // answering with several properties offers one candidate per output.
      for (const field of node.fields) {
        candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: field.name, port: field.name });
      }
    } else if (node.kind === 'formula') {
      const formula = formulas.get(node.id);
      if (formula === undefined) continue;
      // Each output is its own thing to wire from, so a node answering with
      // several offers a choice per property rather than only its first.
      for (const port of formula.outputs) {
        candidates.push({
          nodeId: node.id,
          label: formula.outputs.length === 1 ? nodeLabel(node) : `${nodeLabel(node)} (${port.name})`,
          subtitle: formula.citation ?? formula.id,
          port: port.name,
        });
      }
    } else if (node.kind === 'compare') {
      candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: 'compare', port: VERDICT_PORT });
    } else if (node.kind === 'select') {
      for (const port of selectPortNames(node).outputs) {
        candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: `${node.mode} (${port})`, port });
      }
    } else if (node.kind === 'statistic') {
      candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: node.statistic, port: 'result' });
    }
  }
  return candidates;
}

type MenuTarget =
  | { readonly kind: 'node'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'selection'; readonly x: number; readonly y: number }
  | { readonly kind: 'edge'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'frame'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'pane'; readonly x: number; readonly y: number };

/** Only graph nodes make a selection something that can become a section. */
export function selectedNodeCount(document: GraphDocument, selected: ReadonlySet<string>): number {
  return document.nodes.filter((node) => selected.has(node.id)).length;
}

/** The empty-canvas action says whether it will create or group a section. */
export function sectionActionLabel(document: GraphDocument, selected: ReadonlySet<string>): string {
  return selectedNodeCount(document, selected) === 0 ? 'Add new section' : 'Group into new section';
}

/** A multi-node selection is its own context, never the node under the cursor. */
export function nodeContextMenuKind(
  document: GraphDocument,
  selected: ReadonlySet<string>,
): 'node' | 'selection' {
  return selectedNodeCount(document, selected) > 1 ? 'selection' : 'node';
}

interface QuickAddTarget {
  readonly x: number;
  readonly y: number;
  readonly from: { readonly nodeId: string; readonly port: string; readonly type: 'source' | 'target' };
}

/**
 * Resolve a prospective Quick Add node through the kernel and return the port
 * that makes the dragged edge valid. Dynamic routing ports are deliberately
 * tested as real edges: their existence and type come from the edge itself.
 */
export function compatibleQuickAddPort(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  target: QuickAddTarget,
  choice: QuickAddCandidate,
): string | undefined {
  const id = uniqueId(document, '__quick_add__');
  const position = { x: 0, y: 0 };
  const spec = quickAddNodeSpec(document, choice);
  const node = spec.make(id, position);
  const ports = spec.ports[target.from.type];

  for (const port of ports) {
    let next = addNode(document, node);
    const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
    let freshEndpoint = { node: id, port };
    if (port === NEW_COLUMN) {
      const named = addNamedColumn(next, id, target.from.port);
      next = named.document;
      freshEndpoint = { node: id, port: named.column };
    } else if (port === NEW_PLOT_MEASURE) {
      const named = addPlotMeasure(next, id, target.from.port);
      next = named.document;
      freshEndpoint = { node: id, port: named.measure.id };
    }
    const [from, to] = target.from.type === 'source'
      ? [dragEndpoint, freshEndpoint]
      : [freshEndpoint, dragEndpoint];
    const candidate: Edge = { id: edgeId(from, to), from, to };

    // A fresh Input adopts the unit of the port it is being created for, as
    // it does on an ordinary direct connection.
    if (choice.kind === 'input') {
      const targetUnit = resolveGraph(next, catalogues).targets.get(`${to.node}.${to.port}`)?.unit;
      const adapted = targetUnit === undefined ? undefined : adaptInputUnit(next, candidate, targetUnit);
      if (adapted !== undefined && canConnect(adapted, catalogues, candidate).ok) return port;
    }
    if (canConnect(next, catalogues, candidate).ok) return port;
  }
  return undefined;
}

type Measurements = NodeSizes;

/**
 * A node's measured size, as a property to spread — absent rather than
 * `undefined` when it has not been drawn yet, which is what
 * `exactOptionalPropertyTypes` asks for and what React Flow reads as "not
 * measured".
 */
function sizeOf(measured: Measurements, id: string): { measured?: { width: number; height: number } } {
  const size = measured.get(id);
  return size === undefined ? {} : { measured: size };
}

/**
 * A document supplies positions but ordinary nodes intentionally do not
 * persist their DOM dimensions. This conservative envelope is therefore the
 * reliable viewport target while a replacement graph is still being measured.
 */
export function documentBounds(document: GraphDocument): { x: number; y: number; width: number; height: number } {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const include = (x: number, y: number, width: number, height: number): void => {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  };
  // 300 × 240 deliberately contains every collapsed node kind. A little extra
  // space is preferable to fitting an unloaded example to a stale node list.
  for (const node of document.nodes) include(node.position.x, node.position.y, 300, 240);
  for (const frame of document.frames) include(frame.position.x, frame.position.y, frame.size.width, frame.size.height);
  return left === Infinity ? { x: 0, y: 0, width: 1, height: 1 } : { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Apply React Flow's live geometry reports without making them document edits.
 * The returned document is a Canvas-only preview: the kernel must never see it
 * until the gesture ends, otherwise a single drag asks it to re-evaluate the
 * whole study for every pointer event.
 */
export function previewLayoutChanges(
  document: GraphDocument,
  changes: readonly NodeChange[],
  collapsedGroups: ReadonlySet<string>,
  snapToGrid: boolean,
): GraphDocument {
  const frameIds = new Set(document.frames.map((frame) => frame.id));
  const resizing = new Set(
    changes
      .filter((change) => change.type === 'dimensions')
      .filter((change) => frameIds.has(change.id) && !collapsedGroups.has(change.id))
      .map((change) => change.id),
  );
  const carriedFrames = new Set<string>();
  const carriedNodes = new Set<string>();
  for (const change of changes) {
    if (
      change.type !== 'position' ||
      change.position === undefined ||
      !frameIds.has(change.id) ||
      resizing.has(change.id)
    ) continue;
    const descendants = frameDescendantIds(document, change.id);
    for (const descendant of descendants) if (descendant !== change.id) carriedFrames.add(descendant);
    for (const node of document.nodes) {
      if (node.frameId !== undefined && descendants.has(node.frameId)) carriedNodes.add(node.id);
    }
  }
  const gridSnap = (value: number): number => Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
  let next = document;
  for (const change of changes) {
    if (change.type === 'position' && change.position !== undefined) {
      if (carriedFrames.has(change.id) || carriedNodes.has(change.id)) continue;
      const position =
        frameIds.has(change.id) && resizing.has(change.id) && snapToGrid
          ? { x: gridSnap(change.position.x), y: gridSnap(change.position.y) }
          : change.position;
      if (frameIds.has(change.id)) {
        const before = next.frames.find((frame) => frame.id === change.id);
        next = updateFrame(next, change.id, (frame) => ({ ...frame, position }));
        if (before !== undefined && !resizing.has(change.id)) {
          const dx = position.x - before.position.x;
          const dy = position.y - before.position.y;
          if (dx !== 0 || dy !== 0) next = moveFrameContents(next, change.id, dx, dy);
        }
      } else {
        next = moveNode(next, change.id, position);
      }
    }
    if (
      change.type === 'dimensions' &&
      change.dimensions !== undefined &&
      frameIds.has(change.id) &&
      !collapsedGroups.has(change.id)
    ) {
      const dimensions = snapToGrid
        ? { width: gridSnap(change.dimensions.width), height: gridSnap(change.dimensions.height) }
        : change.dimensions;
      next = updateFrame(next, change.id, (frame) => ({
        ...frame,
        size: dimensions as { width: number; height: number },
      }));
    }
  }
  return next;
}

/**
 * React Flow reserves `input`/`output`/`default`/`group` as its own built-in
 * node types, each with its own default box styling in its base stylesheet —
 * a border, fixed width, centred text. Two of our node kinds are spelled the
 * same, so registering them under those names didn't just choose our
 * component, it also picked up React Flow's own CSS for a node type we never
 * asked for, wrapped around our own `.node` styling underneath (an extra box
 * `formula`/`compare` never had, since neither name collides). Prefixed here
 * so the type string is ours alone; `node.kind` in the document is untouched.
 */
function flowType(kind: NodeKind): string {
  return kind === 'input' || kind === 'output' ? `joveworks-${kind}` : kind;
}

const NODE_TYPES = {
  'joveworks-input': InputNodeView,
  range: RangeNodeView,
  file: FileNodeView,
  formula: FormulaNodeView,
  'joveworks-output': OutputNodeView,
  compare: CompareNodeView,
  select: SelectNodeView,
  statistic: StatisticNodeView,
  closure: ClosureNodeView,
  waypoint: WaypointNodeView,
  pack: PackNodeView,
  unpack: UnpackNodeView,
  monteCarloGenerator: MonteCarloGeneratorNodeView,
  monteCarloReceiver: MonteCarloReceiverNodeView,
  frame: FrameView,
};

const EDGE_TYPES = { bundle: BundleEdge };
const SNAP_GRID: [number, number] = [CANVAS_GRID_SIZE, CANVAS_GRID_SIZE];

export function Canvas({
  controlsVisible,
  tutorialActive = false,
}: {
  readonly controlsVisible: boolean;
  readonly tutorialActive?: boolean;
}): ReactElement {
  const {
    document,
    catalogues,
    analysis,
    edit,
    editLive,
    commitEdit,
    expanded,
    toggleExpanded,
    collapsedGroups,
    toggleGroupCollapsed,
    selected,
    setSelected,
    setMarqueeActive,
    saveUserEquation,
  } = useGraph();
  const { locale, minimapVisible, snapToGrid, setSnapToGrid, themePreference } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const modifierKey = primaryModifierLabel();
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  // A rejected unit connection is a momentary interaction state, never part of
  // the graph. Keeping its endpoints here lets the canvas identify *which* two
  // nodes the message describes without turning dimensions into a colour scheme.
  const [rejectedUnitConnection, setRejectedUnitConnection] = useState<Edge | undefined>(undefined);
  const [menu, setMenu] = useState<MenuTarget | undefined>(undefined);
  const [quickAdd, setQuickAdd] = useState<QuickAddTarget | undefined>(undefined);
  // Edge hover is a view concern, like selection. Keeping its id here lets the
  // projection accent both the wire and precisely its two endpoint nodes
  // without recording anything in the graph document.
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>(undefined);
  const [hoveredPort, setHoveredPort] = useState<HoveredCanvasPort | undefined>(undefined);
  const [findQuery, setFindQuery] = useState<string | undefined>(undefined);
  const flow = useReactFlow();
  const clipboard = useRef<{ document: GraphDocument; selected: ReadonlySet<string> } | undefined>(
    undefined,
  );
  const cursor = useRef<{ readonly x: number; readonly y: number } | undefined>(undefined);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        setSelected(() => new Set(document.nodes.map((node) => node.id)));
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        setFindQuery((current) => current ?? '');
        return;
      }
      if (key === 'c') {
        if (!document.nodes.some((node) => selected.has(node.id))) return;
        event.preventDefault();
        clipboard.current = { document, selected: new Set(selected) };
        return;
      }
      if (key !== 'v' && key !== 'd') return;

      const source = key === 'v' ? clipboard.current : { document, selected };
      if (source === undefined) return;
      const pasteAt = key === 'v' && cursor.current !== undefined
        ? flow.screenToFlowPosition(cursor.current)
        : undefined;
      const duplicated = duplicateSelection(
        document,
        source.document,
        source.selected,
        key === 'd',
        pasteAt,
      );
      if (duplicated.ids.size === 0) return;
      event.preventDefault();
      edit(() => duplicated.document);
      setSelected(() => duplicated.ids);
      if (key === 'v') {
        clipboard.current = { document: duplicated.document, selected: duplicated.ids };
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, edit, flow, selected, setSelected]);

  /**
   * How big each node turned out to be, once drawn.
   *
   * React Flow measures a node in the DOM and reports the result back as a
   * `dimensions` change; until it has one it draws the node `visibility:
   * hidden`, because it cannot place an edge or fit a view around something of
   * unknown size. This component rebuilds its projection from the document on
   * every render, so a measurement that is not kept is discarded immediately
   * and every node stays invisible for ever.
   *
   * It is kept *here* rather than in the document because a node's size is a
   * fact about this rendering of the graph, not about the graph — the same
   * reason selection is local. This map always holds whatever is on screen
   * right now, selection-forced growth (NodeShell.tsx opens a selected node)
   * included, which is exactly what React Flow itself needs.
   */
  const [measured, setMeasured] = useState<Measurements>(new Map());
  const fittedDocumentId = useRef<string | undefined>(undefined);
  // Measurements belong to React Flow's rendered node set. Do not carry sizes
  // from a prior study into the replacement projection.
  useLayoutEffect(() => {
    setMeasured(new Map());
  }, [document.id]);
  useEffect(() => {
    if (fittedDocumentId.current === document.id) return;
    fittedDocumentId.current = document.id;
    const frame = requestAnimationFrame(() => {
      void flow.fitBounds(documentBounds(document), { padding: 0.2, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [document, flow]);
  // React Flow needs live positions while a node is moving, but the graph
  // document (and therefore the kernel) only needs the position at rest.
  // Keep the latter out of this high-frequency path.
  const [layoutPreview, setLayoutPreview] = useState<GraphDocument | undefined>(undefined);
  const layoutPreviewRef = useRef<GraphDocument | undefined>(undefined);
  /**
   * Each node's last-seen size while *not* selected — its resting state,
   * collapsed by default or however large a pin (`expanded`) keeps it, but
   * never the taller box selection alone forces open. `alignSelection` and
   * `spaceSelectionEvenly` only ever run on the current selection, so
   * `measured` for every node they touch is mid-command inflated by that
   * very selection; sizing the command off it would bake the transient
   * expand into node positions that are supposed to be stable once deselected.
   */
  const [restingMeasured, setRestingMeasured] = useState<Measurements>(new Map());

  const commitLayoutPreview = useCallback((): void => {
    const preview = layoutPreviewRef.current;
    if (preview === undefined) return;
    layoutPreviewRef.current = undefined;
    setLayoutPreview(undefined);
    // One discrete edit means one undo step and one analysis/evaluation pass.
    edit(() => reframe(preview));
  }, [edit]);

  const renderedDocument = layoutPreview ?? document;

  const edgeEndpointIds = useMemo(() => {
    const edge = document.edges.find((candidate) => candidate.id === hoveredEdgeId);
    return edge === undefined ? new Set<string>() : new Set([edge.from.node, edge.to.node]);
  }, [document.edges, hoveredEdgeId]);

  const rejectedEndpointIds = useMemo(() => {
    if (rejectedUnitConnection === undefined) return new Set<string>();
    return new Set([rejectedUnitConnection.from.node, rejectedUnitConnection.to.node]);
  }, [rejectedUnitConnection]);

  const hoveredPortEdges = useMemo(
    () =>
      hoveredPort === undefined
        ? []
        : document.edges.filter(
            (edge) =>
              (edge.from.node === hoveredPort.nodeId && edge.from.port === hoveredPort.port) ||
              (edge.to.node === hoveredPort.nodeId && edge.to.port === hoveredPort.port),
          ),
    [document.edges, hoveredPort],
  );

  const matchedNodeIds = useMemo(() => {
    if (findQuery === undefined || findQuery.trim().length === 0) return new Set<string>();
    const searchable = document.nodes.map((node) => ({
      id: node.id,
      text: [searchTitle(node, analysis.formulas, locale), node.id, ...searchPorts(document, analysis.formulas, node)].join(' '),
    }));
    return new Set(fuzzySearch(findQuery, searchable, (candidate) => candidate.text).map((candidate) => candidate.id));
  }, [analysis.formulas, document, findQuery, locale]);

  useEffect(() => {
    if (matchedNodeIds.size === 0) return;
    void flow.fitView({
      nodes: flow.getNodes().filter((node) => matchedNodeIds.has(node.id)),
      padding: 0.2,
      duration: 200,
    });
  }, [findQuery, flow, matchedNodeIds]);

  const connectedNodeIds = useMemo(() => {
    const ids = new Set(edgeEndpointIds);
    for (const edge of hoveredPortEdges) {
      ids.add(edge.from.node);
      ids.add(edge.to.node);
    }
    return ids;
  }, [edgeEndpointIds, hoveredPortEdges]);

  const highlightedPorts = useMemo(() => {
    const ports = new Map<string, Set<string>>();
    const add = (nodeId: string, port: string): void => {
      const current = ports.get(nodeId);
      if (current === undefined) ports.set(nodeId, new Set([port]));
      else current.add(port);
    };
    const hoveredEdge = document.edges.find((candidate) => candidate.id === hoveredEdgeId);
    if (hoveredEdge !== undefined) {
      add(hoveredEdge.from.node, hoveredEdge.from.port);
      add(hoveredEdge.to.node, hoveredEdge.to.port);
    }
    if (hoveredPort !== undefined) add(hoveredPort.nodeId, hoveredPort.port);
    for (const edge of hoveredPortEdges) {
      add(edge.from.node, edge.from.port);
      add(edge.to.node, edge.to.port);
    }
    return new Map([...ports.entries()].map(([nodeId, set]) => [nodeId, [...set]] as const));
  }, [document.edges, hoveredEdgeId, hoveredPort, hoveredPortEdges]);

  useEffect(() => {
    if (rejectedUnitConnection === undefined) return undefined;
    const timeout = window.setTimeout(() => setRejectedUnitConnection(undefined), 4_000);
    return () => window.clearTimeout(timeout);
  }, [rejectedUnitConnection]);

  /** A connection error phrased for the two ports a student just tried to join. */
  const refuseConnection = useCallback(
    (candidate: Edge, reason: string): void => {
      // The kernel distinguishes a dimension failure from a kind failure with
      // "cannot connect <dimension> ..." (rather than "cannot connect a
      // numeric value ..."). Generic-variable binding uses its own wording.
      const unitMismatch =
        (/^cannot connect (?!a )/u.test(reason) || reason.includes('different dimensions')) &&
        !reason.includes('would close a cycle');
      if (!unitMismatch) {
        setRejectedUnitConnection(undefined);
        setRefusal(reason);
        return;
      }

      const source = analysis.resolution?.sources.get(`${candidate.from.node}.${candidate.from.port}`);
      const target = analysis.resolution?.targets.get(`${candidate.to.node}.${candidate.to.port}`);
      const sourceNode = document.nodes.find((node) => node.id === candidate.from.node);
      const targetNode = document.nodes.find((node) => node.id === candidate.to.node);
      const unit = (symbol: string | undefined): string => {
        if (symbol === undefined) return 'an unresolved dimension';
        return symbol === '' ? 'dimensionless' : symbol;
      };
      const fromLabel = sourceNode === undefined ? candidate.from.node : nodeLabel(sourceNode);
      const toLabel = targetNode === undefined ? candidate.to.node : nodeLabel(targetNode);
      const sourceUnit = unit(source?.unit?.symbol);
      const targetUnit = unit(target?.unit?.symbol);

      setRejectedUnitConnection(candidate);
      setRefusal(
        `Can't connect ${fromLabel}'s ${candidate.from.port} output (${sourceUnit}) to ${toLabel}'s ${candidate.to.port} input (${targetUnit}): the units are incompatible.`,
      );
    },
    [analysis.resolution, document.nodes],
  );

  const clearRefusal = useCallback((): void => {
    setRefusal(undefined);
    setRejectedUnitConnection(undefined);
  }, []);

  const nodes = useMemo<FlowNode<CanvasNodeData>[]>(
    () => {
      // Frames are passive surfaces behind calculation nodes, but within that
      // layer the smallest region is the most specific one. This lets a child
      // group receive a click instead of its broad parent when they overlap.
      const frameLayer = new Map(
        [...renderedDocument.frames]
          .sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height)
          .map((frame, index) => [frame.id, -renderedDocument.frames.length + index] as const),
      );
      const hidden = hiddenByCollapsedGroups(renderedDocument, collapsedGroups);
      const portsByGroup = new Map(
        renderedDocument.frames
          .filter((frame) => frame.kind === 'group' && collapsedGroups.has(frame.id))
          .map((frame) => [frame.id, groupPorts(renderedDocument, frame.id)] as const),
      );
      return [
        ...renderedDocument.frames.map((frame) => {
          const ports = portsByGroup.get(frame.id);
          const interfacePorts = ports === undefined ? [] : [...ports.inputs, ...ports.outputs];
          const highlightedGroupPorts = interfacePorts.flatMap((port) => {
            const highlighted = highlightedPorts.get(port.nodeId)?.includes(port.port) ?? false;
            if (!highlighted) return [];
            const kind = ports?.inputs.includes(port) ? 'input' : 'output';
            return [groupPortHandle(kind, port)];
          });
          const macroHighlighted = interfacePorts.some((port) => connectedNodeIds.has(port.nodeId));
          const size = ports === undefined ? frame.size : collapsedGroupSize(ports);
          return {
            id: frame.id,
            type: 'frame',
            position: frame.position,
            data: {
              highlighted: macroHighlighted,
              highlightedGroupPorts,
              onPortHover: setHoveredPort,
              onLayoutGestureEnd: commitLayoutPreview,
              layoutSize: size,
            },
            selected: selected.has(frame.id),
            selectable: true,
            ...sizeOf(measured, frame.id),
            // A group’s controls must sit above its wires, but ordinary nodes
            // still follow it in the projection and therefore win where they
            // overlap. Sections remain fully behind the calculation.
            zIndex: frame.kind === 'group' ? 0 : frameLayer.get(frame.id) ?? -renderedDocument.frames.length,
            ...(hidden.has(frame.id) ? { hidden: true } : {}),
            style: { width: size.width, height: size.height },
          };
        }),
        ...renderedDocument.nodes.map((node) => {
          const className = nodeClasses([
            rejectedEndpointIds.has(node.id) ? 'connection-refused' : undefined,
            matchedNodeIds.has(node.id) ? 'node-search-match' : undefined,
          ]);
          const data: CanvasNodeData = {
            highlighted: connectedNodeIds.has(node.id),
            highlightedPorts: highlightedPorts.get(node.id) ?? [],
            onPortHover: setHoveredPort,
          };
          return {
            id: node.id,
            type: flowType(node.kind),
            position: node.position,
            data,
            selected: selected.has(node.id),
            ...(className === undefined ? {} : { className }),
            ...(hidden.has(node.id) ? { hidden: true } : {}),
            ...sizeOf(measured, node.id),
          };
        }),
      ];
    },
    [collapsedGroups, commitLayoutPreview, connectedNodeIds, highlightedPorts, matchedNodeIds, measured, rejectedEndpointIds, renderedDocument, selected],
  );

  const edges = useMemo<FlowEdge[]>(() => {
    // Every port is rendered with a slot-suffixed handle id (portSlots.ts),
    // even a single-occupancy one — so an edge's target handle has to name the
    // same slot FormulaNodeView assigned it: position among edges sharing this
    // (node, port), in document order, which is exactly how that view counts.
    const slotOf = new Map<string, number>();
    return document.edges.flatMap((edge) => {
      const key = `${edge.to.node}.${edge.to.port}`;
      const slot = slotOf.get(key) ?? 0;
      slotOf.set(key, slot + 1);
      const sourceGroup = collapsedGroupForNode(document, collapsedGroups, edge.from.node);
      const targetGroup = collapsedGroupForNode(document, collapsedGroups, edge.to.node);
      if (sourceGroup !== undefined && sourceGroup === targetGroup) return [];
      return {
        id: edge.id,
        source: sourceGroup ?? edge.from.node,
        sourceHandle: sourceGroup === undefined
          ? edge.from.port
          : groupPortHandle('output', { nodeId: edge.from.node, port: edge.from.port, label: '' }),
        target: targetGroup ?? edge.to.node,
        targetHandle: targetGroup === undefined
          ? slotHandleId(edge.to.port, slot)
          : groupPortHandle('input', { nodeId: edge.to.node, port: edge.to.port, label: '' }),
        ...(document.nodes.find((node) => node.id === edge.from.node)?.kind === 'pack' && edge.from.port === 'bundle'
          ? { type: 'bundle' }
          : {}),
        selected: selected.has(edge.id),
        ...(edge.id === hoveredEdgeId || hoveredPortEdges.some((candidate) => candidate.id === edge.id)
          ? { className: 'edge-hovered' }
          : {}),
      };
    });
  }, [collapsedGroups, document, hoveredEdgeId, hoveredPortEdges, selected]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id),
      );

      setSelected((current) => {
        let next: Set<string> | undefined;
        for (const change of changes) {
          if (change.type === 'select') {
            if (change.selected && !(next ?? current).has(change.id)) {
              next ??= new Set(current);
              next.add(change.id);
            } else if (!change.selected && (next ?? current).has(change.id)) {
              next ??= new Set(current);
              next.delete(change.id);
            }
          }
          if (change.type === 'remove' && (next ?? current).has(change.id)) {
            next ??= new Set(current);
            next.delete(change.id);
          }
        }
        return next ?? current;
      });

      setMeasured((current) => {
        const next = new Map(current);
        let touched = false;
        for (const change of changes) {
          if (change.type === 'dimensions' && change.dimensions !== undefined) {
            const seen = next.get(change.id);
            if (seen?.width === change.dimensions.width && seen.height === change.dimensions.height)
              continue;
            next.set(change.id, change.dimensions);
            touched = true;
          }
          if (change.type === 'remove' && next.delete(change.id)) touched = true;
        }
        return touched ? next : current;
      });

      setRestingMeasured((current) => {
        const next = new Map(current);
        let touched = false;
        for (const change of changes) {
          if (change.type === 'dimensions' && change.dimensions !== undefined && !selected.has(change.id)) {
            const seen = next.get(change.id);
            if (seen?.width === change.dimensions.width && seen.height === change.dimensions.height)
              continue;
            next.set(change.id, change.dimensions);
            touched = true;
          }
          if (change.type === 'remove' && next.delete(change.id)) touched = true;
        }
        return touched ? next : current;
      });

      const hasGeometryChange = changes.some(
        (change) =>
          (change.type === 'position' && change.position !== undefined) ||
          (change.type === 'dimensions' && change.dimensions !== undefined),
      );
      if (hasGeometryChange) {
        setLayoutPreview((current) => {
          const next = previewLayoutChanges(current ?? document, changes, collapsedGroups, snapToGrid);
          layoutPreviewRef.current = next;
          return next;
        });
      }
      // A removal still uses a live edit because React Flow reports connected
      // node and edge removals separately for one Delete keypress.
      if (removed.size > 0) {
        layoutPreviewRef.current = undefined;
        setLayoutPreview(undefined);
        editLive((current) => reframe(removeNodes(current, removed)));
        queueMicrotask(() => commitEdit());
      }
    },
    [collapsedGroups, document, editLive, commitEdit, snapToGrid, selected],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setSelected((current) => {
        let next: Set<string> | undefined;
        for (const change of changes) {
          if (change.type === 'select') {
            if (change.selected && !(next ?? current).has(change.id)) {
              next ??= new Set(current);
              next.add(change.id);
            } else if (!change.selected && (next ?? current).has(change.id)) {
              next ??= new Set(current);
              next.delete(change.id);
            }
          }
          if (change.type === 'remove' && (next ?? current).has(change.id)) {
            next ??= new Set(current);
            next.delete(change.id);
          }
        }
        return next ?? current;
      });
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id),
      );
      // `editLive` + a microtask commit, not a discrete `edit` — see the
      // comment in `onNodesChange`: React Flow fires this callback and
      // `onNodesChange` separately for one Backspace/Delete press when the
      // deleted node has a wire, and both need to land as one undo step.
      if (removed.size > 0) {
        editLive((current) => removeEdges(current, removed));
        queueMicrotask(() => commitEdit());
      }
    },
    [editLive, commitEdit],
  );

  const candidateOf = (connection: Connection | FlowEdge): Edge | undefined => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (sourceHandle === null || sourceHandle === undefined) return undefined;
    if (targetHandle === null || targetHandle === undefined) return undefined;
    const endpoints = {
      from: { node: source, port: basePortName(sourceHandle) },
      to: { node: target, port: basePortName(targetHandle) },
    };
    return { id: edgeId(endpoints.from, endpoints.to), ...endpoints };
  };

  /** The cheap answer, while a wire is in the air. */
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdge): boolean => {
      const candidate = candidateOf(connection);
      if (candidate === undefined || candidate.from.node === candidate.to.node) return false;
      // A port that already carries a wire is about to have it replaced, not
      // joined — but `resolution.targets` here still reflects the *old* edge,
      // which is wrong to check against for a generic port: its bound
      // dimension came from that very edge, so a legitimate rewire to a
      // different dimension would be greyed out before the drop ever reaches
      // `canConnect`, which already accounts for the replacement.
      const alreadyWired = document.edges.some(
        (edge) => edge.to.node === candidate.to.node && edge.to.port === candidate.to.port,
      );
      if (alreadyWired) return true;
      const resolution = analysis.resolution;
      if (resolution === undefined) return true;
      const source = resolution.sources.get(`${candidate.from.node}.${candidate.from.port}`);
      const target = resolution.targets.get(`${candidate.to.node}.${candidate.to.port}`);
      if (source === undefined || target === undefined) return true;
      if (typesConnect(source, target)) return true;

      // Not a dimension match — but a still-unwired input node's own unit is
      // provisional and will relabel to fit at drop (`onConnect`, via
      // `adaptInputUnit`), so its drag should not grey out a target of a
      // different dimension the way every other mismatch does. Narrow on
      // purpose: only the kind still has to agree here, not the dimension —
      // simulating the adaptation itself is `onConnect`'s job, not the
      // hover's.
      const fromNode = document.nodes.find((node) => node.id === candidate.from.node);
      const fromUnwired = !document.edges.some((edge) => edge.from.node === candidate.from.node);
      if (fromNode?.kind === 'input' && hasUnit(fromNode.value) && fromUnwired) {
        return source.kind === target.kind;
      }
      return false;
    },
    [analysis.resolution, document.edges, document.nodes],
  );

  /** A variadic port's new wire joins what is already there, not replaces it. */
  const isVariadicConnectTarget = (to: Edge['to']): boolean => isVariadicTarget(document, catalogues, to);

  /** The authority, when it lands: the whole graph, resolved with it added. */
  const onConnect = useCallback(
    (connection: Connection) => {
      const candidate = candidateOf(connection);
      if (candidate === undefined) return;

      const tableNode = document.nodes.find((entry) => entry.id === candidate.to.node);
      const tableTarget = tableNode?.kind === 'output' && tableNode.output.kind === 'table';
      const result = connectResolvingTableColumn(
        document,
        catalogues,
        candidate,
        isVariadicConnectTarget(candidate.to),
      );
      if (result.ok) {
        clearRefusal();
        edit(result.apply);
        return;
      }

      // Table inputs never adopt a source input's unit: their named column has
      // already been resolved and checked above, exactly as every table entry
      // path is by connectResolvingTableColumn.
      if (tableTarget) {
        refuseConnection(result.refusal.edge, result.refusal.reason);
        return;
      }

      // The one case a straight dimension mismatch does not refuse: the
      // source is a freshly placed, still-unwired input node. Its unit is
      // provisional — nothing downstream has read it yet — so it relabels
      // itself to the target's unit rather than blocking the wire. Only ever
      // a relabel, never a conversion, and `canConnect` re-checked against the
      // adapted document is still the authority: a kind or categorical
      // mismatch, or a cycle, is unaffected and still refuses exactly as
      // before.
      const targetUnit = analysis.resolution?.targets.get(`${candidate.to.node}.${candidate.to.port}`)?.unit;
      const adapted = targetUnit === undefined ? undefined : adaptInputUnit(document, candidate, targetUnit);
      const adaptedResult =
        adapted === undefined
          ? undefined
          : connectResolvingTableColumn(adapted, catalogues, candidate, isVariadicConnectTarget(candidate.to));
      if (targetUnit !== undefined && adaptedResult?.ok === true) {
        clearRefusal();
        edit((current) => {
          const relabelled = adaptInputUnit(current, candidate, targetUnit) ?? current;
          return adaptedResult.apply(relabelled);
        });
        return;
      }

      refuseConnection(result.refusal.edge, result.refusal.reason);
    },
    [analysis.resolution, catalogues, clearRefusal, document, edit, refuseConnection],
  );

  /** What a right click offers, worked out from what was clicked. */
  const menuItems = (target: MenuTarget): readonly MenuItem[] => {
    // Align/space/auto-arrange act on `selected`, not on where the click
    // landed, so they hold regardless of whether the click was inside the
    // selection's own bounding box (`onSelectionContextMenu`, target.kind
    // 'selection') or elsewhere on the pane with a selection still active
    // (target.kind 'pane') — only "Group into new section" needs a drop
    // point, so it stays out of this shared list and is added by each
    // caller with whatever position that context has on hand.
    const alignSpaceActions = (): readonly MenuItem[] => [
      { heading: t('Selection') },
      ...([
        ['Align left', 'left'],
        ['Align right', 'right'],
        ['Align top', 'top'],
        ['Align bottom', 'bottom'],
        ['Align horizontal centres', 'horizontal-centre'],
        ['Align vertical centres', 'vertical-centre'],
      ] as const).map(([label, alignment]) => ({
        label,
        onClick: () => edit((current) => alignSelection(current, selected, alignment, restingMeasured)),
      })),
      {
        label: t('Space evenly horizontally'),
        onClick: () => edit((current) => spaceSelectionEvenly(current, selected, 'horizontal', restingMeasured)),
      },
      {
        label: t('Space evenly vertically'),
        onClick: () => edit((current) => spaceSelectionEvenly(current, selected, 'vertical', restingMeasured)),
      },
      {
        label: t('Auto-arrange selection'),
        onClick: () => edit((current) => arrangeSelection(current, selected)),
      },
    ];
    const selectionActions = (at: { readonly x: number; readonly y: number }): readonly MenuItem[] => [
      ...alignSpaceActions(),
      {
        label: t('Group into new section'),
        onClick: () =>
          edit((current) => groupIntoSection(current, selected, flow.screenToFlowPosition(at))),
      },
      {
        label: t('Group into new group'),
        onClick: () =>
          edit((current) => groupIntoGroup(current, selected, flow.screenToFlowPosition(at))),
      },
    ];
    if (target.kind === 'selection') return selectionActions(target);
    if (target.kind === 'node') {
      const { id } = target;
      const graphNode = document.nodes.find((node) => node.id === id);
      const hasDetails = graphNode !== undefined && ['input', 'formula', 'output', 'compare', 'select', 'closure'].includes(graphNode.kind);
      return [
        ...(hasDetails ? [{
          label: t(expanded.has(id) ? 'Allow auto-collapse' : 'Keep open'),
          onClick: () => toggleExpanded(id),
        }] : []),
        {
          label: t('Duplicate'),
          onClick: () => edit((current) => reframe(duplicateNode(current, id))),
        },
        ...(graphNode?.kind === 'closure' && analysis.formulas.has(id)
          ? [{
              label: t('Save equation to palette'),
              onClick: () => saveUserEquation(nodeLabel(graphNode), graphNode.expression),
            }]
          : []),
        {
          label: t('Delete'),
          danger: true,
          onClick: () => edit((current) => reframe(removeNodes(current, new Set([id])))),
        },
      ];
    }
    if (target.kind === 'edge') {
      const { id } = target;
      return [
        {
          label: t('Delete wire'),
          danger: true,
          onClick: () => edit((current) => removeEdges(current, new Set([id]))),
        },
      ];
    }
    if (target.kind === 'frame') {
      const { id } = target;
      const frame = document.frames.find((candidate) => candidate.id === id);
      return [
        ...(frame?.kind === 'group' ? [{
          label: t(collapsedGroups.has(id) ? 'Expand group' : 'Collapse group'),
          onClick: () => toggleGroupCollapsed(id),
        }] : []),
        {
          label: t(frame?.kind === 'group' ? 'Delete group' : 'Delete section'),
          danger: true,
          onClick: () => edit((current) => reframe(removeNodes(current, new Set([id])))),
        },
      ];
    }
    const at = flow.screenToFlowPosition({ x: target.x, y: target.y });
    return [
      // A pane click lands here whenever it's outside the selection's own
      // bounding box — still with `selected` untouched, so the same actions
      // `onSelectionContextMenu` offers inside that box belong here too.
      ...(selectedNodeCount(document, selected) > 0 ? alignSpaceActions() : []),
      {
        label: t('Add input'),
        onClick: () =>
          edit((current) => {
            const id = uniqueId(current, 'input');
            return addNode(current, {
              kind: 'input',
              id,
              label: id,
              value: { kind: 'scalar', value: 1, unit: parseUnit('') },
              position: at,
            });
          }),
      },
      {
        label: t('Add print output'),
        onClick: () =>
          edit((current) => {
            const id = uniqueId(current, 'result');
            return addNode(current, {
              kind: 'output',
              id,
              label: id,
              output: { kind: 'print' },
              position: at,
            });
          }),
      },
      {
        label: t('Add check output'),
        onClick: () =>
          edit((current) => {
            const id = uniqueId(current, 'check');
            return addNode(current, {
              kind: 'output',
              id,
              label: id,
              output: { kind: 'check', comparison: '>=', threshold: { value: 1, unit: parseUnit('') } },
              position: at,
            });
          }),
      },
      {
        label: t('Add plot output'),
        onClick: () =>
          edit((current) => {
            const id = uniqueId(current, 'plot');
            return addNode(current, {
              kind: 'output',
              id,
              label: id,
              output: { kind: 'plot', measures: [] },
              position: at,
            });
          }),
      },
      {
        label: t(sectionActionLabel(document, selected)),
        onClick: () => edit((current) => groupIntoSection(current, selected, at)),
      },
      {
        label: t(selectedNodeCount(document, selected) === 0 ? 'Add new group' : 'Group into new group'),
        onClick: () => edit((current) => groupIntoGroup(current, selected, at)),
      },
      {
        label: t('Auto-arrange'),
        onClick: () => edit((current) => autoArrange(current, restingMeasured)),
      },
      { heading: t('Canvas') },
      {
        label: t('Snap nodes to grid'),
        checked: snapToGrid,
        onClick: () => setSnapToGrid(!snapToGrid),
      },
    ];
  };

  /**
   * Finish a wire dropped on empty canvas by wiring it to a port that is
   * already there — no node placed, just the edge (the refusal path is
   * the same one a manual drag onto that node's own handle would get).
   * Table column resolution is shared with direct and fresh-node wiring.
   */
  const wireToExisting = (target: QuickAddTarget, nodeId: string, port: string): void => {
    edit((current) => {
      const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
      const existingEndpoint = { node: nodeId, port };
      const [from, to] =
        target.from.type === 'source' ? [dragEndpoint, existingEndpoint] : [existingEndpoint, dragEndpoint];

      const candidate: Edge = { id: edgeId(from, to), from, to };
      const result = connectResolvingTableColumn(
        current,
        catalogues,
        candidate,
        isVariadicConnectTarget(candidate.to),
      );
      if (!result.ok) {
        refuseConnection(result.refusal.edge, result.refusal.reason);
        return current;
      }
      clearRefusal();
      return result.document;
    });
  };

  /**
   * Finish a wire dropped on empty canvas: place the chosen node, then wire
   * the dragged endpoint to whichever of its ports fits the drag's direction.
   * A refusal here is the same refusal a manual drag-and-drop would get,
   * surfaced the same way — the node still lands, just unconnected.
   */
  const pickQuickAdd = (target: QuickAddTarget, choice: QuickAddChoice): void => {
    if (choice.kind === 'existing') {
      wireToExisting(target, choice.nodeId, choice.port);
      return;
    }

    const position = flow.screenToFlowPosition({ x: target.x, y: target.y });
    edit((current) => {
      const spec = quickAddNodeSpec(current, choice);
      const id = uniqueId(current, spec.idPrefix);
      const node = spec.make(id, position, choice.kind === 'formula' ? undefined : id);
      // The same question the menu already answered to decide this entry was
      // offerable at all — asked again here so a node whose ports are not
      // interchangeable (a Select node's `value` and `along`) is wired to
      // the one the preview promised, not simply to its first.
      const port =
        compatibleQuickAddPort(current, catalogues, target, choice) ??
        quickAddChoicePort(current, choice, target.from.type);

      let next = addNode(current, node);
      if (port === undefined) return next;

      const newEndpoint = { node: id, port };
      const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
      const [from, to] =
        target.from.type === 'source' ? [dragEndpoint, newEndpoint] : [newEndpoint, dragEndpoint];

      const candidate: Edge = { id: edgeId(from, to), from, to };
      if (choice.kind === 'input') {
        const targetUnit = resolveGraph(next, catalogues).targets.get(`${to.node}.${to.port}`)?.unit;
        next = targetUnit === undefined ? next : adaptInputUnit(next, candidate, targetUnit) ?? next;
      }
      const result = connectResolvingTableColumn(
        next,
        catalogues,
        candidate,
        isVariadicConnectTarget(candidate.to),
      );
      if (result.ok) {
        clearRefusal();
        next = result.document;
      } else {
        refuseConnection(result.refusal.edge, result.refusal.reason);
        // A quick-added node remains after a refused wire. For a fresh table,
        // that includes the named column resolved for the attempted edge.
        next = result.document;
      }
      return next;
    });
  };

  // Memoized so QuickAddMenu's own `formulas` list — one `resolveGraph`/
  // `canConnect` per candidate formula — only recomputes when the drag, the
  // document, or the catalogues actually change, not on every Canvas
  // re-render the menu happens to be open for (a fresh inline callback prop
  // here would invalidate that memo every render, however unrelated).
  const quickAddCompatiblePort = useCallback(
    (choice: QuickAddCandidate): string | undefined =>
      quickAdd === undefined ? undefined : compatibleQuickAddPort(document, catalogues, quickAdd, choice),
    [document, catalogues, quickAdd],
  );
  const quickAddExisting = useMemo(
    () => (quickAdd === undefined ? [] : existingCandidates(document, analysis.formulas, quickAdd.from)),
    [document, analysis.formulas, quickAdd],
  );

  return (
    <div className="canvas">
      <ReactFlow
        onPointerMove={(event) => {
          cursor.current = { x: event.clientX, y: event.clientY };
        }}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode={themePreference}
        snapToGrid={snapToGrid}
        snapGrid={SNAP_GRID}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        // A node opens on hover or selection (NodeShell.tsx), which grows its
        // measured DOM box — exactly what the marquee is mid-drag testing
        // that box against. Freezing every node's open/collapsed state for
        // the drag's duration keeps hit-testing stable regardless of what
        // the marquee happens to pass over.
        onSelectionStart={() => setMarqueeActive(true)}
        onSelectionEnd={() => setMarqueeActive(false)}
        // React Flow's default lifts a selected node's z-index above every
        // other node's, frame's declared zIndex: -1 included — selecting a
        // frame then buried its own contents underneath it, so a student had
        // to click empty canvas first before a node inside could be reached.
        // With this off, declared zIndex is what stacking follows, always.
        elevateNodesOnSelect={false}
        onNodeDragStop={commitLayoutPreview}
        onPaneClick={() => {
          clearRefusal();
          setMenu(undefined);
          setHoveredPort(undefined);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          if (node.type === 'frame') {
            setMenu({ kind: 'frame', id: node.id, x: event.clientX, y: event.clientY });
            return;
          }
          const kind = nodeContextMenuKind(document, selected);
          setMenu(
            kind === 'selection'
              ? { kind, x: event.clientX, y: event.clientY }
              : { kind, id: node.id, x: event.clientX, y: event.clientY },
          );
        }}
        onSelectionContextMenu={(event, nodes) => {
          event.preventDefault();
          const position = { x: event.clientX, y: event.clientY };
          const [node] = nodes;
          if (nodes.length === 1 && node !== undefined) {
            setMenu({ kind: 'node', id: node.id, ...position });
            return;
          }
          setMenu({ kind: 'selection', ...position });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          setMenu({ kind: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
        }}
        onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdgeId(undefined)}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          if (!('clientX' in event)) return;
          setMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
        }}
        onConnectEnd={(event, state) => {
          if (state.fromHandle === null) return;

          if (state.toHandle !== null) {
            // Dropped on a real port. `isValidConnection` may have blocked
            // `onConnect` from firing — the cheap check while dragging,
            // or a genuine mismatch — so resolve it for real here rather than
            // let the wire snap back with no explanation.
            if (state.isValid !== true) {
              const endpointOf = (handle: typeof state.fromHandle) => ({
                node: handle.nodeId,
                port: basePortName(handle.id ?? ''),
              });
              const [from, to] =
                state.fromHandle.type === 'source'
                  ? [endpointOf(state.fromHandle), endpointOf(state.toHandle)]
                  : [endpointOf(state.toHandle), endpointOf(state.fromHandle)];
              const candidate: Edge = { id: edgeId(from, to), from, to };
              const verdict = canConnect(document, catalogues, candidate);
              if (verdict.ok) {
                clearRefusal();
                edit((current) =>
                  connect(current, candidate.from, candidate.to, isVariadicConnectTarget(candidate.to)),
                );
              } else {
                refuseConnection(candidate, verdict.reason);
              }
            }
            return;
          }

          if (!('clientX' in event)) return;
          const dropTarget = event.target as HTMLElement | null;
          if (dropTarget?.closest('.react-flow__pane') === null || dropTarget === null) return;
          setQuickAdd({
            x: event.clientX,
            y: event.clientY,
            from: {
              nodeId: state.fromHandle.nodeId,
              port: basePortName(state.fromHandle.id ?? ''),
              type: state.fromHandle.type,
            },
          });
        }}
        onMove={() => {
          setMenu(undefined);
          setQuickAdd(undefined);
          setHoveredPort(undefined);
        }}
        minZoom={0.15}
        fitView
        // Spotlighted elements are measured by screen position (`Tutorial.tsx`);
        // letting the viewport pan/zoom or a node drag out from under a running
        // tour sends that position chasing a moving target every poll, which
        // can pin the caption against the same edge every frame and never let
        // its correction converge — a real infinite `setState` loop, not just
        // jitter. Freezing the canvas for the tour's duration is simpler than
        // making that math robust to a moving target.
        panOnDrag={!tutorialActive}
        zoomOnScroll={!tutorialActive}
        zoomOnPinch={!tutorialActive}
        zoomOnDoubleClick={!tutorialActive}
        nodesDraggable={!tutorialActive}
      >
        <Background gap={CANVAS_GRID_SIZE} />
        {controlsVisible ? (
          <Panel position="top-left" className="canvas-controls" aria-label={t('Canvas controls')}>
            <span><kbd>Shift</kbd> {t('drag to select')}</span>
            <span><kbd>{modifierKey}</kbd> / <kbd>Shift</kbd> {t('click to add to selection')}</span>
            <span><kbd>{modifierKey}</kbd>+<kbd>A</kbd> {t('select all')}</span>
            <span><kbd>{modifierKey}</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> {t('undo/redo')}</span>
            <span><kbd>{modifierKey}</kbd>+<kbd>C</kbd>/<kbd>V</kbd> {t('copy/paste')}</span>
            <span><kbd>{modifierKey}</kbd>+<kbd>D</kbd> {t('duplicate')}</span>
          </Panel>
        ) : null}
        {tutorialActive ? null : <Controls />}
        {minimapVisible ? <MiniMap pannable={!tutorialActive} zoomable={!tutorialActive} /> : null}
        {menu === undefined ? null : (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu)}
            onClose={() => setMenu(undefined)}
          />
        )}
        {quickAdd === undefined ? null : (
          <QuickAddMenu
            x={quickAdd.x}
            y={quickAdd.y}
            catalogues={catalogues}
            existing={quickAddExisting}
            canPlot={documentAxes(document).length > 0}
            preferredPort={quickAdd.from.port}
            compatiblePort={quickAddCompatiblePort}
            onPick={(choice) => pickQuickAdd(quickAdd, choice)}
            onClose={() => setQuickAdd(undefined)}
          />
        )}
        {findQuery === undefined ? null : (
          <Panel position="top-right">
            <CanvasFind
              query={findQuery}
              matches={matchedNodeIds.size}
              onChange={setFindQuery}
              onClose={() => setFindQuery(undefined)}
            />
          </Panel>
        )}
        {refusal === undefined ? null : (
          <Panel position="top-center">
            <div className="refusal" role="status">
              {refusal}
              <button type="button" onClick={clearRefusal}>
                ✕
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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

import { adaptInputUnit, canConnect, resolveGraph, typesConnect } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import {
  axes as documentAxes,
  formulaRef,
  CLOSURE_RESULT_PORT,
  hasUnit,
  VALUE_PORT,
  VERDICT_PORT,
  type Edge,
  type Catalogue,
  type Formula,
  type GraphDocument,
  type GraphNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { phrase } from '../i18n';
import {
  addNamedColumn,
  addNode,
  connect,
  duplicateNode,
  duplicateSelection,
  edgeId,
  groupIntoSection,
  moveNode,
  NEW_COLUMN,
  nodeLabel,
  reframe,
  relabelColumn,
  removeEdges,
  removeNodes,
  uniqueId,
  updateFrame,
} from '../model/document';
import { autoArrange } from '../model/layout';
import { primaryModifierLabel } from '../model/platform';
import { alignSelection, arrangeSelection, spaceSelectionEvenly } from '../model/selection-layout';
import { BundleEdge } from './BundleEdge';
import { ClosureNodeView } from './ClosureNodeView';
import { CompareNodeView } from './CompareNodeView';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { FormulaNodeView } from './FormulaNodeView';
import { FrameView } from './FrameView';
import { InputNodeView } from './InputNodeView';
import { OutputNodeView } from './OutputNodeView';
import { PackNodeView } from './PackNodeView';
import { QuickAddMenu, type ExistingCandidate, type QuickAddCandidate, type QuickAddChoice } from './QuickAddMenu';
import { UnpackNodeView } from './UnpackNodeView';
import { WaypointNodeView } from './WaypointNodeView';
import { basePortName, slotHandleId } from './spectrumSlots';

/**
 * Whatever is already wired into `node.port`, by label — undefined if it is
 * free. A target port normally takes one edge (a spectrum's many-slot
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
    return formula === undefined ? nodeLabel(source) : `${nodeLabel(source)} (${formula.output.name})`;
  }
  return nodeLabel(source);
}

/** `exactOptionalPropertyTypes` wants the key absent, not present as `undefined`. */
function replacesField(occupant: string | undefined): { readonly replaces?: string } {
  return occupant === undefined ? {} : { replaces: occupant };
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
        const port = node.output.kind === 'table' ? NEW_COLUMN : VALUE_PORT;
        candidates.push({
          nodeId: node.id,
          label: nodeLabel(node),
          subtitle: node.output.kind,
          port,
          ...(port === NEW_COLUMN ? {} : replacesField(occupantOf(document, formulas, { node: node.id, port }))),
        });
      } else if (node.kind === 'compare') {
        candidates.push({
          nodeId: node.id,
          label: nodeLabel(node),
          subtitle: 'compare',
          port: VALUE_PORT,
          ...replacesField(occupantOf(document, formulas, { node: node.id, port: VALUE_PORT })),
        });
      }
      continue;
    }

    if (node.kind === 'input') {
      candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: 'input', port: VALUE_PORT });
    } else if (node.kind === 'formula') {
      const formula = formulas.get(node.id);
      if (formula === undefined) continue;
      candidates.push({
        nodeId: node.id,
        label: nodeLabel(node),
        subtitle: formula.citation ?? formula.id,
        port: formula.output.name,
      });
    } else if (node.kind === 'compare') {
      candidates.push({ nodeId: node.id, label: nodeLabel(node), subtitle: 'compare', port: VERDICT_PORT });
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
  const node: GraphNode =
    choice.kind === 'formula'
      ? { kind: 'formula', id, formula: formulaRef(choice.formula), position }
      : choice.kind === 'input'
        ? { kind: 'input', id, value: { kind: 'scalar', value: 1, unit: parseUnit('') }, position }
        : choice.kind === 'compare'
          ? { kind: 'compare', id, comparison: '>=', threshold: { value: 1, unit: parseUnit('') }, position }
          : choice.kind === 'closure'
            ? { kind: 'closure', id, expression: 'value', position }
            : choice.kind === 'waypoint' || choice.kind === 'pack' || choice.kind === 'unpack'
              ? { kind: choice.kind, id, position }
              : {
                  kind: 'output', id, position,
                  output: choice.outputKind === 'check'
                    ? { kind: 'check', comparison: '>=', threshold: { value: 1, unit: parseUnit('') } }
                    : choice.outputKind === 'plot' ? { kind: 'plot' }
                    : choice.outputKind === 'table' ? { kind: 'table', columns: [] }
                    : { kind: 'print' },
                };

  if (target.from.type === 'source' && choice.kind === 'input') return undefined;
  if (target.from.type === 'target' && choice.kind === 'output') return undefined;

  const ports = choice.kind === 'formula'
    ? target.from.type === 'source' ? choice.formula.inputs.map((port) => port.name) : [choice.formula.output.name]
    : choice.kind === 'compare' ? [target.from.type === 'source' ? VALUE_PORT : VERDICT_PORT]
    : choice.kind === 'closure' ? [target.from.type === 'source' ? 'value' : CLOSURE_RESULT_PORT]
    : choice.kind === 'waypoint' ? [target.from.type === 'source' ? 'in0' : 'out0']
    : choice.kind === 'pack' ? [target.from.type === 'source' ? 'in0' : 'bundle']
    : choice.kind === 'unpack' ? [target.from.type === 'source' ? 'bundle' : 'out0']
    : choice.kind === 'output' ? [choice.outputKind === 'table' ? NEW_COLUMN : VALUE_PORT]
    : [VALUE_PORT];

  for (const port of ports) {
    let next = addNode(document, node);
    const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
    let freshEndpoint = { node: id, port };
    if (port === NEW_COLUMN) {
      const named = addNamedColumn(next, id, target.from.port);
      next = named.document;
      freshEndpoint = { node: id, port: named.column };
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

type Measurements = ReadonlyMap<string, { width: number; height: number }>;

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
 * React Flow reserves `input`/`output`/`default`/`group` as its own built-in
 * node types, each with its own default box styling in its base stylesheet —
 * a border, fixed width, centred text. Two of our node kinds are spelled the
 * same, so registering them under those names didn't just choose our
 * component, it also picked up React Flow's own CSS for a node type we never
 * asked for, wrapped around our own `.node` styling underneath (an extra box
 * `formula`/`compare` never had, since neither name collides). Prefixed here
 * so the type string is ours alone; `node.kind` in the document is untouched.
 */
function flowType(
  kind: 'input' | 'formula' | 'output' | 'compare' | 'closure' | 'waypoint' | 'pack' | 'unpack',
): string {
  return kind === 'input' || kind === 'output' ? `joveworks-${kind}` : kind;
}

const NODE_TYPES = {
  'joveworks-input': InputNodeView,
  formula: FormulaNodeView,
  'joveworks-output': OutputNodeView,
  compare: CompareNodeView,
  closure: ClosureNodeView,
  waypoint: WaypointNodeView,
  pack: PackNodeView,
  unpack: UnpackNodeView,
  frame: FrameView,
};

const EDGE_TYPES = { bundle: BundleEdge };
const CANVAS_GRID_SIZE = 48;
const SNAP_GRID: [number, number] = [CANVAS_GRID_SIZE, CANVAS_GRID_SIZE];

export function Canvas({ controlsVisible }: { readonly controlsVisible: boolean }): ReactElement {
  const { document, catalogues, analysis, edit, editLive, commitEdit, expanded, toggleExpanded, selected, setSelected, saveUserEquation } =
    useGraph();
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
  const flow = useReactFlow();
  const clipboard = useRef<{ document: GraphDocument; selected: ReadonlySet<string> } | undefined>(
    undefined,
  );

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
      if (key === 'c') {
        if (!document.nodes.some((node) => selected.has(node.id))) return;
        event.preventDefault();
        clipboard.current = { document, selected: new Set(selected) };
        return;
      }
      if (key !== 'v' && key !== 'd') return;

      const source = key === 'v' ? clipboard.current : { document, selected };
      if (source === undefined) return;
      const duplicated = duplicateSelection(document, source.document, source.selected);
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
  }, [document, edit, selected, setSelected]);

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
   * reason selection is local. Nothing downstream reads it.
   */
  const [measured, setMeasured] = useState<Measurements>(new Map());

  const edgeEndpointIds = useMemo(() => {
    const edge = document.edges.find((candidate) => candidate.id === hoveredEdgeId);
    return edge === undefined ? new Set<string>() : new Set([edge.from.node, edge.to.node]);
  }, [document.edges, hoveredEdgeId]);

  const rejectedEndpointIds = useMemo(() => {
    if (rejectedUnitConnection === undefined) return new Set<string>();
    return new Set([rejectedUnitConnection.from.node, rejectedUnitConnection.to.node]);
  }, [rejectedUnitConnection]);

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

  const nodes = useMemo<FlowNode[]>(
    () => [
      ...document.frames.map((frame) => ({
        id: frame.id,
        type: 'frame',
        position: frame.position,
        data: {},
        selected: selected.has(frame.id),
        ...sizeOf(measured, frame.id),
        // Frames sit behind the nodes they group, and a click on one must not
        // steal the node on top of it.
        zIndex: -1,
        style: { width: frame.size.width, height: frame.size.height },
      })),
      ...document.nodes.map((node) => ({
        id: node.id,
        type: flowType(node.kind),
        position: node.position,
        data: {},
        selected: selected.has(node.id),
        ...(edgeEndpointIds.has(node.id) ? { className: 'edge-connected' } : {}),
        ...(rejectedEndpointIds.has(node.id) ? { className: 'connection-refused' } : {}),
        ...sizeOf(measured, node.id),
      })),
    ],
    [document, edgeEndpointIds, measured, rejectedEndpointIds, selected],
  );

  const edges = useMemo<FlowEdge[]>(() => {
    // Every port is rendered with a slot-suffixed handle id (spectrumSlots.ts),
    // even a single-occupancy one — so an edge's target handle has to name the
    // same slot FormulaNodeView assigned it: position among edges sharing this
    // (node, port), in document order, which is exactly how that view counts.
    const slotOf = new Map<string, number>();
    return document.edges.map((edge) => {
      const key = `${edge.to.node}.${edge.to.port}`;
      const slot = slotOf.get(key) ?? 0;
      slotOf.set(key, slot + 1);
      return {
        id: edge.id,
        source: edge.from.node,
        sourceHandle: edge.from.port,
        target: edge.to.node,
        targetHandle: slotHandleId(edge.to.port, slot),
        ...(document.nodes.find((node) => node.id === edge.from.node)?.kind === 'pack' && edge.from.port === 'bundle'
          ? { type: 'bundle' }
          : {}),
        selected: selected.has(edge.id),
        ...(edge.id === hoveredEdgeId ? { className: 'edge-hovered' } : {}),
      };
    });
  }, [document, hoveredEdgeId, selected]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const frames = new Set(document.frames.map((frame) => frame.id));
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id),
      );

      setSelected((current) => {
        const next = new Set(current);
        for (const change of changes) {
          if (change.type === 'select') {
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
          }
          if (change.type === 'remove') next.delete(change.id);
        }
        return next;
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

      // A removal always goes through `editLive`, coalesced by the
      // `queueMicrotask` below rather than `edit`'s usual one-call-one-step —
      // React Flow's own `deleteElements` (`useGlobalKeyHandler`, Backspace/
      // Delete) fires this callback for the node *and* `onEdgesChange` for
      // its connected edges as two separate calls for one keypress, and
      // without coalescing, undoing once would only bring the node back,
      // leaving its wire still gone.
      // NodeResizer reports a resize from the top or left edge as a
      // `position` change too, alongside its `dimensions` change, to keep the
      // opposite corner anchored — that is not a drag, and must not carry
      // the frame's members along with it the way an actual drag does.
      const resizing = new Set(
        changes
          .filter((change) => change.type === 'dimensions')
          .filter((change) => frames.has(change.id))
          .map((change) => change.id),
      );
      editLive((current) => {
        let next = current;
        for (const change of changes) {
          if (change.type === 'position' && change.position !== undefined) {
            const position = change.position;
            if (frames.has(change.id)) {
              // A frame is passive — nothing about membership changes
              // here, only every member's own position, by the same delta the
              // frame itself just moved by. Fires every drag tick, not only
              // at drop, so contents visibly travel with the frame rather
              // than the frame abandoning them mid-drag.
              const before = next.frames.find((frame) => frame.id === change.id);
              next = updateFrame(next, change.id, (frame) => ({ ...frame, position }));
              if (before !== undefined && !resizing.has(change.id)) {
                const dx = position.x - before.position.x;
                const dy = position.y - before.position.y;
                if (dx !== 0 || dy !== 0) {
                  for (const member of next.nodes.filter((node) => node.frameId === change.id)) {
                    next = moveNode(next, member.id, {
                      x: member.position.x + dx,
                      y: member.position.y + dy,
                    });
                  }
                }
              }
            } else {
              next = moveNode(next, change.id, position);
            }
          }
          // A frame's size lives in the document (unlike an ordinary node's,
          // which is measured, never authored) — NodeResizer reports it the
          // same way a drag reports position, live change by live change, so
          // this is the only way the resize preview is not frozen until drop.
          if (change.type === 'dimensions' && change.dimensions !== undefined && frames.has(change.id)) {
            next = updateFrame(next, change.id, (frame) => ({
              ...frame,
              size: change.dimensions as { width: number; height: number },
            }));
          }
        }
        return removed.size === 0 ? next : reframe(removeNodes(next, removed));
      });
      // Drag/resize ticks (removed.size === 0) are coalesced by
      // `onNodeDragStop`/`onResizeEnd` calling `commitEdit` at gesture end;
      // a removal has no such callback, so it commits itself, once the
      // current synchronous burst of change events (this one and possibly
      // `onEdgesChange`'s, for the same keypress) has fully landed.
      if (removed.size > 0) queueMicrotask(() => commitEdit());
    },
    [document.frames, editLive, commitEdit],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setSelected((current) => {
        const next = new Set(current);
        for (const change of changes) {
          if (change.type === 'select') {
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
          }
          if (change.type === 'remove') next.delete(change.id);
        }
        return next;
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
        return source.kind === target.kind || (source.kind === 'numeric' && target.kind === 'spectrum');
      }
      return false;
    },
    [analysis.resolution, document.edges, document.nodes],
  );

  /** A spectrum port's new wire joins what is already there, not replaces it. */
  const isSpectrumTarget = (to: Edge['to']): boolean =>
    analysis.resolution?.targets.get(`${to.node}.${to.port}`)?.kind === 'spectrum';

  /** The authority, when it lands: the whole graph, resolved with it added. */
  const onConnect = useCallback(
    (connection: Connection) => {
      const candidate = candidateOf(connection);
      if (candidate === undefined) return;

      // A table column's name follows whatever is wired to it (OutputNodeView.tsx,
      // the same idea a spectrum port's ghost slot uses) — the *node* on
      // the wire's other end, its own title, never the port symbol, which is
      // not what a student typed. That holds whether the wire lands on the
      // trailing ghost slot (the column does not exist until this creates it)
      // or replaces what an existing column already had (the column keeps its
      // identity but is relabelled after the new source). Checked and
      // committed against the same resolved column, computed twice rather
      // than threaded through, so a commit never applies against a column a
      // since-changed document no longer has under that name.
      const tableNode = document.nodes.find((entry) => entry.id === candidate.to.node);
      if (tableNode?.kind === 'output' && tableNode.output.kind === 'table') {
        const columnBase = (doc: GraphDocument): string => {
          const source = doc.nodes.find((entry) => entry.id === candidate.from.node);
          return source === undefined ? candidate.from.port : nodeLabel(source);
        };
        const resolveTarget = (doc: GraphDocument): { readonly document: GraphDocument; readonly to: Edge['to'] } => {
          const resolved =
            candidate.to.port === NEW_COLUMN
              ? addNamedColumn(doc, candidate.to.node, columnBase(doc))
              : relabelColumn(doc, candidate.to.node, candidate.to.port, columnBase(doc));
          return { document: resolved.document, to: { node: candidate.to.node, port: resolved.column } };
        };

        const checked = resolveTarget(document);
        const verdict = canConnect(checked.document, catalogues, { ...candidate, to: checked.to });
        if (!verdict.ok) {
          refuseConnection({ ...candidate, to: checked.to }, verdict.reason);
          return;
        }
        clearRefusal();
        edit((current) => {
          const resolved = resolveTarget(current);
          return connect(resolved.document, candidate.from, resolved.to);
        });
        return;
      }

      const verdict = canConnect(document, catalogues, candidate);
      if (verdict.ok) {
        clearRefusal();
        edit((current) => connect(current, candidate.from, candidate.to, isSpectrumTarget(candidate.to)));
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
      const adaptedVerdict = adapted === undefined ? undefined : canConnect(adapted, catalogues, candidate);
      if (targetUnit !== undefined && adaptedVerdict?.ok === true) {
        clearRefusal();
        edit((current) => {
          const relabelled = adaptInputUnit(current, candidate, targetUnit) ?? current;
          return connect(relabelled, candidate.from, candidate.to, isSpectrumTarget(candidate.to));
        });
        return;
      }

      refuseConnection(candidate, verdict.reason);
    },
    [analysis.resolution, catalogues, clearRefusal, document, edit, refuseConnection],
  );

  /** What a right click offers, worked out from what was clicked. */
  const menuItems = (target: MenuTarget): readonly MenuItem[] => {
    const selectionActions = (at: { readonly x: number; readonly y: number }): readonly MenuItem[] => [
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
        onClick: () => edit((current) => alignSelection(current, selected, alignment, measured)),
      })),
      {
        label: t('Space evenly horizontally'),
        onClick: () => edit((current) => spaceSelectionEvenly(current, selected, 'horizontal', measured)),
      },
      {
        label: t('Space evenly vertically'),
        onClick: () => edit((current) => spaceSelectionEvenly(current, selected, 'vertical', measured)),
      },
      {
        label: t('Auto-arrange selection'),
        onClick: () => edit((current) => arrangeSelection(current, selected)),
      },
      {
        label: t('Group into new section'),
        onClick: () =>
          edit((current) => groupIntoSection(current, selected, flow.screenToFlowPosition(at))),
      },
    ];
    if (target.kind === 'selection') return selectionActions(target);
    if (target.kind === 'node') {
      const { id } = target;
      const graphNode = document.nodes.find((node) => node.id === id);
      const hasDetails = graphNode !== undefined && ['input', 'formula', 'output', 'compare', 'closure'].includes(graphNode.kind);
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
      return [
        {
          label: t('Delete section'),
          danger: true,
          onClick: () => edit((current) => reframe(removeNodes(current, new Set([id])))),
        },
      ];
    }
    const at = flow.screenToFlowPosition({ x: target.x, y: target.y });
    return [
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
        disabled: documentAxes(document).length === 0,
        onClick: () =>
          edit((current) => {
            const id = uniqueId(current, 'plot');
            const first = documentAxes(current).at(0);
            if (first === undefined) return current;
            return addNode(current, {
              kind: 'output',
              id,
              label: id,
              output: { kind: 'plot', x: first.id },
              position: at,
            });
          }),
      },
      {
        label: t(sectionActionLabel(document, selected)),
        onClick: () => edit((current) => groupIntoSection(current, selected, at)),
      },
      {
        label: t('Auto-arrange'),
        onClick: () => edit((current) => autoArrange(current)),
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
   * A table's ghost slot needs the same column-creation `onConnect` gives a
   * direct drag (`addNamedColumn`, named after the drag's own source).
   */
  const wireToExisting = (target: QuickAddTarget, nodeId: string, port: string): void => {
    edit((current) => {
      const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
      const existingEndpoint = { node: nodeId, port };
      const [from, to] =
        target.from.type === 'source' ? [dragEndpoint, existingEndpoint] : [existingEndpoint, dragEndpoint];

      if (to.port === NEW_COLUMN) {
        const source = current.nodes.find((entry) => entry.id === from.node);
        const base = source === undefined ? from.port : nodeLabel(source);
        const named = addNamedColumn(current, to.node, base);
        const resolvedTo = { node: to.node, port: named.column };
        const candidate: Edge = { id: edgeId(from, resolvedTo), from, to: resolvedTo };
        const verdict = canConnect(named.document, catalogues, candidate);
        if (!verdict.ok) {
          refuseConnection(candidate, verdict.reason);
          return current;
        }
        clearRefusal();
        return connect(named.document, from, resolvedTo);
      }

      const candidate: Edge = { id: edgeId(from, to), from, to };
      const verdict = canConnect(current, catalogues, candidate);
      if (!verdict.ok) {
        refuseConnection(candidate, verdict.reason);
        return current;
      }
      clearRefusal();
      return connect(current, candidate.from, candidate.to, isSpectrumTarget(candidate.to));
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
      const id = uniqueId(
        current,
        choice.kind === 'formula'
          ? choice.formula.id.replace(/[^\w.]/gu, '_')
          : choice.kind === 'input'
            ? 'input'
            : choice.kind === 'compare'
              ? 'compare'
              : choice.kind === 'closure'
                ? 'equation'
                : choice.kind === 'waypoint' || choice.kind === 'pack' || choice.kind === 'unpack'
                  ? choice.kind
              : choice.outputKind === 'print'
                ? 'result'
                : choice.outputKind,
      );
      const node: GraphNode =
        choice.kind === 'formula'
          ? { kind: 'formula', id, formula: formulaRef(choice.formula), position }
          : choice.kind === 'input'
            ? {
                kind: 'input',
                id,
                label: id,
                value: { kind: 'scalar', value: 1, unit: parseUnit('') },
                position,
              }
            : choice.kind === 'compare'
              ? {
                  kind: 'compare',
                  id,
                  label: id,
                  comparison: '>=',
                  threshold: { value: 1, unit: parseUnit('') },
                  position,
                }
              : choice.kind === 'closure'
                ? { kind: 'closure', id, label: id, expression: 'value', position }
                : choice.kind === 'waypoint' || choice.kind === 'pack' || choice.kind === 'unpack'
                  ? { kind: choice.kind, id, label: id, position }
              : {
                  kind: 'output',
                  id,
                  label: id,
                  output:
                    choice.outputKind === 'check'
                      ? { kind: 'check', comparison: '>=', threshold: { value: 1, unit: parseUnit('') } }
                      : choice.outputKind === 'plot'
                        ? { kind: 'plot' }
                        : choice.outputKind === 'table'
                          ? { kind: 'table', columns: [] }
                          : { kind: 'print' },
                  position,
                };

      const port =
        choice.kind === 'formula'
          ? choice.port
          : choice.kind === 'compare'
            ? target.from.type === 'source'
              ? VALUE_PORT
              : VERDICT_PORT
            : choice.kind === 'output' && choice.outputKind === 'table'
              ? NEW_COLUMN
              : choice.kind === 'closure'
                ? target.from.type === 'source' ? 'value' : CLOSURE_RESULT_PORT
                : choice.kind === 'waypoint'
                  ? target.from.type === 'source' ? 'in0' : 'out0'
                  : choice.kind === 'pack'
                    ? target.from.type === 'source' ? 'in0' : 'bundle'
                    : choice.kind === 'unpack'
                      ? target.from.type === 'source' ? 'bundle' : 'out0'
              : VALUE_PORT;

      let next = addNode(current, node);
      if (port === undefined) return next;

      const newEndpoint = { node: id, port };
      const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
      const [from, to] =
        target.from.type === 'source' ? [dragEndpoint, newEndpoint] : [newEndpoint, dragEndpoint];

      // A fresh table starts with zero columns — its ghost slot needs the
      // same column-creation a direct drag onto it gets (addNamedColumn,
      // named after the drag's source), not a plain connect onto a port
      // that does not exist yet.
      if (to.port === NEW_COLUMN) {
        const source = next.nodes.find((entry) => entry.id === from.node);
        const base = source === undefined ? from.port : nodeLabel(source);
        const named = addNamedColumn(next, to.node, base);
        const resolvedTo = { node: to.node, port: named.column };
        const candidate: Edge = { id: edgeId(from, resolvedTo), from, to: resolvedTo };
        const verdict = canConnect(named.document, catalogues, candidate);
        if (!verdict.ok) {
          refuseConnection(candidate, verdict.reason);
          return named.document;
        }
        clearRefusal();
        return connect(named.document, from, resolvedTo);
      }

      const candidate: Edge = { id: edgeId(from, to), from, to };
      if (choice.kind === 'input') {
        const targetUnit = resolveGraph(next, catalogues).targets.get(`${to.node}.${to.port}`)?.unit;
        next = targetUnit === undefined ? next : adaptInputUnit(next, candidate, targetUnit) ?? next;
      }
      const verdict = canConnect(next, catalogues, candidate);
      if (verdict.ok) {
        clearRefusal();
        next = connect(next, candidate.from, candidate.to, isSpectrumTarget(candidate.to));
      } else {
        refuseConnection(candidate, verdict.reason);
      }
      return next;
    });
  };

  return (
    <div className="canvas">
      <ReactFlow
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
        // React Flow's default lifts a selected node's z-index above every
        // other node's, frame's declared zIndex: -1 included — selecting a
        // frame then buried its own contents underneath it, so a student had
        // to click empty canvas first before a node inside could be reached.
        // With this off, declared zIndex is what stacking follows, always.
        elevateNodesOnSelect={false}
        onNodeDragStop={() => {
          editLive(reframe);
          commitEdit();
        }}
        onPaneClick={() => {
          clearRefusal();
          setMenu(undefined);
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
                  connect(current, candidate.from, candidate.to, isSpectrumTarget(candidate.to)),
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
        }}
        minZoom={0.15}
        fitView
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
        <Controls />
        {minimapVisible ? <MiniMap pannable zoomable /> : null}
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
            existing={existingCandidates(document, analysis.formulas, quickAdd.from)}
            canPlot={documentAxes(document).length > 0}
            compatiblePort={(choice) => compatibleQuickAddPort(document, catalogues, quickAdd, choice)}
            onPick={(choice) => pickQuickAdd(quickAdd, choice)}
            onClose={() => setQuickAdd(undefined)}
          />
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

/**
 * The canvas: React Flow drawing the document, and the kernel deciding what may
 * be wired.
 *
 * The division of labour is the whole point of this file, and it is S64:
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

import { useCallback, useMemo, useState, type ReactElement } from 'react';
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

import { canConnect, typesConnect } from '@mds/kernel';
import { parseUnit } from '@mds/units';
import { axes as documentAxes, formulaRef, VALUE_PORT, type Edge, type GraphNode } from '@mds/schema';

import { useGraph } from '../graph-context';
import {
  addNode,
  connect,
  duplicateNode,
  edgeId,
  frameAround,
  moveNode,
  reframe,
  removeEdges,
  removeNodes,
  uniqueId,
  updateFrame,
} from '../model/document';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { FormulaNodeView } from './FormulaNodeView';
import { FrameView } from './FrameView';
import { InputNodeView } from './InputNodeView';
import { OutputNodeView } from './OutputNodeView';
import { QuickAddMenu, type QuickAddChoice } from './QuickAddMenu';

type MenuTarget =
  | { readonly kind: 'node'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'edge'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'frame'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'pane'; readonly x: number; readonly y: number };

interface QuickAddTarget {
  readonly x: number;
  readonly y: number;
  readonly from: { readonly nodeId: string; readonly port: string; readonly type: 'source' | 'target' };
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

const NODE_TYPES = {
  input: InputNodeView,
  formula: FormulaNodeView,
  output: OutputNodeView,
  frame: FrameView,
};

export function Canvas(): ReactElement {
  const { document, catalogues, analysis, edit, pinned, togglePin } = useGraph();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [menu, setMenu] = useState<MenuTarget | undefined>(undefined);
  const [quickAdd, setQuickAdd] = useState<QuickAddTarget | undefined>(undefined);
  const flow = useReactFlow();

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
        type: node.kind,
        position: node.position,
        data: {},
        selected: selected.has(node.id),
        ...sizeOf(measured, node.id),
      })),
    ],
    [document, measured, selected],
  );

  const edges = useMemo<FlowEdge[]>(
    () =>
      document.edges.map((edge) => ({
        id: edge.id,
        source: edge.from.node,
        sourceHandle: edge.from.port,
        target: edge.to.node,
        targetHandle: edge.to.port,
        selected: selected.has(edge.id),
      })),
    [document, selected],
  );

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

      edit((current) => {
        let next = current;
        for (const change of changes) {
          if (change.type === 'position' && change.position !== undefined) {
            next = frames.has(change.id)
              ? updateFrame(next, change.id, (frame) => ({
                  ...frame,
                  position: change.position as { x: number; y: number },
                }))
              : moveNode(next, change.id, change.position);
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
    },
    [document.frames, edit],
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
      if (removed.size > 0) edit((current) => removeEdges(current, removed));
    },
    [edit],
  );

  const candidateOf = (connection: Connection | FlowEdge): Edge | undefined => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (sourceHandle === null || sourceHandle === undefined) return undefined;
    if (targetHandle === null || targetHandle === undefined) return undefined;
    const endpoints = {
      from: { node: source, port: sourceHandle },
      to: { node: target, port: targetHandle },
    };
    return { id: edgeId(endpoints.from, endpoints.to), ...endpoints };
  };

  /** The cheap answer, while a wire is in the air (S64). */
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdge): boolean => {
      const candidate = candidateOf(connection);
      if (candidate === undefined || candidate.from.node === candidate.to.node) return false;
      // A port that already carries a wire is about to have it replaced, not
      // joined — but `resolution.targets` here still reflects the *old* edge,
      // which is wrong to check against for a generic port (S59): its bound
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
      return typesConnect(source, target);
    },
    [analysis.resolution, document.edges],
  );

  /** The authority, when it lands (S64): the whole graph, resolved with it added. */
  const onConnect = useCallback(
    (connection: Connection) => {
      const candidate = candidateOf(connection);
      if (candidate === undefined) return;
      const verdict = canConnect(document, catalogues, candidate);
      if (!verdict.ok) {
        setRefusal(verdict.reason);
        return;
      }
      setRefusal(undefined);
      edit((current) => connect(current, candidate.from, candidate.to));
    },
    [catalogues, document, edit],
  );

  /** What a right click offers, worked out from what was clicked. */
  const menuItems = (target: MenuTarget): readonly MenuItem[] => {
    if (target.kind === 'node') {
      const { id } = target;
      return [
        {
          label: pinned.has(id) ? 'Unpin' : 'Pin open',
          onClick: () => togglePin(id),
        },
        {
          label: 'Duplicate',
          onClick: () => edit((current) => reframe(duplicateNode(current, id))),
        },
        {
          label: 'Delete',
          danger: true,
          onClick: () => edit((current) => reframe(removeNodes(current, new Set([id])))),
        },
      ];
    }
    if (target.kind === 'edge') {
      const { id } = target;
      return [
        {
          label: 'Delete wire',
          danger: true,
          onClick: () => edit((current) => removeEdges(current, new Set([id]))),
        },
      ];
    }
    if (target.kind === 'frame') {
      const { id } = target;
      return [
        {
          label: 'Delete section',
          danger: true,
          onClick: () => edit((current) => reframe(removeNodes(current, new Set([id])))),
        },
      ];
    }
    const ungrouped = document.nodes.filter((node) => node.frameId === undefined);
    const at = flow.screenToFlowPosition({ x: target.x, y: target.y });
    return [
      {
        label: 'Add input',
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
        label: 'Add print output',
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
        label: 'Add check output',
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
        label: 'Add plot output',
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
        label: 'Group into new section',
        disabled: ungrouped.length === 0,
        onClick: () =>
          edit((current) => {
            const inside = current.nodes.filter((node) => node.frameId === undefined);
            if (inside.length === 0) return current;
            const id = uniqueId(current, 'section');
            const frame = frameAround(id, 'New section', inside);
            return reframe({ ...current, frames: [...current.frames, frame] });
          }),
      },
    ];
  };

  /**
   * Finish a wire dropped on empty canvas: place the chosen node, then wire
   * the dragged endpoint to whichever of its ports fits the drag's direction.
   * A refusal here is the same refusal a manual drag-and-drop would get,
   * surfaced the same way (S64) — the node still lands, just unconnected.
   */
  const pickQuickAdd = (target: QuickAddTarget, choice: QuickAddChoice): void => {
    const position = flow.screenToFlowPosition({ x: target.x, y: target.y });
    edit((current) => {
      const id = uniqueId(
        current,
        choice.kind === 'formula'
          ? choice.formula.id.replace(/[^\w.]/gu, '_')
          : choice.kind === 'input'
            ? 'input'
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
            : {
                kind: 'output',
                id,
                label: id,
                output:
                  choice.outputKind === 'check'
                    ? { kind: 'check', comparison: '>=', threshold: { value: 1, unit: parseUnit('') } }
                    : choice.outputKind === 'plot'
                      ? { kind: 'plot', x: documentAxes(current).at(0)?.id ?? '' }
                      : { kind: 'print' },
                position,
              };

      const port =
        choice.kind === 'formula'
          ? target.from.type === 'source'
            ? choice.formula.inputs[0]?.name
            : choice.formula.output.name
          : VALUE_PORT;

      let next = addNode(current, node);
      if (port === undefined) return next;

      const newEndpoint = { node: id, port };
      const dragEndpoint = { node: target.from.nodeId, port: target.from.port };
      const [from, to] =
        target.from.type === 'source' ? [dragEndpoint, newEndpoint] : [newEndpoint, dragEndpoint];
      const candidate: Edge = { id: edgeId(from, to), from, to };
      const verdict = canConnect(next, catalogues, candidate);
      if (verdict.ok) {
        setRefusal(undefined);
        next = connect(next, candidate.from, candidate.to);
      } else {
        setRefusal(verdict.reason);
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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        deleteKeyCode={['Backspace', 'Delete']}
        onNodeDragStop={() => edit(reframe)}
        onPaneClick={() => {
          setRefusal(undefined);
          setMenu(undefined);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          const kind = node.type === 'frame' ? 'frame' : 'node';
          setMenu({ kind, id: node.id, x: event.clientX, y: event.clientY });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          setMenu({ kind: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          if (!('clientX' in event)) return;
          setMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
        }}
        onConnectEnd={(event, state) => {
          if (state.fromHandle === null) return;

          if (state.toHandle !== null) {
            // Dropped on a real port. `isValidConnection` may have blocked
            // `onConnect` from firing — the cheap check while dragging (S64),
            // or a genuine mismatch — so resolve it for real here rather than
            // let the wire snap back with no explanation.
            if (state.isValid !== true) {
              const endpointOf = (handle: typeof state.fromHandle) => ({
                node: handle.nodeId,
                port: handle.id ?? '',
              });
              const [from, to] =
                state.fromHandle.type === 'source'
                  ? [endpointOf(state.fromHandle), endpointOf(state.toHandle)]
                  : [endpointOf(state.toHandle), endpointOf(state.fromHandle)];
              const candidate: Edge = { id: edgeId(from, to), from, to };
              const verdict = canConnect(document, catalogues, candidate);
              if (verdict.ok) {
                setRefusal(undefined);
                edit((current) => connect(current, candidate.from, candidate.to));
              } else {
                setRefusal(verdict.reason);
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
              port: state.fromHandle.id ?? '',
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
        <Background gap={24} />
        <Controls />
        <MiniMap pannable zoomable />
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
            direction={quickAdd.from.type}
            catalogues={catalogues}
            canPlot={documentAxes(document).length > 0}
            onPick={(choice) => pickQuickAdd(quickAdd, choice)}
            onClose={() => setQuickAdd(undefined)}
          />
        )}
        {refusal === undefined ? null : (
          <Panel position="top-center">
            <div className="refusal" role="status">
              {refusal}
              <button type="button" onClick={() => setRefusal(undefined)}>
                ✕
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

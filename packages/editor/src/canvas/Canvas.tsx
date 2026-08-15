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
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react';

import { canConnect, typesConnect } from '@mds/kernel';
import type { Edge } from '@mds/schema';

import { useGraph } from '../graph-context';
import { connect, edgeId, moveNode, reframe, removeEdges, removeNodes, updateFrame } from '../model/document';
import { FormulaNodeView } from './FormulaNodeView';
import { FrameView } from './FrameView';
import { InputNodeView } from './InputNodeView';
import { OutputNodeView } from './OutputNodeView';

const NODE_TYPES = {
  input: InputNodeView,
  formula: FormulaNodeView,
  output: OutputNodeView,
  frame: FrameView,
};

export function Canvas(): ReactElement {
  const { document, catalogues, analysis, edit } = useGraph();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const nodes = useMemo<FlowNode[]>(
    () => [
      ...document.frames.map((frame) => ({
        id: frame.id,
        type: 'frame',
        position: frame.position,
        data: {},
        selected: selected.has(frame.id),
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
      })),
    ],
    [document, selected],
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

      edit((current) => {
        let next = current;
        for (const change of changes) {
          if (change.type !== 'position' || change.position === undefined) continue;
          next = frames.has(change.id)
            ? updateFrame(next, change.id, (frame) => ({
                ...frame,
                position: change.position as { x: number; y: number },
              }))
            : moveNode(next, change.id, change.position);
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
      const resolution = analysis.resolution;
      if (resolution === undefined) return true;
      const source = resolution.sources.get(`${candidate.from.node}.${candidate.from.port}`);
      const target = resolution.targets.get(`${candidate.to.node}.${candidate.to.port}`);
      if (source === undefined || target === undefined) return true;
      return typesConnect(source, target);
    },
    [analysis.resolution],
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
        onNodeDragStop={() => edit(reframe)}
        onPaneClick={() => setRefusal(undefined)}
        minZoom={0.15}
        fitView
      >
        <Background gap={24} />
        <Controls />
        <MiniMap pannable zoomable />
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

import type { Node as FlowNode } from '@xyflow/react';

export interface HoveredCanvasPort {
  readonly nodeId: string;
  readonly port: string;
}

export interface CanvasNodeData extends Record<string, unknown> {
  readonly highlighted?: boolean;
  readonly highlightedPorts?: readonly string[];
  /**
   * Real ports represented by a collapsed group.  Unlike `highlightedPorts`,
   * these include the member node id: two hidden nodes can both have `value`.
   */
  readonly highlightedGroupPorts?: readonly string[];
  readonly onPortHover?: (port?: HoveredCanvasPort) => void;
}

export type CanvasFlowNode = FlowNode<CanvasNodeData>;

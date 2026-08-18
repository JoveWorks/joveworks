import type { Node as FlowNode } from '@xyflow/react';

export interface HoveredCanvasPort {
  readonly nodeId: string;
  readonly port: string;
}

export interface CanvasNodeData extends Record<string, unknown> {
  readonly highlighted?: boolean;
  readonly highlightedPorts?: readonly string[];
  readonly onPortHover?: (port?: HoveredCanvasPort) => void;
}

export type CanvasFlowNode = FlowNode<CanvasNodeData>;

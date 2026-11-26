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
  /** Commits Canvas's transient drag/resize geometry at the end of a gesture. */
  readonly onLayoutGestureEnd?: () => void;
  /** Canvas-only geometry while a frame resize is in progress. */
  readonly layoutSize?: { readonly width: number; readonly height: number };
  /** A collapsed group drawn expanded, read-only, while the pointer is over it. */
  readonly peeking?: boolean;
  /** Starts (an id) or ends (undefined) a peek into a collapsed group. */
  readonly onPeek?: (groupId?: string) => void;
}

export type CanvasFlowNode = FlowNode<CanvasNodeData>;

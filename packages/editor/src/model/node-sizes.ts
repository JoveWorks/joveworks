export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

export type NodeSizes = ReadonlyMap<string, NodeSize>;

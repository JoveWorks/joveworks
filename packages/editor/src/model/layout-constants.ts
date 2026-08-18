/**
 * Nominal spacing shared by every canvas layout pass. A node's real size is
 * only known once React Flow measures its rendered DOM box (see Canvas.tsx),
 * which isn't available to the pure document transforms in `document.ts`
 * and `layout.ts` — both assume this nominal footprint instead, and must
 * agree on the same numbers or a frame sized by one path disagrees with
 * spacing computed by another.
 */

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 180;
export const GAP = 55;

// Layered-layout only: horizontal gap between rank columns, vertical gap
// between stacked blocks within a column, and the gap separating the loose-
// output bottom row from the main layout above it.
export const LAYER_GAP_X = GAP;
export const ROW_GAP_Y = GAP;
export const BOTTOM_ROW_GAP_Y = GAP * 2;

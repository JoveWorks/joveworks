import type { ReactElement } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/** A bundle is a compound value, drawn as two rails rather than a scalar wire. */
export function BundleEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  interactionWidth,
}: EdgeProps): ReactElement {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={path} className="bundle-edge-outer" interactionWidth={0} />
      <BaseEdge
        id={id}
        path={path}
        className="bundle-edge-inner"
        {...(interactionWidth === undefined ? {} : { interactionWidth })}
      />
    </>
  );
}

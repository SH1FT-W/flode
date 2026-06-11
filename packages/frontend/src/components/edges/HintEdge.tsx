import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

/**
 * Visual-only edge indicating which trigger corresponds to which choose-condition.
 * Styled identically to normal flow edges via style/markerEnd passed from FlowCanvas.
 */
export function HintEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />;
}

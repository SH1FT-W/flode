import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

/**
 * Invisible topology edge between consecutive choose-block cases.
 * The transpiler needs this edge; visually the fan-out hint edges
 * from the entry node to each case replace it.
 */
export function ChooseChainEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge path={edgePath} style={{ strokeWidth: 0, opacity: 0 }} />;
}

import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

/**
 * Visual connector between choose-block condition nodes.
 * Indicates "these branches belong to the same choose block" without implying
 * data flows from one to the other. Rendered as a thin faint dashed line, no arrow.
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

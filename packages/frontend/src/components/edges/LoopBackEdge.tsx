import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { useDarkMode } from '@/hooks/useDarkMode';

export function LoopBackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const isDarkMode = useDarkMode();
  const color = isDarkMode ? '#94a3b8' : '#64748b';

  // Backward loop-back (target is left of source): route the dashed line
  // *around* the nodes via a detour over the top, mirroring DeletableEdge,
  // so it never cuts straight through the loop body.
  const isBackwardEdge = targetX < sourceX;

  let edgePath: string;
  if (isBackwardEdge) {
    const horizontalOffset = 50;
    const verticalOffset = 100;
    const startRightX = sourceX + horizontalOffset;
    const topY = Math.min(sourceY, targetY) - verticalOffset;
    const endLeftX = targetX - horizontalOffset;

    edgePath =
      `M ${sourceX},${sourceY} ` +
      `L ${startRightX},${sourceY} ` +
      `L ${startRightX},${topY} ` +
      `L ${endLeftX},${topY} ` +
      `L ${endLeftX},${targetY} ` +
      `L ${targetX},${targetY}`;
  } else {
    [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: 2,
        strokeDasharray: '6 4',
      }}
      markerEnd={`url(#loop-back-arrow-${isDarkMode ? 'dark' : 'light'})`}
    />
  );
}

export function LoopBackEdgeMarkers({ isDarkMode }: { isDarkMode: boolean }) {
  const color = isDarkMode ? '#94a3b8' : '#64748b';
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <marker
          id={`loop-back-arrow-${isDarkMode ? 'dark' : 'light'}`}
          markerWidth="10"
          markerHeight="10"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L6,3 z" fill={color} />
        </marker>
      </defs>
    </svg>
  );
}

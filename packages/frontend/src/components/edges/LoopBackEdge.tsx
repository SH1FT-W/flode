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

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

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
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
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

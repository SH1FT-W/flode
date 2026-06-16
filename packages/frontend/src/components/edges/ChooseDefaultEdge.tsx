import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '@/hooks/useDarkMode';

export function ChooseDefaultEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const isDarkMode = useDarkMode();
  const { t } = useTranslation('nodes');

  const color = isDarkMode ? '#64748b' : '#94a3b8';
  const labelBg = isDarkMode ? '#1e293b' : '#f1f5f9';
  const labelText = isDarkMode ? '#94a3b8' : '#64748b';
  const labelBorder = isDarkMode ? '#334155' : '#cbd5e1';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'none',
          }}
          className="nodrag nopan"
        >
          <span
            style={{
              display: 'inline-block',
              padding: '2px 7px',
              fontSize: '11px',
              fontWeight: 500,
              lineHeight: '16px',
              color: labelText,
              background: labelBg,
              border: `1px solid ${labelBorder}`,
              borderRadius: '10px',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {t('conditions.defaultLabel')}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

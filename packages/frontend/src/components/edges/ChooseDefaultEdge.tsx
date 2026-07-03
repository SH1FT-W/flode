import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

// Follows HA's theme via CSS vars (see lib/ha-theme.ts), no JS color branching needed.
const EDGE_COLOR = 'hsl(var(--muted-foreground))';
const LABEL_BG = 'hsl(var(--muted))';
const LABEL_TEXT = 'hsl(var(--muted-foreground))';
const LABEL_BORDER = 'hsl(var(--border))';

export function ChooseDefaultEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const { t } = useTranslation('nodes');

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
          stroke: EDGE_COLOR,
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
              color: LABEL_TEXT,
              background: LABEL_BG,
              border: `1px solid ${LABEL_BORDER}`,
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

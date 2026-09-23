import { Handle, Position } from '@xyflow/react';
import { AlertCircle, Ban, Plus } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpenQuickAdd } from '@/components/canvas/QuickAddContext';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { useTraceNodeState } from '@/hooks/useTraceNodeState';
import {
  getTraceStateClass,
  NODE_COLORS,
  NODE_STATE_CLASSES,
  type NodeColorToken,
} from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { EntityStateChip } from './EntityStateChip';

type IconComponent = React.ComponentType<{ className?: string }>;

interface NodeHandleProps {
  type: 'source' | 'target';
  color: NodeColorToken;
  id?: string;
  style?: CSSProperties;
  className?: string;
}

/** A small ringed connector dot in the node's accent color. */
export function NodeHandle({ type, color, id, style, className }: NodeHandleProps) {
  return (
    <Handle
      type={type}
      id={id}
      position={type === 'source' ? Position.Right : Position.Left}
      style={style}
      className={cn(NODE_COLORS[color].handle, className)}
    />
  );
}

interface AddNextButtonProps {
  nodeId: string;
  handleId: string | null;
  style?: CSSProperties;
}

/**
 * "+" next to an output handle — opens the quick-add menu to append the next
 * step, wired to this handle. Shown on hover/selection only.
 */
export function AddNextButton({ nodeId, handleId, style }: AddNextButtonProps) {
  const { t } = useTranslation(['ui']);
  const openQuickAdd = useOpenQuickAdd();
  if (!openQuickAdd) return null;

  return (
    <button
      type="button"
      aria-label={t('ui:canvas.addNext')}
      title={t('ui:canvas.addNext')}
      style={style}
      className="nodrag nopan absolute -right-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-card transition-opacity hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 group-hover:opacity-100 group-[.is-selected]:opacity-100"
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        openQuickAdd({
          fromNodeId: nodeId,
          fromHandleId: handleId,
          screenX: rect.right,
          screenY: rect.top + rect.height / 2,
        });
      }}
    >
      <Plus className="size-3.5" />
    </button>
  );
}

interface NodeCardProps {
  id: string;
  selected: boolean;
  disabled: boolean;
  color: NodeColorToken;
  icon: IconComponent;
  /** Node type label, e.g. "Trigger". */
  typeLabel: string;
  /** Optional sub-kind appended to the type label, e.g. "State". */
  kind?: string;
  title: string;
  detail?: string;
  /** Entity whose live state is shown as a chip. */
  entityId?: string;
  /** Renders the left input handle (everything but triggers). */
  hasInput?: boolean;
  /**
   * `default`: one output handle + "+" button. `none`: no output (stop).
   * `custom`: the caller renders its own output handles via `handles`.
   */
  output?: 'default' | 'none' | 'custom';
  handles?: ReactNode;
  /** Floating label above the card, e.g. a choose case number. */
  badge?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}

/**
 * Shared shell for every canvas node (FLODE 2.0 card style): neutral surface,
 * tinted icon chip, type eyebrow, plain-language title, optional detail line
 * and live entity state — plus the validation/disabled/trace/step states that
 * were previously duplicated in each node component.
 */
export function NodeCard({
  id,
  selected,
  disabled,
  color,
  icon: Icon,
  typeLabel,
  kind,
  title,
  detail,
  entityId,
  hasInput = true,
  output = 'default',
  handles,
  badge,
  wide = false,
  children,
}: NodeCardProps) {
  const isActive = useFlowStore((s) => s.activeNodeId === id);
  const stepNumber = useFlowStore((s) => s.getExecutionStepNumber(id));
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const traceState = useTraceNodeState(id);
  const traceError = useFlowStore((s) => (s.isShowingTrace ? s.traceNodeErrors[id] : undefined));
  const traceTime = useFlowStore((s) => (s.isShowingTrace ? s.traceTimestamps[id] : undefined));
  const colors = NODE_COLORS[color];

  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-border bg-card px-3.5 py-3 text-left shadow-raised transition-[box-shadow,opacity] duration-200 hover:shadow-float',
        wide ? 'w-[300px]' : 'w-[260px]',
        selected && cn('is-selected', NODE_STATE_CLASSES.selected),
        isActive && NODE_STATE_CLASSES.active,
        disabled && NODE_STATE_CLASSES.disabled,
        hasErrors && NODE_STATE_CLASSES.error,
        getTraceStateClass(traceState)
      )}
    >
      {badge}

      {hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full shadow-card',
            NODE_STATE_CLASSES.errorBadge
          )}
          title={errorMessages.join('\n')}
        >
          <AlertCircle className="size-3" />
        </div>
      )}
      {disabled && !hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full shadow-card',
            NODE_STATE_CLASSES.disabledBadge
          )}
        >
          <Ban className="size-3" />
        </div>
      )}
      {stepNumber !== null && (
        <div
          title={traceTime ? new Date(traceTime).toLocaleTimeString() : undefined}
          className={cn(
            'absolute -top-2.5 left-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-bold text-[11px] tabular-nums shadow-card',
            traceError
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-success text-success-foreground'
          )}
        >
          {stepNumber}
        </div>
      )}

      {hasInput && <NodeHandle type="target" color={color} />}

      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[9px]',
            colors.chip
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate font-semibold text-[11px] tracking-wide', colors.text)}>
            {kind ? `${typeLabel} · ${kind}` : typeLabel}
          </div>
          <div className="line-clamp-2 break-words font-semibold text-foreground text-sm leading-snug">
            {title}
          </div>
        </div>
      </div>

      {detail && (
        <div className="mt-2 line-clamp-2 break-words text-muted-foreground text-xs">{detail}</div>
      )}
      {traceError && (
        <div className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-destructive text-xs">
          {traceError}
        </div>
      )}
      {entityId && <EntityStateChip entityId={entityId} />}
      {children}

      {output === 'default' && (
        <>
          <NodeHandle type="source" color={color} />
          <AddNextButton nodeId={id} handleId={null} style={{ top: '50%' }} />
        </>
      )}
      {handles}
    </div>
  );
}

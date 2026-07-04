import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, Ban, Zap } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoreInfo } from '@/hooks/useMoreInfo';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { useTraceNodeState } from '@/hooks/useTraceNodeState';
import { getTraceStateClass, NODE_COLORS, NODE_STATE_CLASSES } from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import type { TriggerNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';

const COLORS = NODE_COLORS.trigger;

interface TriggerNodeProps extends NodeProps {
  data: TriggerNodeData;
}

export const TriggerNode = memo(function TriggerNode({ id, data, selected }: TriggerNodeProps) {
  const { t } = useTranslation(['nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const openMoreInfo = useMoreInfo();
  const traceState = useTraceNodeState(id);
  const isActive = activeNodeId === id;
  const stepNumber = getExecutionStepNumber(id);
  const isDisabled = data.enabled === false;

  const triggerPlatformLabels: Record<string, string> = {
    state: t('nodes:triggers.platforms.state'),
    numeric_state: t('nodes:triggers.platforms.numeric_state'),
    time: t('nodes:triggers.platforms.time'),
    time_pattern: t('nodes:triggers.platforms.time_pattern'),
    sun: t('nodes:triggers.platforms.sun'),
    event: t('nodes:triggers.platforms.event'),
    mqtt: t('nodes:triggers.platforms.mqtt'),
    webhook: t('nodes:triggers.platforms.webhook'),
    zone: t('nodes:triggers.platforms.zone'),
    template: t('nodes:triggers.platforms.template'),
    homeassistant: t('nodes:triggers.platforms.homeassistant'),
    device: t('nodes:triggers.platforms.device'),
    calendar: t('nodes:triggers.platforms.calendar'),
    geo_location: t('nodes:triggers.platforms.geo_location'),
    tag: t('nodes:triggers.platforms.tag'),
    conversation: t('nodes:triggers.platforms.conversation'),
    persistent_notification: t('nodes:triggers.platforms.persistent_notification'),
  };
  const getTriggerLabel = (type: string) => triggerPlatformLabels[type] ?? type;

  const getDisplayInfo = (): {
    title: string;
    subtitle: string | undefined;
    /** Set only when `subtitle` is a genuine single entity_id, so it can be made clickable. */
    subtitleEntityId?: string;
    detail: unknown;
  } => {
    const triggerType = data.trigger;

    switch (triggerType) {
      case 'device':
        return {
          title: data.alias || t('nodes:types.trigger'),
          subtitle: data.type
            ? `${data.domain || 'device'}: ${data.type}`
            : getTriggerLabel(triggerType),
          detail: data.device_id ? `Device: ${String(data.device_id).substring(0, 8)}...` : null,
        };

      case 'state':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: Array.isArray(data.entity_id)
            ? `${data.entity_id.length} entities:\n${data.entity_id.join(', ')}`
            : data.entity_id || getTriggerLabel(triggerType),
          subtitleEntityId: !Array.isArray(data.entity_id) ? data.entity_id : undefined,
          detail: data.to ? `to: ${data.to}` : null,
        };

      case 'numeric_state':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: Array.isArray(data.entity_id)
            ? data.entity_id.join(', ')
            : data.entity_id || getTriggerLabel(triggerType),
          subtitleEntityId: !Array.isArray(data.entity_id) ? data.entity_id : undefined,
          detail:
            data.above || data.below
              ? `${data.above ? `>${data.above}` : ''}${data.above && data.below ? ' ' : ''}${data.below ? `<${data.below}` : ''}`
              : null,
        };

      case 'event':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail: data.event_type || null,
        };

      case 'time':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail: data.at
            ? typeof data.at === 'string'
              ? data.at
              : `${(data.at as Record<string, unknown>).entity_id || ''}${(data.at as Record<string, unknown>).offset ? ` (${(data.at as Record<string, unknown>).offset})` : ''}`
            : null,
        };

      case 'sun':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail: data.event ? `${data.event}${data.offset ? ` ${data.offset}` : ''}` : null,
        };

      case 'mqtt':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail: data.topic || null,
        };

      case 'webhook':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail: data.webhook_id || null,
        };

      case 'zone':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: getTriggerLabel(triggerType),
          detail:
            data.zone ||
            (Array.isArray(data.entity_id) ? data.entity_id.join(', ') : data.entity_id) ||
            null,
        };

      default:
        return {
          title: data.alias || getTriggerLabel(triggerType) || t('nodes:types.trigger'),
          subtitle: getTriggerLabel(triggerType) || triggerType,
          detail: null,
        };
    }
  };

  const displayInfo = getDisplayInfo();

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[300px] rounded-lg border-2 px-4 py-3',
        COLORS.border,
        COLORS.bg,
        'transition-all duration-200',
        selected && cn('ring-2 ring-offset-2', COLORS.ring),
        isActive && NODE_STATE_CLASSES.active,
        isDisabled && 'border-dashed opacity-50 grayscale',
        hasErrors && NODE_STATE_CLASSES.error,
        getTraceStateClass(traceState)
      )}
    >
      {hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
            NODE_STATE_CLASSES.errorBadge
          )}
          title={errorMessages.join('\n')}
        >
          <AlertCircle className="h-3 w-3" />
        </div>
      )}
      {isDisabled && !hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
            NODE_STATE_CLASSES.disabledBadge
          )}
        >
          <Ban className="h-3 w-3" />
        </div>
      )}
      <div className="mb-1 flex items-center gap-2">
        <div className={cn('rounded p-1', COLORS.chip)}>
          <Zap className={cn('h-4 w-4', COLORS.text)} />
        </div>
        <span className={cn('font-semibold text-sm', COLORS.text)}>{displayInfo.title}</span>
        {stepNumber && (
          <div
            className={cn(
              'ml-auto flex h-5 w-5 items-center justify-center rounded-full font-bold text-xs',
              COLORS.badge
            )}
          >
            {stepNumber}
          </div>
        )}
      </div>

      <div className={cn('space-y-0.5 text-xs', COLORS.text)}>
        {displayInfo.subtitleEntityId ? (
          <button
            type="button"
            className="nodrag line-clamp-2 truncate whitespace-pre-line text-left font-medium hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              openMoreInfo(displayInfo.subtitleEntityId as string);
            }}
          >
            {displayInfo.subtitle}
          </button>
        ) : (
          <div className="line-clamp-2 truncate whitespace-pre-line font-medium">
            {displayInfo.subtitle}
          </div>
        )}
        {displayInfo.detail != null && displayInfo.detail !== '' && (
          <div className="truncate opacity-75">{String(displayInfo.detail)}</div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className={cn('w-3! h-3!', COLORS.handle)} />
    </div>
  );
});

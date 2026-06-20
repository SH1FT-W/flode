import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, Ban, Zap } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { cn } from '@/lib/utils';
import type { TriggerNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';

interface TriggerNodeProps extends NodeProps {
  data: TriggerNodeData;
}

export const TriggerNode = memo(function TriggerNode({ id, data, selected }: TriggerNodeProps) {
  const { t } = useTranslation(['nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
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

  const getDisplayInfo = () => {
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
          detail: data.to ? `to: ${data.to}` : null,
        };

      case 'numeric_state':
        return {
          title: data.alias || getTriggerLabel(triggerType),
          subtitle: Array.isArray(data.entity_id)
            ? data.entity_id.join(', ')
            : data.entity_id || getTriggerLabel(triggerType),
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
        'relative min-w-[180px] max-w-[300px] rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3',
        'transition-all duration-200',
        selected && 'ring-2 ring-amber-500 ring-offset-2',
        isActive && 'node-active ring-4 ring-green-500',
        isDisabled && 'border-dashed opacity-50 grayscale',
        hasErrors && 'border-red-500 ring-2 ring-red-400'
      )}
    >
      {hasErrors && (
        <div
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
          title={errorMessages.join('\n')}
        >
          <AlertCircle className="h-3 w-3" />
        </div>
      )}
      {isDisabled && !hasErrors && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-white shadow-sm">
          <Ban className="h-3 w-3" />
        </div>
      )}
      <div className="mb-1 flex items-center gap-2">
        <div className="rounded bg-amber-200 p-1">
          <Zap className="h-4 w-4 text-amber-700" />
        </div>
        <span className="font-semibold text-amber-900 text-sm">{displayInfo.title}</span>
        {stepNumber && (
          <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 font-bold text-white text-xs">
            {stepNumber}
          </div>
        )}
      </div>

      <div className="space-y-0.5 text-amber-700 text-xs">
        <div className="line-clamp-2 truncate whitespace-pre-line font-medium">
          {displayInfo.subtitle}
        </div>
        {displayInfo.detail && (
          <div className="truncate opacity-75">{String(displayInfo.detail)}</div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3! h-3! bg-amber-500! border-amber-700!"
      />
    </div>
  );
});

import type { FlowNode } from '@flode/shared';
import { getRawStep } from '@flode/shared';
import { Braces, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError } from '@/components/forms/FieldError';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { getHandledProperties } from '@/config/handledProperties';
import { useHass } from '@/contexts/HassContext';
import { useFlowIssues } from '@/hooks/useFlowIssues';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { nodeTypes } from '@/lib/node-catalog';
import { getNodeColorToken, NODE_COLORS } from '@/lib/node-colors';
import { summarizeNode } from '@/lib/node-summary';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import type { HassEntity } from '@/types/hass';
import { Separator } from '../ui/separator';
import { AutomationSettingsPanel } from './AutomationSettingsPanel';
import { IssuesList } from './IssuesList';
import { NodeFields } from './NodeFields';
import { PropertyEditor } from './PropertyEditor';

interface NodeInspectorHeaderProps {
  nodeType: string | undefined;
  data: Record<string, unknown>;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onDelete: () => void;
}

/** Icon chip + node type + on/off switch + delete, at the top of the properties tab. */
function NodeInspectorHeader({
  nodeType,
  data,
  enabled,
  onEnabledChange,
  onDelete,
}: NodeInspectorHeaderProps) {
  const { t } = useTranslation(['nodes', 'ui']);
  const config = nodeTypes.find((c) => c.type === nodeType);
  const colors = NODE_COLORS[getNodeColorToken(nodeType)];
  const isRawStep = getRawStep(data) !== null;
  const typeLabel = isRawStep
    ? t('ui:rawStep.type')
    : config
      ? t(config.labelKey)
      : t('nodes:types.node');
  const Icon = isRawStep ? Braces : config?.icon;
  const summary = summarizeNode(nodeType, data, useSummaryContext());
  const alias = typeof data.alias === 'string' && data.alias ? data.alias : undefined;
  const title = alias ?? summary?.title ?? typeLabel;

  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
            colors.chip
          )}
        >
          <Icon className="size-4.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('font-semibold text-[11px] tracking-wide', colors.text)}>
          {typeLabel}
        </div>
        <div className="truncate font-semibold text-[15px] text-foreground">{title}</div>
      </div>
      <ToggleSwitch
        id="node-enabled"
        checked={enabled}
        onChange={onEnabledChange}
        label={t('ui:inspector.stepEnabled')}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title={t('ui:inspector.deleteStep')}
        aria-label={t('ui:inspector.deleteStep')}
        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/** Nothing selected: open problems first, then the automation's own settings. */
function AutomationOverview() {
  const issues = useFlowIssues();
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {issues.length > 0 && (
        <div className="px-4 pt-4">
          <IssuesList issues={issues} />
        </div>
      )}
      <AutomationSettingsPanel />
    </div>
  );
}

/** Properties of the selected node — or the automation's own settings when nothing is selected. */
export function PropertyPanel() {
  const { t } = useTranslation(['common', 'nodes', 'ui']);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const removeNode = useFlowStore((s) => s.removeNode);
  const { hass, entities } = useHass();

  // Use entities from hass object directly
  const effectiveEntities = useMemo(() => {
    if (hass?.states && Object.keys(hass.states).length > 0) {
      return Object.values(hass.states).map((state: HassEntity) => ({
        entity_id: state.entity_id,
        state: state.state,
        attributes: state.attributes || {},
        last_changed: state.last_changed || '',
        last_updated: state.last_updated || '',
        context: state.context,
      }));
    }
    return entities;
  }, [hass, entities]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  // Get handled properties for this node type - must be before early return
  // For device triggers/conditions, we need to exclude ALL current node properties to prevent duplicates
  // since device field components handle them dynamically based on API metadata
  const handledProperties = useMemo(() => {
    if (!selectedNode) {
      return getHandledProperties('trigger', []);
    }

    const baseHandled = getHandledProperties(selectedNode.type || 'trigger', []);
    const nodeData = selectedNode.data;

    // Check if this is a device-based node (trigger or condition with device_id)
    const triggerType = typeof nodeData.trigger === 'string' ? nodeData.trigger : '';
    const deviceId = typeof nodeData.device_id === 'string' ? nodeData.device_id : '';
    const isDeviceNode = triggerType === 'device' || deviceId;

    // For device nodes, exclude ALL properties to prevent duplicates with API-driven fields
    if (isDeviceNode && (selectedNode.type === 'trigger' || selectedNode.type === 'condition')) {
      const allNodeProperties = Object.keys(nodeData);
      const handledSet = new Set([...baseHandled, ...allNodeProperties]);
      return handledSet;
    }

    return baseHandled;
  }, [selectedNode]);

  // Must be before early return — hooks can't be called conditionally.
  const { getFieldError } = useNodeErrors(selectedNode?.id ?? '');

  if (!selectedNode) {
    return <AutomationOverview />;
  }

  const handleChange = (key: string, value: unknown) => {
    updateNodeData(selectedNode.id, { [key]: value });
  };

  const handleDeleteProperty = (key: string) => {
    updateNodeData(selectedNode.id, { [key]: undefined });
  };

  return (
    <div className="h-full flex-1 space-y-4 overflow-y-auto p-4">
      <NodeInspectorHeader
        nodeType={selectedNode.type}
        data={selectedNode.data}
        enabled={selectedNode.data.enabled !== false}
        onEnabledChange={(checked) => handleChange('enabled', checked ? undefined : false)}
        onDelete={() => removeNode(selectedNode.id)}
      />

      <FormField label={t('labels.alias')}>
        <Input
          type="text"
          value={typeof selectedNode.data.alias === 'string' ? selectedNode.data.alias : ''}
          onChange={(e) => handleChange('alias', e.target.value)}
          placeholder={t('placeholders.optionalDisplayName')}
        />
      </FormField>

      {/* ID field — triggers only. Home Assistant's action-step schemas
          (service call, delay, wait, set_variables, ...) don't support a
          per-step `id:` at all, only triggers do (for `trigger.id`
          templating and `choose:`/`condition: trigger` routing) — real HA
          rejects it outright ("extra keys not allowed") on any other step
          type, it's not just ignored. */}
      {selectedNode.type === 'trigger' && (
        <FormField label={t('labels.id')}>
          <Input
            type="text"
            value={typeof selectedNode.data.id === 'string' ? selectedNode.data.id : ''}
            onChange={(e) => handleChange('id', e.target.value || undefined)}
            placeholder={t('placeholders.optionalUniqueId')}
            className="font-mono"
          />
          <FieldError message={getFieldError('id')} />
        </FormField>
      )}

      <Separator />

      {/* Node-specific fields */}
      <NodeFields
        node={selectedNode as FlowNode}
        onChange={handleChange}
        entities={effectiveEntities}
      />

      {/* Additional properties editor */}
      <PropertyEditor
        node={selectedNode as FlowNode}
        handledProperties={handledProperties}
        onChange={handleChange}
        onDelete={handleDeleteProperty}
      />

      {/* Node ID footer */}
      <div className="pt-2 text-muted-foreground text-xs">
        {t('nodes:panel.nodeId', { id: selectedNode.id })}
      </div>
    </div>
  );
}

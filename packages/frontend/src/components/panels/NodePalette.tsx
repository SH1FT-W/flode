import {
  Clock,
  Columns2,
  GitBranch,
  GitFork,
  Hash,
  Hourglass,
  Play,
  Repeat,
  Shuffle,
  Variable,
  Zap,
} from 'lucide-react';
import { type DragEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { type CompoundBlockKey, createCompoundBlock } from '@/lib/block-factories';
import { NODE_COLORS } from '@/lib/node-colors';
import { cn, generateNodeId } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';

export interface NodeTypeConfig {
  type: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  defaultData: Record<string, unknown>;
}

export const nodeTypes = [
  {
    type: 'trigger',
    labelKey: 'nodes:types.trigger',
    icon: Zap,
    color: NODE_COLORS.trigger.palette,
    defaultData: {
      trigger: 'state',
      entity_id: '',
    },
  },
  {
    type: 'condition',
    labelKey: 'nodes:types.condition',
    icon: GitBranch,
    color: NODE_COLORS.condition.palette,
    defaultData: {
      condition: 'state',
      entity_id: '',
    },
  },
  {
    type: 'action',
    labelKey: 'nodes:types.action',
    icon: Play,
    color: NODE_COLORS.action.palette,
    defaultData: {
      service: 'light.turn_on',
    },
  },
  {
    type: 'delay',
    labelKey: 'nodes:types.delay',
    icon: Clock,
    color: NODE_COLORS.delay.palette,
    defaultData: {
      delay: '00:00:05',
    },
  },
  {
    type: 'wait',
    labelKey: 'nodes:types.wait',
    icon: Hourglass,
    color: NODE_COLORS.wait.palette,
    defaultData: {
      wait_template: '',
      timeout: '00:01:00',
    },
  },
  {
    type: 'set_variables',
    labelKey: 'nodes:types.set_variables',
    icon: Variable,
    color: NODE_COLORS.variables.palette,
    defaultData: {
      variables: {},
    },
  },
] as const satisfies readonly NodeTypeConfig[];

export interface CompoundTypeConfig {
  key: CompoundBlockKey;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  group: 'branching' | 'loops' | 'parallel';
}

export const compoundTypes = [
  {
    key: 'choose' as CompoundBlockKey,
    labelKey: 'nodes:compoundBlocks.choose',
    icon: Shuffle,
    color: NODE_COLORS.condition.palette,
    group: 'branching',
  },
  {
    key: 'if_else' as CompoundBlockKey,
    labelKey: 'nodes:compoundBlocks.if_else',
    icon: GitFork,
    color: NODE_COLORS.condition.palette,
    group: 'branching',
  },
  {
    key: 'repeat_while' as CompoundBlockKey,
    labelKey: 'nodes:compoundBlocks.repeat_while',
    icon: Repeat,
    color: NODE_COLORS.condition.palette,
    group: 'loops',
  },
  {
    key: 'repeat_count' as CompoundBlockKey,
    labelKey: 'nodes:compoundBlocks.repeat_count',
    icon: Hash,
    color: NODE_COLORS.delay.palette,
    group: 'loops',
  },
  {
    key: 'parallel' as CompoundBlockKey,
    labelKey: 'nodes:compoundBlocks.parallel',
    icon: Columns2,
    color: NODE_COLORS.action.palette,
    group: 'parallel',
  },
] as const satisfies readonly CompoundTypeConfig[];

const compoundGroupOrder = ['branching', 'loops', 'parallel'] as const;

export function NodePalette() {
  const { t } = useTranslation(['common', 'nodes']);
  const addNode = useFlowStore((s) => s.addNode);
  const addCompound = useFlowStore((s) => s.addCompound);
  const nodes = useFlowStore((s) => s.nodes);

  const handleAddNode = useCallback(
    (config: NodeTypeConfig) => {
      // Calculate position based on existing nodes - horizontal layout
      const baseX = nodes.length * 250 + 250;
      const baseY = 150;

      addNode({
        id: generateNodeId(config.type),
        type: config.type,
        position: { x: baseX, y: baseY },
        data: { ...config.defaultData },
      });
    },
    [addNode, nodes.length]
  );

  const handleAddCompound = useCallback(
    (config: CompoundTypeConfig) => {
      const baseX = nodes.length * 250 + 250;
      const baseY = 150;
      const block = createCompoundBlock(config.key, baseX, baseY);
      addCompound(block.nodes, block.edges);
    },
    [addCompound, nodes.length]
  );

  const onDragStart = useCallback((event: DragEvent<HTMLButtonElement>, config: NodeTypeConfig) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: config.type,
        defaultData: config.defaultData,
      })
    );
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragStartCompound = useCallback(
    (event: DragEvent<HTMLButtonElement>, config: CompoundTypeConfig) => {
      event.dataTransfer.setData(
        'application/reactflow-compound',
        JSON.stringify({ key: config.key })
      );
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  return (
    <div className="space-y-2 p-4">
      <h3 className="mb-3 font-semibold text-muted-foreground text-sm">{t('labels.addNode')}</h3>
      <div className="space-y-2">
        {nodeTypes.map((config) => (
          <Button
            key={config.type}
            variant="outline"
            onClick={() => handleAddNode(config)}
            onDragStart={(e) => onDragStart(e, config)}
            draggable
            className={cn(
              'h-auto w-full justify-start gap-3 py-3',
              'cursor-grab transition-colors active:cursor-grabbing',
              config.color
            )}
          >
            <config.icon className="h-4 w-4" />
            <span className="font-medium text-sm">{t(config.labelKey)}</span>
          </Button>
        ))}
      </div>

      <Separator className="my-3" />

      <h3 className="mb-3 font-semibold text-muted-foreground text-sm">
        {t('nodes:compoundBlocks.sectionLabel')}
      </h3>
      <div className="space-y-3">
        {compoundGroupOrder.map((group) => {
          const items = compoundTypes.filter((c) => c.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-2">
              <h4 className="px-1 font-medium text-muted-foreground/70 text-xs uppercase tracking-wide">
                {t(`nodes:compoundBlocks.groups.${group}`)}
              </h4>
              {items.map((config) => (
                <Button
                  key={config.key}
                  variant="outline"
                  onClick={() => handleAddCompound(config)}
                  onDragStart={(e) => onDragStartCompound(e, config)}
                  draggable
                  className={cn(
                    'h-auto w-full justify-start gap-3 py-3',
                    'cursor-grab transition-colors active:cursor-grabbing',
                    config.color
                  )}
                >
                  <config.icon className="h-4 w-4" />
                  <span className="font-medium text-sm">{t(config.labelKey)}</span>
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

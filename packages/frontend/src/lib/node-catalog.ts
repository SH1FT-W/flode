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
import type { CompoundBlockKey } from '@/lib/block-factories';
import type { NodeColorToken } from '@/lib/node-colors';

type IconComponent = React.ComponentType<{ className?: string }>;

export interface NodeTypeConfig {
  type: string;
  labelKey: string;
  descriptionKey: string;
  icon: IconComponent;
  color: NodeColorToken;
  defaultData: Record<string, unknown>;
}

export interface CompoundTypeConfig {
  key: CompoundBlockKey;
  labelKey: string;
  descriptionKey: string;
  icon: IconComponent;
  color: NodeColorToken;
  group: 'branching' | 'loops' | 'parallel';
}

/**
 * Every insertable building block — the single catalog shared by the block
 * library (NodePalette), the quick-add menu, the node "+" button and the
 * command palette, so a new node type only ever needs adding here.
 */
export const nodeTypes = [
  {
    type: 'trigger',
    labelKey: 'nodes:types.trigger',
    descriptionKey: 'nodes:descriptions.trigger',
    icon: Zap,
    color: 'trigger',
    defaultData: {
      trigger: 'state',
      entity_id: '',
    },
  },
  {
    type: 'condition',
    labelKey: 'nodes:types.condition',
    descriptionKey: 'nodes:descriptions.condition',
    icon: GitBranch,
    color: 'condition',
    defaultData: {
      condition: 'state',
      entity_id: '',
    },
  },
  {
    type: 'action',
    labelKey: 'nodes:types.action',
    descriptionKey: 'nodes:descriptions.action',
    icon: Play,
    color: 'action',
    defaultData: {
      service: 'light.turn_on',
    },
  },
  {
    type: 'delay',
    labelKey: 'nodes:types.delay',
    descriptionKey: 'nodes:descriptions.delay',
    icon: Clock,
    color: 'delay',
    defaultData: {
      delay: '00:00:05',
    },
  },
  {
    type: 'wait',
    labelKey: 'nodes:types.wait',
    descriptionKey: 'nodes:descriptions.wait',
    icon: Hourglass,
    color: 'wait',
    defaultData: {
      wait_template: '',
      timeout: '00:01:00',
    },
  },
  {
    type: 'set_variables',
    labelKey: 'nodes:types.set_variables',
    descriptionKey: 'nodes:descriptions.set_variables',
    icon: Variable,
    color: 'variables',
    defaultData: {
      variables: {},
    },
  },
] as const satisfies readonly NodeTypeConfig[];

export const compoundTypes = [
  {
    key: 'if_else',
    labelKey: 'nodes:compoundBlocks.if_else',
    descriptionKey: 'nodes:descriptions.if_else',
    icon: GitFork,
    color: 'condition',
    group: 'branching',
  },
  {
    key: 'choose',
    labelKey: 'nodes:compoundBlocks.choose',
    descriptionKey: 'nodes:descriptions.choose',
    icon: Shuffle,
    color: 'condition',
    group: 'branching',
  },
  {
    key: 'repeat_while',
    labelKey: 'nodes:compoundBlocks.repeat_while',
    descriptionKey: 'nodes:descriptions.repeat_while',
    icon: Repeat,
    color: 'condition',
    group: 'loops',
  },
  {
    key: 'repeat_count',
    labelKey: 'nodes:compoundBlocks.repeat_count',
    descriptionKey: 'nodes:descriptions.repeat_count',
    icon: Hash,
    color: 'delay',
    group: 'loops',
  },
  {
    key: 'parallel',
    labelKey: 'nodes:compoundBlocks.parallel',
    descriptionKey: 'nodes:descriptions.parallel',
    icon: Columns2,
    color: 'action',
    group: 'parallel',
  },
] as const satisfies readonly CompoundTypeConfig[];

export const compoundGroupOrder = ['branching', 'loops', 'parallel'] as const;

/** Drag-and-drop payload MIME types (library → canvas). */
export const DND_NODE_MIME = 'application/reactflow';
export const DND_COMPOUND_MIME = 'application/reactflow-compound';

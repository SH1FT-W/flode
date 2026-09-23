import type { TFunction } from 'i18next';
import { PlayCircle } from 'lucide-react';
import { useUiStore } from '@/store/ui-store';
import type { NodeAction } from './NodeAction';
import type { NodeActionContext } from './NodeActionContext';

/**
 * "Run from here": executes the selected node and everything after it for
 * real in Home Assistant — after a confirmation (see RunFromDialog).
 */
export function getRunFromAction(t: TFunction): NodeAction {
  return {
    name: 'run-from',
    icon: PlayCircle,
    tooltip: t('toolbar.runFrom'),
    group: 'node-specific',
    isEnabled: (context: NodeActionContext) => context.selectedNodes.length === 1,
    execute: (context: NodeActionContext) => {
      const [node] = context.selectedNodes;
      if (node) useUiStore.getState().openRunFrom(node.id);
    },
  };
}

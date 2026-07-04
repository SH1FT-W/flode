import type { TFunction } from 'i18next';
import { CopyPlus } from 'lucide-react';
import { showSuccessToast } from '@/lib/haToast';
import { cloneNodesIntoCanvas } from './clipboardHelpers';
import type { NodeAction } from './NodeAction';
import type { NodeActionContext } from './NodeActionContext';

export function getDuplicateAction(t: TFunction): NodeAction {
  return {
    name: 'duplicate',
    icon: CopyPlus,
    tooltip: t('toolbar.duplicate'),
    shortcut: 'ctrl+d',
    group: 'clipboard',
    isEnabled: (context: NodeActionContext) => context.selectedNodes.length > 0,
    execute: (context: NodeActionContext) => {
      const selectedNodeIds = context.selectedNodes.map((n) => n.id);
      const selectedEdges = context.edges.filter(
        (edge) => selectedNodeIds.includes(edge.source) && selectedNodeIds.includes(edge.target)
      );

      cloneNodesIntoCanvas(context.selectedNodes, selectedEdges, context);

      showSuccessToast(
        `${context.selectedNodes.length} node${context.selectedNodes.length !== 1 ? 's' : ''} duplicated`
      );
    },
  };
}

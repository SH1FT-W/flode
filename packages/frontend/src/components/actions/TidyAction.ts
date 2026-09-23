import type { TFunction } from 'i18next';
import { Sparkles } from 'lucide-react';
import { showSuccessToast } from '@/lib/haToast';
import { formatShortcut } from '@/lib/shortcuts';
import { useFlowStore } from '@/store/flow-store';
import type { NodeAction } from './NodeAction';
import type { NodeActionContext } from './NodeActionContext';

const FALLBACK_SIZE = { width: 260, height: 96 };

/**
 * Re-runs the import layout (ELK, via the transpiler) on the current flow,
 * using each card's real rendered size. One `setNodes` call, so a single
 * undo step restores the previous arrangement.
 */
async function tidyFlow(context: NodeActionContext, t: TFunction): Promise<void> {
  // Lazy: the transpiler (with elkjs) is its own chunk, not in the initial bundle.
  const { applyHeuristicLayout } = await import('@flode/transpiler');
  const graph = useFlowStore.getState().toFlowGraph();
  const sizes = Object.fromEntries(
    context.nodes.map((node) => [
      node.id,
      {
        width: node.measured?.width ?? FALLBACK_SIZE.width,
        height: node.measured?.height ?? FALLBACK_SIZE.height,
      },
    ])
  );
  const laidOut = await applyHeuristicLayout(graph.nodes, graph.edges, sizes);
  const positions = new Map(laidOut.map((node) => [node.id, node.position]));
  context.setNodes(
    useFlowStore
      .getState()
      .nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }))
  );
  context.fitView();
  showSuccessToast(t('toolbar.tidied', { shortcut: formatShortcut('ctrl+z') }));
}

export function getTidyAction(t: TFunction): NodeAction {
  return {
    name: 'tidy',
    icon: Sparkles,
    tooltip: t('toolbar.tidy'),
    shortcut: 'ctrl+shift+f',
    group: 'align',
    isEnabled: (context: NodeActionContext) => context.nodes.length > 1,
    execute: (context: NodeActionContext) => {
      void tidyFlow(context, t);
    },
  };
}

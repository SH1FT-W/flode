import { useReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  getAlignBottomAction,
  getAlignLeftAction,
  getAlignRightAction,
  getAlignTopAction,
  getCopyAction,
  getCutAction,
  getDeleteAction,
  getDisconnectAction,
  getDuplicateAction,
  getPasteAction,
  getRedoAction,
  getRunFromAction,
  getSelectAllAction,
  getTidyAction,
  getToggleEnabledAction,
  getUndoAction,
  type NodeAction,
  type NodeActionContext,
} from '@/components/actions';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { fitViewOptions } from '@/lib/viewport';
import { useFlowStore } from '@/store/flow-store';

/**
 * All canvas node actions plus the context they run against — the single
 * source for the floating dock, the right-click menu, the command palette and
 * keyboard shortcuts. Must be used inside a ReactFlowProvider.
 */
export function useNodeActions(): { actions: NodeAction[]; context: NodeActionContext } {
  const { t } = useTranslation();
  const { fitView } = useReactFlow();
  const store = useFlowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      clipboard: s.clipboard,
      pasteCount: s.pasteCount,
      addNode: s.addNode,
      removeNode: s.removeNode,
      updateNodeData: s.updateNodeData,
      setNodes: s.setNodes,
      setEdges: s.setEdges,
      setClipboard: s.setClipboard,
      setPasteCount: s.setPasteCount,
    }))
  );
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const context = useMemo<NodeActionContext>(
    () => ({
      ...store,
      selectedNodes: store.nodes.filter((n) => n.selected),
      undo,
      redo,
      canUndo,
      canRedo,
      fitView: () => {
        // Wait a frame so freshly moved nodes are measured before fitting.
        requestAnimationFrame(() => {
          void fitView(fitViewOptions());
        });
      },
    }),
    [store, undo, redo, canUndo, canRedo, fitView]
  );

  const actions = useMemo(
    () => [
      getUndoAction(t),
      getRedoAction(t),
      getTidyAction(t),
      getRunFromAction(t),
      getDuplicateAction(t),
      getCopyAction(t),
      getCutAction(t),
      getPasteAction(t),
      getToggleEnabledAction(t),
      getDisconnectAction(t),
      getAlignLeftAction(t),
      getAlignRightAction(t),
      getAlignTopAction(t),
      getAlignBottomAction(t),
      getSelectAllAction(t),
      getDeleteAction(t),
    ],
    [t]
  );

  return { actions, context };
}

/** Resolves an action's (possibly context-dependent) tooltip, icon and enabled state. */
export function resolveNodeAction(action: NodeAction, context: NodeActionContext) {
  return {
    label: typeof action.tooltip === 'function' ? action.tooltip(context) : action.tooltip,
    icon: action.getIcon ? action.getIcon(context) : action.icon,
    enabled: action.isEnabled ? action.isEnabled(context) : true,
  };
}

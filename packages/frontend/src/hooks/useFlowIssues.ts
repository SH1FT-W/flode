import { useReactFlow } from '@xyflow/react';
import { useCallback, useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeLabel } from '@/hooks/useNodeLabel';
import { computeFlowIssues, type FlowIssue } from '@/lib/flow-issues';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';

export interface DisplayIssue extends FlowIssue {
  text: string;
  nodeLabel?: string;
  nodeType?: string;
}

/**
 * Current save-blocking problems, translated and labelled for display.
 * Recomputed from a deferred copy of the flow so dragging stays smooth.
 */
export function useFlowIssues(): DisplayIssue[] {
  const { t } = useTranslation(['ui']);
  const nodes = useDeferredValue(useFlowStore((s) => s.nodes));
  const edges = useDeferredValue(useFlowStore((s) => s.edges));
  const nodeErrors = useFlowStore((s) => s.nodeErrors);
  const nodeLabel = useNodeLabel();

  return useMemo(() => {
    // `nodes`/`edges` are the dependencies; toFlowGraph reads the same store state.
    void edges;
    const graph = useFlowStore.getState().toFlowGraph();
    return computeFlowIssues(graph, nodeErrors).map((issue) => {
      const node = issue.nodeId ? nodes.find((n) => n.id === issue.nodeId) : undefined;
      const text =
        issue.kind === 'field'
          ? t(issue.message ?? '', { defaultValue: issue.message ?? '' })
          : issue.kind === 'other'
            ? (issue.message ?? '')
            : issue.kind === 'invalidService'
              ? t('ui:issues.invalidService', { service: issue.detail ?? '' })
              : t(`ui:issues.${issue.kind}`);
      return {
        ...issue,
        text,
        nodeLabel: node ? nodeLabel(node, node.id) : undefined,
        nodeType: node?.type,
      };
    });
  }, [nodes, edges, nodeErrors, nodeLabel, t]);
}

/** Jumps to an issue: selects and centers its node, or shows the automation panel. */
export function useFocusIssue(): (issue: FlowIssue) => void {
  const { getNode, setCenter, getZoom } = useReactFlow();
  return useCallback(
    (issue) => {
      const { nodes, onNodesChange } = useFlowStore.getState();
      onNodesChange(
        nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: n.id === issue.nodeId }))
      );
      useUiStore.getState().setInspectorTab('properties');
      const node = issue.nodeId ? getNode(issue.nodeId) : undefined;
      if (node) {
        void setCenter(
          node.position.x + (node.measured?.width ?? 260) / 2,
          node.position.y + (node.measured?.height ?? 96) / 2,
          { zoom: Math.max(getZoom(), 0.9), duration: 350 }
        );
      }
    },
    [getNode, setCenter, getZoom]
  );
}

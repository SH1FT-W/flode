import { useReactFlow, type Viewport } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { fitViewOptions } from '@/lib/viewport';
import { flowHasChanges, useFlowStore } from '@/store/flow-store';
import { closeTab, openInNewTab, switchTab, useTabsStore } from '@/store/tabs-store';
import { useUiStore } from '@/store/ui-store';

/**
 * Editor tabs with the canvas viewport handled: each tab reopens where it was
 * scrolled/zoomed; a tab without a remembered viewport is fitted to its nodes.
 */
export function useEditorTabs() {
  const { getViewport, setViewport, fitView } = useReactFlow();

  const showViewport = useCallback(
    (viewport: Viewport | undefined) => {
      requestAnimationFrame(() => {
        if (viewport) void setViewport(viewport);
        else void fitView(fitViewOptions());
      });
    },
    [setViewport, fitView]
  );

  const openNew = useCallback(
    (load: () => unknown) => openInNewTab(load, getViewport()),
    [getViewport]
  );

  const switchTo = useCallback(
    (tabId: string) => {
      if (tabId === useTabsStore.getState().activeTabId) return;
      showViewport(switchTab(tabId, getViewport()));
    },
    [getViewport, showViewport]
  );

  const close = useCallback(
    (tabId: string) => {
      const { tabs, activeTabId } = useTabsStore.getState();
      const snapshot = tabs.find((tab) => tab.id === tabId)?.snapshot;
      const isDirty =
        tabId === activeTabId
          ? useFlowStore.getState().hasRealChanges()
          : snapshot !== undefined && flowHasChanges(snapshot);
      const doClose = () => {
        const wasActive = tabId === useTabsStore.getState().activeTabId;
        const viewport = closeTab(tabId);
        if (viewport === null) useUiStore.getState().setView('home');
        else if (wasActive) showViewport(viewport);
      };
      if (isDirty) useUiStore.getState().askDiscard(doClose, 'closeTab');
      else doClose();
    },
    [showViewport]
  );

  return useMemo(() => ({ openNew, switchTo, close }), [openNew, switchTo, close]);
}

import { useEffect } from 'react';
import { useTabsStore } from '@/store/tabs-store';
import { useUiStore } from '@/store/ui-store';

/**
 * FLODE comes back where it was left: in the editor with the last active tab
 * when that was showing, otherwise on the start screen — after a page reload
 * as well as when re-entering the panel from HA's sidebar. Deep links
 * (`?automation=`, `?new=1`) switch the view themselves afterwards.
 */
export function useRestoreLastView(): void {
  useEffect(() => {
    const restore = () => {
      const { editorOpen, activeTabId } = useTabsStore.getState();
      if (editorOpen && activeTabId) useUiStore.getState().setView('editor');
    };
    const unsubscribeHydration = useTabsStore.persist.hasHydrated()
      ? undefined
      : useTabsStore.persist.onFinishHydration(restore);
    if (!unsubscribeHydration) restore();

    const unsubscribeView = useUiStore.subscribe((state, previous) => {
      if (state.view !== previous.view) {
        useTabsStore.setState({ editorOpen: state.view === 'editor' });
      }
    });
    return () => {
      unsubscribeHydration?.();
      unsubscribeView();
    };
  }, []);
}

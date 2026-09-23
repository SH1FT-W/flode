import { useCallback, useMemo } from 'react';
import { useHass } from '@/contexts/HassContext';
import { mapAutomationEntityToCatalogItem } from '@/hooks/useAutomationCatalog';
import { useEditorTabs } from '@/hooks/useEditorTabs';
import { type LoadableAutomation, useLoadAutomation } from '@/hooks/useLoadAutomation';
import type { AutomationCatalogItem } from '@/lib/ha-api';
import { findTabByAutomation } from '@/store/tabs-store';
import { useUiStore } from '@/store/ui-store';

/**
 * Opens an existing automation in the editor: switches to its tab when it's
 * already open, otherwise loads it into a new tab (nothing open is lost, so
 * there's nothing to confirm).
 */
export function useOpenAutomation() {
  const loadAutomation = useLoadAutomation();
  const tabs = useEditorTabs();
  return useCallback(
    (automation: LoadableAutomation) => {
      useUiStore.getState().setView('editor');
      const openTab = findTabByAutomation(automation.automation_id, automation.kind);
      if (openTab) tabs.switchTo(openTab);
      else void tabs.openNew(() => loadAutomation(automation));
    },
    [loadAutomation, tabs]
  );
}

/** Every automation entity currently known to HA, sorted by name (no area lookup). */
export function useAutomationEntities(): AutomationCatalogItem[] {
  const { entities } = useHass();
  return useMemo(
    () =>
      entities
        .map((entity) => mapAutomationEntityToCatalogItem(entity))
        .filter((item): item is AutomationCatalogItem => item !== null)
        .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name)),
    [entities]
  );
}

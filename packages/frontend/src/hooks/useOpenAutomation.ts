import { useCallback, useMemo } from 'react';
import { useHass } from '@/contexts/HassContext';
import { mapAutomationEntityToCatalogItem } from '@/hooks/useAutomationCatalog';
import { type LoadableAutomation, useLoadAutomation } from '@/hooks/useLoadAutomation';
import type { AutomationCatalogItem } from '@/lib/ha-api';
import { useUiStore } from '@/store/ui-store';

/**
 * Opens an existing automation in the editor — asks first when the current
 * flow has unsaved changes, then switches to the editor view and loads it.
 */
export function useOpenAutomation() {
  const loadAutomation = useLoadAutomation();
  return useCallback(
    (automation: LoadableAutomation) =>
      useUiStore.getState().runGuarded(() => {
        useUiStore.getState().setView('editor');
        void loadAutomation(automation);
      }),
    [loadAutomation]
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

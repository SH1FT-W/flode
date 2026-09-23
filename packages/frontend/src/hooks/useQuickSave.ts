import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHass } from '@/contexts/HassContext';
import { fireAutomationSaved } from '@/lib/automation-events';
import { computeFlowIssues } from '@/lib/flow-issues';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { showErrorToast, showSuccessToast } from '@/lib/haToast';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';

/**
 * ⌘S / the header's Save button. An automation that already exists in HA is
 * saved straight away (with a toast); a new one opens the save dialog to ask
 * for its name and details. With open problems, nothing is sent — the
 * problem list is shown instead.
 */
export function useQuickSave(): () => Promise<void> {
  const { t } = useTranslation(['ui', 'errors']);
  const { hass } = useHass();

  return useCallback(async () => {
    const store = useFlowStore.getState();
    const ui = useUiStore.getState();
    if (store.isSaving) return;
    if (!store.automationId) {
      ui.openDialog('save');
      return;
    }
    if (!hass) {
      showErrorToast(t('errors:connection.notConnected'));
      return;
    }

    store.validateAllNodes();
    const issues = computeFlowIssues(store.toFlowGraph(), useFlowStore.getState().nodeErrors);
    if (issues.length > 0) {
      showErrorToast(t('ui:issues.cannotSave', { count: issues.length }));
      // Deselect so the inspector shows the automation panel with the problem list.
      const { nodes, onNodesChange } = useFlowStore.getState();
      onNodesChange(nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
      ui.setInspectorTab('properties');
      return;
    }

    try {
      await store.updateAutomation(hass);
      const entityId = getHomeAssistantAPI(hass).findAutomationEntityId(store.automationId);
      await fireAutomationSaved(hass, entityId ?? undefined);
      showSuccessToast(t('ui:save.saved'));
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : t('errors:api.unknownError'));
    }
  }, [hass, t]);
}

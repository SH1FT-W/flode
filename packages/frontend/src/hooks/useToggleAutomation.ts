import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHass } from '@/contexts/HassContext';
import type { AutomationCatalogItem } from '@/lib/ha-api';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { showErrorToast, showSuccessToast } from '@/lib/haToast';

/** Turns an automation on/off in Home Assistant, with a toast either way. */
export function useToggleAutomation() {
  const { t } = useTranslation(['dialogs']);
  const { hass, config } = useHass();

  return useCallback(
    async (automation: Pick<AutomationCatalogItem, 'entity_id'>, enabled: boolean) => {
      try {
        await getHomeAssistantAPI(hass, config).setAutomationState(automation.entity_id, enabled);
        showSuccessToast(
          enabled ? t('dialogs:import.automationEnabled') : t('dialogs:import.automationDisabled')
        );
      } catch {
        showErrorToast(t('dialogs:import.updateStateFailed'));
      }
    },
    [hass, config, t]
  );
}

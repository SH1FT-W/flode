import { getScriptFields, type ScriptFields } from '@flode/shared';
import { t } from 'i18next';
import { useCallback } from 'react';
import { rawErrorMessage } from '@/lib/error-codes';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { showErrorToast, showSuccessToast } from '@/lib/haToast';
import { getLatestHass } from '@/store/hass-store';
import { useUiStore } from '@/store/ui-store';

export interface RunScriptTarget {
  scriptId: string;
  name: string;
  fields: ScriptFields;
}

/** Starts script `scriptId` with `variables` (fields); HA runs it in the background. */
export async function startScript(
  target: Pick<RunScriptTarget, 'scriptId' | 'name'>,
  variables: Record<string, unknown>
): Promise<void> {
  const hass = getLatestHass();
  if (!hass) return;
  try {
    await hass.callWS({
      type: 'call_service',
      domain: 'script',
      service: 'turn_on',
      service_data: { entity_id: `script.${target.scriptId}`, variables },
    });
    showSuccessToast(t('ui:scripts.started', { name: target.name }));
  } catch (error) {
    showErrorToast(
      t('ui:scripts.runFailed', { error: rawErrorMessage(error) ?? t('errors:api.unknownError') })
    );
  }
}

/**
 * "Run script": the saved version in Home Assistant. A script with input
 * fields opens the run dialog to fill them in; one without starts right away.
 */
export function useRunScript() {
  return useCallback(async (scriptId: string, name: string) => {
    const hass = getLatestHass();
    if (!hass) return;
    const config = await getHomeAssistantAPI(hass).getScriptConfig(scriptId);
    const fields = getScriptFields(config ?? {});
    if (Object.keys(fields).length > 0) {
      useUiStore.getState().openRunScript({ scriptId, name, fields });
      return;
    }
    await startScript({ scriptId, name }, {});
  }, []);
}

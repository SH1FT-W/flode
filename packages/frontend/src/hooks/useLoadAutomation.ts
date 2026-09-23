import { parseScript, transpiler } from '@flode/transpiler';
import { useReactFlow } from '@xyflow/react';
import { dump as yamlDump } from 'js-yaml';
import { useTranslation } from 'react-i18next';
import { useHass } from '@/contexts/HassContext';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { showErrorToast, showSuccessToast, showWarningToast } from '@/lib/haToast';
import { fitViewOptions } from '@/lib/viewport';
import { useFlowStore } from '@/store/flow-store';

export interface LoadableAutomation {
  /** Config id — an automation's `id:` or a script's object id. */
  automation_id: string;
  /** What to open; automations when omitted. */
  kind?: 'automation' | 'script';
  entity_id?: string;
  friendly_name?: string;
}

/** Parses a loaded config — scripts are reshaped into a script flow first. */
async function parseConfig(config: Record<string, unknown>, isScript: boolean) {
  if (isScript) return parseScript(transpiler, config);
  return transpiler.fromYaml(
    yamlDump(config, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: false })
  );
}

/**
 * Loads an automation's (or script's) config into the editor by id — shared
 * between `AutomationImportDialog` (picking from a list) and FLODE's
 * `?automation=` deep-link handling (see App.tsx), so both go through the
 * exact same fetch/parse/toast logic.
 */
export function useLoadAutomation() {
  const { t } = useTranslation(['dialogs', 'errors']);
  const { hass, config: hassConfig } = useHass();
  const { reset, fromFlowGraph, setFlowName, setAutomationId } = useFlowStore();
  const { fitView } = useReactFlow();

  return async (automation: LoadableAutomation): Promise<boolean> => {
    const displayName = automation.friendly_name || automation.automation_id;
    try {
      const api = getHomeAssistantAPI(hass, hassConfig);

      if (!api.isConnected()) {
        throw new Error(t('errors:connection.noConnection'));
      }

      const isScript = automation.kind === 'script';
      const config = isScript
        ? await api.getScriptConfig(automation.automation_id)
        : await api.getAutomationConfigWithFallback(
            automation.automation_id,
            automation.friendly_name
          );
      if (isScript && !config) throw new Error(t('errors:import.scriptNotFound'));

      reset();

      if (config) {
        const result = await parseConfig(config, isScript);
        if (!result.success || !result.graph) {
          throw new Error(result.errors?.join('\n') || t('errors:import.parseFailed'));
        }

        fromFlowGraph(result.graph);
        setTimeout(() => {
          void fitView(fitViewOptions());
        }, 150);

        setFlowName(displayName);
        setAutomationId(automation.automation_id);

        showSuccessToast(t('dialogs:import.importSuccess', { name: displayName }));

        // Parsed successfully, but not losslessly — file a Repair issue so this
        // survives past the toast instead of being a one-time UI warning only.
        if (result.warnings.length > 0 && automation.entity_id && !isScript) {
          showWarningToast(t('dialogs:import.lossyImportWarning', { name: displayName }), {
            description: t('dialogs:import.lossyImportWarningDescription', {
              count: result.warnings.length,
            }),
          });
          void api.reportImportIssue(automation.entity_id, result.warnings);
        }
      } else {
        setFlowName(displayName);
        setAutomationId(automation.automation_id);

        showWarningToast(t('dialogs:import.openedWarning', { name: displayName }), {
          description: t('dialogs:import.openedWarningDescription'),
        });
      }

      return true;
    } catch (error) {
      console.error('FLODE: Failed to open automation:', error);
      showErrorToast(t('dialogs:import.importFailed', { message: (error as Error).message }));
      return false;
    }
  };
}

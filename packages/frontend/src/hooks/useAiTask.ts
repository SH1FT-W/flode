import { useCallback, useEffect, useState } from 'react';
import { getLatestHass, useHassStore } from '@/store/hass-store';

/** `AITaskEntityFeature.GENERATE_DATA` in Home Assistant. */
const GENERATE_DATA_FEATURE = 1;

interface AiTaskPreferences {
  gen_data_entity_id: string | null;
}

interface GenerateDataResponse {
  response?: { data?: unknown };
}

function isGenerateDataResponse(value: unknown): value is GenerateDataResponse {
  return typeof value === 'object' && value !== null;
}

/**
 * The `ai_task` entities that can generate data, joined into one string so
 * the selector result is stable between unrelated state updates.
 */
function selectAiTaskEntityIds(
  states: Record<string, { attributes: Record<string, unknown> }> | undefined
): string {
  if (!states) return '';
  return Object.keys(states)
    .filter((id) => {
      if (!id.startsWith('ai_task.')) return false;
      const features = states[id]?.attributes?.supported_features;
      return typeof features === 'number' && (features & GENERATE_DATA_FEATURE) !== 0;
    })
    .sort()
    .join(',');
}

export interface AiTask {
  /** The AI Task entity FLODE uses, `null` when none is set up or chosen as default. */
  entityId: string | null;
  /** AI Task entities exist, but none is chosen as HA's default ("AI suggestions" → data generation). */
  needsDefault: boolean;
  /** Friendly name of that entity (e.g. "Claude AI Task"), for UI hints. */
  name: string | null;
  /** Runs one `ai_task.generate_data` call and returns the model's text reply. */
  generate: (taskName: string, instructions: string) => Promise<string>;
}

/**
 * Home Assistant's AI Task service as FLODE's AI backend. Uses exactly the
 * entity chosen under Settings → System → AI → AI suggestions (data
 * generation tasks, `/config/ai-tasks`) — like
 * HA's own AI features, nothing is used without that choice. Without one,
 * `entityId` is `null` and every AI entry point stays hidden.
 */
export function useAiTask(): AiTask {
  const available = useHassStore((s) => selectAiTaskEntityIds(s.hass?.states));
  const hasHass = useHassStore((s) => s.hass !== undefined);
  const [preferred, setPreferred] = useState<string | null>(null);

  // HA has no event for preference changes: read it when AI Task entities
  // appear/disappear and whenever the window regains focus (the user may
  // have just changed the default in another tab or HA's settings page).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `available` is the trigger, not an input
  useEffect(() => {
    if (!getLatestHass() || !available) {
      setPreferred(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getLatestHass()
        ?.callWS<AiTaskPreferences>({ type: 'ai_task/preferences/get' })
        .then((prefs) => {
          if (!cancelled) setPreferred(prefs?.gen_data_entity_id ?? null);
        })
        .catch(() => {
          if (!cancelled) setPreferred(null);
        });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [available, hasHass]);

  const ids = available ? available.split(',') : [];
  const entityId = preferred && ids.includes(preferred) ? preferred : null;
  const needsDefault = ids.length > 0 && entityId === null;

  const name = useHassStore((s) => {
    const value = entityId ? s.hass?.states?.[entityId]?.attributes?.friendly_name : undefined;
    return typeof value === 'string' ? value : entityId;
  });

  const generate = useCallback(
    async (taskName: string, instructions: string) => {
      const hass = getLatestHass();
      if (!hass || !entityId) throw new Error('No AI Task entity available');
      const result = await hass.callWS<unknown>({
        type: 'call_service',
        domain: 'ai_task',
        service: 'generate_data',
        service_data: { task_name: taskName, instructions, entity_id: entityId },
        return_response: true,
      });
      const data = isGenerateDataResponse(result) ? result.response?.data : undefined;
      if (typeof data !== 'string' || !data.trim()) throw new Error('The AI returned no text');
      return data;
    },
    [entityId]
  );

  return { entityId, needsDefault, name, generate };
}

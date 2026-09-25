/**
 * Home Assistant's AI Tasks (`ai_task.generate_data`) — the LLM the user set up
 * in HA and picked as default for data generation. FLODE never talks to an AI
 * provider itself. Framework-free: every UI passes its own `callWS`.
 */

export type CallWS = <T>(message: Record<string, unknown> & { type: string }) => Promise<T>;

type States = Record<string, { attributes: Record<string, unknown> } | undefined>;

const GENERATE_DATA_FEATURE = 1;

/** AI Task entities that can generate data. */
export function aiTaskEntityIds(states: States | undefined): string[] {
  if (!states) return [];
  return Object.keys(states)
    .filter((id) => {
      if (!id.startsWith('ai_task.')) return false;
      const features = states[id]?.attributes.supported_features;
      return typeof features === 'number' && (features & GENERATE_DATA_FEATURE) !== 0;
    })
    .sort();
}

export interface AiTaskChoice {
  /** The AI Task FLODE uses — HA's default for data generation; `null` if there is none. */
  entityId: string | null;
  /** AI Tasks exist, but none is chosen as HA's default ("AI suggestions" → data generation). */
  needsDefault: boolean;
}

export async function chooseAiTask(
  callWS: CallWS,
  states: States | undefined
): Promise<AiTaskChoice> {
  const ids = aiTaskEntityIds(states);
  if (ids.length === 0) return { entityId: null, needsDefault: false };
  try {
    const prefs = await callWS<{ gen_data_entity_id?: string | null }>({
      type: 'ai_task/preferences/get',
    });
    const preferred = prefs?.gen_data_entity_id ?? null;
    const entityId = preferred && ids.includes(preferred) ? preferred : null;
    return { entityId, needsDefault: entityId === null };
  } catch {
    return { entityId: null, needsDefault: true };
  }
}

/** One `ai_task.generate_data` call; resolves the model's text reply. */
export async function generateWithAiTask(
  callWS: CallWS,
  entityId: string,
  taskName: string,
  instructions: string
): Promise<string> {
  const result = await callWS<{ response?: { data?: unknown } } | null>({
    type: 'call_service',
    domain: 'ai_task',
    service: 'generate_data',
    service_data: { task_name: taskName, instructions, entity_id: entityId },
    return_response: true,
  });
  const data = result?.response?.data;
  if (typeof data !== 'string' || !data.trim()) throw new Error('The AI returned no text');
  return data;
}

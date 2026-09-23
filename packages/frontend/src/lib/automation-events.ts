import { getHomeAssistantAPI } from '@/lib/ha-api';
import type { HomeAssistant } from '@/types/hass';

/**
 * Fires `flode_automation_saved` so other automations/scripts can react to
 * FLODE saves. Best-effort — never blocks or fails the save itself.
 */
export async function fireAutomationSaved(
  hass: HomeAssistant,
  entityId: string | undefined
): Promise<void> {
  if (!entityId) return;
  try {
    await getHomeAssistantAPI(hass).fireBusEvent('flode_automation_saved', {
      entity_id: entityId,
    });
  } catch (err) {
    console.warn('Failed to fire flode_automation_saved event:', err);
  }
}

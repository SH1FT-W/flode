import { useEffect } from 'react';
import { useHass } from '@/contexts/HassContext';

/**
 * Asks the HA frontend to load the backend "services", "triggers" and
 * "conditions" translations, so
 * `hass.localize('component.light.services.turn_on.name')` returns the
 * user's language ("Einschalten") for node summaries instead of falling back
 * to the English service name. `loadBackendTranslation` is an undocumented
 * frontend-internal method (panel mode only) — silently skipped when absent.
 */
export function useBackendTranslations(): void {
  const { hass } = useHass();
  const language = hass?.language;
  const hasHass = hass !== undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per hass session/language, not on every state update
  useEffect(() => {
    if (!hass || !('loadBackendTranslation' in hass)) return;
    const load = hass.loadBackendTranslation;
    if (typeof load === 'function') {
      // services: action names; triggers/conditions: names of HA's target-based types
      for (const category of ['services', 'triggers', 'conditions']) {
        void Promise.resolve(load.call(hass, category)).catch(() => undefined);
      }
    }
  }, [hasHass, language]);
}

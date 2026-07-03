import { useEffect } from 'react';
import { useHass } from '@/contexts/HassContext';
import { applyHaTheme } from '@/lib/ha-theme';

/**
 * Mirrors HA's active theme (light/dark + custom theme overrides) onto
 * FLODE's own CSS custom properties on every `hass` update. Required because
 * FLODE currently runs in an iframe, so CSS custom properties set on HA's
 * document never inherit into FLODE's — see docs/ha-native-migration.md.
 */
export function useHaThemeSync() {
  const { hass } = useHass();

  useEffect(() => {
    applyHaTheme(document.documentElement, hass);
  }, [hass]);
}

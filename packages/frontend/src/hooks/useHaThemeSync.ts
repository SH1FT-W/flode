import { useEffect } from 'react';
import { useAppRoot } from '@/contexts/AppRootContext';
import { useHass } from '@/contexts/HassContext';
import { applyHaTheme } from '@/lib/ha-theme';

/**
 * Mirrors HA's active theme (light/dark + custom theme overrides) onto
 * FLODE's own CSS custom properties on every `hass` update, writing them
 * onto the app-root element (see contexts/AppRootContext.tsx) rather than
 * `document.documentElement` — in panel mode that's HA's own shared `<html>`,
 * which we must not mutate; the app-root div inside our shadow root is the
 * correct, self-contained target either way.
 */
export function useHaThemeSync() {
  const { hass } = useHass();
  const appRoot = useAppRoot();

  useEffect(() => {
    if (!appRoot) return;
    applyHaTheme(appRoot, hass);
  }, [hass, appRoot]);
}

import { useEffect } from 'react';
import { useAppRoot } from '@/contexts/AppRootContext';
import { useHass } from '@/contexts/HassContext';
import { useThemeOverride } from '@/contexts/ThemeOverrideContext';
import { applyHaTheme } from '@/lib/ha-theme';

/**
 * Mirrors HA's active theme (light/dark + custom theme overrides) onto
 * FLODE's own CSS custom properties on every `hass` update, writing them
 * onto the app-root element (see contexts/AppRootContext.tsx) rather than
 * `document.documentElement` — in panel mode that's HA's own shared `<html>`,
 * which we must not mutate; the app-root div inside our shadow root is the
 * correct, self-contained target either way.
 *
 * Reads FLODE's own light/dark override from ThemeOverrideContext and passes
 * it straight through to applyHaTheme — same source of truth as useDarkMode,
 * so the CSS variables set here always agree with components branching on
 * useDarkMode().
 */
export function useHaThemeSync() {
  const { hass } = useHass();
  const appRoot = useAppRoot();
  const { themeOverride } = useThemeOverride();

  useEffect(() => {
    if (!appRoot) return;
    applyHaTheme(appRoot, hass, themeOverride);
  }, [hass, appRoot, themeOverride]);
}

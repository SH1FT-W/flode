import { useThemeOverride } from '@/contexts/ThemeOverrideContext';
import { useHass } from '../contexts/HassContext';

/**
 * The single source of truth for "is FLODE in dark mode right now" — combines
 * HA's real `hass.themes.darkMode` with FLODE's own override (see
 * contexts/ThemeOverrideContext.tsx). Every component that branches on dark
 * mode (canvas colors, YAML editor syntax theme, edge markers, ...) MUST go
 * through this hook rather than reading `hass.themes.darkMode` directly —
 * otherwise it drifts out of sync with the CSS variables applyHaTheme writes
 * (see useHaThemeSync.ts), which is what caused unreadable light-mode output
 * (dark-tuned colors/editor-theme on a light background) before this existed.
 *
 * Reads `hass.themes.darkMode` directly on every render instead of caching
 * it in state — avoids stale values when HA mutates the themes object
 * without replacing the hass reference.
 */
export function useDarkMode() {
  const { hass } = useHass();
  const { themeOverride } = useThemeOverride();

  if (themeOverride === 'auto') return hass?.themes?.darkMode ?? false;
  return themeOverride === 'dark';
}

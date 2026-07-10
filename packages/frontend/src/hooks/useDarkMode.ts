import { useHass } from '../contexts/HassContext';

/**
 * Hook to detect and sync with Home Assistant's dark mode.
 * Reads hass.themes.darkMode directly on every render instead of
 * caching it in state — avoids stale values when HA mutates the
 * themes object without replacing the hass reference.
 */
export function useDarkMode() {
  const { hass } = useHass();
  return hass?.themes?.darkMode ?? false;
}

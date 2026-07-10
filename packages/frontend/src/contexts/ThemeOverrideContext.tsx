import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useState,
} from 'react';
import type { ThemeOverride } from '@/lib/ha-theme';

const STORAGE_KEY = 'flode_theme_override';

function isThemeOverride(value: string | null): value is ThemeOverride {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function loadThemeOverride(): ThemeOverride {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeOverride(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

interface ThemeOverrideContextProps {
  themeOverride: ThemeOverride;
  setThemeOverride: (value: ThemeOverride) => void;
}

const ThemeOverrideContext = createContext<ThemeOverrideContextProps | undefined>(undefined);

/**
 * FLODE's own light/dark override (see lib/ha-theme.ts), persisted in
 * localStorage. Lives in a shared context — not a plain per-component hook —
 * because every consumer (useDarkMode, useHaThemeSync, ThemeToggle, ...) must
 * observe the exact same value; independent `useState` instances reading the
 * same localStorage key would drift out of sync with each other the moment
 * one of them changed it.
 */
export const ThemeOverrideProvider: FC<PropsWithChildren> = ({ children }) => {
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>(loadThemeOverride);

  const setThemeOverride = useCallback((value: ThemeOverride) => {
    setThemeOverrideState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <ThemeOverrideContext.Provider value={{ themeOverride, setThemeOverride }}>
      {children}
    </ThemeOverrideContext.Provider>
  );
};

export function useThemeOverride(): ThemeOverrideContextProps {
  const context = useContext(ThemeOverrideContext);
  if (context === undefined) {
    throw new Error('useThemeOverride must be used within a ThemeOverrideProvider');
  }
  return context;
}

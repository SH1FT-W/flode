import { createContext, useContext } from 'react';

/**
 * The element FLODE's React tree is mounted into — either a `<div>` inside
 * the `flode-panel` custom element's Shadow DOM (panel mode) or the plain
 * `#root` div in `index.html` (standalone dev mode). In both cases it is
 * where our compiled CSS lives, so it doubles as:
 *  - the target for HA theme-variable writes and the `dark` class
 *    (see hooks/useHaThemeSync.ts, App.tsx) instead of `document.documentElement`
 *  - the default portal container for Radix overlays (Dialog/DropdownMenu/
 *    Popover/Select) instead of `document.body` — required in panel mode so
 *    portaled content stays inside the shadow root and keeps its styling.
 */
const AppRootContext = createContext<HTMLElement | null>(null);

export const AppRootProvider = AppRootContext.Provider;

export function useAppRoot(): HTMLElement | null {
  return useContext(AppRootContext);
}

/** Portal container for Radix UI overlays. `undefined` = Radix's own default (`document.body`). */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(AppRootContext) ?? undefined;
}

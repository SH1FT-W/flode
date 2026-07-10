import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { AppRootProvider } from './contexts/AppRootContext';
import { HassProvider } from './contexts/HassContext';
import { ThemeOverrideProvider } from './contexts/ThemeOverrideContext';
import i18n from './i18n';
import type { HomeAssistant } from './types/hass';

export interface FlodeAppHandle {
  /** Re-renders with fresh `hass`/`narrow`/language-override state (panel mode only — HA gives us fresh values on every update). */
  update: (hass: HomeAssistant | undefined, narrow?: boolean, languageOverride?: string) => void;
  unmount: () => void;
}

/**
 * Mounts the FLODE React app into `container`. Shared by panel-wrapper.ts
 * (Shadow DOM, real `hass` from HA) and main.tsx (standalone dev, remote
 * WebSocket mode) so both paths render through the exact same tree —
 * `container` itself is always the "app root" (see contexts/AppRootContext.tsx),
 * regardless of whether it lives inside a shadow root or the plain document.
 */
export function mountFlodeApp(
  container: HTMLElement,
  options: {
    initialHass?: HomeAssistant;
    initialNarrow?: boolean;
    initialLanguageOverride?: string;
    forceMode?: 'remote';
  } = {}
): FlodeAppHandle {
  // `color`/`background-color` must be declared on this exact element, not
  // just further up (`:host`/`:root`/`body` in index.css) — App.tsx toggles
  // the `.dark` class on this same `container` (see useAppRoot/AppRootContext),
  // and CSS custom-property overrides from a class only affect ordinary
  // properties like `color` that are declared ON that element (or below).
  // Declaring them higher up locks in whichever mode was active at that
  // higher element (which never gets `.dark` toggled) and never re-resolves,
  // so dark mode silently kept rendering light-mode text/background.
  container.classList.add('bg-background', 'text-foreground');

  const root = ReactDOM.createRoot(container);

  const render = (hass?: HomeAssistant, narrow?: boolean, languageOverride?: string) => {
    root.render(
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <AppRootProvider value={container}>
            <HassProvider
              externalHass={hass}
              externalNarrow={narrow}
              externalLanguageOverride={languageOverride}
              forceMode={options.forceMode}
            >
              <ThemeOverrideProvider>
                <App />
              </ThemeOverrideProvider>
            </HassProvider>
          </AppRootProvider>
        </I18nextProvider>
      </React.StrictMode>
    );
  };

  render(options.initialHass, options.initialNarrow, options.initialLanguageOverride);

  return {
    update: render,
    unmount: () => root.unmount(),
  };
}

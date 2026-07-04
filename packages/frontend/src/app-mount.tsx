import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { AppRootProvider } from './contexts/AppRootContext';
import { HassProvider } from './contexts/HassContext';
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
              <App />
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

import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { AppRootProvider } from './contexts/AppRootContext';
import { HassProvider } from './contexts/HassContext';
import i18n from './i18n';
import type { HomeAssistant } from './types/hass';

export interface FlodeAppHandle {
  /** Re-renders with a fresh `hass` object (panel mode only — HA gives us a new one on every update). */
  update: (hass: HomeAssistant | undefined) => void;
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
  options: { initialHass?: HomeAssistant; forceMode?: 'remote' } = {}
): FlodeAppHandle {
  const root = ReactDOM.createRoot(container);

  const render = (hass?: HomeAssistant) => {
    root.render(
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <AppRootProvider value={container}>
            <HassProvider externalHass={hass} forceMode={options.forceMode}>
              <App />
            </HassProvider>
          </AppRootProvider>
        </I18nextProvider>
      </React.StrictMode>
    );
  };

  render(options.initialHass);

  return {
    update: render,
    unmount: () => root.unmount(),
  };
}

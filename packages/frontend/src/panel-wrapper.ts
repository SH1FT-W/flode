/**
 * Home Assistant panel entry point for FLODE.
 *
 * Mounts the React app directly into a Shadow DOM on this custom element
 * (no iframe) so FLODE shares HA's document — required for native HA web
 * components (ha-entity-picker, ha-selector, ...) to work, since they live
 * in HA's document-wide `customElements` registry which an iframe cannot see.
 * See docs/ha-native-migration.md section 0 for the full rationale.
 *
 * The shadow root keeps FLODE's Tailwind styles from leaking into HA's own
 * UI (and vice versa) without the iframe's document isolation.
 */
import { type FlodeAppHandle, mountFlodeApp } from './app-mount';
import cssText from './index.css?inline';
import type { HomeAssistant } from './types/hass';

class FlodePanelWrapper extends HTMLElement {
  private _hass: HomeAssistant | undefined;
  private appHandle: FlodeAppHandle | null = null;

  set hass(value: HomeAssistant | undefined) {
    this._hass = value;
    this.appHandle?.update(value);
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.position = 'relative';

    const shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = cssText;
    shadow.appendChild(style);

    const appRoot = document.createElement('div');
    appRoot.style.width = '100%';
    appRoot.style.height = '100%';

    // Avoid a white/black flash before React's first theme-sync effect runs.
    const isDarkMode = this._hass?.themes?.darkMode ?? false;
    appRoot.style.background = isDarkMode ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)';

    shadow.appendChild(appRoot);

    this.appHandle = mountFlodeApp(appRoot, { initialHass: this._hass });
  }

  disconnectedCallback() {
    this.appHandle?.unmount();
    this.appHandle = null;
  }
}

// Register the custom element
if (!customElements.get('flode-panel')) {
  customElements.define('flode-panel', FlodePanelWrapper);
}

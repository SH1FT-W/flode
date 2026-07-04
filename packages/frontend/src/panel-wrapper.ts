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
import { registerHaToastTarget } from './lib/haToast';
import type { HomeAssistant } from './types/hass';

/** Minimal shape of HA's `CustomPanelInfo` — only the bit FLODE's own `config_flow` options populate. */
interface FlodePanelInfo {
  config?: {
    language?: string;
  };
}

class FlodePanelWrapper extends HTMLElement {
  private _hass: HomeAssistant | undefined;
  private _narrow = false;
  private _languageOverride: string | undefined;
  private appHandle: FlodeAppHandle | null = null;

  set hass(value: HomeAssistant | undefined) {
    this._hass = value;
    this.appHandle?.update(value, this._narrow, this._languageOverride);
  }

  get hass() {
    return this._hass;
  }

  /** Set by HA's panel-loading mechanism (`ha-panel-custom`), same as `hass`. */
  set narrow(value: boolean) {
    this._narrow = value;
    this.appHandle?.update(this._hass, value, this._languageOverride);
  }

  get narrow() {
    return this._narrow;
  }

  /** Set by `ha-panel-custom` — carries `config` from `panel_custom.async_register_panel`, i.e. FLODE's own options-flow settings. */
  set panel(value: FlodePanelInfo | undefined) {
    const language = value?.config?.language;
    this._languageOverride = language && language !== 'auto' ? language : undefined;
    this.appHandle?.update(this._hass, this._narrow, this._languageOverride);
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

    this.appHandle = mountFlodeApp(appRoot, {
      initialHass: this._hass,
      initialNarrow: this._narrow,
      initialLanguageOverride: this._languageOverride,
    });
    registerHaToastTarget(appRoot);
  }

  disconnectedCallback() {
    this.appHandle?.unmount();
    this.appHandle = null;
    registerHaToastTarget(null);
  }
}

// Register the custom element
if (!customElements.get('flode-panel')) {
  customElements.define('flode-panel', FlodePanelWrapper);
}

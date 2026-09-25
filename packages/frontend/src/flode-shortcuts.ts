import { css, html, LitElement } from 'lit';
import type { HomeAssistant } from './ha';
import { formatKeys, SHORTCUTS, type ShortcutGroup } from './shortcuts';
import { t } from './strings';

const GROUPS: readonly ShortcutGroup[] = ['general', 'edit', 'view'];
const GROUP_LABEL = {
  general: 'shortcutsGeneral',
  edit: 'shortcutsEdit',
  view: 'shortcutsView',
} as const;

/** "?": every keyboard shortcut, listed from the same table that binds them. */
export class FlodeShortcuts extends LitElement {
  static properties = {
    hass: { attribute: false },
    open: { type: Boolean },
  };

  declare hass: HomeAssistant | undefined;
  declare open: boolean;

  constructor() {
    super();
    this.open = false;
  }

  render() {
    const language = this.hass?.language ?? 'en';
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, 'shortcutsTitle')}
      width="medium"
      @closed=${() => this.dispatchEvent(new CustomEvent('closed'))}
    >
      <p class="muted">${t(language, 'shortcutsIntro')}</p>
      ${GROUPS.map(
        (group) => html`<h4>${t(language, GROUP_LABEL[group])}</h4>
          <div class="rows">
            ${SHORTCUTS.filter((shortcut) => shortcut.group === group).map(
              (shortcut) => html`<div class="row">
                <span>${t(language, shortcut.label)}</span>
                <span class="keys">
                  ${shortcut.keys.map((keys) => html`<kbd>${formatKeys(keys)}</kbd>`)}
                </span>
              </div>`
            )}
          </div>`
      )}
    </ha-dialog>`;
  }

  static styles = css`
    .muted {
      margin: 0 0 8px;
      color: var(--secondary-text-color);
    }
    h4 {
      margin: 16px 0 4px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .rows {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      column-gap: 24px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--divider-color);
      font-size: 14px;
    }
    .keys {
      display: flex;
      gap: 4px;
      flex: none;
    }
    kbd {
      min-width: 18px;
      padding: 2px 6px;
      border: 1px solid var(--divider-color);
      border-bottom-width: 2px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12px;
      text-align: center;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
    }
  `;
}

customElements.define('flode-shortcuts', FlodeShortcuts);

declare global {
  interface HTMLElementTagNameMap {
    'flode-shortcuts': FlodeShortcuts;
  }
}

import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import type { HomeAssistant } from './ha';
import { t } from './strings';

export type PaletteGroup = 'commands' | 'add' | 'open';

export interface PaletteEntry {
  id: string;
  group: PaletteGroup;
  label: string;
  icon: string;
  /** Shown on the right, e.g. "⌘S". */
  hint?: string;
  /** Extra words the search matches (entity ids, "automation" …). */
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER: readonly PaletteGroup[] = ['commands', 'add', 'open'];
const GROUP_LABEL = {
  commands: 'paletteCommands',
  add: 'paletteAdd',
  open: 'paletteOpen',
} as const;
/** Without a query, only this many automations/scripts are listed. */
const OPEN_WITHOUT_QUERY = 8;

/**
 * ⌘K: commands, adding blocks and opening automations/scripts in one
 * searchable list, inside HA's own dialog. The panel builds the entries.
 */
export class FlodePalette extends LitElement {
  static properties = {
    hass: { attribute: false },
    entries: { attribute: false },
    open: { type: Boolean },
    query: { state: true },
    index: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare entries: PaletteEntry[];
  declare open: boolean;
  declare query: string;
  declare index: number;

  constructor() {
    super();
    this.entries = [];
    this.open = false;
    this.query = '';
    this.index = 0;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has('open') && this.open) {
      this.query = '';
      this.index = 0;
      // HA's dialog animates in; focus the search once it's there.
      window.setTimeout(() => this.renderRoot.querySelector('input')?.focus(), 80);
    }
  }

  /** Matching entries, grouped in display order. */
  private get visible(): PaletteEntry[] {
    const words = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (entry: PaletteEntry) => {
      const haystack = `${entry.label} ${entry.keywords ?? ''}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    };
    return GROUP_ORDER.flatMap((group) => {
      const inGroup = this.entries.filter((entry) => entry.group === group && matches(entry));
      return group === 'open' && words.length === 0
        ? inGroup.slice(0, OPEN_WITHOUT_QUERY)
        : inGroup;
    });
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('closed'));
  }

  private choose(entry: PaletteEntry | undefined): void {
    if (!entry) return;
    this.close();
    // Close first — a command may open another dialog.
    window.setTimeout(() => entry.run(), 0);
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Keep typing inside the palette (HA and the canvas listen for keys on window).
    event.stopPropagation();
    const count = this.visible.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.index = count ? (this.index + 1) % count : 0;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.index = count ? (this.index - 1 + count) % count : 0;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.choose(this.visible[this.index]);
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  protected render() {
    const language = this.language;
    const visible = this.visible;
    let previous: PaletteGroup | null = null;
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, 'paletteTitle')}
      width="medium"
      @closed=${() => this.close()}
    >
      <div class="body" @keydown=${this.onKeyDown}>
        <label class="search">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input
            .value=${this.query}
            placeholder=${t(language, 'palettePlaceholder')}
            @input=${(event: InputEvent) => {
              if (event.target instanceof HTMLInputElement) {
                this.query = event.target.value;
                this.index = 0;
              }
            }}
          />
        </label>
        <div class="list" role="listbox">
          ${
            visible.length === 0
              ? html`<p class="empty">${t(language, 'paletteNothing')}</p>`
              : visible.map((entry, i) => {
                  const header =
                    entry.group !== previous
                      ? html`<div class="group">${t(language, GROUP_LABEL[entry.group])}</div>`
                      : nothing;
                  previous = entry.group;
                  return html`${header}<button
                      class="row ${i === this.index ? 'active' : ''}"
                      role="option"
                      aria-selected=${i === this.index ? 'true' : 'false'}
                      @mousemove=${() => {
                        this.index = i;
                      }}
                      @click=${() => this.choose(entry)}
                    >
                      <ha-icon .icon=${entry.icon}></ha-icon>
                      <span class="label">${entry.label}</span>
                      ${entry.hint ? html`<span class="hint">${entry.hint}</span>` : nothing}
                    </button>`;
                })
          }
        </div>
      </div>
    </ha-dialog>`;
  }

  static styles = css`
    .body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 320px;
    }
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
      background: var(--card-background-color);
    }
    .search:focus-within {
      border-color: var(--primary-color);
    }
    .search input {
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 15px;
    }
    .list {
      display: flex;
      flex-direction: column;
      max-height: 55vh;
      overflow-y: auto;
    }
    .group {
      padding: 10px 8px 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 10px;
      border: 0;
      border-radius: 8px;
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      color: var(--primary-text-color);
      background: transparent;
      --mdc-icon-size: 20px;
    }
    .row ha-icon {
      color: var(--secondary-text-color);
    }
    .row.active {
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .hint {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .empty {
      margin: 16px 8px;
      color: var(--secondary-text-color);
    }
  `;
}

customElements.define('flode-palette', FlodePalette);

declare global {
  interface HTMLElementTagNameMap {
    'flode-palette': FlodePalette;
  }
}

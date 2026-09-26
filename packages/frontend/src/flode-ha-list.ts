import { css, LitElement, nothing, type PropertyValues } from 'lit';
import {
  type AutomationListItem,
  type FlowKind,
  type HassEntityState,
  type HomeAssistant,
  listFlows,
} from './ha';

/** HA's list pages (Settings → Automations / Scripts) — FLODE shows their table. */
const PICKER: Record<FlowKind, { tag: string; prop: string }> = {
  automation: { tag: 'ha-automation-picker', prop: 'automations' },
  script: { tag: 'ha-script-picker', prop: 'scripts' },
};

/** Tags `ensureAutomationEditors` must have registered for this view to work. */
export const HA_LIST_TAGS = ['ha-automation-picker', 'ha-script-picker'];

/**
 * HA's page frame around the table — its app bar (menu, tabs, help) and the
 * "create" button — is FLODE's own start screen here. On phones the app bar
 * holds HA's search field, so only its buttons go.
 */
const FRAME_CSS = `
  ha-menu-button, ha-icon-button-arrow-prev, #tabbar, #toolbar-icon, #fab, .fab-bottom-space {
    display: none !important;
  }
  /* HA pins its narrow page to the viewport — here it sits inside FLODE's page. */
  :host([narrow]) {
    position: relative;
    width: auto;
  }
  :host(:not([narrow])) .toolbar {
    display: none;
  }
  :host(:not([narrow])) .container {
    height: 100%;
  }
  :host([narrow]) .toolbar {
    background: transparent;
    border-bottom: 1px solid var(--divider-color);
  }
`;

let frameSheet: CSSStyleSheet | null = null;

function frameStyles(): CSSStyleSheet {
  if (!frameSheet) {
    frameSheet = new CSSStyleSheet();
    frameSheet.replaceSync(FRAME_CSS);
  }
  return frameSheet;
}

/** HA's `fireEvent` puts `detail` on a plain `Event`, not a `CustomEvent`. */
function detailField(event: Event, key: string): unknown {
  const detail: unknown = Reflect.get(event, 'detail');
  return typeof detail === 'object' && detail !== null ? Reflect.get(detail, key) : undefined;
}

async function settled(element: Element): Promise<void> {
  const done: unknown = Reflect.get(element, 'updateComplete');
  if (done instanceof Promise) await done;
}

/**
 * HA's own automation / script table — filters, grouping, sorting, search,
 * labels and bulk actions exactly as in Settings → Automations — inside
 * FLODE's start screen. A click on a row opens the flow editor instead of HA's.
 */
export class FlodeHaList extends LitElement {
  static properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    kind: { attribute: false },
  };

  declare hass: HomeAssistant | undefined;
  declare narrow: boolean;
  declare kind: FlowKind;

  private statesSeen: Record<string, HassEntityState> | null = null;
  private entities: Record<FlowKind, HassEntityState[]> = { automation: [], script: [] };
  /** One HA page per kind, kept while switching — its table keeps filters and scroll. */
  private pickers = new Map<FlowKind, HTMLElement>();
  private framed = new WeakSet<HTMLElement>();

  constructor() {
    super();
    this.narrow = false;
    this.kind = 'automation';
    // Captured on the way down, before HA's page navigates to its own editor.
    this.addEventListener('row-click', this.interceptRowClick, { capture: true });
    this.addEventListener('selection-changed', this.forwardSelection);
  }

  /** HA's table page inside the picker. */
  private get table(): HTMLElement | null {
    const picker = this.pickers.get(this.kind);
    const table = picker?.shadowRoot?.querySelector('hass-tabs-subpage-data-table');
    return table instanceof HTMLElement ? table : null;
  }

  /** HA's select mode (checkboxes + selection bar). */
  startSelection(): void {
    const table = this.table;
    if (table) Reflect.set(table, '_selectMode', true);
  }

  clearSelection(): void {
    const table = this.table;
    if (!table) return;
    const clear: unknown = Reflect.get(table, 'clearSelection');
    if (typeof clear === 'function') clear.call(table);
    Reflect.set(table, '_selectMode', false);
  }

  private entitiesOf(kind: FlowKind): HassEntityState[] {
    const states = this.hass?.states;
    if (states && states !== this.statesSeen) {
      this.statesSeen = states;
      const all = Object.values(states);
      this.entities = {
        automation: all.filter((s) => s.entity_id.startsWith('automation.')),
        script: all.filter((s) => s.entity_id.startsWith('script.')),
      };
    }
    return this.entities[kind];
  }

  private interceptRowClick = (event: Event): void => {
    const id = detailField(event, 'id');
    if (!this.hass || typeof id !== 'string') return;
    const item = listFlows(this.hass, this.kind).find((entry) => entry.entityId === id);
    // YAML-only automations have no config id — HA's page shows them read-only.
    if (!item) return;
    event.stopPropagation();
    this.emit<AutomationListItem>('open-item', item);
  };

  private forwardSelection = (event: Event): void => {
    const value = detailField(event, 'value');
    if (Array.isArray(value)) {
      this.emit(
        'selection',
        value.filter((id): id is string => typeof id === 'string')
      );
    }
  };

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }

  protected render() {
    if (!this.hass) return nothing;
    let picker = this.pickers.get(this.kind);
    if (!picker) {
      picker = document.createElement(PICKER[this.kind].tag);
      picker.className = 'picker';
      this.pickers.set(this.kind, picker);
    }
    Reflect.set(picker, 'hass', this.hass);
    Reflect.set(picker, 'narrow', this.narrow);
    Reflect.set(picker, 'route', { prefix: '/flode', path: `/${this.kind}` });
    Reflect.set(picker, PICKER[this.kind].prop, this.entitiesOf(this.kind));
    return picker;
  }

  protected async updated(changed: PropertyValues<this>): Promise<void> {
    super.updated(changed);
    const picker = this.pickers.get(this.kind);
    if (!picker) return;
    await settled(picker);
    const table = this.table;
    if (!table || this.framed.has(table)) return;
    await settled(table);
    const page = table.shadowRoot?.querySelector('hass-tabs-subpage');
    if (!page?.shadowRoot) return;
    this.framed.add(table);
    // No tabs: on phones HA would otherwise add its bottom tab bar.
    Object.defineProperty(table, 'tabs', {
      configurable: true,
      get: () => [],
      set: () => undefined,
    });
    const refresh: unknown = Reflect.get(table, 'requestUpdate');
    if (typeof refresh === 'function') refresh.call(table);
    page.shadowRoot.adoptedStyleSheets = [...page.shadowRoot.adoptedStyleSheets, frameStyles()];
  }

  static styles = css`
    :host {
      display: block;
    }
    .picker {
      display: block;
      height: 100%;
    }
  `;
}

customElements.define('flode-ha-list', FlodeHaList);

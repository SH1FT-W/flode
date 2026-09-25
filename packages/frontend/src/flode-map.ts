import { isPlainObject } from '@flode/shared';
import {
  buildDependencyMap,
  type DependencyItem,
  type DependencyItemInput,
  type DependencyMap,
  type EntityReferenceUsage,
  type ReferenceRole,
} from '@flode/ui-core';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { type AutomationListItem, type HomeAssistant, listFlows, loadFlowConfig } from './ha';
import { mapT, summaryContext } from './i18n';

type IssueKind = 'conflicts' | 'selfTriggers' | 'missing' | 'chains';

const ISSUE_KINDS: readonly IssueKind[] = ['conflicts', 'selfTriggers', 'missing', 'chains'];
const ISSUE_ICONS: Record<IssueKind, string> = {
  conflicts: 'mdi:swap-horizontal',
  selfTriggers: 'mdi:repeat',
  missing: 'mdi:file-question-outline',
  chains: 'mdi:source-branch',
};
const MAX_RESULTS = 60;
/** Config requests in flight at once (a home can have 100+ automations). */
const PARALLEL_LOADS = 8;

/** One map per page view; "Neu einlesen" rebuilds it. */
let cached: { map: DependencyMap; loadedAt: Date } | null = null;

async function loadInputs(hass: HomeAssistant): Promise<DependencyItemInput[]> {
  const items = [...listFlows(hass, 'automation'), ...listFlows(hass, 'script')];
  const inputs: DependencyItemInput[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      if (!item) continue;
      try {
        const config = await loadFlowConfig(hass, item.kind, item.configId);
        if (isPlainObject(config)) {
          inputs.push({
            kind: item.kind,
            id: item.configId,
            entityId: item.entityId,
            name: item.name,
            config,
          });
        }
      } catch {
        // Not editable in the UI (YAML-only) — left out of the map.
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_LOADS }, worker));
  return inputs;
}

/**
 * "Zusammenhänge": every automation and script at once — who listens to
 * what, who switches what, chains between them, opposite control and
 * references to entities that no longer exist (`@flode/ui-core`'s dependency-map).
 */
export class FlodeMap extends LitElement {
  static properties = {
    hass: { attribute: false },
    query: { attribute: false },
    map: { state: true },
    loadedAt: { state: true },
    loading: { state: true },
    issue: { state: true },
    focusId: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare query: string;
  declare map: DependencyMap | null;
  declare loadedAt: Date | null;
  declare loading: boolean;
  declare issue: IssueKind;
  declare focusId: string | null;

  constructor() {
    super();
    this.query = '';
    this.map = cached?.map ?? null;
    this.loadedAt = cached?.loadedAt ?? null;
    this.loading = false;
    this.issue = 'conflicts';
    this.focusId = null;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  private m(key: string, options?: Record<string, unknown>): string {
    return mapT(this.language, key, options);
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!cached) void this.reload();
  }

  async reload(): Promise<void> {
    const hass = this.hass;
    if (!hass || this.loading) return;
    this.loading = true;
    try {
      const inputs = await loadInputs(hass);
      const states = this.hass?.states ?? hass.states;
      const map = buildDependencyMap(inputs, (entityId) => states[entityId] !== undefined);
      cached = { map, loadedAt: new Date() };
      this.map = map;
      this.loadedAt = cached.loadedAt;
    } finally {
      this.loading = false;
    }
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    // First hass after the element was created before HA handed it over.
    if (changed.has('hass') && !changed.get('hass') && !cached && !this.loading) void this.reload();
  }

  private label(id: string): string {
    const item = this.map?.items[id];
    if (item) return item.name;
    const name = this.hass?.states[id]?.attributes.friendly_name;
    return typeof name === 'string' ? name : id;
  }

  /** HA's own service name ("Leuchte einschalten"), like the card summaries. */
  private serviceNote(service: string | undefined): string | undefined {
    const ctx = summaryContext(this.hass);
    return service ? (ctx?.serviceLabel(service) ?? service) : undefined;
  }

  private chip(
    id: string,
    options: { note?: string; tone?: 'warning' | 'missing' } = {}
  ): TemplateResult {
    const isItem = this.map?.items[id] !== undefined;
    return html`<button
      class="chip ${options.tone ?? ''} ${this.focusId === id ? 'focused' : ''}"
      title=${id}
      @click=${() => {
        this.focusId = id;
      }}
    >
      ${isItem ? html`<ha-icon icon=${id.startsWith('script.') ? 'mdi:script-text-outline' : 'mdi:robot-outline'}></ha-icon>` : nothing}
      <span class="chip-label">${this.label(id)}</span>
      ${options.note ? html`<span class="chip-note">${options.note}</span>` : nothing}
    </button>`;
  }

  private group(title: string, entries: TemplateResult[]) {
    if (entries.length === 0) return nothing;
    return html`<section class="group">
      <h4>${title} <span class="count">${entries.length}</span></h4>
      <div class="chips">${entries}</div>
    </section>`;
  }

  private renderIssueList() {
    const map = this.map;
    if (!map) return nothing;
    const rows = (() => {
      switch (this.issue) {
        case 'conflicts':
          return map.conflicts.map(
            (c) => html`<div class="row">
              ${this.chip(c.entityId, { tone: 'warning' })}
              <span class="break"></span>
              ${this.chip(c.a.item, { note: this.serviceNote(c.a.service) })}
              <ha-icon class="arrow warn" icon="mdi:swap-horizontal"></ha-icon>
              ${this.chip(c.b.item, { note: this.serviceNote(c.b.service) })}
            </div>`
          );
        case 'selfTriggers':
          return map.selfTriggers.map(
            (s) => html`<div class="row">
              ${this.chip(s.item)}<ha-icon class="arrow warn" icon="mdi:repeat"></ha-icon>${this.chip(s.entityId)}
            </div>`
          );
        case 'missing':
          return map.missing.map(
            (x) => html`<div class="row">
              ${this.chip(x.item)}<ha-icon class="arrow" icon="mdi:arrow-right"></ha-icon>${this.chip(x.entityId, { tone: 'missing' })}
              <span class="role">${this.m(`role.${x.role}`)}</span>
            </div>`
          );
        default:
          return map.chains.map(
            (c) => html`<div class="row">
              ${this.chip(c.from)}<ha-icon class="arrow" icon="mdi:arrow-right"></ha-icon>
              ${c.via !== c.to ? html`${this.chip(c.via)}<ha-icon class="arrow" icon="mdi:arrow-right"></ha-icon>` : nothing}
              ${this.chip(c.to)}
            </div>`
          );
      }
    })();
    return html`<h3>${this.m(`issues.${this.issue}.title`)}</h3>
      ${rows.length > 0 ? rows : html`<p class="muted">${this.m(`issues.${this.issue}.empty`)}</p>`}`;
  }

  private searchResults(): string[] {
    const map = this.map;
    const q = this.query.trim().toLowerCase();
    if (!map || !q) return [];
    const ids = new Set([...Object.keys(map.items), ...Object.keys(map.usage)]);
    return [...ids]
      .filter((id) => id.includes(q) || this.label(id).toLowerCase().includes(q))
      .sort((a, b) => this.label(a).localeCompare(this.label(b)))
      .slice(0, MAX_RESULTS);
  }

  private renderResults() {
    const map = this.map;
    if (!map) return nothing;
    const results = this.searchResults();
    return html`<h3>${this.m('results', { count: results.length })}</h3>
      ${
        results.length === 0
          ? html`<p class="muted">${this.m('noResults')}</p>`
          : results.map((id) => {
              const item = map.items[id];
              const uses = map.usage[id] ?? [];
              return html`<div class="row">
                ${this.chip(id)}
                <span class="role">
                  ${
                    item
                      ? this.m('refCount', { count: item.references.length })
                      : this.m('useCount', { count: new Set(uses.map((u) => u.item)).size })
                  }
                </span>
              </div>`;
            })
      }`;
  }

  private openItem(item: DependencyItem): void {
    const flow: AutomationListItem = {
      kind: item.kind,
      entityId: item.entityId,
      configId: item.id,
      name: item.name,
      enabled: true,
      lastTriggered: null,
    };
    this.dispatchEvent(new CustomEvent('open-item', { detail: flow }));
  }

  private renderItemFocus(item: DependencyItem, map: DependencyMap) {
    const refs = (roles: ReferenceRole[]) => item.references.filter((r) => roles.includes(r.role));
    const conflicts = map.conflicts.filter(
      (c) => c.a.item === item.entityId || c.b.item === item.entityId
    );
    const selfTrigger = map.selfTriggers.filter((s) => s.item === item.entityId);
    const missing = new Set(
      map.missing.filter((x) => x.item === item.entityId).map((x) => x.entityId)
    );
    const refChips = (roles: ReferenceRole[]) =>
      refs(roles).map((r) =>
        this.chip(r.entityId, {
          note: this.serviceNote(r.service),
          ...(missing.has(r.entityId) ? { tone: 'missing' as const } : {}),
        })
      );
    return html`
      <div class="focus-head">
        <div>
          <div class="kind">${this.m(`kind.${item.kind}`)}</div>
          <h3 class="name">${item.name}</h3>
          <div class="id">${item.entityId}</div>
        </div>
        <ha-button appearance="plain" @click=${() => this.openItem(item)}>
          <ha-icon slot="start" icon="mdi:open-in-app"></ha-icon>${this.m('open')}
        </ha-button>
      </div>
      ${
        conflicts.length || selfTrigger.length || missing.size
          ? html`<div class="notice warn">
              ${conflicts.map((c) => {
                const other = c.a.item === item.entityId ? c.b : c.a;
                return html`<div class="row">
                  ${this.m('focus.conflictWith')} ${this.chip(other.item)} ${this.m('focus.on')} ${this.chip(c.entityId)}
                </div>`;
              })}
              ${selfTrigger.map((x) => html`<div class="row">${this.m('focus.selfTrigger')} ${this.chip(x.entityId)}</div>`)}
              ${missing.size ? html`<div>${this.m('focus.missing', { count: missing.size })}</div>` : nothing}
            </div>`
          : nothing
      }
      ${this.group(
        this.m('focus.triggeredBy'),
        map.chains.filter((c) => c.to === item.entityId).map((c) => this.chip(c.from))
      )}
      ${this.group(this.m('focus.listensTo'), refChips(['trigger']))}
      ${this.group(this.m('focus.reads'), refChips(['condition', 'template']))}
      ${this.group(this.m('focus.controls'), refChips(['action']))}
      ${this.group(
        this.m('focus.triggers'),
        map.chains.filter((c) => c.from === item.entityId).map((c) => this.chip(c.to))
      )}
    `;
  }

  private renderEntityFocus(entityId: string, map: DependencyMap) {
    const uses = map.usage[entityId] ?? [];
    const state = this.hass?.states[entityId]?.state;
    const unique = (list: EntityReferenceUsage[]) => [
      ...new Map(list.map((u) => [`${u.item}-${u.service ?? ''}`, u])).values(),
    ];
    const byRole = (roles: ReferenceRole[]) => unique(uses.filter((u) => roles.includes(u.role)));
    return html`
      <div class="focus-head">
        <div>
          <div class="kind">${this.m('kind.entity')}</div>
          <h3 class="name">${this.label(entityId)}</h3>
          <div class="id">${entityId} ${state !== undefined ? html`<span class="state">${state}</span>` : nothing}</div>
        </div>
      </div>
      ${
        state === undefined
          ? html`<div class="notice missing">
              ${this.m('focus.entityMissing', { count: new Set(uses.map((u) => u.item)).size })}
            </div>`
          : nothing
      }
      ${uses.length === 0 ? html`<p class="muted">${this.m('focus.unused')}</p>` : nothing}
      ${this.group(
        this.m('focus.usedAsTrigger'),
        byRole(['trigger']).map((u) => this.chip(u.item))
      )}
      ${this.group(
        this.m('focus.usedAsCondition'),
        byRole(['condition', 'template']).map((u) => this.chip(u.item))
      )}
      ${this.group(
        this.m('focus.controlledBy'),
        byRole(['action']).map((u) => this.chip(u.item, { note: this.serviceNote(u.service) }))
      )}
    `;
  }

  private renderFocus() {
    const map = this.map;
    const id = this.focusId;
    if (!map || !id) return html`<p class="muted">${this.m('focus.empty')}</p>`;
    const item = map.items[id];
    return item ? this.renderItemFocus(item, map) : this.renderEntityFocus(id, map);
  }

  render() {
    const map = this.map;
    if (!map) {
      return html`<div class="loading"><ha-spinner size="small"></ha-spinner>${this.m('loading')}</div>`;
    }
    const items = Object.values(map.items);
    const searching = this.query.trim() !== '';
    return html`
      <div class="summary">
        <span>
          ${this.m('summary', {
            automations: this.m('automationCount', {
              count: items.filter((i) => i.kind === 'automation').length,
            }),
            scripts: this.m('scriptCount', {
              count: items.filter((i) => i.kind === 'script').length,
            }),
            entities: Object.keys(map.usage).length,
          })}
        </span>
        <span class="spacer"></span>
        ${
          this.loadedAt
            ? html`<span class="muted">
                ${this.m('loadedAt', {
                  time: this.loadedAt.toLocaleTimeString(this.language, { timeStyle: 'short' }),
                })}
              </span>`
            : nothing
        }
        <ha-button appearance="plain" .disabled=${this.loading} @click=${() => void this.reload()}>
          <ha-icon slot="start" icon="mdi:refresh"></ha-icon>${this.m('reload')}
        </ha-button>
      </div>
      <div class="tiles">
        ${ISSUE_KINDS.map((kind) => {
          const count = map[kind].length;
          const active = this.issue === kind && !searching;
          return html`<button
            class="tile ${active ? 'active' : ''} ${count > 0 && kind !== 'chains' ? 'has' : ''}"
            @click=${() => {
              this.issue = kind;
              this.dispatchEvent(new CustomEvent('clear-query'));
            }}
          >
            <span class="tile-head"><ha-icon .icon=${ISSUE_ICONS[kind]}></ha-icon>${this.m(`issues.${kind}.title`)}</span>
            <span class="tile-count">${count}</span>
            <span class="tile-hint">${this.m(`issues.${kind}.hint`)}</span>
          </button>`;
        })}
      </div>
      <div class="columns">
        <div class="list">${searching ? this.renderResults() : this.renderIssueList()}</div>
        <ha-card class="focus">${this.renderFocus()}</ha-card>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 0;
      color: var(--secondary-text-color);
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 14px;
      color: var(--secondary-text-color);
    }
    .spacer {
      flex: 1;
    }
    .muted {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: 14px;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      font: inherit;
      text-align: left;
      cursor: pointer;
      color: var(--primary-text-color);
      background: var(--card-background-color);
      --mdc-icon-size: 18px;
    }
    .tile.active {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px var(--primary-color);
    }
    .tile-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .tile.has .tile-head ha-icon {
      color: var(--warning-color, #ffa600);
    }
    .tile-count {
      font-size: 24px;
      font-weight: 600;
    }
    .tile-hint {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 0.8fr);
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 800px) {
      .columns {
        grid-template-columns: 1fr;
      }
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }
    .row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--secondary-background-color);
    }
    .notice .row {
      padding: 2px 0;
      background: transparent;
    }
    .break {
      width: 100%;
    }
    .arrow {
      --mdc-icon-size: 15px;
      color: var(--secondary-text-color);
    }
    .arrow.warn {
      color: var(--warning-color, #ffa600);
    }
    .role {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      padding: 3px 9px;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      color: var(--primary-text-color);
      background: var(--card-background-color);
      --mdc-icon-size: 14px;
    }
    .chip:hover,
    .chip.focused {
      border-color: var(--primary-color);
    }
    .chip.warning {
      border-color: var(--warning-color, #ffa600);
    }
    .chip.missing {
      border-style: dashed;
      border-color: var(--error-color, #db4437);
      color: var(--error-color, #db4437);
    }
    .chip-label {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chip-note {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .focus {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
    }
    .focus-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .kind {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--secondary-text-color);
    }
    .name {
      margin: 2px 0;
      font-size: 17px;
    }
    .id {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .state {
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 6px;
      font-family: var(--ha-font-family-body, sans-serif);
      background: var(--secondary-background-color);
    }
    .notice {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
    }
    .notice.warn {
      background: color-mix(in srgb, var(--warning-color, #ffa600) 14%, transparent);
    }
    .notice.missing {
      background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
    }
    .group h4 {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .group .count {
      margin-left: 4px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `;
}

customElements.define('flode-map', FlodeMap);

declare global {
  interface HTMLElementTagNameMap {
    'flode-map': FlodeMap;
  }
}

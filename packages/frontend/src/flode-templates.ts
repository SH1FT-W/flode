import {
  formatTemplateResult,
  subscribeTemplatePreview,
  TEMPLATE_SNIPPETS,
  type TemplatePreview,
  templateResultType,
} from '@flode/ui-core';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { type AutomationListItem, getTrace, type HomeAssistant, listTraces } from './ha';
import { t } from './strings';
import { runVariables } from './trace';

const DRAFT_KEY = 'flode3.templateWorkshop';
const DEBOUNCE_MS = 350;

type VariableSource = 'none' | 'given' | 'lastRun';

function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? TEMPLATE_SNIPPETS[0].code;
  } catch {
    return TEMPLATE_SNIPPETS[0].code;
  }
}

function writeDraft(value: string): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, value);
  } catch {
    // Storage blocked — the draft just isn't kept.
  }
}

/**
 * Template workshop (⌘J): Jinja in HA's own code editor, rendered live by
 * Home Assistant (`render_template`) — with the result type, what it reacts
 * to and optionally the variables of a real run (`trigger`, `this`, …).
 */
export class FlodeTemplates extends LitElement {
  static properties = {
    hass: { attribute: false },
    open: { type: Boolean },
    /** The open automation/script — enables "last run" variables. */
    item: { attribute: false },
    /** Variables handed over from a run step in the debug view. */
    given: { attribute: false },
    template: { state: true },
    source: { state: true },
    lastRun: { state: true },
    preview: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare open: boolean;
  declare item: AutomationListItem | null;
  declare given: Record<string, unknown> | null;
  declare template: string;
  declare source: VariableSource;
  declare lastRun: Record<string, unknown> | null;
  declare preview: TemplatePreview;

  private stop: (() => void) | undefined;
  private timer: number | undefined;

  constructor() {
    super();
    this.open = false;
    this.item = null;
    this.given = null;
    this.template = readDraft();
    this.source = 'none';
    this.lastRun = null;
    this.preview = { status: 'idle' };
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  private get variables(): Record<string, unknown> | undefined {
    if (this.source === 'given') return this.given ?? undefined;
    if (this.source === 'lastRun') return this.lastRun ?? undefined;
    return undefined;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') && this.open) {
      this.source = this.given ? 'given' : 'none';
      this.lastRun = null;
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!this.open) {
      this.stopPreview();
      return;
    }
    if (
      changed.has('open') ||
      changed.has('template') ||
      changed.has('source') ||
      changed.has('lastRun')
    ) {
      this.schedulePreview();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopPreview();
  }

  private stopPreview(): void {
    window.clearTimeout(this.timer);
    this.stop?.();
    this.stop = undefined;
  }

  private schedulePreview(): void {
    this.stopPreview();
    const connection = this.hass?.connection;
    if (!connection) return;
    this.timer = window.setTimeout(() => {
      this.stop = subscribeTemplatePreview(connection, this.template, this.variables, (preview) => {
        this.preview = preview;
      });
    }, DEBOUNCE_MS);
  }

  private async useLastRun(): Promise<void> {
    this.source = 'lastRun';
    const { hass, item } = this;
    if (!hass || !item || this.lastRun) return;
    const [latest] = await listTraces(hass, item.kind, item.configId);
    if (!latest) return;
    const trace = await getTrace(hass, item.kind, item.configId, latest.run_id);
    this.lastRun = runVariables(trace);
  }

  private setTemplate(value: string): void {
    this.template = value;
    writeDraft(value);
  }

  private renderPreview() {
    const language = this.language;
    const preview = this.preview;
    switch (preview.status) {
      case 'idle':
        return html`<p class="muted">${t(language, 'tplIdle')}</p>`;
      case 'loading':
        return html`<p class="muted running"><ha-spinner size="tiny"></ha-spinner>${t(language, 'tplRendering')}</p>`;
      case 'error':
        return html`<ha-alert alert-type="error"><span class="mono">${preview.message}</span></ha-alert>`;
      default: {
        const text = formatTemplateResult(preview.result);
        const listeners = preview.listeners;
        return html`<div class="result">
            <span class="type">${t(language, `tplType_${templateResultType(preview.result)}`)}</span>
            <pre>${text === '' ? html`<em class="muted">${t(language, 'tplEmpty')}</em>` : text}</pre>
          </div>
          ${
            listeners
              ? html`<div class="listeners">
                  <span>${t(language, 'tplUpdatesOn')}</span>
                  ${listeners.all ? html`<span class="pill warn">${t(language, 'tplAllStates')}</span>` : nothing}
                  ${listeners.time ? html`<span class="pill">${t(language, 'tplTime')}</span>` : nothing}
                  ${listeners.domains.map((domain) => html`<span class="pill mono">${domain}.*</span>`)}
                  ${listeners.entities.map((entity) => html`<span class="pill mono">${entity}</span>`)}
                  ${
                    !listeners.all &&
                    !listeners.time &&
                    listeners.domains.length === 0 &&
                    listeners.entities.length === 0
                      ? html`<span class="pill">${t(language, 'tplStatic')}</span>`
                      : nothing
                  }
                </div>`
              : nothing
          }`;
      }
    }
  }

  render() {
    const language = this.language;
    const sources: VariableSource[] = [
      'none',
      ...(this.given ? (['given'] as const) : []),
      ...(this.item ? (['lastRun'] as const) : []),
    ];
    const sourceLabel = {
      none: 'tplSourceNone',
      given: 'tplSourceGiven',
      lastRun: 'tplSourceLastRun',
    } as const;
    const variables = this.variables;
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, 'tplTitle')}
      width="large"
      @closed=${() => this.dispatchEvent(new CustomEvent('closed'))}
    >
      <p class="muted intro">${t(language, 'tplIntro')}</p>
      <div class="columns" @keydown=${(event: KeyboardEvent) => event.stopPropagation()}>
        <div class="left">
          <ha-code-editor
            .hass=${this.hass}
            .value=${this.template}
            mode="jinja2"
            autocomplete-entities
            autocomplete-icons
            linewrap
            @value-changed=${(event: CustomEvent<{ value: string }>) => {
              event.stopPropagation();
              this.setTemplate(event.detail.value);
            }}
          ></ha-code-editor>
          <div class="snippets">
            ${TEMPLATE_SNIPPETS.map(
              (snippet) => html`<button
                class="chip"
                title=${snippet.code}
                @click=${() =>
                  this.setTemplate(
                    this.template.trim()
                      ? `${this.template.trimEnd()}\n${snippet.code}`
                      : snippet.code
                  )}
              >
                ${t(language, `tplSnippet_${snippet.key}`)}
              </button>`
            )}
          </div>
        </div>
        <div class="right">
          <h4>${t(language, 'tplVariables')}</h4>
          <div class="sources">
            ${sources.map(
              (source) => html`<button
                class="chip ${this.source === source ? 'active' : ''}"
                @click=${() => {
                  if (source === 'lastRun') void this.useLastRun();
                  else this.source = source;
                }}
              >
                ${t(language, sourceLabel[source])}
              </button>`
            )}
          </div>
          ${
            variables
              ? html`<div class="vars">
                  ${Object.keys(variables).map((name) => html`<span class="pill mono">${name}</span>`)}
                </div>`
              : nothing
          }
          <h4>${t(language, 'tplResult')}</h4>
          ${this.renderPreview()}
        </div>
      </div>
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${() => {
            void navigator.clipboard?.writeText(this.template);
            this.dispatchEvent(
              new CustomEvent('hass-notification', {
                detail: { message: t(language, 'tplCopied') },
                bubbles: true,
                composed: true,
              })
            );
          }}
        >
          <ha-icon slot="start" icon="mdi:content-copy"></ha-icon>${t(language, 'tplCopy')}
        </ha-button>
        <ha-button slot="primaryAction" @click=${() => this.dispatchEvent(new CustomEvent('closed'))}>
          OK
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    .intro {
      margin: 0 0 12px;
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
    }
    @media (max-width: 760px) {
      .columns {
        grid-template-columns: 1fr;
      }
    }
    .left,
    .right {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    ha-code-editor {
      min-height: 180px;
    }
    h4 {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .snippets,
    .sources,
    .vars,
    .listeners {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .chip {
      padding: 5px 10px;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      color: var(--primary-text-color);
      background: var(--card-background-color);
    }
    .chip:hover,
    .chip.active {
      border-color: var(--primary-color);
    }
    .chip.active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: var(--secondary-background-color);
    }
    .pill.warn {
      background: color-mix(in srgb, var(--warning-color, #ffa600) 20%, transparent);
    }
    .mono {
      font-family: var(--ha-font-family-code, monospace);
    }
    .result {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 10px;
      background: var(--secondary-background-color);
    }
    .type {
      flex: none;
      padding: 1px 6px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      background: var(--card-background-color);
    }
    pre {
      flex: 1;
      min-width: 0;
      margin: 0;
      max-height: 280px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: var(--ha-font-family-code, monospace);
      font-size: 13px;
    }
    .listeners {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .muted {
      color: var(--secondary-text-color);
      font-size: 14px;
    }
    .running {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
  `;
}

customElements.define('flode-templates', FlodeTemplates);

declare global {
  interface HTMLElementTagNameMap {
    'flode-templates': FlodeTemplates;
  }
}

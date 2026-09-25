import { type FlowGraph, FlowGraphSchema, isPlainObject } from '@flode/shared';
import { load as yamlLoad } from 'js-yaml';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { flowYaml } from './flow-yaml';
import { errorMessage, type FlowKind, type HomeAssistant } from './ha';
import { t } from './strings';

/** A flow read from pasted YAML or a JSON file — opened as a new, unsaved draft. */
export interface ImportedFlow {
  graph: FlowGraph;
  kind: FlowKind;
}

/** Scripts have a `sequence` and no triggers; everything else is read as an automation. */
export function yamlKind(config: unknown): FlowKind {
  if (!isPlainObject(config)) return 'automation';
  const hasTriggers = 'triggers' in config || 'trigger' in config;
  return 'sequence' in config && !hasTriggers ? 'script' : 'automation';
}

export async function flowFromYaml(yaml: string): Promise<ImportedFlow> {
  let config: unknown = yamlLoad(yaml);
  // A pasted scripts.yaml entry (`my_script: {…}`) — take the script itself.
  if (isPlainObject(config) && Object.keys(config).length === 1) {
    const [only] = Object.values(config);
    if (isPlainObject(only) && 'sequence' in only) config = only;
  }
  // automations.yaml is a list — the first automation.
  if (Array.isArray(config)) config = config[0];
  const kind = yamlKind(config);
  const { transpiler, parseFlowYaml } = await import('@flode/transpiler');
  const { dump } = await import('js-yaml');
  const result = await parseFlowYaml(transpiler, dump(config), kind, { keepBlocks: true });
  if (!result.success || !result.graph) throw new Error(result.errors?.join('\n') ?? 'parse');
  return { graph: result.graph, kind };
}

/** FLODE's own flow file (the graph as JSON). */
export function downloadFlowJson(graph: FlowGraph): void {
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(graph.name || 'flow').replace(/[^\wÀ-ɏ -]+/g, '').trim() || 'flow'}.flode.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFlowJson(): Promise<ImportedFlow | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then((text) => {
        try {
          const parsed = FlowGraphSchema.safeParse(JSON.parse(text));
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid');
          resolve({
            graph: parsed.data,
            kind: parsed.data.metadata?.kind === 'script' ? 'script' : 'automation',
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    input.click();
  });
}

/** "Paste YAML": an automation or script in HA's own code editor → a new draft. */
export class FlodeYamlImport extends LitElement {
  static properties = {
    hass: { attribute: false },
    open: { type: Boolean },
    yaml: { state: true },
    error: { state: true },
    busy: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare open: boolean;
  declare yaml: string;
  declare error: string | null;
  declare busy: boolean;

  constructor() {
    super();
    this.open = false;
    this.yaml = '';
    this.error = null;
    this.busy = false;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') && this.open) this.error = null;
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('closed'));
  }

  private async import(): Promise<void> {
    if (!this.yaml.trim() || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const flow = await flowFromYaml(this.yaml);
      this.yaml = '';
      this.dispatchEvent(new CustomEvent<ImportedFlow>('imported', { detail: flow }));
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.busy = false;
    }
  }

  render() {
    const language = this.hass?.language ?? 'en';
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, 'ioYamlTitle')}
      width="large"
      @closed=${() => this.close()}
    >
      <p class="muted">${t(language, 'ioYamlIntro')}</p>
      <ha-code-editor
        .hass=${this.hass}
        .value=${this.yaml}
        mode="yaml"
        autocomplete-entities
        @value-changed=${(event: CustomEvent<{ value: string }>) => {
          event.stopPropagation();
          this.yaml = event.detail.value;
        }}
        @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
      ></ha-code-editor>
      ${this.error ? html`<ha-alert alert-type="error">${this.error}</ha-alert>` : nothing}
      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" @click=${() => this.close()}>
          ${t(language, 'cancel')}
        </ha-button>
        <ha-button slot="primaryAction" .disabled=${this.busy || !this.yaml.trim()} @click=${() => void this.import()}>
          ${t(language, 'ioOpenDraft')}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    .muted {
      margin: 0 0 12px;
      color: var(--secondary-text-color);
    }
    ha-code-editor {
      min-height: 240px;
    }
    ha-alert {
      display: block;
      margin-top: 12px;
    }
  `;
}

/** "Show YAML": the whole flow as HA saves it, read-only in HA's code editor. */
export class FlodeYamlView extends LitElement {
  static properties = {
    hass: { attribute: false },
    graph: { attribute: false },
    kind: { attribute: false },
    open: { type: Boolean },
    yaml: { state: true },
    error: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare graph: FlowGraph | undefined;
  declare kind: FlowKind;
  declare open: boolean;
  declare yaml: string;
  declare error: string | null;

  constructor() {
    super();
    this.kind = 'automation';
    this.open = false;
    this.yaml = '';
    this.error = null;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') && this.open) void this.load();
  }

  private async load(): Promise<void> {
    const graph = this.graph;
    this.yaml = '';
    this.error = null;
    if (!graph) return;
    try {
      this.yaml = await flowYaml(graph, this.kind);
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  private copy(): void {
    const language = this.hass?.language ?? 'en';
    void navigator.clipboard?.writeText(this.yaml);
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message: t(language, 'ioYamlCopied') },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const language = this.hass?.language ?? 'en';
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, 'ioShowYaml')}
      width="large"
      @closed=${() => this.dispatchEvent(new CustomEvent('closed'))}
    >
      <p class="muted">${t(language, 'yamlViewIntro')}</p>
      ${
        this.error
          ? html`<ha-alert alert-type="error">${this.error}</ha-alert>`
          : html`<ha-code-editor
              .hass=${this.hass}
              .value=${this.yaml}
              mode="yaml"
              .readOnly=${true}
              @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
            ></ha-code-editor>`
      }
      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" .disabled=${!this.yaml} @click=${() => this.copy()}>
          <ha-icon slot="start" icon="mdi:content-copy"></ha-icon>${t(language, 'ioCopyYaml')}
        </ha-button>
        <ha-button slot="primaryAction" @click=${() => this.dispatchEvent(new CustomEvent('closed'))}>
          ${t(language, 'close')}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    .muted {
      margin: 0 0 12px;
      color: var(--secondary-text-color);
    }
  `;
}

customElements.define('flode-yaml-import', FlodeYamlImport);
customElements.define('flode-yaml-view', FlodeYamlView);

declare global {
  interface HTMLElementTagNameMap {
    'flode-yaml-import': FlodeYamlImport;
    'flode-yaml-view': FlodeYamlView;
  }
}

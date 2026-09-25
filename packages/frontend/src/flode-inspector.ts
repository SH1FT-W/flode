import { type FlowNode, getScriptFields, isPlainObject, isScriptStart } from '@flode/shared';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { ensureAutomationEditors, ensureHaSelector, type HomeAssistant } from './ha';
import { hasUiEditor, nodeToStep, type StepKind, stepKind } from './ha-step';
import { NODE_META, nodeIcon, nodeTitle } from './node-meta';
import { t } from './strings';

/**
 * Right-hand panel for the selected node. Editing goes through HA's own
 * automation editors (`ha-automation-trigger-editor` & co. — the forms of
 * Settings → Automations), so pickers, dialogs, theme and keyboard behaviour
 * are HA's. Falls back to HA's YAML object editor if they can't be loaded.
 */
const NARROW_BELOW = 440;

export class FlodeInspector extends LitElement {
  static properties = {
    hass: { attribute: false },
    node: { attribute: false },
    error: { attribute: false },
    selectorReady: { state: true },
    editorsReady: { state: true },
    yamlMode: { state: true },
    narrow: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare node: FlowNode | null;
  declare error: string | null;
  declare selectorReady: boolean;
  declare editorsReady: boolean;
  declare yamlMode: boolean;
  /** Below this width HA's forms switch to their stacked (mobile) layout. */
  declare narrow: boolean;

  private resizeObserver = new ResizeObserver(([entry]) => {
    const narrow = (entry?.contentRect.width ?? 0) < NARROW_BELOW;
    if (narrow !== this.narrow) this.narrow = narrow;
  });

  constructor() {
    super();
    this.node = null;
    this.error = null;
    this.selectorReady = false;
    this.editorsReady = false;
    this.yamlMode = false;
    this.narrow = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  protected firstUpdated(): void {
    void ensureAutomationEditors(this.hass).then((ready) => {
      this.editorsReady = ready;
    });
    void ensureHaSelector().then((ready) => {
      this.selectorReady = ready;
    });
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    const previous = changed.get('node');
    // A different block starts in form mode again.
    if (changed.has('node') && previous?.id !== this.node?.id) this.yamlMode = false;
  }

  private emit(
    name: 'data-change' | 'step-change' | 'delete' | 'run-from',
    detail: Record<string, unknown> = {}
  ): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private onStepChanged(
    node: FlowNode,
    kind: StepKind,
    event: CustomEvent<{ value: unknown }>
  ): void {
    event.stopPropagation();
    const step = event.detail.value;
    if (typeof step !== 'object' || step === null || Array.isArray(step)) return;
    this.emit('step-change', { id: node.id, kind, step });
  }

  /** A script's start card: HA's own field editor (`fields:`), like HA's script editor. */
  private renderScriptFields(node: FlowNode) {
    const data: Record<string, unknown> = isPlainObject(node.data) ? node.data : {};
    return html`<ha-script-fields
      .hass=${this.hass}
      .fields=${structuredClone(getScriptFields(data))}
      .narrow=${this.narrow}
      @value-changed=${(event: CustomEvent<{ value: unknown }>) => {
        event.stopPropagation();
        const fields = isPlainObject(event.detail.value) ? event.detail.value : {};
        const { fields: _old, ...rest } = data;
        this.emit('data-change', {
          id: node.id,
          data: Object.keys(fields).length > 0 ? { ...rest, fields } : rest,
        });
      }}
    ></ha-script-fields>`;
  }

  private renderEditor(node: FlowNode) {
    if (isScriptStart(node.data)) return this.renderScriptFields(node);
    const kind = stepKind(node.type);
    const step = nodeToStep(node);
    const ui = hasUiEditor(kind, step);
    const yaml = this.yamlMode || !ui;
    const onChange = (e: CustomEvent<{ value: unknown }>) => this.onStepChanged(node, kind, e);
    // HA asks for YAML when the step has something its form can't show.
    const onUiUnavailable = (e: Event) => {
      e.stopPropagation();
      this.yamlMode = true;
    };
    switch (kind) {
      case 'trigger':
        return html`<ha-automation-trigger-editor
          .hass=${this.hass}
          .trigger=${step}
          .yamlMode=${yaml}
          .uiSupported=${ui}
          .inSidebar=${true}
          @value-changed=${onChange}
          @ui-mode-not-available=${onUiUnavailable}
        ></ha-automation-trigger-editor>`;
      case 'condition':
        return html`<ha-automation-condition-editor
          .hass=${this.hass}
          .condition=${step}
          .narrow=${this.narrow}
          .yamlMode=${yaml}
          .uiSupported=${ui}
          .inSidebar=${true}
          @value-changed=${onChange}
          @ui-mode-not-available=${onUiUnavailable}
        ></ha-automation-condition-editor>`;
      default:
        return html`<ha-automation-action-editor
          .hass=${this.hass}
          .action=${step}
          .narrow=${this.narrow}
          .yamlMode=${yaml}
          .uiSupported=${ui}
          .inSidebar=${true}
          @value-changed=${onChange}
          @ui-mode-not-available=${onUiUnavailable}
        ></ha-automation-action-editor>`;
    }
  }

  private renderFallback(node: FlowNode, language: string) {
    return this.selectorReady
      ? html`<ha-selector
          .hass=${this.hass}
          .selector=${{ object: {} }}
          .value=${node.data}
          .label=${t(language, 'nodeConfig')}
          .required=${false}
          @value-changed=${(e: CustomEvent<{ value: unknown }>) =>
            this.emit('data-change', { id: node.id, data: e.detail.value })}
        ></ha-selector>`
      : html`<pre class="raw">${JSON.stringify(node.data, null, 2)}</pre>`;
  }

  render() {
    const node = this.node;
    const language = this.hass?.language ?? 'en';
    if (!node) {
      return html`<div class="empty">
        <ha-icon icon="mdi:gesture-tap"></ha-icon>
        <p>${t(language, 'inspectorEmpty')}</p>
      </div>`;
    }
    const meta = NODE_META[node.type];
    return html`
      <div class="head" style="--node-color: ${meta.color}">
        <span class="icon"><ha-icon .icon=${nodeIcon(node)}></ha-icon></span>
        <div class="titles">
          <span class="type">${nodeTitle(node, this.hass)}</span>
          <span class="id">${node.id}</span>
        </div>
        ${
          this.editorsReady && !isScriptStart(node.data)
            ? html`<ha-icon-button
                class=${this.yamlMode ? 'active' : ''}
                .label=${t(language, this.yamlMode ? 'editUi' : 'editYaml')}
                @click=${() => {
                  this.yamlMode = !this.yamlMode;
                }}
              >
                <ha-icon icon="mdi:code-braces"></ha-icon>
              </ha-icon-button>`
            : nothing
        }
        ${
          isScriptStart(node.data)
            ? nothing
            : html`<ha-icon-button
                .label=${t(language, 'runFrom')}
                @click=${() => this.emit('run-from', { id: node.id })}
              >
                <ha-icon icon="mdi:play-circle-outline"></ha-icon>
              </ha-icon-button>`
        }
        ${
          // Every script needs its start card.
          isScriptStart(node.data)
            ? nothing
            : html`<ha-icon-button
                .label=${t(language, 'delete')}
                @click=${() => this.emit('delete', { id: node.id })}
              >
                <ha-icon icon="mdi:delete-outline"></ha-icon>
              </ha-icon-button>`
        }
      </div>
      ${
        this.editorsReady
          ? // A fresh HA editor per block: reusing one lets the previous block's
            // sub-form see the new step and flip the editor into YAML mode.
            keyed(node.id, this.renderEditor(node))
          : this.renderFallback(node, language)
      }
      ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      box-sizing: border-box;
      color: var(--primary-text-color);
      overflow-y: auto;
      overflow-x: hidden;
      min-width: 0;
      border-left: 1px solid var(--divider-color);
    }
    .head,
    ha-automation-trigger-editor,
    ha-automation-condition-editor,
    ha-automation-action-editor {
      min-width: 0;
      max-width: 100%;
    }
    .empty {
      margin: auto;
      text-align: center;
      color: var(--secondary-text-color);
      --mdc-icon-size: 32px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      color: var(--node-color);
      background: color-mix(in srgb, var(--node-color) 16%, transparent);
    }
    .titles {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .type {
      font-weight: 600;
      font-size: 16px;
    }
    .id {
      font-family: var(--ha-font-family-code, monospace);
      font-size: 12px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .raw {
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: var(--secondary-background-color);
      font-size: 12px;
      overflow: auto;
    }
    .error {
      margin: 0;
      color: var(--error-color);
      font-size: 13px;
    }
    ha-icon-button.active {
      color: var(--primary-color);
    }
  `;
}

customElements.define('flode-inspector', FlodeInspector);

declare global {
  interface HTMLElementTagNameMap {
    'flode-inspector': FlodeInspector;
  }
}

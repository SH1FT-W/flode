import { type FlowNode, getScriptFields, isPlainObject, isScriptStart } from '@flode/shared';
import {
  getTriggerIdOptions,
  makeDuplicateTriggerIdsUnique,
  selectTriggerIds,
  type TriggerIdFlow,
  type TriggerIdOption,
} from '@flode/ui-core';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { defineElement } from './define-element';
import { ensureAutomationEditors, ensureHaSelector, type HomeAssistant } from './ha';
import { hasUiEditor, nodeToStep, type StepEdit, type StepKind, stepKind } from './ha-step';
import { nodeIconTemplate } from './node-icon';
import { NODE_META, nodeTitle, summarize } from './node-meta';
import { t } from './strings';
import { TriggerIdsContext } from './trigger-ids-context';

/** A card whose data changed along with the open one (trigger IDs). */
export interface NodeDataEdit {
  id: string;
  data: unknown;
}

/** `nodes-change`: cards whose data changed, plus the open card's new step — one undo step. */
export interface NodesChange {
  data: NodeDataEdit[];
  step?: StepEdit;
}

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
    /** All cards of the flow — the triggers HA's "Triggered by" form lists. */
    nodes: { attribute: false },
    /** The automation's `variables` / `trigger_variables` — templates in there may read `trigger.id`. */
    flowVariables: { attribute: false },
    error: { attribute: false },
    confirmDuplicateIds: { state: true },
    selectorReady: { state: true },
    editorsReady: { state: true },
    yamlMode: { state: true },
    narrow: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare node: FlowNode | null;
  declare nodes: readonly FlowNode[];
  declare flowVariables: readonly unknown[];
  declare error: string | null;
  declare confirmDuplicateIds: boolean;
  declare selectorReady: boolean;
  declare editorsReady: boolean;
  declare yamlMode: boolean;
  /** Below this width HA's forms switch to their stacked (mobile) layout. */
  declare narrow: boolean;

  /**
   * The step object handed to HA's editor, one per node. HA keys its nested
   * rows (the actions of an if/choose block …) by object identity, so a fresh
   * copy on every render — each `hass` update — rebuilds them and collapses
   * any row the user just expanded (#24).
   */
  private steps = new WeakMap<FlowNode, Record<string, unknown>>();
  /** The step HA's editor just reported, reused for the node it turns into. */
  private reported: { from: FlowNode; step: Record<string, unknown> } | null = null;

  /** Options keep their candidate IDs while the trigger cards stay the same. */
  private triggerOptions: { triggers: readonly unknown[]; options: TriggerIdOption[] } | null =
    null;
  private triggerIds = new TriggerIdsContext(this, {
    select: (condition, ids) => {
      const flow = this.triggerIdFlow();
      this.applyTriggerIds(
        flow,
        selectTriggerIds(flow, this.optionsFor(flow.triggers), condition, ids)
      );
    },
    fixDuplicateIds: async () => {
      this.confirmDuplicateIds = true;
    },
  });

  private resizeObserver = new ResizeObserver(([entry]) => {
    const narrow = (entry?.contentRect.width ?? 0) < NARROW_BELOW;
    if (narrow !== this.narrow) this.narrow = narrow;
  });

  constructor() {
    super();
    this.node = null;
    this.nodes = [];
    this.error = null;
    this.confirmDuplicateIds = false;
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
    if (changed.has('node')) {
      const node = this.node;
      const reported = this.reported;
      // Our own edit coming back as the new node: keep HA's object (and its row keys).
      if (node && reported && reported.from === previous && previous?.id === node.id) {
        this.steps.set(node, reported.step);
      }
      this.reported = null;
    }
    const { triggers } = this.triggerIdFlow();
    this.triggerIds.setTriggers(triggers, this.optionsFor(triggers));
  }

  private optionsFor(triggers: readonly unknown[]): TriggerIdOption[] {
    const cached = this.triggerOptions;
    if (
      cached &&
      cached.triggers.length === triggers.length &&
      cached.triggers.every((trigger, index) => trigger === triggers[index])
    ) {
      return cached.options;
    }
    const options = getTriggerIdOptions(triggers);
    this.triggerOptions = { triggers, options };
    return options;
  }

  /** The flow's trigger cards and all other cards — the open one as the step HA's editor holds. */
  private triggerIdFlow(): TriggerIdFlow {
    const triggers: unknown[] = [];
    const steps: unknown[] = [];
    for (const node of this.nodes) {
      if (node.type === 'trigger') triggers.push(node.data);
      else steps.push(node === this.node ? this.stepOf(node) : node.data);
    }
    return { triggers, steps, templates: this.flowVariables ?? [] };
  }

  /** Hands the cards a trigger-ID change touched to the panel — as one undo step. */
  private applyTriggerIds(before: TriggerIdFlow, after: TriggerIdFlow): void {
    const open = this.node;
    const change: NodesChange = { data: [] };
    let triggerIndex = 0;
    let stepIndex = 0;
    for (const node of this.nodes) {
      const isTrigger = node.type === 'trigger';
      const index = isTrigger ? triggerIndex++ : stepIndex++;
      const was = isTrigger ? before.triggers[index] : before.steps[index];
      const now = isTrigger ? after.triggers[index] : after.steps[index];
      if (now === was) continue;
      if (node !== open || isTrigger) {
        change.data.push({ id: node.id, data: now });
      } else if (isPlainObject(now)) {
        // The open card comes back as HA's step; keep HA's object (and its row keys).
        this.reported = { from: node, step: now };
        change.step = { id: node.id, kind: stepKind(node.type), step: structuredClone(now) };
      }
    }
    if (change.data.length > 0 || change.step) this.emit('nodes-change', { ...change });
  }

  private fixDuplicateIds(): void {
    this.confirmDuplicateIds = false;
    const flow = this.triggerIdFlow();
    this.applyTriggerIds(flow, makeDuplicateTriggerIdsUnique(flow));
  }

  /** HA's own confirmation before splitting shared trigger IDs (its texts, FLODE's dialog). */
  private renderDuplicateIdsDialog() {
    const localize = this.hass?.localize;
    if (!this.confirmDuplicateIds || !localize) return nothing;
    const key = 'ui.panel.config.automation.editor.conditions.type.trigger';
    return html`<ha-dialog
      open
      .headerTitle=${localize(`${key}.assign_unique_ids_title`)}
      @closed=${() => {
        this.confirmDuplicateIds = false;
      }}
    >
      <p>${localize(`${key}.assign_unique_ids_description`)}</p>
      <ha-dialog-footer slot="footer">
        <ha-button
          slot="secondaryAction"
          appearance="plain"
          @click=${() => {
            this.confirmDuplicateIds = false;
          }}
        >
          ${localize('ui.common.cancel')}
        </ha-button>
        <ha-button slot="primaryAction" @click=${() => this.fixDuplicateIds()}>
          ${localize(`${key}.duplicate_ids_fix`)}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  private stepOf(node: FlowNode): Record<string, unknown> {
    let step = this.steps.get(node);
    if (!step) {
      step = nodeToStep(node);
      this.steps.set(node, step);
    }
    return step;
  }

  private emit(
    name: 'data-change' | 'step-change' | 'nodes-change' | 'delete' | 'run-from',
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
    if (!isPlainObject(step)) return;
    this.reported = { from: node, step };
    // A copy for the graph: HA's editors keep normalising their own object in place.
    this.emit('step-change', { id: node.id, kind, step: structuredClone(step) });
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
    const step = this.stepOf(node);
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
        <span class="icon">${nodeIconTemplate(node, summarize(node, this.hass), this.hass)}</span>
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
      ${this.renderDuplicateIdsDialog()}
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

defineElement('flode-inspector', FlodeInspector);

declare global {
  interface HTMLElementTagNameMap {
    'flode-inspector': FlodeInspector;
  }
}

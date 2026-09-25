import type { FlowGraph } from '@flode/shared';
import {
  type AiEntityCandidate,
  type AiFlowKind,
  draftFlowWithAi,
  extractYaml,
  generateWithAiTask,
  readableAiError,
} from '@flode/ui-core';
import { css, html, LitElement, nothing } from 'lit';
import { errorMessage, type HomeAssistant } from './ha';
import { t } from './strings';

/** The transpiler (with elkjs) is only loaded when the AI is actually used. */
function loadTranspiler() {
  return import('@flode/transpiler');
}

/** Every entity the model may use, with its area. */
export function entityCandidates(hass: HomeAssistant): AiEntityCandidate[] {
  return Object.values(hass.states).map((entity) => {
    const name = entity.attributes.friendly_name;
    const areaId = hass.entities?.[entity.entity_id]?.area_id;
    const area = areaId ? hass.areas?.[areaId]?.name : undefined;
    return {
      entity_id: entity.entity_id,
      name: typeof name === 'string' ? name : entity.entity_id,
      ...(area ? { area } : {}),
    };
  });
}

/**
 * "Build with AI": a description in HA's own dialog and text field, run on
 * HA's AI Task (the default chosen under Settings → AI suggestions). The
 * result opens as an unsaved draft — nothing is saved without the user.
 */
export class FlodeAiDialog extends LitElement {
  static properties = {
    hass: { attribute: false },
    aiEntityId: { attribute: false },
    kind: { attribute: false },
    open: { type: Boolean },
    description: { state: true },
    running: { state: true },
    error: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare aiEntityId: string | null;
  declare kind: AiFlowKind;
  declare open: boolean;
  declare description: string;
  declare running: boolean;
  declare error: string | null;

  constructor() {
    super();
    this.aiEntityId = null;
    this.kind = 'automation';
    this.open = false;
    this.description = '';
    this.running = false;
    this.error = null;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  private close(): void {
    if (this.running) return;
    this.error = null;
    this.dispatchEvent(new CustomEvent('closed'));
  }

  private async create(): Promise<void> {
    const { hass, aiEntityId } = this;
    const description = this.description.trim();
    if (!hass || !aiEntityId || !description || this.running) return;
    this.running = true;
    this.error = null;
    try {
      const { transpiler, parseFlowYaml, validateFlowGraph } = await loadTranspiler();
      const result = await draftFlowWithAi(
        { description, kind: this.kind, language: hass.language, entities: entityCandidates(hass) },
        {
          generate: (taskName, instructions) =>
            generateWithAiTask(
              (message) => hass.callWS(message),
              aiEntityId,
              taskName,
              instructions
            ),
          parse: (reply, kind) =>
            parseFlowYaml(transpiler, extractYaml(reply), kind, { keepBlocks: true }),
          validate: (graph) => validateFlowGraph(graph).errors.map((error) => error.message),
        }
      );
      this.description = '';
      this.dispatchEvent(
        new CustomEvent<{ graph: FlowGraph; unknownEntityIds: string[]; kind: AiFlowKind }>(
          'ai-draft',
          {
            detail: { ...result, kind: this.kind },
          }
        )
      );
    } catch (error) {
      this.error = readableAiError(errorMessage(error));
    } finally {
      this.running = false;
    }
  }

  render() {
    const language = this.language;
    const aiName = this.aiEntityId
      ? this.hass?.states[this.aiEntityId]?.attributes.friendly_name
      : undefined;
    return html`<ha-dialog
      .open=${this.open}
      .headerTitle=${t(language, this.kind === 'script' ? 'aiTitleScript' : 'aiTitle')}
      .preventScrimClose=${this.running}
      @closed=${() => this.close()}
    >
      <div class="body">
        <p class="muted">${t(language, this.kind === 'script' ? 'aiIntroScript' : 'aiIntro')}</p>
        <div class="examples">
          ${(
            this.kind === 'script'
              ? (['aiExampleScript1', 'aiExampleScript2', 'aiExampleScript3'] as const)
              : (['aiExample1', 'aiExample2', 'aiExample3'] as const)
          ).map(
            (key) => html`<button
              class="example"
              .disabled=${this.running}
              @click=${() => {
                this.description = t(language, key);
              }}
            >
              ${t(language, key)}
            </button>`
          )}
        </div>
        <ha-selector
          .hass=${this.hass}
          .selector=${{ text: { multiline: true } }}
          .value=${this.description}
          .label=${t(language, 'aiDescribe')}
          .disabled=${this.running}
          @value-changed=${(event: CustomEvent<{ value: unknown }>) => {
            this.description = typeof event.detail.value === 'string' ? event.detail.value : '';
          }}
          @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
        ></ha-selector>
        ${this.error ? html`<ha-alert alert-type="error">${this.error}</ha-alert>` : nothing}
        ${
          this.running
            ? html`<p class="running"><ha-spinner size="small"></ha-spinner>${t(language, 'aiRunning')}${
                typeof aiName === 'string' ? ` (${aiName})` : ''
              }</p>`
            : nothing
        }
        <p class="hint">${t(language, 'aiPrivacy')}</p>
      </div>
      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" .disabled=${this.running} @click=${() => this.close()}>
          ${t(language, 'cancel')}
        </ha-button>
        <ha-button
          slot="primaryAction"
          .disabled=${this.running || !this.description.trim()}
          @click=${() => void this.create()}
        >
          ${t(language, 'aiCreate')}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    .body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .muted,
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .hint {
      font-size: 12px;
      line-height: 1.5;
    }
    .examples {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .example {
      padding: 6px 10px;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      color: var(--primary-text-color);
      background: var(--card-background-color);
    }
    .example:hover {
      border-color: var(--primary-color);
    }
    .running {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
    }
  `;
}

customElements.define('flode-ai-dialog', FlodeAiDialog);

declare global {
  interface HTMLElementTagNameMap {
    'flode-ai-dialog': FlodeAiDialog;
  }
}

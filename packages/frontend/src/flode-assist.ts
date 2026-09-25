import type { FlowGraph } from '@flode/shared';
import {
  type AssistTurn,
  buildAssistInstructions,
  findUnknownEntityIds,
  generateWithAiTask,
  parseAssistReply,
  readableAiError,
  selectPromptEntities,
} from '@flode/ui-core';
import { css, html, LitElement, nothing } from 'lit';
import { entityCandidates } from './flode-ai';
import { flowYaml } from './flow-yaml';
import { errorMessage, type FlowKind, type HomeAssistant } from './ha';
import { t } from './strings';

function loadTranspiler() {
  return import('@flode/transpiler');
}

interface Proposal {
  graph?: FlowGraph;
  /** Why it can't be applied as is (unparseable YAML, unknown entities …). */
  problems: string[];
}

interface ChatTurn extends AssistTurn {
  proposal?: Proposal;
  applied?: boolean;
}

/** One conversation per open flow (tab), kept while the page lives. */
const conversations = new Map<string, ChatTurn[]>();

/**
 * The AI assistant beside the editor: ask about the open automation/script,
 * let it find mistakes or optimize — runs on HA's AI Task. A proposed change
 * is only a preview until "Apply" (one undo step, nothing is saved).
 */
export class FlodeAssist extends LitElement {
  static properties = {
    hass: { attribute: false },
    aiEntityId: { attribute: false },
    graph: { attribute: false },
    kind: { attribute: false },
    turns: { state: true },
    input: { state: true },
    running: { state: true },
    error: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare aiEntityId: string | null;
  declare graph: FlowGraph | undefined;
  declare kind: FlowKind;
  declare turns: ChatTurn[];
  declare input: string;
  declare running: boolean;
  declare error: string | null;

  constructor() {
    super();
    this.aiEntityId = null;
    this.kind = 'automation';
    this.turns = [];
    this.input = '';
    this.running = false;
    this.error = null;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    const previous = changed.get('graph');
    const before =
      previous && typeof previous === 'object' && 'id' in previous ? previous.id : undefined;
    // Another tab: show its own conversation.
    if (changed.has('graph') && before !== this.graph?.id) {
      this.turns = (this.graph && conversations.get(this.graph.id)) ?? [];
      this.error = null;
    }
  }

  private setTurns(turns: ChatTurn[]): void {
    this.turns = turns;
    if (this.graph) conversations.set(this.graph.id, turns);
  }

  private async ask(request: string): Promise<void> {
    const { hass, aiEntityId, graph } = this;
    const text = request.trim();
    if (!hass || !aiEntityId || !graph || !text || this.running) return;
    const history: AssistTurn[] = this.turns.map(({ role, text: turnText }) => ({
      role,
      text: turnText,
    }));
    this.setTurns([...this.turns, { role: 'user', text }]);
    this.input = '';
    this.running = true;
    this.error = null;
    try {
      const currentYaml = await flowYaml(graph, this.kind);
      const candidates = entityCandidates(hass);
      const reply = await generateWithAiTask(
        (message) => hass.callWS(message),
        aiEntityId,
        'FLODE: assistant',
        buildAssistInstructions({
          kind: this.kind,
          flowYaml: currentYaml,
          request: text,
          entities: selectPromptEntities(text, candidates),
          language: hass.language,
          history,
        })
      );
      const parsed = parseAssistReply(reply);
      this.setTurns([
        ...this.turns,
        {
          role: 'assistant',
          text: parsed.text,
          ...(parsed.yaml ? { proposal: await this.readProposal(parsed.yaml) } : {}),
        },
      ]);
    } catch (error) {
      this.error = readableAiError(errorMessage(error));
    } finally {
      this.running = false;
    }
  }

  private async readProposal(yaml: string): Promise<Proposal> {
    const hass = this.hass;
    const { transpiler, parseFlowYaml, validateFlowGraph } = await loadTranspiler();
    const result = await parseFlowYaml(transpiler, yaml, this.kind, { keepBlocks: true });
    if (!result.success || !result.graph) {
      return { problems: result.errors ?? [t(this.language, 'assistUnreadable')] };
    }
    const unknown = hass
      ? findUnknownEntityIds(
          result.graph.nodes.map((node) => node.data),
          new Set(Object.keys(hass.states))
        )
      : [];
    return {
      graph: result.graph,
      problems: [
        ...validateFlowGraph(result.graph).errors.map((e) => e.message),
        ...unknown.map((id) => `${t(this.language, 'assistUnknownEntity')} ${id}`),
      ],
    };
  }

  private apply(index: number): void {
    const turn = this.turns[index];
    const graph = turn?.proposal?.graph;
    if (!turn || !graph) return;
    this.dispatchEvent(new CustomEvent('assist-apply', { detail: { graph } }));
    this.setTurns(this.turns.map((t, i) => (i === index ? { ...t, applied: true } : t)));
  }

  private renderTurn(turn: ChatTurn, index: number) {
    const language = this.language;
    if (turn.role === 'user') return html`<div class="turn user">${turn.text}</div>`;
    const proposal = turn.proposal;
    return html`<div class="turn assistant">
      ${turn.text ? html`<ha-markdown .content=${turn.text}></ha-markdown>` : nothing}
      ${
        proposal
          ? html`<div class="proposal">
              <div class="proposal-head">
                <ha-icon icon="mdi:file-compare"></ha-icon>
                ${
                  proposal.graph
                    ? t(language, 'assistProposal').replace(
                        '{n}',
                        String(proposal.graph.nodes.length)
                      )
                    : t(language, 'assistUnreadable')
                }
              </div>
              ${
                proposal.problems.length > 0
                  ? html`<ul class="problems">
                      ${proposal.problems.map((problem) => html`<li>${problem}</li>`)}
                    </ul>`
                  : nothing
              }
              ${
                proposal.graph
                  ? html`<ha-button
                      .disabled=${turn.applied === true}
                      @click=${() => this.apply(index)}
                    >
                      <ha-icon slot="start" icon=${turn.applied ? 'mdi:check' : 'mdi:check-bold'}></ha-icon>
                      ${t(language, turn.applied ? 'assistApplied' : 'assistApply')}
                    </ha-button>`
                  : nothing
              }
            </div>`
          : nothing
      }
    </div>`;
  }

  render() {
    const language = this.language;
    const quick = [
      ['mdi:bug-check-outline', 'assistFindErrors', 'assistFindErrorsPrompt'],
      ['mdi:auto-fix', 'assistOptimize', 'assistOptimizePrompt'],
      ['mdi:help-circle-outline', 'assistExplain', 'assistExplainPrompt'],
    ] as const;
    return html`
      <div class="head">
        <ha-icon icon="mdi:creation"></ha-icon>
        <span class="title">${t(language, 'assistTitle')}</span>
        ${
          this.turns.length > 0
            ? html`<ha-icon-button
                .label=${t(language, 'assistClear')}
                .disabled=${this.running}
                @click=${() => this.setTurns([])}
              >
                <ha-icon icon="mdi:broom"></ha-icon>
              </ha-icon-button>`
            : nothing
        }
      </div>
      ${
        this.turns.length === 0
          ? html`<p class="hint">${t(language, this.kind === 'script' ? 'assistIntroScript' : 'assistIntro')}</p>`
          : nothing
      }
      <div class="quick">
        ${quick.map(
          ([icon, label, prompt]) => html`<button
            class="chip"
            .disabled=${this.running}
            @click=${() => void this.ask(t(language, prompt))}
          >
            <ha-icon .icon=${icon}></ha-icon>${t(language, label)}
          </button>`
        )}
      </div>
      <div class="turns">${this.turns.map((turn, index) => this.renderTurn(turn, index))}</div>
      ${
        this.running
          ? html`<p class="hint running"><ha-spinner size="small"></ha-spinner>${t(language, 'assistThinking')}</p>`
          : nothing
      }
      ${this.error ? html`<ha-alert alert-type="error">${this.error}</ha-alert>` : nothing}
      <div class="ask">
        <ha-selector
          .hass=${this.hass}
          .selector=${{ text: { multiline: true } }}
          .value=${this.input}
          .label=${t(language, 'assistPlaceholder')}
          .disabled=${this.running}
          @value-changed=${(event: CustomEvent<{ value: unknown }>) => {
            this.input = typeof event.detail.value === 'string' ? event.detail.value : '';
          }}
          @keydown=${(event: KeyboardEvent) => {
            event.stopPropagation();
            // ⌘/Ctrl+Enter sends, like HA's own assist dialog sends on Enter.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
              void this.ask(this.input);
          }}
        ></ha-selector>
        <ha-button .disabled=${this.running || !this.input.trim()} @click=${() => void this.ask(this.input)}>
          <ha-icon slot="start" icon="mdi:send"></ha-icon>${t(language, 'assistSend')}
        </ha-button>
      </div>
      <p class="hint">${t(language, 'assistPrivacy')}</p>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      box-sizing: border-box;
      color: var(--primary-text-color);
      overflow-y: auto;
      overflow-x: hidden;
      min-width: 0;
      border-left: 1px solid var(--divider-color);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 40px;
    }
    .title {
      flex: 1;
      font-weight: 600;
      font-size: 16px;
    }
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      color: var(--primary-text-color);
      background: var(--card-background-color);
      --mdc-icon-size: 16px;
    }
    .chip:hover:not([disabled]) {
      border-color: var(--primary-color);
    }
    .turns {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .turn {
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .turn.user {
      align-self: flex-end;
      max-width: 85%;
      white-space: pre-wrap;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
    }
    .turn.assistant {
      background: var(--secondary-background-color);
    }
    .proposal {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
      padding: 10px;
      border: 1px solid var(--divider-color);
      border-radius: 10px;
      background: var(--card-background-color);
    }
    .proposal-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      --mdc-icon-size: 18px;
    }
    .problems {
      margin: 0;
      padding-left: 18px;
      font-size: 12px;
      color: var(--warning-color, #ffa600);
    }
    .ask {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }
    .ask ha-selector {
      align-self: stretch;
    }
    .running {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--secondary-text-color);
    }
  `;
}

customElements.define('flode-assist', FlodeAssist);

declare global {
  interface HTMLElementTagNameMap {
    'flode-assist': FlodeAssist;
  }
}

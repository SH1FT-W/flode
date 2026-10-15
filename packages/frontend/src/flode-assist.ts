import type { FlowGraph } from '@flode/shared';
import {
  type AssistReply,
  type AssistTurn,
  buildAssistInstructions,
  findUnknownEntityIds,
  generateWithAiTask,
  parseAssistReply,
  readableAiError,
  safeAiMarkdown,
  selectPromptEntities,
} from '@flode/ui-core';
import { css, html, LitElement, nothing } from 'lit';
import {
  addTurn,
  type ChatTurn,
  conversation,
  endRequest,
  isAsking,
  type Proposal,
  setConversation,
  startRequest,
  watchConversations,
} from './assist-conversations';
import { defineElement } from './define-element';
import { entityCandidates } from './flode-ai';
import { flowYaml } from './flow-yaml';
import { errorMessage, type FlowKind, type HomeAssistant } from './ha';
import { entityExists } from './node-meta';
import { t } from './strings';

function loadTranspiler() {
  return import('@flode/transpiler');
}

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
    confirmIndex: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare aiEntityId: string | null;
  declare graph: FlowGraph | undefined;
  declare kind: FlowKind;
  declare turns: ChatTurn[];
  declare input: string;
  declare running: boolean;
  /** The proposal whose flow changed since the question — waiting for "apply anyway". */
  declare confirmIndex: number | null;

  constructor() {
    super();
    this.aiEntityId = null;
    this.kind = 'automation';
    this.turns = [];
    this.input = '';
    this.running = false;
    this.confirmIndex = null;
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
      this.showConversation();
      this.confirmIndex = null;
    }
  }

  private unwatch: (() => void) | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    this.unwatch = watchConversations(() => this.showConversation());
    this.showConversation();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unwatch?.();
    this.unwatch = undefined;
  }

  /** The shown flow's conversation, and whether it is still waiting for an answer. */
  private showConversation(): void {
    this.turns = this.graph ? conversation(this.graph.id) : [];
    this.running = this.graph ? isAsking(this.graph.id) : false;
  }

  private setTurns(turns: ChatTurn[]): void {
    this.turns = turns;
    if (this.graph) setConversation(this.graph.id, turns);
  }

  /** The answer belongs to the flow that asked — the tab may have changed meanwhile. */
  private async ask(request: string): Promise<void> {
    const { hass, aiEntityId, graph, kind } = this;
    const text = request.trim();
    if (!hass || !aiEntityId || !graph || !text || !startRequest(graph.id)) return;
    const history: AssistTurn[] = this.turns
      .filter((turn) => !turn.error)
      .map(({ role, text: turnText }) => ({ role, text: turnText }));
    this.setTurns([...this.turns, { role: 'user', text }]);
    this.input = '';
    this.running = true;
    try {
      const currentYaml = await flowYaml(graph, kind);
      const candidates = entityCandidates(hass);
      const reply = await generateWithAiTask(
        (message) => hass.callWS(message),
        aiEntityId,
        'FLODE: assistant',
        buildAssistInstructions({
          kind,
          flowYaml: currentYaml,
          request: text,
          entities: selectPromptEntities(text, candidates),
          language: hass.language,
          history,
        })
      );
      // HA's YAML (`!input`, `!secret` …), read like the transpiler reads it.
      const { loadHaYaml } = await loadTranspiler();
      const parsed = parseAssistReply(reply, { kind, parseYaml: loadHaYaml });
      addTurn(graph.id, {
        role: 'assistant',
        text: parsed.text,
        ...(parsed.yaml
          ? { proposal: { ...(await this.readProposal(parsed, kind)), baseYaml: currentYaml } }
          : {}),
      });
    } catch (error) {
      // Stays with the flow that asked — the user may be on another tab by now.
      addTurn(graph.id, {
        role: 'assistant',
        text: '',
        error: readableAiError(errorMessage(error)),
      });
    } finally {
      endRequest(graph.id);
    }
  }

  private async readProposal(reply: AssistReply, kind: FlowKind): Promise<Proposal> {
    const hass = this.hass;
    const language = this.language;
    const { transpiler, parseFlowYaml, validateFlowGraph } = await loadTranspiler();
    const result = await parseFlowYaml(transpiler, reply.yaml ?? '', kind, { keepBlocks: true });
    if (!result.success || !result.graph) {
      return { problems: result.errors ?? [t(language, 'assistUnreadable')] };
    }
    const unknown = hass
      ? findUnknownEntityIds(
          result.graph.nodes.map((node) => node.data),
          (entityId) => entityExists(hass, entityId)
        )
      : [];
    return {
      graph: result.graph,
      problems: [
        ...(reply.blocked ? [t(language, 'assistNoTriggers')] : []),
        ...validateFlowGraph(result.graph).errors.map((e) => e.message),
        ...unknown.map((id) => `${t(language, 'assistUnknownEntity')} ${id}`),
      ],
      ...(reply.blocked ? { blocked: true } : {}),
      ...(reply.present ? { present: reply.present } : {}),
    };
  }

  /** Whether the open flow still is what the proposal was made for. */
  private async proposalIsCurrent(proposal: Proposal): Promise<boolean> {
    const { graph, kind } = this;
    if (!graph || proposal.baseYaml === undefined) return true;
    try {
      return (await flowYaml(graph, kind)) === proposal.baseYaml;
    } catch {
      return false;
    }
  }

  /**
   * Applies a proposal. One made for an older state of the flow would undo
   * the changes since — it needs a second click ("apply anyway").
   */
  private async apply(index: number): Promise<void> {
    const proposal = this.turns[index]?.proposal;
    const graph = proposal?.graph;
    if (!proposal || !graph || proposal.blocked) return;
    if (this.confirmIndex !== index && !(await this.proposalIsCurrent(proposal))) {
      this.confirmIndex = index;
      return;
    }
    this.confirmIndex = null;
    this.dispatchEvent(
      new CustomEvent('assist-apply', { detail: { graph, present: proposal.present } })
    );
    this.setTurns(this.turns.map((t, i) => (i === index ? { ...t, applied: true } : t)));
  }

  private renderTurn(turn: ChatTurn, index: number) {
    const language = this.language;
    if (turn.role === 'user') return html`<div class="turn user">${turn.text}</div>`;
    if (turn.error) return html`<ha-alert alert-type="error">${turn.error}</ha-alert>`;
    const proposal = turn.proposal;
    const stale = this.confirmIndex === index;
    return html`<div class="turn assistant">
      ${turn.text ? html`<ha-markdown .content=${safeAiMarkdown(turn.text)}></ha-markdown>` : nothing}
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
                stale
                  ? html`<ha-alert alert-type="warning">${t(language, 'assistStale')}</ha-alert>`
                  : nothing
              }
              ${
                proposal.graph && !proposal.blocked
                  ? html`<ha-button
                      .disabled=${turn.applied === true}
                      @click=${() => void this.apply(index)}
                    >
                      <ha-icon slot="start" icon=${turn.applied ? 'mdi:check' : 'mdi:check-bold'}></ha-icon>
                      ${t(
                        language,
                        turn.applied ? 'assistApplied' : stale ? 'assistApplyAnyway' : 'assistApply'
                      )}
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

defineElement('flode-assist', FlodeAssist);

declare global {
  interface HTMLElementTagNameMap {
    'flode-assist': FlodeAssist;
  }
}

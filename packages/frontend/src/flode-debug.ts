import type { FlowGraph } from '@flode/shared';
import { buildExplainInstructions, generateWithAiTask, readableAiError } from '@flode/ui-core';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import {
  type AutomationListItem,
  ensureTraceViewer,
  errorMessage,
  getRunLogbook,
  getTrace,
  type HomeAssistant,
  listTraces,
  type TraceListItem,
} from './ha';
import type { ManualRun } from './manual-runs';
import { t } from './strings';
import {
  configAtPath,
  type HaTrace,
  nodeForPath,
  type RunMark,
  runMarks,
  runVariables,
} from './trace';

/** What happened in a run, in words (HA's `script_execution`, else the run state). */
type RunResultKey =
  | 'run_running'
  | 'run_finished'
  | 'run_failed_conditions'
  | 'run_error'
  | 'run_aborted'
  | 'run_other';

function runResultKey(run: TraceListItem): RunResultKey {
  if (run.state === 'running') return 'run_running';
  switch (run.script_execution) {
    case 'finished':
      return 'run_finished';
    case 'failed_conditions':
      return 'run_failed_conditions';
    case 'error':
      return 'run_error';
    case 'aborted':
    case 'cancelled':
      return 'run_aborted';
    default:
      return run.error ? 'run_error' : 'run_other';
  }
}

function runTone(run: TraceListItem): 'ok' | 'stopped' | 'error' {
  const key = runResultKey(run);
  if (key === 'run_error') return 'error';
  return key === 'run_finished' || key === 'run_running' ? 'ok' : 'stopped';
}

/**
 * Runs of the open automation/script, shown with HA's own trace elements —
 * the timeline (`hat-trace-timeline`) and step details
 * (`ha-trace-path-details`) of Settings → Automations → Traces. Reports which
 * cards ran (`run-marks`) so the canvas can light them up.
 */
export class FlodeDebug extends LitElement {
  static properties = {
    hass: { attribute: false },
    item: { attribute: false },
    graph: { attribute: false },
    narrow: { attribute: false },
    aiEntityId: { attribute: false },
    manualRuns: { attribute: false },
    manualId: { state: true },
    explanation: { state: true },
    explaining: { state: true },
    runs: { state: true },
    runId: { state: true },
    trace: { state: true },
    logbook: { state: true },
    selectedPath: { state: true },
    viewerReady: { state: true },
    message: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare item: AutomationListItem | undefined;
  declare graph: FlowGraph | undefined;
  declare narrow: boolean;
  /** HA's default AI Task — enables "explain this run". */
  declare aiEntityId: string | null;
  /** "Run from here" executions of this flow (newest first). */
  declare manualRuns: ManualRun[];
  /** The selected one of them (instead of a HA run). */
  declare manualId: string | null;
  private lastManualKey = '';
  declare explanation: string | null;
  declare explaining: boolean;
  declare runs: TraceListItem[] | null;
  declare runId: string | null;
  declare trace: HaTrace | null;
  declare logbook: unknown[];
  declare selectedPath: string | null;
  declare viewerReady: boolean;
  declare message: string | null;

  constructor() {
    super();
    this.narrow = false;
    this.aiEntityId = null;
    this.manualRuns = [];
    this.manualId = null;
    this.explanation = null;
    this.explaining = false;
    this.runs = null;
    this.runId = null;
    this.trace = null;
    this.logbook = [];
    this.selectedPath = null;
    this.viewerReady = false;
    this.message = null;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    const previous = changed.get('item');
    if (
      changed.has('item') &&
      (previous?.configId !== this.item?.configId || previous?.kind !== this.item?.kind)
    ) {
      this.runs = null;
      this.trace = null;
      this.runId = null;
      void this.loadRuns();
    }
    // A new "run from here" shows up selected.
    const before = changed.get('manualRuns');
    if (
      changed.has('manualRuns') &&
      this.manualRuns[0] &&
      before?.[0]?.id !== this.manualRuns[0].id
    ) {
      this.manualId = this.manualRuns[0].id;
    }
    // Only real changes re-mark the canvas: the panel hands over a fresh
    // array on every render, and new marks re-render the panel — no loop.
    const manualKey = this.manualRuns.map((run) => `${run.id}:${run.status}`).join('|');
    const manualChanged = manualKey !== this.lastManualKey;
    this.lastManualKey = manualKey;
    if (
      (changed.has('trace') ||
        changed.has('graph') ||
        changed.has('selectedPath') ||
        changed.has('manualId') ||
        manualChanged) &&
      this.hasUpdated
    ) {
      this.emitMarks();
    }
  }

  protected firstUpdated(): void {
    void ensureTraceViewer(this.hass).then((ready) => {
      this.viewerReady = ready;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Leaving the debug view clears the marks on the canvas.
    this.dispatchEvent(new CustomEvent('run-marks', { detail: { marks: null, active: null } }));
  }

  private emitMarks(): void {
    const manual = this.manualRuns.find((run) => run.id === this.manualId);
    if (manual) {
      const mark: RunMark = manual.status === 'error' ? 'error' : 'done';
      const marks = new Map(manual.nodeIds.map((id): [string, RunMark] => [id, mark]));
      this.dispatchEvent(new CustomEvent('run-marks', { detail: { marks, active: null } }));
      return;
    }
    const { trace, graph, item } = this;
    const marks = trace && graph && item ? runMarks(graph, item.kind, trace) : null;
    const active =
      trace && graph && item && this.selectedPath
        ? (nodeForPath(graph, item.kind, this.selectedPath) ?? null)
        : null;
    this.dispatchEvent(new CustomEvent('run-marks', { detail: { marks, active } }));
  }

  async loadRuns(): Promise<void> {
    const { hass, item } = this;
    if (!hass || !item?.configId) return;
    try {
      const runs = await listTraces(hass, item.kind, item.configId);
      if (this.item !== item) return;
      this.runs = runs;
      this.message = null;
      const keep = runs.find((run) => run.run_id === this.runId);
      const first = keep ?? runs[0];
      if (first) await this.pickRun(first.run_id);
      else this.emitMarks();
    } catch (error) {
      this.message = errorMessage(error);
    }
  }

  private async pickRun(runId: string): Promise<void> {
    const { hass, item } = this;
    if (!hass || !item) return;
    this.runId = runId;
    this.manualId = null;
    try {
      const trace = await getTrace(hass, item.kind, item.configId, runId);
      const logbook = await getRunLogbook(hass, trace.timestamp.start, trace.context.id);
      if (this.runId !== runId) return;
      this.logbook = logbook;
      this.selectedPath = null;
      this.explanation = null;
      this.trace = trace;
    } catch (error) {
      this.message = errorMessage(error);
    }
  }

  /** "Why did it (not) work?" — HA's AI Task reads the selected run. */
  private async explain(): Promise<void> {
    const { hass, trace, aiEntityId } = this;
    if (!hass || !trace || !aiEntityId || this.explaining) return;
    this.explaining = true;
    this.explanation = null;
    const runId = trace.run_id;
    try {
      const errorStep = Object.values(trace.trace)
        .flat()
        .find((step) => step.error);
      const text = await generateWithAiTask(
        (message) => hass.callWS(message),
        aiEntityId,
        'FLODE: explain run',
        buildExplainInstructions({
          config: trace.config,
          trace: trace.trace,
          outcome: trace.script_execution ?? trace.state,
          error: trace.error ?? errorStep?.error,
          language: hass.language,
          timeZone: hass.config?.time_zone,
        })
      );
      if (this.trace?.run_id === runId) this.explanation = text;
    } catch (error) {
      this.message = readableAiError(errorMessage(error));
    } finally {
      this.explaining = false;
    }
  }

  private renderExplain() {
    if (!this.aiEntityId || !this.trace) return nothing;
    const language = this.language;
    return html`
      <ha-button appearance="filled" .disabled=${this.explaining} @click=${() => void this.explain()}>
        <ha-icon slot="start" icon="mdi:creation"></ha-icon>
        ${t(language, this.explanation ? 'aiExplainAgain' : 'aiExplain')}
      </ha-button>
      ${
        this.explaining
          ? html`<p class="hint running"><ha-spinner size="small"></ha-spinner>${t(language, 'aiExplaining')}</p>`
          : nothing
      }
      ${this.explanation ? html`<ha-markdown class="explanation" .content=${this.explanation}></ha-markdown>` : nothing}
    `;
  }

  private renderManualRun(run: ManualRun) {
    const language = this.language;
    const tone = run.status === 'error' ? 'error' : 'ok';
    const status = { running: 'manualRunning', done: 'manualDone', error: 'run_error' } as const;
    return html`<button
      class="run ${run.id === this.manualId ? 'active' : ''}"
      @click=${() => {
        this.manualId = run.id;
      }}
    >
      ${run.status === 'running' ? html`<ha-spinner size="tiny"></ha-spinner>` : html`<span class="dot ${tone}"></span>`}
      <span class="when">
        ${new Date(run.startedAt).toLocaleTimeString(language, { timeStyle: 'medium' })} · ${run.label}
      </span>
      <span class="result">${t(language, status[run.status])}</span>
    </button>`;
  }

  /** What a "run from here" did: status and HA's logbook for its context. */
  private renderManualDetails(run: ManualRun) {
    const language = this.language;
    return html`
      ${run.error ? html`<ha-alert alert-type="error">${run.error}</ha-alert>` : nothing}
      <h3>${t(language, 'manualLogbook')}</h3>
      ${
        run.logbook.length > 0
          ? html`<ha-logbook-renderer
              .hass=${this.hass}
              .entries=${run.logbook}
              .narrow=${true}
              .virtualize=${false}
            ></ha-logbook-renderer>`
          : html`<p class="hint">
              ${t(
                language,
                run.status === 'running'
                  ? 'manualRunning'
                  : run.logbookFinal
                    ? 'manualNoChanges'
                    : 'manualLogbookEmpty'
              )}
            </p>`
      }
      <p class="hint">${t(language, 'manualHint')}</p>
    `;
  }

  private renderRun(run: TraceListItem) {
    const language = this.language;
    const active = run.run_id === this.runId && this.manualId === null;
    return html`<button class="run ${active ? 'active' : ''}" @click=${() => void this.pickRun(run.run_id)}>
      <span class="dot ${runTone(run)}"></span>
      <span class="when">
        ${new Date(run.timestamp.start).toLocaleString(language, { dateStyle: 'short', timeStyle: 'medium' })}
      </span>
      <span class="result">${t(language, runResultKey(run))}</span>
    </button>`;
  }

  render() {
    const language = this.language;
    const trace = this.trace;
    const manual = this.manualRuns.find((run) => run.id === this.manualId);
    const selected =
      trace && this.selectedPath
        ? { path: this.selectedPath, config: configAtPath(trace.config, this.selectedPath) }
        : undefined;
    return html`
      <div class="head">
        <ha-icon icon="mdi:timeline-clock-outline"></ha-icon>
        <span class="title">${t(language, 'runs')}</span>
        <ha-icon-button .label=${t(language, 'refresh')} @click=${() => void this.loadRuns()}>
          <ha-icon icon="mdi:refresh"></ha-icon>
        </ha-icon-button>
      </div>
      ${this.message ? html`<p class="error">${this.message}</p>` : nothing}
      ${
        this.manualRuns.length > 0
          ? html`<h3>${t(language, 'manualTitle')}</h3>
              <div class="runs">${this.manualRuns.map((run) => this.renderManualRun(run))}</div>
              <h3>${t(language, 'runs')}</h3>`
          : nothing
      }
      ${
        this.runs === null
          ? html`<p class="hint">${t(language, 'loading')}</p>`
          : this.runs.length === 0
            ? html`<p class="hint">${t(language, 'noRuns')}</p>`
            : html`<div class="runs">${this.runs.map((run) => this.renderRun(run))}</div>
                <p class="hint">${t(language, 'runsHint')}</p>`
      }
      ${manual ? this.renderManualDetails(manual) : this.renderExplain()}
      ${
        !manual && trace && this.viewerReady
          ? html`
              <h3>${t(language, 'timeline')}</h3>
              <hat-trace-timeline
                .hass=${this.hass}
                .trace=${trace}
                .logbookEntries=${this.logbook}
                .selectedPath=${this.selectedPath ?? undefined}
                .allowPick=${true}
                @value-changed=${(event: CustomEvent<{ value: string }>) => {
                  event.stopPropagation();
                  this.selectedPath = event.detail.value;
                }}
              ></hat-trace-timeline>
              ${
                selected
                  ? html`<h3>${t(language, 'stepDetails')}</h3>
                      <ha-button
                        appearance="plain"
                        @click=${() =>
                          this.dispatchEvent(
                            new CustomEvent('test-template', {
                              detail: { variables: runVariables(trace, selected.path) },
                            })
                          )}
                      >
                        <ha-icon slot="start" icon="mdi:code-braces"></ha-icon>${t(language, 'tplTestWithRun')}
                      </ha-button>
                      <ha-trace-path-details
                        .hass=${this.hass}
                        .narrow=${this.narrow}
                        .trace=${trace}
                        .logbookEntries=${this.logbook}
                        .selected=${selected}
                        .trackedNodes=${{}}
                        .renderedNodes=${{}}
                      ></ha-trace-path-details>`
                  : html`<p class="hint">${t(language, 'pickStep')}</p>`
              }
            `
          : nothing
      }
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
    }
    .title {
      flex: 1;
      font-weight: 600;
      font-size: 16px;
    }
    h3 {
      margin: 8px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .runs {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .run {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      color: var(--primary-text-color);
      background: transparent;
    }
    .run:hover {
      background: var(--secondary-background-color);
    }
    .run.active {
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .when {
      flex: 1;
      font-variant-numeric: tabular-nums;
    }
    .result {
      color: var(--secondary-text-color);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex: none;
    }
    .dot.ok {
      background: var(--success-color, #43a047);
    }
    .dot.stopped {
      background: var(--warning-color, #ffa600);
    }
    .dot.error {
      background: var(--error-color, #db4437);
    }
    .running {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .explanation {
      padding: 12px;
      border-radius: 12px;
      background: var(--secondary-background-color);
    }
    .hint {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--secondary-text-color);
    }
    .error {
      margin: 0;
      color: var(--error-color);
      font-size: 13px;
    }
  `;
}

customElements.define('flode-debug', FlodeDebug);

declare global {
  interface HTMLElementTagNameMap {
    'flode-debug': FlodeDebug;
  }
}

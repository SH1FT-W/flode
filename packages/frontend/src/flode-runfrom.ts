import { type FlowGraph, isPlainObject } from '@flode/shared';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { defineElement } from './define-element';
import { type AutomationListItem, errorMessage, getLatestTrace, type HomeAssistant } from './ha';
import { t } from './strings';
import { runVariables } from './trace';

interface Prepared {
  sequence?: unknown[];
  /** The cards that run (for marking them on the canvas). */
  nodeIds?: string[];
  errors?: string[];
  usesTriggerData?: boolean;
  /** `trigger` of the automation's last run, for steps that read `trigger.…`. */
  variables?: { trigger: Record<string, unknown> };
  /** When that run started. */
  triggeredAt?: string;
}

/**
 * The `trigger` variable of a saved automation's last run (HA's trace keeps
 * it) — what steps reading `trigger.…` get when run from here. `null` without
 * one: never ran, not saved yet, or a script (scripts have no trigger).
 */
async function lastTrigger(
  hass: HomeAssistant,
  item: AutomationListItem | undefined
): Promise<Pick<Prepared, 'variables' | 'triggeredAt'> | null> {
  if (item?.kind !== 'automation') return null;
  try {
    const trace = await getLatestTrace(hass, item.kind, item.configId);
    const trigger = trace ? runVariables(trace).trigger : undefined;
    return trace && isPlainObject(trigger)
      ? { variables: { trigger }, triggeredAt: trace.timestamp.start }
      : null;
  } catch {
    // No run to borrow from — it runs without, as before (and says so).
    return null;
  }
}

/**
 * "Run from here": runs the chosen block and everything after it for real
 * in Home Assistant — after this confirmation — with HA's own
 * `execute_script` (what HA's editor uses for "Run action").
 */
export class FlodeRunFrom extends LitElement {
  static properties = {
    hass: { attribute: false },
    graph: { attribute: false },
    nodeId: { attribute: false },
    /** The saved automation (its last run lends `trigger`); unset for a new flow. */
    item: { attribute: false },
    label: { attribute: false },
    prepared: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare graph: FlowGraph | undefined;
  declare nodeId: string | null;
  declare item: AutomationListItem | undefined;
  declare label: string;
  declare prepared: Prepared | null;

  constructor() {
    super();
    this.nodeId = null;
    this.label = '';
    this.prepared = null;
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('nodeId')) {
      this.prepared = null;
      if (this.nodeId) void this.prepare(this.nodeId);
    }
  }

  private async prepare(nodeId: string): Promise<void> {
    const graph = this.graph;
    if (!graph) return;
    try {
      const { transpiler, transpileSequence, buildSequenceFlow, SEQUENCE_ENTRY_ID } = await import(
        '@flode/transpiler'
      );
      const result = transpileSequence(transpiler, graph, [nodeId]);
      const borrowed =
        result.success && result.usesTriggerData && this.hass
          ? await lastTrigger(this.hass, this.item)
          : null;
      if (this.nodeId !== nodeId) return;
      const nodeIds = buildSequenceFlow(graph, [nodeId])
        .nodes.map((node) => node.id)
        .filter((id) => id !== SEQUENCE_ENTRY_ID);
      this.prepared = result.success
        ? {
            sequence: result.sequence,
            nodeIds,
            usesTriggerData: result.usesTriggerData,
            ...borrowed,
          }
        : { errors: result.errors ?? [] };
    } catch (error) {
      // Shown like any other reason it can't run — not "Preparing…" forever.
      if (this.nodeId === nodeId) this.prepared = { errors: [errorMessage(error)] };
    }
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('closed'));
  }

  /** The panel runs it (and shows it under "Runs" — HA keeps no trace for execute_script). */
  private run(): void {
    const prepared = this.prepared;
    if (!prepared?.sequence) return;
    this.dispatchEvent(
      new CustomEvent('run-start', {
        detail: {
          sequence: prepared.sequence,
          nodeIds: prepared.nodeIds ?? [],
          label: this.label,
          variables: prepared.variables,
        },
      })
    );
    this.close();
  }

  /** Steps reading `trigger.…`: they get the last run's, or are warned about. */
  private renderTriggerData(prepared: Prepared | null) {
    if (!prepared?.usesTriggerData) return nothing;
    const language = this.language;
    return prepared.triggeredAt
      ? html`<ha-alert alert-type="info"
          >${t(language, 'runFromLastTrigger')}
          <ha-relative-time .hass=${this.hass} .datetime=${prepared.triggeredAt}></ha-relative-time
        ></ha-alert>`
      : html`<ha-alert alert-type="warning">${t(language, 'runFromTriggerData')}</ha-alert>`;
  }

  render() {
    const language = this.language;
    const prepared = this.prepared;
    const steps = prepared?.sequence?.length ?? 0;
    return html`<ha-dialog
      .open=${this.nodeId !== null}
      .headerTitle=${t(language, 'runFromTitle')}
      @closed=${() => this.close()}
    >
      <div class="body">
        <p>${t(language, 'runFromIntro').replace('{name}', this.label)}</p>
        ${
          prepared === null
            ? html`<p class="muted running"><ha-spinner size="tiny"></ha-spinner>${t(language, 'runFromPreparing')}</p>`
            : prepared.errors
              ? html`<ha-alert alert-type="error">${t(language, 'runFromInvalid')} ${prepared.errors.join(' · ')}</ha-alert>`
              : html`<p class="muted">
                  ${t(language, steps === 1 ? 'runFromStep' : 'runFromSteps').replace('{n}', String(steps))}
                </p>`
        }
        ${this.renderTriggerData(prepared)}
      </div>
      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" @click=${() => this.close()}>
          ${t(language, 'cancel')}
        </ha-button>
        <ha-button slot="primaryAction" .disabled=${!prepared?.sequence} @click=${() => this.run()}>
          <ha-icon slot="start" icon="mdi:play-circle-outline"></ha-icon>${t(language, 'runFromConfirm')}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    .body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    p {
      margin: 0;
      line-height: 1.5;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .running {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;
}

defineElement('flode-runfrom', FlodeRunFrom);

declare global {
  interface HTMLElementTagNameMap {
    'flode-runfrom': FlodeRunFrom;
  }
}

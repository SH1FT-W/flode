import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { defineElement } from './define-element';

/** What a longer task reports while it runs; `value` goes from 0 to 1. */
export interface Progress {
  heading: string;
  name: string;
  step: string;
  value: number;
}

/** Quick loads finish before the dialog would appear — no flash for them. */
const SHOW_AFTER_MS = 250;

/**
 * HA dialog with a progress bar for tasks that make the user wait
 * (opening a flow, merging automations). `progress: null` = nothing running.
 */
export class FlodeProgress extends LitElement {
  static properties = {
    progress: { attribute: false },
    shown: { state: true },
  };

  declare progress: Progress | null;
  declare shown: boolean;
  private timer: number | undefined;

  constructor() {
    super();
    this.progress = null;
    this.shown = false;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('progress')) return;
    const running = this.progress !== null;
    const wasRunning = (changed.get('progress') ?? null) !== null;
    if (running && !wasRunning) {
      this.timer = window.setTimeout(() => {
        this.shown = true;
      }, SHOW_AFTER_MS);
    } else if (!running) {
      window.clearTimeout(this.timer);
      this.shown = false;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.timer);
  }

  render() {
    const progress = this.progress;
    const percent = Math.round((progress?.value ?? 0) * 100);
    return html`<ha-dialog
      .open=${this.shown && progress !== null}
      .headerTitle=${progress?.heading ?? ''}
      .preventScrimClose=${true}
      @closed=${() => {
        // Only hides the dialog — the task itself finishes and opens its tab.
        this.shown = false;
      }}
    >
      ${
        progress
          ? html`<div class="body">
              <div class="name">${progress.name}</div>
              <div
                class="bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow=${percent}
              >
                <div class="fill" style="width: ${percent}%"></div>
              </div>
              <div class="step">
                <ha-spinner size="small"></ha-spinner>
                <span>${progress.step}</span>
                <span class="percent">${percent} %</span>
              </div>
            </div>`
          : nothing
      }
    </ha-dialog>`;
  }

  static styles = css`
    .body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: min(360px, 80vw);
      padding-bottom: 8px;
    }
    .name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar {
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--primary-color);
      transition: width 0.25s ease-out;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .percent {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
  `;
}

defineElement('flode-progress', FlodeProgress);

declare global {
  interface HTMLElementTagNameMap {
    'flode-progress': FlodeProgress;
  }
}

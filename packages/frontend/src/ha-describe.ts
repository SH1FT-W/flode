import { type FlowNode, isPlainObject, isScriptStart } from '@flode/shared';
import type { NodeSummary } from '@flode/ui-core';
import { ensureAutomationEditors, type HomeAssistant } from './ha';
import { nodeToStep, type StepKind, stepKind } from './ha-step';
import { summaryContext } from './i18n';

/**
 * HA's own one-line text for a step ("Zustand in Unter dem Horizont geändert",
 * "Um 2:00 verzögern") — the header of HA's editor row. HA builds it in
 * functions it doesn't export (`describeTrigger` & co.), so FLODE renders the
 * row off-screen and reads it: the wording is always that of the running HA.
 */

/** A card text read from HA's row (its eyebrow would only repeat HA's first words, #26). */
export interface HaSummary extends NodeSummary {
  fromHa: true;
}

export function isHaSummary(summary: NodeSummary): summary is HaSummary {
  return 'fromHa' in summary;
}

/** Where the text sits in HA's row: its `<h3>` header, or the condition summary's `label`. */
function readRowText(row: Element): string {
  const root = row.shadowRoot;
  const summary = root?.querySelector('ha-automation-condition-summary');
  if (summary) {
    const label: unknown = Reflect.get(summary, 'label');
    return typeof label === 'string' ? label.trim() : '';
  }
  const header = root?.querySelector('h3[slot="header"]');
  if (!header) return '';
  // Only the header's own text — its target chips and options are elements of their own.
  return Array.from(header.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** HA writes this when its describe function throws — then FLODE's own text is the better one. */
const DESCRIBE_ERROR = /^Error in describing/;

/** A Lit element's first render; `null` for anything else. */
function updateCompleteOf(element: Element): Promise<unknown> | null {
  const done: unknown = Reflect.get(element, 'updateComplete');
  return done instanceof Promise ? done : null;
}

function rowTag(kind: StepKind): string {
  return `ha-automation-${kind}-row`;
}

/** What HA shows next to its text: the step's targets, or the entities of a state trigger/condition. */
function stepTarget(step: Record<string, unknown>): object | undefined {
  if (isPlainObject(step.target)) return step.target;
  return step.entity_id === undefined ? undefined : { entity_id: step.entity_id };
}

interface Request {
  key: string;
  kind: StepKind;
  step: Record<string, unknown>;
}

export class HaDescriptions {
  private readonly texts = new Map<string, string | null>();
  private queue: Request[] = [];
  private flushing = false;
  private language?: string;
  private entities?: HomeAssistant['entities'];

  /**
   * `onReady` runs once a batch of texts came in — the canvas re-renders then.
   * `host` is where the hidden rows go: inside HA's page, so they get HA's
   * states, translations and registries like every row of HA's own editor.
   */
  constructor(
    private readonly onReady: () => void,
    private readonly host: () => Pick<ParentNode, 'append'> | null
  ) {}

  /**
   * The card as HA's row shows it: HA's text, its targets below. FLODE's own
   * `summary` while HA's text is being read (and for cards HA has no row for).
   * Names and language come from `hass`, so the texts are read again after a
   * rename or a language switch.
   */
  summary(
    node: FlowNode,
    hass: HomeAssistant | undefined,
    own: NodeSummary
  ): NodeSummary | HaSummary {
    if (!hass || isScriptStart(node.data)) return own;
    if (hass.language !== this.language || hass.entities !== this.entities) {
      this.language = hass.language;
      this.entities = hass.entities;
      this.texts.clear();
    }
    const kind = stepKind(node.type);
    const step = nodeToStep(node);
    const key = `${kind}:${JSON.stringify(step)}`;
    const text = this.texts.get(key);
    if (text) {
      const target = stepTarget(step);
      const detail = target && summaryContext(hass)?.targetSummary(target);
      return { ...own, title: text, detail: detail || undefined, fromHa: true };
    }
    if (!this.texts.has(key)) this.request({ key, kind, step }, hass);
    return own;
  }

  private request(request: Request, hass: HomeAssistant): void {
    this.texts.set(request.key, null);
    this.queue.push(request);
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => void this.flush(hass));
  }

  /** Renders every queued step in one hidden box, reads all headers, then tells the canvas. */
  private async flush(hass: HomeAssistant): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    // HA's rows come with its automation editor — without them the cards keep FLODE's text.
    const ready = await ensureAutomationEditors(hass);
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.inert = true;
    box.style.cssText =
      'position: fixed; left: -10000px; top: 0; width: 600px; visibility: hidden; pointer-events: none';
    const host = this.host();
    const known = ready && host ? batch.filter(({ kind }) => customElements.get(rowTag(kind))) : [];
    const rows = known.map(({ kind, step }) => {
      const row = document.createElement(rowTag(kind));
      Reflect.set(row, 'hass', hass);
      Reflect.set(row, kind, step);
      box.append(row);
      return row;
    });
    host?.append(box);
    let read = 0;
    try {
      const rendered = await Promise.allSettled(rows.map(updateCompleteOf));
      rows.forEach((row, index) => {
        const request = known[index];
        if (!request) return;
        // A row that failed to render is read again next time (not kept as "no text").
        if (rendered[index]?.status === 'rejected') {
          this.texts.delete(request.key);
          return;
        }
        const text = readRowText(row);
        if (text && !DESCRIBE_ERROR.test(text)) {
          this.texts.set(request.key, text);
          read++;
        }
      });
      // No place for the rows yet (panel not rendered): ask again on the next render.
      if (ready && !host) for (const { key } of batch) this.texts.delete(key);
    } finally {
      box.remove();
      this.flushing = false;
      if (this.queue.length > 0) {
        this.flushing = true;
        queueMicrotask(() => void this.flush(hass));
      }
    }
    // Only new texts re-render the canvas — a retry that read nothing doesn't loop.
    if (read > 0) this.onReady();
  }
}

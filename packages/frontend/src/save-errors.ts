import type { FlowGraph, FlowNode } from '@flode/shared';
import type { FlowKind, HomeAssistant } from './ha';
import { summarize } from './node-meta';
import { type StringKey, t } from './strings';
import { nodeForPath } from './trace';

/** A card with a problem and the words for it (its red border's tooltip). */
export interface CardIssue {
  nodeId: string;
  text: string;
}

/** Why saving failed, in words: the line for the bar, HA's own wording, the card it concerns. */
export interface SaveProblem {
  text: string;
  /** Home Assistant's (or the transpiler's) message as it came — shown as detail. */
  detail?: string;
  issue?: CardIssue;
}

/** What the explanations need: the language, and HA's data for the cards' names. */
export interface SaveErrorContext {
  language: string;
  hass?: HomeAssistant | undefined;
}

/** A check of FLODE's transpiler that failed before anything went to HA (`ValidationError`). */
export interface FlowCheckError {
  code: string;
  message: string;
  path?: string[];
}

/** HA's messages, the explanation for each (first match wins; some name the field). */
const HA_REASONS: readonly { pattern: RegExp; key: StringKey; needsField?: boolean }[] = [
  { pattern: /required key not provided/i, key: 'saveErrRequired', needsField: true },
  { pattern: /at least one of/i, key: 'saveErrAtLeastOne' },
  { pattern: /should be format|invalid time/i, key: 'saveErrFormat', needsField: true },
  { pattern: /extra keys not allowed/i, key: 'saveErrExtra', needsField: true },
  { pattern: /entity id/i, key: 'saveErrEntity', needsField: true },
];

/** Transpiler checks, by `ValidationError.code`. */
const FLOW_REASONS: Partial<Record<string, StringKey>> = {
  ORPHANED_NODE: 'saveErrOrphan',
  INVALID_SERVICE: 'saveErrService',
};

const ROOTS: Record<string, string> = {
  triggers: 'trigger',
  trigger: 'trigger',
  conditions: 'condition',
  condition: 'condition',
  actions: 'action',
  action: 'action',
  sequence: 'sequence',
};

/**
 * Where HA's message points, as a trace path: `… at 'conditions[0].entity_id'`
 * or `… @ data['actions'][2]['then'][0]` → `condition/0`, `action/2/then/0`.
 * The last name in it (`entity_id`) is the field; no path without a step index.
 */
export function haErrorLocation(message: string): { path?: string; field?: string } {
  const raw = (/\bat '([^']+)'/.exec(message) ?? /@ data(\[\S+)/.exec(message))?.[1];
  if (!raw) return {};
  const segments = raw
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\['?(\w+)'?\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  const names = segments.filter((segment) => !/^\d+$/.test(segment));
  const field = names.length > 1 ? names.at(-1) : undefined;
  const root = ROOTS[segments[0] ?? ''];
  const steps = root ? [root] : [];
  // Step indexes and the nested lists that hold steps (`then`, `else`, `sequence` …).
  for (let i = 1; root && i < segments.length && /^\d+$/.test(segments[i] ?? ''); i += 2) {
    steps.push(segments[i] ?? '');
    const key = segments[i + 1];
    if (key === undefined || !/^\d+$/.test(segments[i + 2] ?? '')) break;
    steps.push(key);
  }
  return {
    ...(steps.length > 1 ? { path: steps.join('/') } : {}),
    ...(field ? { field } : {}),
  };
}

/** The only card whose settings have `field` — where HA's message has no step index. */
function onlyCardWith(graph: FlowGraph, field: string): FlowNode | undefined {
  const cards = graph.nodes.filter((node) => JSON.stringify(node.data).includes(`"${field}":`));
  return cards.length === 1 ? cards[0] : undefined;
}

/** The words HA's message stands for, without its "Message malformed:" lead. */
function plainHaMessage(message: string): string {
  return message.replace(/^Message malformed:\s*/i, '').trim();
}

/** A card's name for messages: its text as on the canvas, never its internal id. */
export function cardName(node: FlowNode, hass?: HomeAssistant): string {
  return summarize(node, hass).title;
}

/** Internal node ids in a message, replaced by the cards' names. */
function withCardNames(message: string, graph: FlowGraph, hass?: HomeAssistant): string {
  return graph.nodes.reduce(
    (text, node) => text.split(node.id).join(cardName(node, hass)),
    message
  );
}

function fill(language: string, key: StringKey, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    t(language, key)
  );
}

/** One problem with its card: "„Licht an“: Pflichtfeld „entity_id“ fehlt." */
function problemAt(
  { language, hass }: SaveErrorContext,
  node: FlowNode | undefined,
  reason: string
): Pick<SaveProblem, 'text' | 'issue'> {
  if (!node) return { text: reason };
  return {
    text: fill(language, 'saveErrAtCard', { card: cardName(node, hass), reason }),
    issue: { nodeId: node.id, text: reason },
  };
}

/** HA refused the config (`config/automation/config/…` → 400). */
export function describeHaSaveError(
  message: string,
  graph: FlowGraph,
  kind: FlowKind,
  context: SaveErrorContext
): SaveProblem {
  const { language, hass } = context;
  const { path, field } = haErrorLocation(message);
  const nodeId = path ? nodeForPath(graph, kind, path) : undefined;
  const node =
    graph.nodes.find((n) => n.id === nodeId) ?? (field ? onlyCardWith(graph, field) : undefined);
  const reason = HA_REASONS.find(
    (candidate) => candidate.pattern.test(message) && (field || !candidate.needsField)
  );
  const text = fill(language, reason?.key ?? 'saveErrGeneric', { field: field ?? '' });
  const detail = withCardNames(plainHaMessage(message), graph, hass);
  // Not one of HA's config checks (connection lost …): its own words are the clearest.
  if (!reason && !path && !field) return { text: detail };
  return { ...problemAt(context, node, text), detail };
}

/** FLODE's own checks failed (nothing was sent to HA). Explains the first one. */
export function describeFlowCheckErrors(
  errors: readonly FlowCheckError[],
  graph: FlowGraph,
  context: SaveErrorContext
): SaveProblem {
  const { language, hass } = context;
  const first = errors[0];
  const detail = errors.map((error) => withCardNames(error.message, graph, hass)).join(' · ');
  if (!first) return { text: t(language, 'saveErrGeneric') };
  const nodeId = first.path?.[0] === 'nodes' ? first.path[1] : undefined;
  const node = graph.nodes.find((n) => n.id === nodeId);
  const key = FLOW_REASONS[first.code];
  const reason = key ? t(language, key) : withCardNames(first.message, graph, hass);
  return { ...problemAt(context, node, reason), ...(key ? { detail } : {}) };
}

/** A save that failed for a reason `SaveProblem` explains. */
export class SaveProblemError extends Error {
  readonly problem: SaveProblem;
  constructor(problem: SaveProblem) {
    super(problem.text);
    this.problem = problem;
  }
}

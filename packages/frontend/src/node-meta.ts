import { type FlowNode, getRawStep, isPlainObject, isScriptStart } from '@flode/shared';
import {
  type HaBlockType,
  haBlockType,
  type NodeSummary,
  type StepIssue,
  stepIssues,
  summarizeNode,
} from '@flode/ui-core';
import type { NodeType } from './flow-model';
import { type HomeAssistant, serviceInfo } from './ha';
import { summaryContext } from './i18n';
import { t } from './strings';

/**
 * Per node type: HA icon and colour. Colours are HA's own state/theme
 * variables, so the canvas follows every HA theme and dark mode by itself.
 */
export const NODE_META: Record<NodeType, { icon: string; color: string }> = {
  trigger: { icon: 'mdi:flash', color: 'var(--amber-color, #ffc107)' },
  condition: { icon: 'mdi:source-branch', color: 'var(--blue-color, #2196f3)' },
  action: { icon: 'mdi:play-circle-outline', color: 'var(--green-color, #4caf50)' },
  delay: { icon: 'mdi:timer-sand', color: 'var(--purple-color, #9c27b0)' },
  wait: { icon: 'mdi:timer-pause-outline', color: 'var(--deep-purple-color, #673ab7)' },
  set_variables: { icon: 'mdi:variable', color: 'var(--cyan-color, #00bcd4)' },
};

/** HA's icons for its building blocks (as in Settings → Automations). */
const BLOCK_ICONS: Record<HaBlockType, string> = {
  if: 'mdi:call-split',
  choose: 'mdi:arrow-decision',
  repeat: 'mdi:refresh',
  parallel: 'mdi:shuffle-disabled',
  sequence: 'mdi:format-list-numbered',
};

function blockOf(node: FlowNode): HaBlockType | undefined {
  const raw = node.type === 'action' ? getRawStep(node.data) : null;
  return raw ? haBlockType(raw) : undefined;
}

/** Card icon: the node type's, or HA's block icon for a Wenn-dann / Auswählen … block. */
export function nodeIcon(node: FlowNode): string {
  const block = blockOf(node);
  if (block) return BLOCK_ICONS[block];
  // A script has no triggers in HA — its start card is not shown as one.
  if (isScriptStart(node.data)) return 'mdi:script-text-play-outline';
  return NODE_META[node.type].icon;
}

/**
 * Card eyebrow: just the kind ("Leuchte", "Zustandsänderung") — the card's
 * colour already says trigger / condition / action, and a long "Auslöser ·
 * Numerischer Zustand" was always cut off. Without a kind: the node type.
 */
export function nodeEyebrow(node: FlowNode, summary: NodeSummary, language: string): string {
  return summary.kind ?? typeLabel(node.type, language);
}

/** The full eyebrow for tooltips: "Aktion · Leuchte". */
export function nodeTypeLine(node: FlowNode, summary: NodeSummary, language: string): string {
  if (isScriptStart(node.data) || !summary.kind) return nodeEyebrow(node, summary, language);
  return `${typeLabel(node.type, language)} · ${summary.kind}`;
}

/** Inspector heading: HA's block name ("Wenn-dann") or the node type ("Aktion"). */
export function nodeTitle(node: FlowNode, hass: HomeAssistant | undefined): string {
  const block = blockOf(node);
  const ctx = summaryContext(hass);
  if (block && ctx) return ctx.blockLabel(block);
  // A script's start card: "Skript-Start", as its card says.
  // A script's (hidden) start node holds its fields — the inspector shows HA's field editor.
  if (isScriptStart(node.data)) return t(hass?.language ?? 'en', 'fields');
  return typeLabel(node.type, hass?.language ?? 'en');
}

export function typeLabel(type: NodeType, language: string): string {
  return t(language, `type_${type}`);
}

/**
 * Plain-language card text ("Movement Backyard changes to Detected") — the
 * `@flode/ui-core` summaries, with HA's own translations.
 */
export function summarize(
  node: FlowNode,
  hass: HomeAssistant | undefined,
  fullNames = false
): NodeSummary {
  const data: Record<string, unknown> = isPlainObject(node.data) ? node.data : {};
  const ctx = summaryContext(hass, fullNames);
  return (
    (ctx && summarizeNode(node.type, data, ctx)) ?? {
      title: typeLabel(node.type, hass?.language ?? 'en'),
    }
  );
}

interface CachedIssues {
  hass: HomeAssistant;
  created: ReadonlySet<string>;
  issues: StepIssue[];
}

/** Per card data: its issues while neither HA's data nor the flow's created entities changed. */
const issueCache = new WeakMap<object, CachedIssues>();

/**
 * What would make this step fail: a service HA doesn't have, an entity that
 * doesn't exist. Entities the flow creates itself (`created`, from
 * `createdEntityIds`) count as existing. Nothing is reported while HA's data
 * isn't loaded yet.
 */
export function nodeIssues(
  node: FlowNode,
  hass: HomeAssistant | undefined,
  created: ReadonlySet<string>
): StepIssue[] {
  if (!hass?.services) return [];
  const data: Record<string, unknown> = isPlainObject(node.data) ? node.data : {};
  const cached = issueCache.get(data);
  if (cached && cached.hass === hass && cached.created === created) return cached.issues;
  const { states, entities } = hass;
  const issues = stepIssues(node.type, data, {
    hasService: (service) => serviceInfo(hass, service) !== undefined,
    hasEntity: (entityId) =>
      entityId in states || entities?.[entityId] !== undefined || created.has(entityId),
  });
  issueCache.set(data, { hass, created, issues });
  return issues;
}

/** One tooltip line per issue: "Dienst gibt es nicht: notify.x". */
export function issueLines(issues: StepIssue[], language: string): string[] {
  return issues.map((issue) =>
    issue.kind === 'unknownService'
      ? `${t(language, 'issueService')}: ${issue.service}`
      : `${t(language, 'issueEntity')}: ${issue.entityId}`
  );
}

import { type FlowNode, getRawStep, isPlainObject, isScriptStart } from '@flode/shared';
import { type HaBlockType, haBlockType, type NodeSummary, summarizeNode } from '@flode/ui-core';
import type { NodeType } from './flow-model';
import type { HomeAssistant } from './ha';
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

/** Card eyebrow: "Aktion · Leuchte", or just "Skript-Start" for a script's start card. */
export function nodeEyebrow(node: FlowNode, summary: NodeSummary, language: string): string {
  if (isScriptStart(node.data)) return summary.kind ?? typeLabel(node.type, language);
  return summary.kind
    ? `${typeLabel(node.type, language)} · ${summary.kind}`
    : typeLabel(node.type, language);
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
export function summarize(node: FlowNode, hass: HomeAssistant | undefined): NodeSummary {
  const data: Record<string, unknown> = isPlainObject(node.data) ? node.data : {};
  const ctx = summaryContext(hass);
  return (
    (ctx && summarizeNode(node.type, data, ctx)) ?? {
      title: typeLabel(node.type, hass?.language ?? 'en'),
    }
  );
}

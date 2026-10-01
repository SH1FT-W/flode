import { type FlowNode, isTemplateString } from '@flode/shared';
import type { NodeSummary } from '@flode/ui-core';
import { html, type TemplateResult } from 'lit';
import type { HomeAssistant } from './ha';
import { NODE_META, nodeIcon } from './node-meta';

/**
 * HA's own icon elements, as in Settings → Automations. They come with HA's
 * automation editor, which FLODE loads — until then the type icon is shown.
 */
export const HA_ICON_ELEMENTS = ['ha-trigger-icon', 'ha-condition-icon', 'ha-service-icon'];

function defined(tag: string): boolean {
  return customElements.get(tag) !== undefined;
}

function stringField(node: FlowNode, key: string): string | undefined {
  const value: unknown = Reflect.get(node.data, key);
  return typeof value === 'string' && value && !isTemplateString(value) ? value : undefined;
}

/**
 * Card icon like HA's automation editor: the entity's live icon when the step
 * is about one entity, else HA's icon for the trigger / condition / action.
 * HA blocks, delays, script starts … keep FLODE's type icons.
 */
export function nodeIconTemplate(
  node: FlowNode,
  summary: NodeSummary,
  hass: HomeAssistant | undefined
): TemplateResult {
  const typeIcon = nodeIcon(node);
  const fallback = html`<ha-icon .icon=${typeIcon}></ha-icon>`;
  if (typeIcon !== NODE_META[node.type].icon) return fallback;
  const stateObj = summary.entityId ? hass?.states[summary.entityId] : undefined;
  if (stateObj) return html`<ha-state-icon .hass=${hass} .stateObj=${stateObj}></ha-state-icon>`;
  const trigger = node.type === 'trigger' ? stringField(node, 'trigger') : undefined;
  if (trigger && defined('ha-trigger-icon')) {
    return html`<ha-trigger-icon .hass=${hass} .trigger=${trigger}></ha-trigger-icon>`;
  }
  const condition = node.type === 'condition' ? stringField(node, 'condition') : undefined;
  if (condition && defined('ha-condition-icon')) {
    return html`<ha-condition-icon .hass=${hass} .condition=${condition}></ha-condition-icon>`;
  }
  const service = node.type === 'action' ? stringField(node, 'service') : undefined;
  if (service && defined('ha-service-icon')) {
    return html`<ha-service-icon .hass=${hass} .service=${service}></ha-service-icon>`;
  }
  return fallback;
}

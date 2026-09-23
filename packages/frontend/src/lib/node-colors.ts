export type NodeColorToken = 'trigger' | 'condition' | 'action' | 'delay' | 'wait' | 'variables';

interface NodeColorClasses {
  /** Accent text (eyebrow, icons) */
  text: string;
  /** Tinted icon chip — background + icon color */
  chip: string;
  /** React Flow connector handle ring */
  handle: string;
  /** Solid fill (step badges, minimap) */
  fill: string;
}

/**
 * Single source of truth for per-node-type styling, shared by the canvas
 * node cards (components/nodes/NodeCard.tsx), the block library, the quick-add
 * menu and the command palette. Colors themselves live as CSS custom
 * properties (index.css / lib/ha-theme.ts) so they follow HA's active theme —
 * this only maps a color token to Tailwind class names built on those tokens.
 *
 * FLODE 2.0 cards are neutral surfaces; the node type is carried by a tinted
 * icon chip and accent text instead of a fully tinted card with a colored border.
 *
 * Class names are spelled out in full (not template-built) so Tailwind's
 * static content scanner can find and generate them.
 */
export const NODE_COLORS: Record<NodeColorToken, NodeColorClasses> = {
  trigger: {
    text: 'text-trigger',
    chip: 'bg-trigger/15 text-trigger',
    handle: 'border-trigger!',
    fill: 'bg-trigger text-trigger-foreground',
  },
  condition: {
    text: 'text-condition',
    chip: 'bg-condition/15 text-condition',
    handle: 'border-condition!',
    fill: 'bg-condition text-condition-foreground',
  },
  action: {
    text: 'text-action',
    chip: 'bg-action/15 text-action',
    handle: 'border-action!',
    fill: 'bg-action text-action-foreground',
  },
  delay: {
    text: 'text-delay',
    chip: 'bg-delay/15 text-delay',
    handle: 'border-delay!',
    fill: 'bg-delay text-delay-foreground',
  },
  wait: {
    text: 'text-wait',
    chip: 'bg-wait/15 text-wait',
    handle: 'border-wait!',
    fill: 'bg-wait text-wait-foreground',
  },
  variables: {
    text: 'text-variables',
    chip: 'bg-variables/15 text-variables',
    handle: 'border-variables!',
    fill: 'bg-variables text-variables-foreground',
  },
};

/** Minimap fill per color token (SVG `fill-*`, spelled out for Tailwind). */
export const NODE_MINIMAP_CLASSES: Record<NodeColorToken, string> = {
  trigger: 'fill-trigger',
  condition: 'fill-condition',
  action: 'fill-action',
  delay: 'fill-delay',
  wait: 'fill-wait',
  variables: 'fill-variables',
};

/** React Flow node `type` → color token. */
export function getNodeColorToken(nodeType: string | undefined): NodeColorToken {
  switch (nodeType) {
    case 'trigger':
    case 'condition':
    case 'action':
    case 'delay':
    case 'wait':
      return nodeType;
    case 'set_variables':
      return 'variables';
    default:
      return 'action';
  }
}

/** Shared node-state styling, independent of node type. */
export const NODE_STATE_CLASSES = {
  selected: 'ring-2 ring-primary shadow-float',
  error: 'ring-2 ring-destructive/60',
  errorBadge: 'bg-destructive text-destructive-foreground',
  disabled: 'border-dashed opacity-55 grayscale',
  disabledBadge: 'bg-muted-foreground text-background',
  active: 'node-active ring-4 ring-success',
  /** Trace overlay — real HA run, distinct from validation `error`/live `active`. */
  traceExecuted: 'ring-2 ring-success/60',
  traceError: 'ring-2 ring-destructive/70',
  traceSkipped: 'opacity-40 grayscale',
} as const;

export type TraceNodeState = 'executed' | 'error' | 'skipped' | null;

/** Maps a node's `useTraceNodeState` result to the class from `NODE_STATE_CLASSES` above, if any. */
export function getTraceStateClass(state: TraceNodeState): string | undefined {
  switch (state) {
    case 'executed':
      return NODE_STATE_CLASSES.traceExecuted;
    case 'error':
      return NODE_STATE_CLASSES.traceError;
    case 'skipped':
      return NODE_STATE_CLASSES.traceSkipped;
    default:
      return undefined;
  }
}

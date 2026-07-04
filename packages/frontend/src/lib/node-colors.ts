export type NodeColorToken = 'trigger' | 'condition' | 'action' | 'delay' | 'wait' | 'variables';

interface NodeColorClasses {
  /** Card border */
  border: string;
  /** Card background tint */
  bg: string;
  /** Selection ring */
  ring: string;
  /** Icon/title/body accent text */
  text: string;
  /** Icon chip background */
  chip: string;
  /** React Flow connector handle */
  handle: string;
  /** Step-number / count badge */
  badge: string;
  /** NodePalette drag button */
  palette: string;
}

/**
 * Single source of truth for per-node-type styling, shared by the canvas
 * node components (components/nodes/*.tsx) and NodePalette.tsx. Colors
 * themselves live as CSS custom properties (index.css / lib/ha-theme.ts) so
 * they follow HA's active theme — this only maps a node type to Tailwind
 * class names built on top of those tokens.
 *
 * Class names are spelled out in full (not template-built) so Tailwind's
 * static content scanner can find and generate them — dynamically
 * constructed strings like `border-${token}` are invisible to Tailwind's JIT.
 */
export const NODE_COLORS: Record<NodeColorToken, NodeColorClasses> = {
  trigger: {
    border: 'border-trigger',
    bg: 'bg-trigger/10',
    ring: 'ring-trigger',
    text: 'text-trigger',
    chip: 'bg-trigger/20',
    handle: 'bg-trigger! border-trigger!',
    badge: 'bg-trigger text-trigger-foreground',
    palette: 'bg-trigger/10 border-trigger text-trigger hover:bg-trigger/20',
  },
  condition: {
    border: 'border-condition',
    bg: 'bg-condition/10',
    ring: 'ring-condition',
    text: 'text-condition',
    chip: 'bg-condition/20',
    handle: 'bg-condition! border-condition!',
    badge: 'bg-condition text-condition-foreground',
    palette: 'bg-condition/10 border-condition text-condition hover:bg-condition/20',
  },
  action: {
    border: 'border-action',
    bg: 'bg-action/10',
    ring: 'ring-action',
    text: 'text-action',
    chip: 'bg-action/20',
    handle: 'bg-action! border-action!',
    badge: 'bg-action text-action-foreground',
    palette: 'bg-action/10 border-action text-action hover:bg-action/20',
  },
  delay: {
    border: 'border-delay',
    bg: 'bg-delay/10',
    ring: 'ring-delay',
    text: 'text-delay',
    chip: 'bg-delay/20',
    handle: 'bg-delay! border-delay!',
    badge: 'bg-delay text-delay-foreground',
    palette: 'bg-delay/10 border-delay text-delay hover:bg-delay/20',
  },
  wait: {
    border: 'border-wait',
    bg: 'bg-wait/10',
    ring: 'ring-wait',
    text: 'text-wait',
    chip: 'bg-wait/20',
    handle: 'bg-wait! border-wait!',
    badge: 'bg-wait text-wait-foreground',
    palette: 'bg-wait/10 border-wait text-wait hover:bg-wait/20',
  },
  variables: {
    border: 'border-variables',
    bg: 'bg-variables/10',
    ring: 'ring-variables',
    text: 'text-variables',
    chip: 'bg-variables/20',
    handle: 'bg-variables! border-variables!',
    badge: 'bg-variables text-variables-foreground',
    palette: 'bg-variables/10 border-variables text-variables hover:bg-variables/20',
  },
};

/** Shared node-state styling, independent of node type. */
export const NODE_STATE_CLASSES = {
  error: 'border-destructive ring-2 ring-destructive/40',
  errorBadge: 'bg-destructive text-destructive-foreground',
  disabledBadge: 'bg-muted-foreground text-background',
  active: 'node-active ring-4 ring-success',
  /** Trace overlay (Phase E) — real HA run, distinct from validation `error`/live `active`. */
  traceExecuted: 'ring-2 ring-emerald-500/60',
  traceError: 'border-destructive ring-2 ring-destructive/70',
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

import { type FlowGraph, isPlainObject } from '@flode/shared';
import { createTracePathResolver } from '@flode/ui-core';
import type { FlowKind } from './ha';

/**
 * A run as HA's `trace/get` returns it — only what FLODE 3 reads itself; the
 * whole object goes unchanged into HA's own trace elements.
 */
export interface HaTrace {
  run_id: string;
  state: string;
  script_execution?: string | null;
  timestamp: { start: string; finish?: string | null };
  context: { id: string };
  config: Record<string, unknown>;
  trace: Record<string, TraceStepResult[]>;
  error?: string;
}

export interface TraceStepResult {
  path: string;
  timestamp: string;
  changed_variables?: Record<string, unknown>;
  error?: string;
  result?: Record<string, unknown>;
}

/** How a card took part in the selected run. */
export type RunMark = 'done' | 'failed' | 'error';

/** Scripts record `sequence/N`; FLODE lays scripts out like automations (`action/N`). */
function flowPath(kind: FlowKind, path: string): string {
  return kind === 'script' ? path.replace(/^sequence\//, 'action/') : path;
}

/** Which card each recorded step belongs to — steps inside a HA block mark the block. */
export function runMarks(graph: FlowGraph, kind: FlowKind, trace: HaTrace): Map<string, RunMark> {
  const resolve = createTracePathResolver(graph.nodes, graph.edges);
  const marks = new Map<string, RunMark>();
  const rank: Record<RunMark, number> = { done: 0, failed: 1, error: 2 };
  for (const [path, steps] of Object.entries(trace.trace)) {
    const id = resolve(flowPath(kind, path));
    if (!id) continue;
    const mark: RunMark = steps.some((s) => s.error || s.result?.error)
      ? 'error'
      : steps.some((s) => s.result?.result === false) && !path.includes('/', path.indexOf('/') + 1)
        ? 'failed'
        : 'done';
    const previous = marks.get(id);
    if (!previous || rank[mark] > rank[previous]) marks.set(id, mark);
  }
  return marks;
}

/** The card a trace path belongs to (for the timeline's selected step). */
export function nodeForPath(graph: FlowGraph, kind: FlowKind, path: string): string | undefined {
  return createTracePathResolver(graph.nodes, graph.edges)(flowPath(kind, path));
}

const ROOT_KEYS: Record<string, readonly string[]> = {
  trigger: ['triggers', 'trigger'],
  condition: ['conditions', 'condition'],
  action: ['actions', 'action'],
  sequence: ['sequence'],
};

/**
 * The step config a path points to inside the run's config
 * (`action/1/then/0` → `config.actions[1].then[0]`) — what HA's step details
 * show next to the result.
 */
export function configAtPath(config: Record<string, unknown>, path: string): unknown {
  const [root, ...rest] = path.split('/');
  const key = ROOT_KEYS[root ?? '']?.find((k) => k in config);
  let current: unknown = key ? config[key] : undefined;
  for (const segment of rest) {
    if (current === undefined || current === null) return undefined;
    if (/^\d+$/.test(segment)) {
      current = Array.isArray(current)
        ? current[Number(segment)]
        : Number(segment) === 0
          ? current
          : undefined;
    } else {
      current = isPlainObject(current) ? current[segment] : undefined;
    }
  }
  return current;
}

/**
 * The variables a run had (what its templates saw: `trigger`, `this`, …),
 * up to and including the step at `uptoPath` — or at its end.
 */
export function runVariables(trace: HaTrace, uptoPath?: string): Record<string, unknown> {
  const steps = Object.values(trace.trace)
    .flat()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const variables: Record<string, unknown> = {};
  for (const step of steps) {
    if (step.changed_variables) Object.assign(variables, step.changed_variables);
    if (uptoPath && step.path === uptoPath) break;
  }
  // FLODE's layout metadata lives in `variables:` but isn't something a template uses.
  delete variables._flode_metadata;
  return variables;
}

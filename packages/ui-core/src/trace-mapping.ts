/**
 * Maps Home Assistant trace step paths (`trigger/0`, `condition/0`,
 * `action/1`, `action/0/then/0`, `action/0/if/condition/0`, …) to FLODE node
 * ids by walking the flow graph the same way the native transpiler lays it
 * out:
 *
 * - single-branch conditions right after the triggers become the top-level
 *   `conditions:` block (`condition/N`);
 * - every other step is part of the `actions:` sequence (`action/N`), where a
 *   condition with a Yes-and-No branch is one `if` step whose branches are
 *   nested (`…/then/K`, `…/else/K`) and the flow continues where both
 *   branches meet; a condition with only a Yes branch nests everything after
 *   it under `then`.
 *
 * Shapes it can't follow (choose blocks, repeats, parallel fan-out, trigger-id
 * routing) resolve to `undefined` — the caller counts those as unmapped.
 */

export interface TraceGraphNode {
  id: string;
  type?: string;
}

export interface TraceGraphEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  type?: string;
}

/** Visual-only / back edges that don't describe the forward execution order. */
const IGNORED_EDGE_TYPES = new Set(['hint', 'loop-back', 'choose-chain', 'choose-default']);

export function createTracePathResolver(
  nodes: readonly TraceGraphNode[],
  edges: readonly TraceGraphEdge[]
): (path: string) => string | undefined {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const flowEdges = edges.filter((e) => !IGNORED_EDGE_TYPES.has(e.type ?? ''));

  const successors = (id: string, handle?: 'true' | 'false'): string[] =>
    flowEdges
      .filter(
        (e) =>
          e.source === id &&
          (handle === undefined ||
            (handle === 'true' ? e.sourceHandle !== 'false' : e.sourceHandle === 'false'))
      )
      .map((e) => e.target);

  const single = (ids: string[]): string | undefined =>
    new Set(ids).size === 1 ? ids[0] : undefined;

  /** First node reachable from both `a` and `b` (breadth-first from `a`). */
  const mergePoint = (a: string, b: string): string | undefined => {
    const reach = (start: string) => {
      const seen = new Set<string>();
      const queue = [start];
      while (queue.length > 0) {
        const id = queue.shift();
        if (id === undefined || seen.has(id)) continue;
        seen.add(id);
        queue.push(...successors(id));
      }
      return seen;
    };
    const fromB = reach(b);
    const seen = new Set<string>();
    const queue = [a];
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      if (fromB.has(id)) return id;
      queue.push(...successors(id));
    }
    return undefined;
  };

  /** Top-level steps of a sequence starting at `start`, ending before `stop`. */
  const sequenceFrom = (start: string | undefined, stop?: string): string[] => {
    const steps: string[] = [];
    let current = start;
    while (current && current !== stop && !steps.includes(current)) {
      steps.push(current);
      if (typeOf.get(current) === 'condition') {
        const yes = single(successors(current, 'true'));
        const no = single(successors(current, 'false'));
        // Only-Yes branch: everything after is nested under `then`.
        current = yes && no ? mergePoint(yes, no) : undefined;
      } else {
        current = single(successors(current));
      }
    }
    return steps;
  };

  const triggers = nodes.filter((n) => n.type === 'trigger').map((n) => n.id);

  // Top-level `conditions:` — single-branch conditions straight after the triggers.
  const topConditions: string[] = [];
  let next = single(triggers.flatMap((id) => successors(id)));
  while (
    next &&
    typeOf.get(next) === 'condition' &&
    successors(next, 'false').length === 0 &&
    !topConditions.includes(next)
  ) {
    topConditions.push(next);
    next = single(successors(next, 'true'));
  }
  const mainSequence = sequenceFrom(next);

  /** Resolves `…/then/K` / `…/else/K` / `…/if/…` below the `if` step `conditionId`. */
  const resolveNested = (conditionId: string, rest: string[]): string | undefined => {
    const [branch, indexStr, ...deeper] = rest;
    if (branch === undefined || branch === 'if') return conditionId;
    if (branch !== 'then' && branch !== 'else') return undefined;
    const yes = single(successors(conditionId, 'true'));
    const no = single(successors(conditionId, 'false'));
    const stop = yes && no ? mergePoint(yes, no) : undefined;
    const branchSteps = sequenceFrom(branch === 'then' ? yes : no, stop);
    return resolveStep(branchSteps, indexStr, deeper);
  };

  const resolveStep = (
    steps: string[],
    indexStr: string | undefined,
    rest: string[]
  ): string | undefined => {
    const id = steps[Number(indexStr)];
    if (id === undefined) return undefined;
    if (rest.length === 0) return id;
    // A step nested in any other card (a HA block, an opaque repeat …) belongs to that card.
    return typeOf.get(id) === 'condition' ? resolveNested(id, rest) : id;
  };

  return (path) => {
    const [root, indexStr, ...rest] = path.split('/');
    switch (root) {
      // Deeper paths (e.g. `condition/0/entity_id/0`) are sub-results of the same step.
      case 'trigger':
        return triggers[Number(indexStr)];
      case 'condition':
        return topConditions[Number(indexStr)];
      case 'action':
        return resolveStep(mainSequence, indexStr, rest);
      default:
        return undefined;
    }
  };
}

/**
 * The little of a directed graph the topology analysis needs: nodes,
 * predecessors, successors and a topological order (`null`: a cycle).
 *
 * Neighbours are kept as object keys, so they list in the order a plain
 * object gives its keys (integer-like ids first) — the order graphlib gave,
 * which this replaces (it pulled in all of lodash).
 */
export class Digraph {
  private readonly preds: Record<string, Record<string, true>> = {};
  private readonly sucs: Record<string, Record<string, true>> = {};

  /** Adds `id` (again: no change). */
  setNode(id: string): void {
    if (Object.hasOwn(this.preds, id)) return;
    this.preds[id] = {};
    this.sucs[id] = {};
  }

  /** Adds the edge `from` → `to` and both its nodes; the same edge twice stays one. */
  setEdge(from: string, to: string): void {
    this.setNode(from);
    this.setNode(to);
    this.sucs[from][to] = true;
    this.preds[to][from] = true;
  }

  nodes(): string[] {
    return Object.keys(this.preds);
  }

  /** The nodes with an edge to `id`; `undefined` for a node not in the graph. */
  predecessors(id: string): string[] | undefined {
    return Object.hasOwn(this.preds, id) ? Object.keys(this.preds[id]) : undefined;
  }

  /** The nodes `id` has an edge to; `undefined` for a node not in the graph. */
  successors(id: string): string[] | undefined {
    return Object.hasOwn(this.sucs, id) ? Object.keys(this.sucs[id]) : undefined;
  }

  /**
   * The nodes so that each comes after all its predecessors, `null` when
   * there is a cycle. Same order as graphlib's `alg.topsort`: from each sink
   * (in node order) depth first through its predecessors.
   */
  topsort(): string[] | null {
    const visited = new Set<string>();
    const onPath = new Set<string>();
    const order: string[] = [];
    const visit = (id: string): boolean => {
      if (onPath.has(id)) return false;
      if (visited.has(id)) return true;
      onPath.add(id);
      visited.add(id);
      for (const pred of Object.keys(this.preds[id])) {
        if (!visit(pred)) return false;
      }
      onPath.delete(id);
      order.push(id);
      return true;
    };
    const sinks = this.nodes().filter((id) => Object.keys(this.sucs[id]).length === 0);
    for (const sink of sinks) {
      if (!visit(sink)) return null;
    }
    // A cycle without a way out to a sink is never reached from one.
    return visited.size === this.nodes().length ? order : null;
  }
}

import type { FlowEdge } from './schemas/edges';

/**
 * `base`, or `base_1`, `base_2`, … when `taken` holds it already (several ids
 * from one millisecond, or the same connection created twice). The id handed
 * out is added to `taken`, so the next call with the same base gets the next suffix.
 */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 1; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
}

/** The same edges, with every id unique: a repeated id gets a counter suffix. */
export function withUniqueEdgeIds(edges: FlowEdge[]): FlowEdge[] {
  const taken = new Set<string>();
  return edges.map((edge) => {
    const id = uniqueId(edge.id, taken);
    return id === edge.id ? edge : { ...edge, id };
  });
}

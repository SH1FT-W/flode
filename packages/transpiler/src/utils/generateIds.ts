import { uniqueId } from '@flode/shared';
import { v4 as uuidv4 } from 'uuid';

// Global counter to ensure uniqueness even when Date.now() returns the same value
let globalNodeCounter = 0;

/**
 * Generate a unique node ID.
 */
export function generateNodeId(type: string, index: number): string {
  return `${type}_${Date.now()}_${index}_${globalNodeCounter++}`;
}

/**
 * Generate a unique graph ID.
 */
export function generateGraphId(): string {
  return uuidv4();
}

/** The millisecond the edge ids in `edgeIdsOfStamp` were handed out in. */
let edgeStamp = 0;
const edgeIdsOfStamp = new Set<string>();

/**
 * Generate a unique edge ID: source, target and handle (so a condition's
 * "true" and "false" edges to one node don't share an id) plus the time, with
 * a counter when the same connection is created again within one millisecond.
 */
export function generateEdgeId(source: string, target: string, sourceHandle?: string): string {
  const now = Date.now();
  if (now !== edgeStamp) {
    edgeStamp = now;
    edgeIdsOfStamp.clear();
  }
  const base = `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ''}-${now}`;
  return uniqueId(base, edgeIdsOfStamp);
}

/**
 * Reset the global counter (for testing purposes)
 */
export function resetNodeCounter(): void {
  globalNodeCounter = 0;
}

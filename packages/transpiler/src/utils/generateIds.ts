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

/**
 * Generate a unique edge ID — the handle is part of it, so a condition's
 * "true" and "false" edges to one node don't share an id.
 */
export function generateEdgeId(source: string, target: string, sourceHandle?: string): string {
  return `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ''}-${Date.now()}`;
}

/**
 * Reset the global counter (for testing purposes)
 */
export function resetNodeCounter(): void {
  globalNodeCounter = 0;
}

import type { Connection } from '@xyflow/react';
import { compoundTypes, nodeTypes } from '@/components/panels/NodePalette';

/**
 * Which end of the dragged (but unfinished) connection the quick-add node
 * needs to satisfy — `'forward'` when the user dragged from a *source*
 * handle (the new node needs a target/input), `'backward'` when dragged
 * from a *target* handle (the new node needs a source/output).
 */
export type QuickAddDirection = 'forward' | 'backward';

/**
 * Node types offered by the quick-add menu, filtered by which handle the new
 * node needs to satisfy the dragged connection.
 *
 * Return type is derived via `typeof` from the actual `nodeTypes`/
 * `compoundTypes` arrays (not the wider `NodeTypeConfig`/`CompoundTypeConfig`
 * interfaces) so each item's `labelKey` keeps its specific string-literal
 * type — widening it to plain `string` breaks i18next's typed `t()` calls at
 * the call site (QuickAddMenu.tsx).
 */
export function getAvailableQuickAddTypes(direction: QuickAddDirection): {
  simple: (typeof nodeTypes)[number][];
  compound: (typeof compoundTypes)[number][];
} {
  if (direction === 'forward') {
    // The new node must accept an incoming connection — triggers have no
    // target/input handle, so they can't complete a forward drag.
    return {
      simple: nodeTypes.filter((config) => config.type !== 'trigger'),
      compound: [...compoundTypes],
    };
  }
  // Dragged backward from a target handle: the new node must have a source
  // handle to feed the dragged-from node. Every simple type has one (a
  // "stop" action has none, but that's a data-driven variant of "action",
  // not a distinct type offered here). Compound blocks are excluded — their
  // exit point(s) aren't well-defined enough to wire safely (e.g. a choose
  // block's two cases don't converge on a single node).
  return { simple: [...nodeTypes], compound: [] };
}

/**
 * Builds the `Connection`(s) to pass to the store's `onConnect` action to
 * wire a quick-added node into the dragged (but unfinished) connection.
 * Returns one `Connection` per target id — usually one, two for a `parallel`
 * block's two independent branches (see `block-factories.ts`'s
 * `entryNodeIds`).
 */
export function buildQuickAddConnections(
  direction: QuickAddDirection,
  fromNodeId: string,
  fromHandleId: string | null,
  newNodeIds: string[]
): Connection[] {
  return newNodeIds.map((newNodeId) =>
    direction === 'forward'
      ? { source: fromNodeId, sourceHandle: fromHandleId, target: newNodeId, targetHandle: null }
      : { source: newNodeId, sourceHandle: null, target: fromNodeId, targetHandle: fromHandleId }
  );
}

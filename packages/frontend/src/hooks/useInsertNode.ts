import { useReactFlow, type XYPosition } from '@xyflow/react';
import { useCallback } from 'react';
import { type CompoundBlockKey, createCompoundBlock } from '@/lib/block-factories';
import type { NodeTypeConfig } from '@/lib/node-catalog';
import { buildQuickAddConnections, type QuickAddDirection } from '@/lib/quick-add';
import { generateNodeId } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';

/** Approximate rendered size of a node card — used to center new nodes on a point. */
export const NODE_SIZE_ESTIMATE = { width: 260, height: 96 } as const;

/** Horizontal distance between a node and the next one placed after it. */
const NEXT_NODE_GAP_X = 340;

/** An existing handle a newly inserted node should be wired to. */
export interface InsertLink {
  fromNodeId: string;
  fromHandleId: string | null;
  direction: QuickAddDirection;
}

export type InsertItem =
  | { kind: 'simple'; config: NodeTypeConfig }
  | { kind: 'compound'; key: CompoundBlockKey };

/**
 * Single place that creates nodes/blocks on the canvas and wires them up —
 * shared by drag & drop, the quick-add menu, the node "+" button, the block
 * library and the command palette.
 */
export function useInsertNode() {
  const addNode = useFlowStore((s) => s.addNode);
  const addCompound = useFlowStore((s) => s.addCompound);
  const onConnect = useFlowStore((s) => s.onConnect);
  const { setCenter, getZoom } = useReactFlow();

  /** Inserts `item` centered on `center` (flow coordinates), optionally wired to `link`. */
  const insertAt = useCallback(
    (item: InsertItem, center: XYPosition, link?: InsertLink): string[] => {
      let newIds: string[];
      if (item.kind === 'simple') {
        const id = generateNodeId(item.config.type);
        addNode({
          id,
          type: item.config.type,
          position: {
            x: center.x - NODE_SIZE_ESTIMATE.width / 2,
            y: center.y - NODE_SIZE_ESTIMATE.height / 2,
          },
          data: { ...item.config.defaultData },
        });
        newIds = [id];
      } else {
        const block = createCompoundBlock(item.key, center.x, center.y);
        addCompound(block.nodes, block.edges);
        newIds = block.entryNodeIds;
      }
      if (link) {
        for (const connection of buildQuickAddConnections(
          link.direction,
          link.fromNodeId,
          link.fromHandleId,
          newIds
        )) {
          onConnect(connection);
        }
      }
      return newIds;
    },
    [addNode, addCompound, onConnect]
  );

  /**
   * Inserts `item` at the "natural next" spot: right after the single selected
   * node (and wired to it), otherwise right of the rightmost node. Scrolls the
   * canvas so the new node is visible.
   */
  const insertNext = useCallback(
    (item: InsertItem) => {
      const { nodes } = useFlowStore.getState();
      const selected = nodes.filter((n) => n.selected);
      const anchor =
        selected.length === 1
          ? selected[0]
          : nodes.reduce<(typeof nodes)[number] | undefined>(
              (best, n) => (!best || n.position.x > best.position.x ? n : best),
              undefined
            );
      const center = anchor
        ? {
            x: anchor.position.x + NEXT_NODE_GAP_X + NODE_SIZE_ESTIMATE.width / 2,
            y: anchor.position.y + NODE_SIZE_ESTIMATE.height / 2,
          }
        : { x: 0, y: 0 };
      // Only wire when the user picked a node to continue from — and never
      // from a stop action, which has no outgoing handle.
      // Triggers have no input handle, so they're never wired after anything.
      const linkFrom =
        selected.length === 1 && typeof selected[0].data.stop !== 'string'
          ? selected[0]
          : undefined;
      const isTrigger = item.kind === 'simple' && item.config.type === 'trigger';
      const link: InsertLink | undefined =
        linkFrom && !isTrigger
          ? {
              fromNodeId: linkFrom.id,
              fromHandleId: linkFrom.type === 'condition' ? 'true' : null,
              direction: 'forward',
            }
          : undefined;
      insertAt(item, center, link);
      setCenter(center.x, center.y, { duration: 300, zoom: getZoom() });
    },
    [insertAt, setCenter, getZoom]
  );

  return { insertAt, insertNext };
}

import type { NodeMouseHandler, OnBeforeDelete, OnConnectEnd } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  type EdgeTypes,
  MarkerType,
  MiniMap,
  type NodeTypes,
  type OnSelectionChangeParams,
  Panel,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { Command, Zap } from 'lucide-react';
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AiCreateButton } from '@/components/ai/AiCreateButton';
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/CanvasContextMenu';
import { CanvasDock } from '@/components/canvas/CanvasDock';
import { LastRunChip } from '@/components/canvas/LastRunChip';
import { QuickAddProvider, type QuickAddRequest } from '@/components/canvas/QuickAddContext';
import { QuickAddMenu, type QuickAddPosition } from '@/components/canvas/QuickAddMenu';
import {
  ChooseChainEdge,
  ChooseDefaultEdge,
  DeletableEdge,
  HintEdge,
  LoopBackEdge,
} from '@/components/edges';
import {
  ActionNode,
  ConditionNode,
  DelayNode,
  SetVariablesNode,
  TriggerNode,
  WaitNode,
} from '@/components/nodes';
import { Button } from '@/components/ui/button';
import { useDarkMode } from '@/hooks/useDarkMode';
import { type InsertItem, NODE_SIZE_ESTIMATE, useInsertNode } from '@/hooks/useInsertNode';
import type { CompoundBlockKey } from '@/lib/block-factories';
import {
  nodeTypes as catalogNodeTypes,
  DND_COMPOUND_MIME,
  DND_NODE_MIME,
} from '@/lib/node-catalog';
import { getNodeColorToken, NODE_MINIMAP_CLASSES } from '@/lib/node-colors';
import type { QuickAddDirection } from '@/lib/quick-add';
import { formatShortcut } from '@/lib/shortcuts';
import { fitViewOptions, isNarrowViewport } from '@/lib/viewport';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';
import { isMacOS } from '@/utils/useAgentPlatform';

/** Edge colors follow the theme tokens (see index.css / lib/ha-theme.ts). */
const EDGE_COLOR = 'hsl(var(--muted-foreground) / 0.45)';
const EDGE_COLOR_SELECTED = 'hsl(var(--primary))';
const EDGE_COLOR_SIMULATION = 'hsl(var(--success))';
const EDGE_COLOR_TRACE = 'hsl(var(--warning))';

const TRIGGER_CONFIG = catalogNodeTypes[0];

interface QuickAddState {
  screenPosition: QuickAddPosition;
  flowPosition: { x: number; y: number };
  fromNodeId: string;
  fromHandleId: string | null;
  direction: QuickAddDirection;
}

// New node types should be added here as needed!
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  wait: WaitNode,
  set_variables: SetVariablesNode,
};

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
  hint: HintEdge,
  'choose-chain': ChooseChainEdge,
  'choose-default': ChooseDefaultEdge,
  'loop-back': LoopBackEdge,
};

export function FlowCanvas() {
  const { t } = useTranslation(['common', 'debug']);
  const isDarkMode = useDarkMode();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    selectedNodeId,
    isSimulating,
    executionPath,
    isShowingTrace,
    traceExecutionPath,
    canDeleteEdge,
  } = useFlowStore();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNode, getZoom, setCenter } = useReactFlow();
  const { insertAt, insertNext } = useInsertNode();
  const openDialog = useUiStore((s) => s.openDialog);
  const minimapVisible = useUiStore((s) => s.minimapVisible);
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const initialFitViewOptions = useMemo(fitViewOptions, []);

  // Phones: the inspector opens as a bottom sheet over the lower ~55 % of
  // the canvas — move the selected node into the visible top part instead
  // of leaving it hidden underneath.
  useEffect(() => {
    if (!selectedNodeId || !isNarrowViewport()) return;
    const node = getNode(selectedNodeId);
    const canvasHeight = reactFlowWrapper.current?.clientHeight ?? 0;
    if (!node || canvasHeight === 0) return;
    const zoom = Math.max(getZoom(), 0.8);
    const width = node.measured?.width ?? NODE_SIZE_ESTIMATE.width;
    const height = node.measured?.height ?? NODE_SIZE_ESTIMATE.height;
    // Node should sit at ~22 % from the top: shift the viewport centre down accordingly.
    const offsetY = (canvasHeight * (0.5 - 0.22)) / zoom;
    void setCenter(node.position.x + width / 2, node.position.y + height / 2 + offsetY, {
      zoom,
      duration: 300,
    });
  }, [selectedNodeId, getNode, getZoom, setCenter]);

  // Dropping a dragged connection on empty canvas offers a quick-add menu
  // instead of just discarding it — see QuickAddMenu.tsx.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      // A real (or attempted, near-a-handle) connection was involved —
      // xyflow already handled it, nothing for us to do.
      if (connectionState.toNode || !connectionState.fromHandle || !connectionState.fromNode) {
        return;
      }
      // Released outside the canvas entirely (e.g. over the node palette).
      const targetEl = event.target as Element | null;
      if (!targetEl?.closest?.('.react-flow__pane')) return;

      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;

      const flowPosition = screenToFlowPosition({ x: point.clientX, y: point.clientY });

      setQuickAdd({
        screenPosition: { screenX: point.clientX, screenY: point.clientY },
        flowPosition,
        fromNodeId: connectionState.fromHandle.nodeId,
        fromHandleId: connectionState.fromHandle.id ?? null,
        direction: connectionState.fromHandle.type === 'source' ? 'forward' : 'backward',
      });
    },
    [screenToFlowPosition]
  );

  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);

  // A node's "+" button: place the new node to the right of the clicked button.
  const openQuickAddFromNode = useCallback(
    (request: QuickAddRequest) => {
      setQuickAdd({
        screenPosition: { screenX: request.screenX, screenY: request.screenY },
        flowPosition: screenToFlowPosition({
          x: request.screenX + 40 + NODE_SIZE_ESTIMATE.width / 2,
          y: request.screenY,
        }),
        fromNodeId: request.fromNodeId,
        fromHandleId: request.fromHandleId,
        direction: 'forward',
      });
    },
    [screenToFlowPosition]
  );

  const handleQuickAddSelect = useCallback(
    (item: InsertItem) => {
      if (!quickAdd) return;
      insertAt(item, quickAdd.flowPosition, {
        fromNodeId: quickAdd.fromNodeId,
        fromHandleId: quickAdd.fromHandleId,
        direction: quickAdd.direction,
      });
      setQuickAdd(null);
    },
    [quickAdd, insertAt]
  );

  // Right-click on a node selects it (unless it's part of the current
  // selection) and opens the node menu; on empty canvas, the pane menu.
  const onNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      if (!node.selected) {
        onNodesChange(
          useFlowStore
            .getState()
            .nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: n.id === node.id }))
        );
      }
      setContextMenu({ x: event.clientX, y: event.clientY, target: 'node' });
    },
    [onNodesChange]
  );

  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target: 'pane' });
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      if (selectedNodes.length === 1) {
        selectNode(selectedNodes[0].id);
      } else {
        selectNode(null);
      }
    },
    [selectNode]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Prevent deletion of edges that would leave a condition node with no outgoing connections
  const onBeforeDelete = useCallback<OnBeforeDelete>(
    async ({ nodes: nodesToDelete, edges: edgesToDelete }) => {
      const allowedEdges = edgesToDelete.filter((edge) => canDeleteEdge(edge.id));
      return { nodes: nodesToDelete, edges: allowedEdges };
    },
    [canDeleteEdge]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const center = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      try {
        const compoundData = event.dataTransfer.getData(DND_COMPOUND_MIME);
        if (compoundData) {
          const { key } = JSON.parse(compoundData) as { key: CompoundBlockKey };
          insertAt({ kind: 'compound', key }, center);
          return;
        }
        const nodeData = event.dataTransfer.getData(DND_NODE_MIME);
        if (!nodeData) return;
        const { type } = JSON.parse(nodeData) as { type: string };
        const config = catalogNodeTypes.find((c) => c.type === type);
        if (config) insertAt({ kind: 'simple', config }, center);
      } catch (err) {
        console.error('Failed to parse dropped block data:', err);
      }
    },
    [screenToFlowPosition, insertAt]
  );

  // Style edges based on simulation state, trace state, and selected node
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      // Check if this edge is part of the execution path during simulation
      const sourceIdx = executionPath.indexOf(edge.source);
      const targetIdx = executionPath.indexOf(edge.target);

      const isActiveInSimulation =
        isSimulating &&
        executionPath.length >= 2 &&
        sourceIdx !== -1 &&
        targetIdx !== -1 &&
        targetIdx === sourceIdx + 1;

      // Check if this edge is part of the trace execution path
      const traceSourceIdx = traceExecutionPath.indexOf(edge.source);
      const traceTargetIdx = traceExecutionPath.indexOf(edge.target);

      const isActiveInTrace =
        isShowingTrace &&
        traceExecutionPath.length >= 2 &&
        traceSourceIdx !== -1 &&
        traceTargetIdx !== -1 &&
        traceTargetIdx === traceSourceIdx + 1;

      // Check if this edge is connected to the selected node
      const isConnectedToSelected =
        selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);

      // Invisible semantic flow edges — trigger→case1 in trigger-based choose blocks.
      // Topology/serializer needs them; hint edges already show the visual connection.
      if (edge.type === 'choose-entry') {
        return {
          ...edge,
          style: { opacity: 0, pointerEvents: 'none' as const },
          markerEnd: undefined,
        };
      }

      // choose-chain — invisible, topology only (fan-out hint edges replace it visually)
      if (edge.type === 'choose-chain') {
        return {
          ...edge,
          style: { opacity: 0, pointerEvents: 'none' as const },
          markerEnd: undefined,
        };
      }

      // choose-default — subtle dashed "Sonst/Otherwise" edge, rendered by ChooseDefaultEdge
      if (edge.type === 'choose-default') {
        return {
          ...edge,
          style: {},
          markerEnd: undefined,
        };
      }

      // Visual-only hint edges (trigger routing)
      if (edge.type === 'hint') {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: EDGE_COLOR },
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
        };
      }

      // Loop-back edges — dashed style, handled by LoopBackEdge component
      if (edge.type === 'loop-back') {
        return { ...edge };
      }

      // Determine edge styling based on state (priority: simulation > trace > selection)
      let edgeStyle = { strokeWidth: 2, stroke: EDGE_COLOR };
      let markerEnd = { type: MarkerType.ArrowClosed, color: EDGE_COLOR };

      if (isActiveInSimulation) {
        // Simulation takes precedence - green for active path
        edgeStyle = { stroke: EDGE_COLOR_SIMULATION, strokeWidth: 3 };
        markerEnd = { type: MarkerType.ArrowClosed, color: EDGE_COLOR_SIMULATION };
      } else if (isActiveInTrace) {
        // Trace visualization - orange for trace path
        edgeStyle = { stroke: EDGE_COLOR_TRACE, strokeWidth: 3 };
        markerEnd = { type: MarkerType.ArrowClosed, color: EDGE_COLOR_TRACE };
      } else if (isConnectedToSelected) {
        // Blue highlighting for connected edges
        edgeStyle = { stroke: EDGE_COLOR_SELECTED, strokeWidth: 2.5 };
        markerEnd = { type: MarkerType.ArrowClosed, color: EDGE_COLOR_SELECTED };
      }

      return {
        ...edge,
        type: 'deletable',
        animated: isActiveInSimulation || isActiveInTrace,
        style: edgeStyle,
        markerEnd,
      };
    });
  }, [edges, isSimulating, executionPath, isShowingTrace, traceExecutionPath, selectedNodeId]);

  const isEmpty = nodes.length === 0;

  return (
    <QuickAddProvider value={openQuickAddFromNode}>
      <div className="relative h-full w-full" ref={reactFlowWrapper}>
        <ReactFlow
          colorMode={isDarkMode ? 'dark' : 'light'}
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onBeforeDelete={onBeforeDelete}
          onSelectionChange={onSelectionChange}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onDragOver={onDragOver}
          onDrop={onDrop}
          panOnScroll={isMacOS()}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: 'deletable',
            style: { strokeWidth: 2, stroke: EDGE_COLOR },
            markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
          maxZoom={2}
          minZoom={0.25}
          fitView
          fitViewOptions={initialFitViewOptions}
          snapToGrid
          snapGrid={[15, 15]}
          deleteKeyCode={null}
          className="bg-canvas!"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color="hsl(var(--muted-foreground) / 0.28)"
          />
          {minimapVisible && (
            <MiniMap
              className="hidden opacity-80 transition-opacity hover:opacity-100 md:block"
              style={{ width: 144, height: 92 }}
              nodeStrokeWidth={0}
              nodeBorderRadius={6}
              zoomable
              pannable
              nodeClassName={(node) => NODE_MINIMAP_CLASSES[getNodeColorToken(node.type)]}
            />
          )}

          <CanvasDock />

          {isSimulating && (
            <Panel
              position="top-center"
              className="flode-glass flex items-center gap-2 rounded-full border border-success/40 px-4 py-1.5 font-medium text-sm text-success shadow-raised"
            >
              <span className="size-2 animate-pulse rounded-full bg-success" />
              {t('debug:simulation.simulatingExecution')}
            </Panel>
          )}

          {!isSimulating && <LastRunChip />}
        </ReactFlow>

        {isEmpty && (
          <EmptyCanvas
            onAddTrigger={() => insertNext({ kind: 'simple', config: TRIGGER_CONFIG })}
            onBrowse={() => openDialog('palette')}
          />
        )}

        <QuickAddMenu
          position={quickAdd?.screenPosition ?? null}
          direction={quickAdd?.direction ?? 'forward'}
          onSelect={handleQuickAddSelect}
          onClose={closeQuickAdd}
        />
        <CanvasContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      </div>
    </QuickAddProvider>
  );
}

interface EmptyCanvasProps {
  onAddTrigger: () => void;
  onBrowse: () => void;
}

/** First-run hint on an empty canvas. */
function EmptyCanvas({ onAddTrigger, onBrowse }: EmptyCanvasProps) {
  const { t } = useTranslation(['ui']);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-7 text-center shadow-raised">
        <span className="flex size-11 items-center justify-center rounded-xl bg-trigger/15 text-trigger">
          <Zap className="size-5" />
        </span>
        <h2 className="text-balance font-semibold text-base text-foreground">
          {t('ui:canvas.emptyTitle')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('ui:canvas.emptyText', { shortcut: formatShortcut('ctrl+k') })}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button onClick={onAddTrigger}>
            <Zap />
            {t('ui:canvas.addTrigger')}
          </Button>
          <Button variant="outline" onClick={onBrowse}>
            <Command />
            {t('ui:canvas.browseBlocks')}
          </Button>
          <AiCreateButton />
        </div>
      </div>
    </div>
  );
}

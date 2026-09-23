import type {
  FlowEdge,
  FlowGraph,
  FlowMetadata,
  FlowNode,
  NodeValidationError,
} from '@flode/shared';
import { getRawStep, validateNodeData } from '@flode/shared';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { t as i18t } from 'i18next';
import { temporal } from 'zundo';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import type { AutomationTrace } from '@/lib/ha-api';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { logger } from '@/lib/logger';
import { createTracePathResolver } from '@/lib/trace-mapping';
import { generateUUID } from '@/lib/utils';
import type { HomeAssistant } from '@/types/hass';
import { flodeIndexedDBStorage } from '@/utils/indexeddb-storage';

/**
 * Node data types for React Flow
 */

export interface TriggerNodeData {
  alias?: string;
  trigger: string;
  entity_id?: string | string[];
  to?: string;
  from?: string;
  event_type?: string;
  [key: string]: unknown;
}

export interface ConditionNodeData {
  alias?: string;
  condition: string;
  entity_id?: string | string[];
  state?: string;
  template?: string;

  // Numeric state conditions
  above?: number;
  below?: number;

  // Time conditions
  after?: string;
  before?: string;
  weekday?: string | string[];

  // Zone conditions
  zone?: string;

  // Sun conditions
  after_offset?: string;
  before_offset?: string;

  // Device conditions
  device_id?: string;
  domain?: string;
  type?: string;
  subtype?: string;

  // Template conditions
  value_template?: string;

  // Generic conditions
  attribute?: string;
  for?: string | { hours?: number; minutes?: number; seconds?: number };

  // Nested conditions for and/or/not group types
  conditions?: ConditionNodeData[];

  [key: string]: unknown;
}

export interface ActionNodeData {
  alias?: string;
  service?: string;
  event?: string;
  event_data?: Record<string, unknown>;
  target?: {
    entity_id?: string | string[];
    area_id?: string | string[];
    device_id?: string | string[];
  };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DelayNodeData {
  alias?: string;
  delay: string | { hours?: number; minutes?: number; seconds?: number };
  [key: string]: unknown;
}

export interface WaitNodeData {
  alias?: string;
  wait_template?: string;
  wait_for_trigger?: TriggerNodeData[];
  timeout?: string;
  continue_on_timeout?: boolean;
  [key: string]: unknown;
}

export interface SetVariablesNodeData {
  alias?: string;
  variables: Record<string, unknown>;
  [key: string]: unknown;
}

export type FlowNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | DelayNodeData
  | WaitNodeData
  | SetVariablesNodeData;

/**
 * Flow store state
 */
export interface FlowState {
  // Graph state
  flowId: string;
  flowName: string;
  flowDescription: string;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];

  // Automation metadata (mode, max, max_exceeded, etc.)
  flowMetadata: FlowMetadata;

  // User-defined root-level variables (preserved across import/export round-trips)
  userVariables: Record<string, unknown> | undefined;

  // User-defined trigger_variables (preserved across import/export round-trips)
  userTriggerVariables: Record<string, unknown> | undefined;

  // Selection state
  selectedNodeId: string | null;

  // Save state
  automationId: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  originalSnapshot: string | null; // JSON snapshot of original state for comparison

  // Simulation state
  isSimulating: boolean;
  activeNodeId: string | null;
  executionPath: string[];

  // Trace state
  isShowingTrace: boolean;
  traceData: AutomationTrace | null;
  traceExecutionPath: string[];
  traceTimestamps: Record<string, string>;
  /** Node IDs whose trace step raised an exception. */
  traceNodeErrors: Record<string, string>;
  /** Node IDs the graph can reach but the trace never touched (condition blocked, branch not taken, ...). */
  traceSkippedNodeIds: string[];
  /** Trace steps that couldn't be mapped to a node (nested choose/repeat paths) — count only, never blocks rendering. */
  traceUnmappedStepCount: number;

  // Shared simulation/trace state
  simulationSpeed: number;

  // Toolbar state
  clipboard: string | null;
  pasteCount: number;

  // Actions
  setNodes: (nodes: Node<FlowNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange<Node<FlowNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  addNode: (node: Node<FlowNodeData>) => void;
  addCompound: (nodes: Node<FlowNodeData>[], edges: Edge[]) => void;
  updateNodeData: (nodeId: string, data: Partial<FlowNodeData>) => void;
  removeNode: (nodeId: string) => void;

  selectNode: (nodeId: string | null) => void;

  setFlowName: (name: string) => void;
  setFlowDescription: (description: string) => void;
  setFlowMetadata: (metadata: Partial<FlowMetadata>) => void;

  setClipboard: (data: string | null) => void;
  setPasteCount: (count: number) => void;

  // Save actions
  setAutomationId: (id: string | null) => void;
  setSaving: (saving: boolean) => void;
  setSaved: () => void;
  setUnsavedChanges: (hasChanges: boolean) => void;
  saveAutomation: (hassApi: HomeAssistant) => Promise<string>;
  updateAutomation: (hassApi: HomeAssistant) => Promise<void>;
  hasRealChanges: () => boolean; // Compare current state to original snapshot

  // Simulation
  startSimulation: () => void;
  stopSimulation: () => void;
  setActiveNode: (nodeId: string | null) => void;
  addToExecutionPath: (nodeId: string) => void;
  clearExecutionPath: () => void;

  // Trace
  showTrace: (traceData: AutomationTrace) => Promise<void>;
  hideTrace: () => void;
  clearTraceExecutionPath: () => void;

  // Shared simulation/trace actions
  setSimulationSpeed: (speed: number) => void;
  getExecutionStepNumber: (nodeId: string) => number | null;

  // Edge validation
  canDeleteEdge: (edgeId: string) => boolean;

  // Import/Export
  toFlowGraph: () => FlowGraph;
  fromFlowGraph: (graph: FlowGraph) => void;
  reset: () => void;

  // Node validation
  nodeErrors: Map<string, NodeValidationError[]>;
  validateNode: (nodeId: string) => void;
  validateAllNodes: () => void;
  clearNodeErrors: (nodeId: string) => void;
  hasValidationErrors: () => boolean;
}

/**
 * Normalize trigger node data to use 'trigger' instead of legacy 'platform' field.
 * This ensures consistency across the codebase.
 */
function normalizeTriggerData(data: Record<string, unknown>): Record<string, unknown> {
  if ('platform' in data && !('trigger' in data)) {
    const { platform, ...rest } = data;
    return { ...rest, trigger: platform };
  }
  return data;
}

/**
 * Normalize node data based on node type.
 * Currently only normalizes trigger nodes.
 */
function normalizeNodeData(type: string, data: Record<string, unknown>): Record<string, unknown> {
  if (type === 'trigger') {
    return normalizeTriggerData(data);
  }
  return data;
}

/**
 * Finds nodes that share the same non-empty `data.id` (the exported HA step
 * `id:` — a separate field from the node's own graph id, see
 * `updateNodeData`). Two steps with the same id would either fail to load in
 * HA or make `trigger.id`/`choose:` routing ambiguous, and this can't be
 * caught by `validateNodeData`'s per-node schema check, which never sees the
 * rest of the graph.
 */
function findDuplicateIdErrors(nodes: Node<FlowNodeData>[]): Map<string, NodeValidationError> {
  const idToNodeIds = new Map<string, string[]>();
  for (const node of nodes) {
    const id = node.data.id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    idToNodeIds.set(id, [...(idToNodeIds.get(id) ?? []), node.id]);
  }

  const errors = new Map<string, NodeValidationError>();
  for (const [, nodeIds] of idToNodeIds) {
    if (nodeIds.length < 2) continue;
    for (const nodeId of nodeIds) {
      errors.set(nodeId, { path: ['id'], message: 'errors:validation.node.duplicateId' });
    }
  }
  return errors;
}

const defaultFlowMetadata: FlowMetadata = {
  mode: 'single',
  initial_state: true,
};

const initialState = {
  flowId: generateUUID(),
  flowName: 'Untitled Automation',
  flowDescription: '',
  flowMetadata: defaultFlowMetadata,
  userVariables: undefined,
  userTriggerVariables: undefined,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  automationId: null,
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,
  originalSnapshot: null,
  isSimulating: false,
  activeNodeId: null,
  executionPath: [],
  isShowingTrace: false,
  traceData: null,
  traceExecutionPath: [],
  traceTimestamps: {},
  traceNodeErrors: {},
  traceSkippedNodeIds: [],
  traceUnmappedStepCount: 0,
  simulationSpeed: 800,
  nodeErrors: new Map<string, NodeValidationError[]>(),
  clipboard: null,
  pasteCount: 0,
};

/**
 * Persisted state for the flow store
 * This is duplicated here to avoid circular dependencies
 */
export type PersistedFlowState = Pick<
  FlowState,
  | 'flowId'
  | 'flowName'
  | 'flowDescription'
  | 'flowMetadata'
  | 'nodes'
  | 'edges'
  | 'selectedNodeId'
  | 'automationId'
  | 'lastSaved'
  | 'originalSnapshot'
>;

type FlowContent = Pick<
  FlowState,
  'flowName' | 'flowDescription' | 'flowMetadata' | 'nodes' | 'edges'
>;

/** The saved-relevant content of a flow as a comparable string (positions included). */
export function flowContentKey(content: FlowContent): string {
  return JSON.stringify({
    flowName: content.flowName,
    flowDescription: content.flowDescription,
    flowMetadata: content.flowMetadata,
    nodes: content.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: content.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  });
}

/**
 * Whether a flow differs from how it was loaded/saved. Without a snapshot
 * it's a new flow, which counts as changed once it has any node.
 */
export function flowHasChanges(flow: FlowContent & Pick<FlowState, 'originalSnapshot'>): boolean {
  if (!flow.originalSnapshot) return flow.nodes.length > 0;
  return flowContentKey(flow) !== flow.originalSnapshot;
}

// Partial state selector for persistence
const persistSelector = (state: FlowState): PersistedFlowState => ({
  flowId: state.flowId,
  flowName: state.flowName,
  flowDescription: state.flowDescription,
  flowMetadata: state.flowMetadata,
  nodes: state.nodes,
  edges: state.edges,
  selectedNodeId: state.selectedNodeId,
  automationId: state.automationId,
  lastSaved: state.lastSaved,
  originalSnapshot: state.originalSnapshot,
});

/**
 * The subset of FlowState that undo/redo tracks — graph content only.
 * Selection, save/dirty bookkeeping, simulation/trace UI state, clipboard,
 * and derived validation errors are deliberately excluded so they don't
 * generate (or get reverted by) history entries.
 */
export type TemporalFlowState = Pick<
  FlowState,
  | 'nodes'
  | 'edges'
  | 'flowName'
  | 'flowDescription'
  | 'flowMetadata'
  | 'userVariables'
  | 'userTriggerVariables'
>;

const temporalSelector = (state: FlowState): TemporalFlowState => ({
  nodes: state.nodes,
  edges: state.edges,
  flowName: state.flowName,
  flowDescription: state.flowDescription,
  flowMetadata: state.flowMetadata,
  userVariables: state.userVariables,
  userTriggerVariables: state.userTriggerVariables,
});

/**
 * React Flow's own bookkeeping — measuring a card's size, (de)selecting it —
 * isn't an edit. Tracked like one, the re-measure after every undo pushed a
 * history entry that wiped the redo stack (redo was greyed out right after ⌘Z).
 */
const BOOKKEEPING_CHANGE_TYPES = new Set(['dimensions', 'select']);

function isBookkeepingOnly(changes: readonly { type: string }[]): boolean {
  return changes.length > 0 && changes.every((change) => BOOKKEEPING_CHANGE_TYPES.has(change.type));
}

/** Applies a store update without recording undo history. */
function untracked(update: () => void): void {
  const temporal = useFlowStore.temporal.getState();
  temporal.pause();
  try {
    update();
  } finally {
    temporal.resume();
  }
}

/**
 * Validates the open flow and turns it into what Home Assistant stores: an
 * automation config, or — for a script flow (`flowMetadata.kind`) — a script
 * config. Throws a readable error when the flow can't be saved.
 */
async function buildSaveConfig(
  state: FlowState
): Promise<{ kind: 'automation' | 'script'; config: Record<string, unknown> }> {
  state.validateAllNodes();
  const errorCount = useFlowStore.getState().nodeErrors.size;
  if (errorCount > 0) {
    throw new Error(
      `Cannot save: ${errorCount} node(s) have validation errors. Fix the highlighted nodes before saving.`
    );
  }

  const graph = state.toFlowGraph();
  if (graph.nodes.length === 0) throw new Error(i18t('errors:validation.emptyAutomation'));
  if (!graph.nodes.some((n) => n.type === 'trigger')) {
    throw new Error(i18t('errors:validation.noTrigger'));
  }
  if (!graph.nodes.some((n) => n.type === 'action')) {
    throw new Error(i18t('errors:validation.noAction'));
  }

  const { FlowTranspiler, transpileScript } = await import('@flode/transpiler');
  const transpiler = new FlowTranspiler();
  const validation = transpiler.validate(graph);
  if (validation.errors.length > 0) {
    console.error('FLODE: Validation errors:', validation.errors);
    throw new Error(`Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  const naming = { alias: state.flowName, description: state.flowDescription || '' };

  if (state.flowMetadata.kind === 'script') {
    const script = transpileScript(transpiler, graph);
    if (!script.success || !script.config) {
      throw new Error(script.errors?.join(', ') || 'Failed to transpile flow to script config');
    }
    return { kind: 'script', config: { ...script.config, ...naming } };
  }

  const result = transpiler.transpile(graph);
  if (!result.success || !result.output?.automation) {
    throw new Error('Failed to transpile flow to automation config');
  }
  return {
    kind: 'automation',
    config: {
      ...naming,
      ...result.output.automation,
      variables: {
        ...(result.output.automation.variables || {}),
        _flode_metadata: {
          version: 1,
          strategy: 'native' as const,
          nodes: Object.fromEntries(
            graph.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
          ),
          graph_id: graph.id,
          graph_version: 1,
        },
      },
    },
  };
}

let pendingHistoryCommit:
  | { timeoutId: ReturnType<typeof setTimeout>; burstStart: TemporalFlowState }
  | undefined;

/**
 * Cancels an in-flight debounced history commit (see `handleSet` below)
 * without flushing it. Called from `reset()`/`fromFlowGraph()` alongside
 * `temporal.getState().clear()` — clearing the past/future arrays alone
 * isn't enough, since a burst that was still debouncing when the graph got
 * replaced would otherwise fire *after* the clear and push a snapshot of the
 * *previous* automation into the *new* one's history.
 */
function cancelPendingHistoryCommit(): void {
  if (pendingHistoryCommit) {
    clearTimeout(pendingHistoryCommit.timeoutId);
    pendingHistoryCommit = undefined;
  }
}

export const useFlowStore = create<FlowState>()(
  persist(
    temporal(
      (set, get) => ({
        ...initialState,

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),

        onNodesChange: (changes) => {
          if (isBookkeepingOnly(changes)) {
            untracked(() => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })));
            return;
          }
          set((state) => ({
            nodes: applyNodeChanges(changes, state.nodes),
            hasUnsavedChanges: true,
          }));
        },

        onEdgesChange: (changes) => {
          if (isBookkeepingOnly(changes)) {
            untracked(() => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })));
            return;
          }
          set((state) => ({
            edges: applyEdgeChanges(changes, state.edges),
            hasUnsavedChanges: true,
          }));
        },

        onConnect: (connection) =>
          set((state) => ({
            edges: addEdge(
              {
                ...connection,
                id: `e-${connection.source}-${connection.target}-${Date.now()}`,
                animated: false,
              },
              state.edges
            ),
            hasUnsavedChanges: true,
          })),

        addNode: (node) => {
          // Normalize node data (e.g., convert platform to trigger for trigger nodes)
          const normalizedNode = node.type
            ? {
                ...node,
                data: normalizeNodeData(
                  node.type,
                  node.data as Record<string, unknown>
                ) as FlowNodeData,
              }
            : node;

          set((state) => ({
            nodes: [...state.nodes, normalizedNode],
            hasUnsavedChanges: true,
          }));
          // Validate the newly added node
          get().validateNode(node.id);
        },

        addCompound: (nodes, edges) => {
          const normalizedNodes = nodes.map((node) =>
            node.type
              ? {
                  ...node,
                  data: normalizeNodeData(
                    node.type,
                    node.data as Record<string, unknown>
                  ) as FlowNodeData,
                }
              : node
          );
          set((state) => ({
            nodes: [...state.nodes, ...normalizedNodes],
            edges: [...state.edges, ...edges],
            hasUnsavedChanges: true,
          }));
          for (const node of normalizedNodes) get().validateNode(node.id);
        },

        updateNodeData: (nodeId, data) => {
          set((state) => ({
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
            ),
            hasUnsavedChanges: true,
          }));
          if ('id' in data) {
            // A rename can resolve a duplicate on one node while creating a
            // new one on another — single-node validation can't see that.
            get().validateAllNodes();
          } else {
            get().validateNode(nodeId);
          }
        },

        removeNode: (nodeId) =>
          set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
            hasUnsavedChanges: true,
          })),

        selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

        setClipboard: (data: string | null) => set({ clipboard: data }),
        setPasteCount: (count: number) => set({ pasteCount: count }),

        setFlowName: (name) => set({ flowName: name, hasUnsavedChanges: true }),
        setFlowDescription: (description) =>
          set({ flowDescription: description, hasUnsavedChanges: true }),
        setFlowMetadata: (metadata) =>
          set((state) => ({
            flowMetadata: { ...state.flowMetadata, ...metadata },
            hasUnsavedChanges: true,
          })),

        // Save actions
        setAutomationId: (id) => set({ automationId: id }),
        setSaving: (saving) => set({ isSaving: saving }),
        setSaved: () => set({ lastSaved: new Date(), hasUnsavedChanges: false }),
        setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
        hasRealChanges: () => flowHasChanges(get()),

        saveAutomation: async (hassApi: HomeAssistant) => {
          set({ isSaving: true });
          try {
            const { kind, config } = await buildSaveConfig(get());
            const api = getHomeAssistantAPI(hassApi);
            const automationId =
              kind === 'script'
                ? await api.createScript(config)
                : await api.createAutomation(config);
            set({
              automationId,
              isSaving: false,
              lastSaved: new Date(),
              hasUnsavedChanges: false,
            });
            return automationId;
          } catch (error) {
            set({ isSaving: false });
            throw error;
          }
        },

        updateAutomation: async (hassApi: HomeAssistant) => {
          const { automationId } = get();
          if (!automationId) {
            throw new Error('No automation ID set. Use saveAutomation() for new automations.');
          }
          set({ isSaving: true });
          try {
            const { kind, config } = await buildSaveConfig(get());
            const api = getHomeAssistantAPI(hassApi);
            if (kind === 'script') await api.updateScript(automationId, config);
            else await api.updateAutomation(automationId, config);
            set({
              isSaving: false,
              lastSaved: new Date(),
              hasUnsavedChanges: false,
            });
          } catch (error) {
            set({ isSaving: false });
            throw error;
          }
        },

        startSimulation: () => set({ isSimulating: true, executionPath: [], activeNodeId: null }),
        stopSimulation: () => set({ isSimulating: false, activeNodeId: null }),
        setActiveNode: (nodeId) => set({ activeNodeId: nodeId }),
        addToExecutionPath: (nodeId) =>
          set((state) => ({
            executionPath: [...state.executionPath, nodeId],
          })),
        clearExecutionPath: () => set({ executionPath: [] }),

        showTrace: async (traceData) => {
          const traceExecutionPath: string[] = [];
          const traceTimestamps: Record<string, string> = {};
          const traceNodeErrors: Record<string, string> = {};
          let traceUnmappedStepCount = 0;

          if (traceData?.trace) {
            const state = get();
            // Follows the graph like the native transpiler lays out the YAML
            // (HA counts delay/wait/action/inline-if together as `action/N`).
            const resolveNodeId = createTracePathResolver(state.nodes, state.edges);

            const sortedSteps = Object.entries(traceData.trace)
              .flatMap(([path, steps]) =>
                Array.isArray(steps) ? steps.map((step) => ({ ...step, path })) : []
              )
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            for (const step of sortedSteps) {
              const nodeId = resolveNodeId(step.path);
              if (!nodeId) {
                traceUnmappedStepCount++;
                logger.debug(`[trace] No matching node for step path: ${step.path}`);
                continue;
              }

              if (!traceExecutionPath.includes(nodeId)) {
                traceExecutionPath.push(nodeId);
                traceTimestamps[nodeId] = step.timestamp;
              }

              const stepError =
                step.error ?? (step.result?.error ? 'Stopped with error' : undefined);
              if (stepError) {
                traceNodeErrors[nodeId] = stepError;
              }
            }
          }

          const traceSkippedNodeIds = get()
            .nodes.map((n) => n.id)
            .filter((id) => !traceExecutionPath.includes(id));

          set({
            isShowingTrace: true,
            traceData,
            traceExecutionPath,
            traceTimestamps,
            traceNodeErrors,
            traceSkippedNodeIds,
            traceUnmappedStepCount,
            activeNodeId: null,
          });
        },
        hideTrace: () =>
          set({
            isShowingTrace: false,
            traceData: null,
            traceExecutionPath: [],
            traceTimestamps: {},
            traceNodeErrors: {},
            traceSkippedNodeIds: [],
            traceUnmappedStepCount: 0,
            activeNodeId: null,
          }),
        clearTraceExecutionPath: () =>
          set({
            traceExecutionPath: [],
            traceTimestamps: {},
            traceNodeErrors: {},
            traceSkippedNodeIds: [],
          }),

        setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
        getExecutionStepNumber: (nodeId) => {
          const state = get();
          // Check simulation execution path first
          if (state.isSimulating && state.executionPath.length > 0) {
            const stepIndex = state.executionPath.indexOf(nodeId);
            return stepIndex >= 0 ? stepIndex + 1 : null;
          }
          // Check trace execution path
          if (state.isShowingTrace && state.traceExecutionPath.length > 0) {
            const stepIndex = state.traceExecutionPath.indexOf(nodeId);
            return stepIndex >= 0 ? stepIndex + 1 : null;
          }
          return null;
        },

        canDeleteEdge: (edgeId: string) => {
          // Visual-only and structural edges are not deletable by the user
          if (
            edgeId.startsWith('hint-') ||
            edgeId.startsWith('choose-chain-') ||
            edgeId.startsWith('choose-hint-')
          )
            return false;
          const state = get();
          const edge = state.edges.find((e) => e.id === edgeId);
          if (
            edge?.type === 'hint' ||
            edge?.type === 'choose-chain' ||
            edge?.type === 'choose-hint' ||
            edge?.type === 'choose-default' ||
            edge?.type === 'choose-entry' ||
            edge?.type === 'loop-back'
          )
            return false;
          return true;
        },

        toFlowGraph: (): FlowGraph => {
          const state = get();
          const nodeIds = new Set(state.nodes.map((n) => n.id));

          return {
            id: state.flowId,
            name: state.flowName,
            description: state.flowDescription || undefined,
            nodes: state.nodes.map((n) => {
              // Ensure node has all required fields
              const nodeData = { ...n.data };

              // Add missing required fields for different node types
              if (n.type === 'trigger' && !nodeData.trigger) {
                console.warn(
                  `FLODE: Trigger node ${n.id} missing trigger type, adding default 'state'`
                );
                nodeData.trigger = 'state';
              }

              if (
                n.type === 'action' &&
                !nodeData.service &&
                !nodeData.repeat &&
                !nodeData.event &&
                !('stop' in nodeData) &&
                !getRawStep(nodeData)
              ) {
                console.warn(
                  `FLODE: Action node ${n.id} missing service, adding default 'light.turn_on'`
                );
                nodeData.service = 'light.turn_on';
              }

              return {
                id: n.id,
                type: n.type as FlowNode['type'],
                position: n.position,
                data: nodeData as FlowNode['data'],
              };
            }) as FlowNode[],
            // Filter out orphaned edges that reference deleted nodes
            edges: state.edges
              .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
              .map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
                label: typeof e.label === 'string' ? e.label : undefined,
                type: e.type as string | undefined,
              })) as FlowEdge[],
            metadata: state.flowMetadata,
            version: 1,
            userVariables: state.userVariables,
            userTriggerVariables: state.userTriggerVariables,
          };
        },

        fromFlowGraph: (graph) => {
          const nodes = graph.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            // Normalize node data when loading (e.g., convert platform to trigger)
            data: normalizeNodeData(n.type, n.data as Record<string, unknown>) as FlowNodeData,
          }));
          const edges = graph.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: e.label,
            type: e.type,
          }));
          const importedMetadata: FlowMetadata = {
            ...defaultFlowMetadata,
            ...graph.metadata,
          };
          // Create snapshot for comparison
          const originalSnapshot = flowContentKey({
            flowName: graph.name,
            flowDescription: graph.description || '',
            flowMetadata: importedMetadata,
            nodes,
            edges,
          });
          set({
            flowId: graph.id,
            flowName: graph.name,
            flowDescription: graph.description || '',
            flowMetadata: importedMetadata,
            userVariables: graph.userVariables,
            userTriggerVariables: graph.userTriggerVariables,
            nodes,
            edges,
            selectedNodeId: null,
            // Reset save state when importing
            automationId: null,
            hasUnsavedChanges: false,
            lastSaved: null,
            originalSnapshot,
            nodeErrors: new Map(),
          });
          // Validate all nodes after loading
          get().validateAllNodes();
          // A freshly loaded automation shouldn't offer undo back into
          // whatever was open before it.
          cancelPendingHistoryCommit();
          useFlowStore.temporal.getState().clear();
        },

        reset: () => {
          set({
            ...initialState,
            flowId: generateUUID(),
            flowMetadata: { ...defaultFlowMetadata },
            originalSnapshot: null,
            nodeErrors: new Map(),
          });
          cancelPendingHistoryCommit();
          useFlowStore.temporal.getState().clear();
        },

        // Node validation
        validateNode: (nodeId) => {
          const state = get();
          const node = state.nodes.find((n) => n.id === nodeId);
          if (!node || !node.type) return;

          const errors = validateNodeData(node.type, node.data as Record<string, unknown>);

          set((s) => {
            const newErrors = new Map(s.nodeErrors);
            if (errors.length > 0) {
              newErrors.set(nodeId, errors);
            } else {
              newErrors.delete(nodeId);
            }
            return { nodeErrors: newErrors };
          });
        },

        validateAllNodes: () => {
          const state = get();
          const newErrors = new Map<string, NodeValidationError[]>();

          for (const node of state.nodes) {
            if (!node.type) continue;
            const errors = validateNodeData(node.type, node.data as Record<string, unknown>);
            if (errors.length > 0) {
              newErrors.set(node.id, errors);
            }
          }

          const duplicateIdErrors = findDuplicateIdErrors(state.nodes);
          for (const [nodeId, error] of duplicateIdErrors) {
            newErrors.set(nodeId, [...(newErrors.get(nodeId) ?? []), error]);
          }

          set({ nodeErrors: newErrors });
        },

        clearNodeErrors: (nodeId) => {
          set((s) => {
            const newErrors = new Map(s.nodeErrors);
            newErrors.delete(nodeId);
            return { nodeErrors: newErrors };
          });
        },

        hasValidationErrors: () => {
          return get().nodeErrors.size > 0;
        },
      }),
      {
        partialize: temporalSelector,
        limit: 100,
        // Without this, zundo pushes a history entry on *every* set() call
        // regardless of whether the tracked (partialized) fields actually
        // changed — so UI-only actions like selectNode/setClipboard, which
        // never touch nodes/edges/flowName/etc., would still create no-op
        // undo steps. Shallow-compares the partialized fields; nodes/edges
        // get new array references on every real structural change, so this
        // only skips truly no-op sets.
        equality: shallow,
        // Coalesces bursts of rapid changes (every pointer-move frame of a
        // node drag, a run of keystrokes, an add-then-immediately-edit) into
        // ONE history entry spanning the whole burst, not just its last
        // step. A plain trailing-edge debounce would only keep the *last*
        // call's `pastState` — the state just before that final call —
        // silently discarding the earlier steps' undo information, so
        // undoing would only jump back one micro-step instead of to before
        // the burst started. This remembers the *first* call's `pastState`
        // for the duration of the burst and only actually commits 300ms
        // after it goes quiet. Only the trigger for committing a snapshot is
        // delayed; the live store state itself updates immediately.
        handleSet: (handleSet) => (pastStateArg: FlowState | ((state: FlowState) => FlowState)) => {
          // zundo's own .d.ts mistypes this parameter as `FlowState |
          // ((state: FlowState) => FlowState)` — an artifact of `Parameters<>`
          // only resolving the *last* overload of zustand's own overloaded
          // `setState`. Verified against zundo/dist/index.js's
          // `temporalHandleSet`: at runtime this is always
          // `options.partialize(get())`, i.e. our own `temporalSelector`
          // output — a genuine `TemporalFlowState`.
          const pastState = pastStateArg as unknown as TemporalFlowState;
          const burstStart = pendingHistoryCommit?.burstStart ?? pastState;
          cancelPendingHistoryCommit();
          const timeoutId = setTimeout(() => {
            pendingHistoryCommit = undefined;
            handleSet(burstStart);
          }, 300);
          pendingHistoryCommit = { timeoutId, burstStart };
        },
      }
    ),
    {
      name: 'flode-flow-storage',
      storage: flodeIndexedDBStorage,
      partialize: persistSelector,
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Normalize node data after rehydration (e.g., convert platform to trigger)
          const normalizedNodes = state.nodes.map((n) => ({
            ...n,
            data: n.type
              ? (normalizeNodeData(n.type, n.data as Record<string, unknown>) as FlowNodeData)
              : n.data,
          }));

          // Update nodes if any were normalized
          const hasChanges = normalizedNodes.some(
            (n, i) => JSON.stringify(n.data) !== JSON.stringify(state.nodes[i].data)
          );
          if (hasChanges) {
            state.nodes = normalizedNodes;
          }

          // Validate all nodes after normalization
          state.validateAllNodes();
        }
      },
    }
  )
);

/** Everything needed to put a flow back into the editor later (one editor tab). */
export type FlowSnapshot = PersistedFlowState &
  Pick<FlowState, 'userVariables' | 'userTriggerVariables'>;

/** The flow currently in the editor, for parking it in a background tab. */
export function captureFlowSnapshot(): FlowSnapshot {
  const state = useFlowStore.getState();
  return {
    ...persistSelector(state),
    userVariables: state.userVariables,
    userTriggerVariables: state.userTriggerVariables,
  };
}

/** Undo/redo stacks, kept per tab for the session. */
export interface FlowHistory {
  pastStates: Partial<TemporalFlowState>[];
  futureStates: Partial<TemporalFlowState>[];
}

export function captureFlowHistory(): FlowHistory {
  const { pastStates, futureStates } = useFlowStore.temporal.getState();
  return { pastStates, futureStates };
}

/**
 * Puts a parked flow back into the editor: simulation/trace/selection state is
 * cleared, validation re-run, and its own undo history (if any) restored.
 */
export function restoreFlowSnapshot(snapshot: FlowSnapshot, history?: FlowHistory): void {
  useFlowStore.setState({
    ...initialState,
    ...snapshot,
    selectedNodeId: null,
    nodeErrors: new Map(),
  });
  useFlowStore.getState().validateAllNodes();
  // The setState above queued a debounced history entry holding the flow that
  // was open *before* (see `handleSet`) — drop it, or undo in this tab would
  // bring back the other tab's content.
  cancelPendingHistoryCommit();
  useFlowStore.temporal.setState({
    pastStates: history?.pastStates ?? [],
    futureStates: history?.futureStates ?? [],
  });
}

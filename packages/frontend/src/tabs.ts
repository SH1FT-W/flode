import { type FlowGraph, FlowGraphSchema, isPlainObject } from '@flode/shared';
import type { Viewport } from '@xyflow/system';
import type { AutomationListItem, RegistryEntry, RegistryUpdate } from './ha';

export type SaveState = 'saved' | 'unsaved' | 'saving';

export interface EditorTab {
  id: string;
  flow: OpenFlow;
  past: FlowGraph[];
  future: FlowGraph[];
  saveState: SaveState;
  selectedId: string | null;
  viewport?: Viewport;
  /** Restored after a reload without changes — reloaded from HA when shown. */
  stale?: boolean;
}

export interface OpenFlow {
  item: AutomationListItem;
  /** `graph.name` / `graph.description` are the alias and description (undoable like any edit). */
  graph: FlowGraph;
  /** Not in HA yet — the first save asks for a name (like HA's own editor). */
  isNew: boolean;
  registryEntry: RegistryEntry | null;
  /** Area / category / labels from HA's rename dialog, applied after saving. */
  registryUpdate?: RegistryUpdate;
  /** What the transpiler couldn't read when the flow was opened (shown until dismissed). */
  importWarnings?: string[];
}

// ---- remembered tabs (survive a page reload) ---------------------

/** FLODE 3's own key — FLODE 2 kept its tabs in IndexedDB, the two never touch. */
const STORAGE_KEY = 'flode3.tabs';

export interface StoredTabs {
  tabs: EditorTab[];
  activeTabId: string | null;
  showHome: boolean;
}

interface StoredTab {
  id: string;
  flow: OpenFlow;
  saveState: SaveState;
  viewport?: Viewport;
}

/** Undo history is not kept across a reload. */
export function writeTabs(state: StoredTabs): void {
  const stored = {
    activeTabId: state.activeTabId,
    showHome: state.showHome,
    tabs: state.tabs.map(
      (tab): StoredTab => ({
        id: tab.id,
        flow: tab.flow,
        saveState: tab.saveState === 'saving' ? 'unsaved' : tab.saveState,
        viewport: tab.viewport,
      })
    ),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked or full — tabs just aren't remembered.
  }
}

function isViewport(value: unknown): value is Viewport {
  return (
    isPlainObject(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.zoom === 'number'
  );
}

function isItem(value: unknown): value is AutomationListItem {
  return (
    isPlainObject(value) &&
    typeof value.entityId === 'string' &&
    typeof value.configId === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'automation' || value.kind === 'script')
  );
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  return isPlainObject(value) && typeof value.entity_id === 'string';
}

function isRegistryUpdate(value: unknown): value is RegistryUpdate {
  const optionalId = (v: unknown) => v === undefined || v === null || typeof v === 'string';
  return (
    isPlainObject(value) &&
    optionalId(value.area) &&
    optionalId(value.category) &&
    (value.labels === undefined ||
      (Array.isArray(value.labels) && value.labels.every((l) => typeof l === 'string')))
  );
}

function restoreTab(value: unknown): EditorTab | null {
  if (!isPlainObject(value) || typeof value.id !== 'string') return null;
  const flow = value.flow;
  if (!isPlainObject(flow) || !isPlainObject(flow.item)) return null;
  // Tabs remembered before scripts existed have no `kind`.
  const item: unknown = { kind: 'automation', ...flow.item };
  if (!isItem(item)) return null;
  const graph = FlowGraphSchema.safeParse(flow.graph);
  if (!graph.success) return null;
  const saveState: SaveState = value.saveState === 'saved' ? 'saved' : 'unsaved';
  const restoredGraph: FlowGraph = graph.data;
  return {
    id: value.id,
    flow: {
      item,
      graph: restoredGraph,
      isNew: flow.isNew === true,
      registryEntry: isRegistryEntry(flow.registryEntry) ? flow.registryEntry : null,
      registryUpdate: isRegistryUpdate(flow.registryUpdate) ? flow.registryUpdate : undefined,
    },
    past: [],
    future: [],
    saveState,
    selectedId: null,
    viewport: isViewport(value.viewport) ? value.viewport : undefined,
    stale: saveState === 'saved',
  };
}

export function readTabs(): StoredTabs | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.map(restoreTab).filter((tab): tab is EditorTab => tab !== null);
    const activeTabId =
      typeof parsed.activeTabId === 'string' && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : (tabs[0]?.id ?? null);
    return { tabs, activeTabId, showHome: parsed.showHome !== false || tabs.length === 0 };
  } catch {
    return null;
  }
}

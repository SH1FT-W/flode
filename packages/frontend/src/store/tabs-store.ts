import type { Viewport } from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateUUID } from '@/lib/utils';
import { IndexedDBStorage } from '@/utils/indexeddb-storage';
import {
  captureFlowHistory,
  captureFlowSnapshot,
  type FlowHistory,
  type FlowSnapshot,
  restoreFlowSnapshot,
  useFlowStore,
} from './flow-store';

/**
 * One open editor tab. The active tab's flow lives in `flow-store` (so the
 * editor itself is unchanged); background tabs keep a parked `snapshot`.
 */
export interface EditorTab {
  id: string;
  snapshot?: FlowSnapshot;
  viewport?: Viewport;
}

interface TabsState {
  tabs: EditorTab[];
  activeTabId: string | null;
  /** The editor (not the start screen) was showing — FLODE returns there after a reload. */
  editorOpen: boolean;
}

/** Undo stacks per tab — session only (they reference live objects, not worth persisting). */
const histories = new Map<string, FlowHistory>();

/** Same IndexedDB database as the flow store, under its own key. */
const tabsStorage = IndexedDBStorage.createJSONStorage<TabsState>(
  'flode-flow-storage',
  'flow-store'
);

export const useTabsStore = create<TabsState>()(
  persist((): TabsState => ({ tabs: [], activeTabId: null, editorOpen: false }), {
    name: 'flode-editor-tabs',
    storage: tabsStorage,
    version: 1,
  })
);

/** A tab that holds nothing yet — reused instead of opening another one. */
function activeTabIsBlank(): boolean {
  const flow = useFlowStore.getState();
  return flow.nodes.length === 0 && !flow.automationId;
}

/** Makes sure the flow currently in the editor has a tab (first use, or after a reload). */
export function ensureActiveTab(): string {
  const { tabs, activeTabId } = useTabsStore.getState();
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) return activeTabId;
  const id = generateUUID();
  useTabsStore.setState({ tabs: [...tabs, { id }], activeTabId: id });
  return id;
}

/** Parks the editor's flow in its tab (snapshot, viewport, undo history). */
function parkActiveTab(viewport: Viewport | undefined): void {
  const activeId = ensureActiveTab();
  histories.set(activeId, captureFlowHistory());
  const snapshot = captureFlowSnapshot();
  useTabsStore.setState((state) => ({
    tabs: state.tabs.map((tab) => (tab.id === activeId ? { ...tab, snapshot, viewport } : tab)),
  }));
}

/**
 * Opens a fresh tab and runs `load` in it (reset editor, then load/import).
 * An empty active tab is reused instead.
 */
export async function openInNewTab(
  load: () => unknown,
  viewport: Viewport | undefined
): Promise<void> {
  if (!activeTabIsBlank()) {
    parkActiveTab(viewport);
    const id = generateUUID();
    useTabsStore.setState((state) => ({ tabs: [...state.tabs, { id }], activeTabId: id }));
  } else {
    ensureActiveTab();
  }
  useFlowStore.getState().reset();
  await load();
}

/** Switches to `tabId`; returns the viewport to restore for it, if any. */
export function switchTab(tabId: string, viewport: Viewport | undefined): Viewport | undefined {
  const { tabs, activeTabId } = useTabsStore.getState();
  const target = tabs.find((tab) => tab.id === tabId);
  if (!target || tabId === activeTabId) return undefined;
  parkActiveTab(viewport);
  if (target.snapshot) restoreFlowSnapshot(target.snapshot, histories.get(tabId));
  useTabsStore.setState((state) => ({
    activeTabId: tabId,
    tabs: state.tabs.map((tab) => (tab.id === tabId ? { id: tab.id } : tab)),
  }));
  return target.viewport;
}

/**
 * Closes a tab (no confirmation — callers ask first when it has changes).
 * Closing the active tab activates a neighbour; returns its viewport, or
 * `null` when no tab is left.
 */
export function closeTab(tabId: string): Viewport | undefined | null {
  const { tabs, activeTabId } = useTabsStore.getState();
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return undefined;
  histories.delete(tabId);
  const remaining = tabs.filter((tab) => tab.id !== tabId);

  if (tabId !== activeTabId) {
    useTabsStore.setState({ tabs: remaining });
    return undefined;
  }
  const next = remaining[Math.min(index, remaining.length - 1)];
  if (!next) {
    useTabsStore.setState({ tabs: [], activeTabId: null });
    useFlowStore.getState().reset();
    return null;
  }
  if (next.snapshot) restoreFlowSnapshot(next.snapshot, histories.get(next.id));
  useTabsStore.setState({
    activeTabId: next.id,
    tabs: remaining.map((tab) => (tab.id === next.id ? { id: tab.id } : tab)),
  });
  return next.viewport;
}

type FlowKind = 'automation' | 'script';

/** The tab that already has automation/script `configId` open, if any. */
export function findTabByAutomation(
  configId: string,
  kind: FlowKind = 'automation'
): string | undefined {
  const { tabs, activeTabId } = useTabsStore.getState();
  const matches = (flow: Pick<FlowSnapshot, 'automationId' | 'flowMetadata'>) =>
    flow.automationId === configId && (flow.flowMetadata.kind ?? 'automation') === kind;
  if (activeTabId && matches(useFlowStore.getState())) return activeTabId;
  return tabs.find((tab) => tab.snapshot && matches(tab.snapshot))?.id;
}

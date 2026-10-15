import { type FlowGraph, FlowGraphSchema, isPlainObject } from '@flode/shared';
import { randomId } from '@flode/ui-core';
import type { Viewport } from '@xyflow/system';
import type { AutomationListItem, RegistryEntry, RegistryUpdate } from './ha';
import type { SaveProblem } from './save-errors';
import type { StringKey } from './strings';

export type SaveState = 'saved' | 'unsaved' | 'saving';

/** Title + intro text of the warnings banner above a flow. */
export interface ImportWarningsHeading {
  title: StringKey;
  text: StringKey;
}

export interface EditorTab {
  id: string;
  flow: OpenFlow;
  past: FlowGraph[];
  future: FlowGraph[];
  saveState: SaveState;
  selectedId: string | null;
  viewport?: Viewport;
  /** The tab's error bar (a failed save …) — each tab keeps its own. */
  message?: string | null;
  /** Why its last save failed, with the card it concerns. */
  saveProblem?: SaveProblem | null;
}

export interface OpenFlow {
  item: AutomationListItem;
  /** `graph.name` / `graph.description` are the alias and description (undoable like any edit). */
  graph: FlowGraph;
  /** Not in HA yet — the first save asks for a name (like HA's own editor). */
  isNew: boolean;
  /**
   * Made from this blueprint: shown read-only — the blueprint's steps with
   * the flow's inputs filled in — and never saved.
   */
  blueprint?: string;
  registryEntry: RegistryEntry | null;
  /** Area / category / labels from HA's rename dialog, applied after saving. */
  registryUpdate?: RegistryUpdate;
  /** What the transpiler couldn't read when the flow was opened (shown until dismissed). */
  importWarnings?: string[];
  /** Heading + intro of that banner when it isn't about unread parts (merging). */
  importWarningsHeading?: ImportWarningsHeading;
  /**
   * `configFingerprint` of HA's config when the flow was opened or last saved —
   * a different one in HA means the flow was changed there meanwhile.
   */
  haVersion?: string;
  /**
   * The graph as HA has it (opened, saved or reloaded) — undoing back to it
   * makes the tab saved again. Not remembered across a reload.
   */
  savedGraph?: FlowGraph;
}

/** A save that went through: the graph it wrote and the entity HA has for it. */
export interface SaveResult {
  graph: FlowGraph;
  saved: {
    configId: string;
    entityId: string;
    registryEntry: RegistryEntry | null;
    /** Fingerprint of the config HA stored (see `OpenFlow.haVersion`). */
    haVersion?: string;
  };
}

/**
 * A tab's flow and state once its save finished (`null` = it failed). Edits
 * made while saving are newer than what HA got, so they stay unsaved.
 */
export function settleSave(
  flow: OpenFlow,
  result: SaveResult | null
): { flow: OpenFlow; saveState: SaveState } {
  if (!result) return { flow, saveState: 'unsaved' };
  const { configId, entityId, registryEntry, haVersion } = result.saved;
  const settled: OpenFlow =
    flow.item.configId === configId
      ? {
          ...flow,
          isNew: false,
          item: { ...flow.item, entityId },
          registryEntry,
          registryUpdate: undefined,
          // Unknown when HA's stored config couldn't be read back — no check then.
          haVersion,
          savedGraph: result.graph,
        }
      : flow;
  return { flow: settled, saveState: flow.graph === result.graph ? 'saved' : 'unsaved' };
}

// ---- undo history ----------------------------------------------------------

/** Whether `flow` showing `graph` (after an undo/redo step) is what HA has. */
export function historySaveState(flow: OpenFlow, graph: FlowGraph): SaveState {
  return !flow.isNew && !flow.registryUpdate && flow.savedGraph === graph ? 'saved' : 'unsaved';
}

/** Edits of the same card closer together than this are one undo step (typing in HA's form). */
export const HISTORY_COALESCE_MS = 1000;

/** The last edit that went into the undo history: what it changed and when. */
export interface HistoryMark {
  key: string;
  at: number;
}

/** Whether an edit of `key` at `now` continues the last undo step instead of starting one. */
export function continuesStep(
  last: HistoryMark | null,
  key: string | undefined,
  now: number
): boolean {
  return (
    key !== undefined && last !== null && last.key === key && now - last.at < HISTORY_COALESCE_MS
  );
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
  /** The browser window that wrote this entry (`WINDOW_ID`). */
  writer: string;
}

/** This browser window — tells its own stored entries from another window's. */
const WINDOW_ID = randomId();

/** The stored tab entries as they are (unparsed) — `[]` when there are none. */
function storedEntries(): unknown[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPlainObject(parsed) && Array.isArray(parsed.tabs) ? parsed.tabs : [];
  } catch {
    return [];
  }
}

/** An unsaved draft another browser window wrote. */
function isOthersDraft(entry: unknown): boolean {
  return isPlainObject(entry) && entry.saveState !== 'saved' && entry.writer !== WINDOW_ID;
}

/** A stored draft another browser window wrote (a tab this window never had). */
function isForeignDraft(entry: unknown, known: ReadonlySet<string>): boolean {
  return (
    isPlainObject(entry) &&
    typeof entry.id === 'string' &&
    !known.has(entry.id) &&
    entry.saveState !== 'saved'
  );
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Remembers the tabs (undo history is not kept across a reload). Every
 * browser window shares the storage: unsaved drafts another window wrote —
 * tabs this window never had (`known`) — are kept, not overwritten. Resolves
 * `false` when the storage is full (the tabs aren't remembered then).
 */
export function writeTabs(state: StoredTabs, known: ReadonlySet<string>): boolean {
  const own = state.tabs.map(
    (tab): StoredTab => ({
      id: tab.id,
      flow: { ...tab.flow, savedGraph: undefined },
      saveState: tab.saveState === 'saving' ? 'unsaved' : tab.saveState,
      viewport: tab.viewport,
      writer: WINDOW_ID,
    })
  );
  const entries = storedEntries();
  // A tab both windows have: another window's unsaved draft beats this window's
  // untouched copy of it (this window's own edits are 'unsaved' and win).
  const merged = own.map((tab): unknown => {
    if (tab.saveState !== 'saved') return tab;
    const theirs = entries.find((entry) => isPlainObject(entry) && entry.id === tab.id);
    return isOthersDraft(theirs) ? theirs : tab;
  });
  const mine = new Set([...known, ...own.map((tab) => tab.id)]);
  const foreign = entries.filter((entry) => isForeignDraft(entry, mine));
  const stored = {
    activeTabId: state.activeTabId,
    showHome: state.showHome,
    tabs: [...merged, ...foreign],
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch (error) {
    // Blocked storage (private mode …) just doesn't remember; a full one is worth a word.
    return !isQuotaError(error);
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
      ...(typeof flow.haVersion === 'string' ? { haVersion: flow.haVersion } : {}),
      ...(saveState === 'saved' ? { savedGraph: restoredGraph } : {}),
    },
    past: [],
    future: [],
    saveState,
    selectedId: null,
    viewport: isViewport(value.viewport) ? value.viewport : undefined,
  };
}

/** The automation/script a tab shows — two windows may have left a tab for the same one. */
function flowKey(tab: EditorTab): string | null {
  return tab.flow.isNew ? null : `${tab.flow.item.kind}:${tab.flow.item.configId}`;
}

/** One tab per automation/script: an unsaved draft beats a saved copy, else the first. */
function withoutDuplicates(tabs: EditorTab[]): EditorTab[] {
  const keep = new Map<string, EditorTab>();
  for (const tab of tabs) {
    const key = flowKey(tab);
    const kept = key === null ? undefined : keep.get(key);
    if (key !== null && (!kept || (kept.saveState === 'saved' && tab.saveState !== 'saved')))
      keep.set(key, tab);
  }
  return tabs.filter((tab) => {
    const key = flowKey(tab);
    return key === null || keep.get(key) === tab;
  });
}

export function readTabs(): StoredTabs | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !Array.isArray(parsed.tabs)) return null;
    const tabs = withoutDuplicates(
      parsed.tabs.map(restoreTab).filter((tab): tab is EditorTab => tab !== null)
    );
    const activeTabId =
      typeof parsed.activeTabId === 'string' && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : (tabs[0]?.id ?? null);
    return { tabs, activeTabId, showHome: parsed.showHome !== false || tabs.length === 0 };
  } catch {
    return null;
  }
}

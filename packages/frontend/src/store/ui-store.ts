import { create } from 'zustand';
import type { RunScriptTarget } from '@/hooks/useRunScript';
import type { AiFlowKind } from '@/lib/ai-assist';
import { useFlowStore } from './flow-store';

export type AppView = 'home' | 'editor';
export type HomeSection = 'automations' | 'scripts';
/** `replace`: the flow gets replaced (import, clear …); `closeTab`: its tab closes. */
export type DiscardReason = 'replace' | 'closeTab';
export type InspectorTab = 'properties' | 'yaml' | 'simulator';

/** App-level dialogs/overlays — only one is open at a time. */
export type AppDialog =
  | 'palette'
  | 'shortcuts'
  | 'save'
  | 'importYaml'
  | 'openAutomation'
  | 'settings'
  | 'clear'
  | 'exit'
  | 'discard'
  | 'aiFlow'
  | 'aiExplain'
  | 'runFrom'
  | 'runScript';

const LIBRARY_COLLAPSED_KEY = 'flode.libraryCollapsed';
const MINIMAP_VISIBLE_KEY = 'flode.minimapVisible';
const AI_HINT_DISMISSED_KEY = 'flode.aiHintDismissed';

/** Per-browser UI preference; storage may be unavailable (private mode), then defaults apply. */
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage unavailable — the toggle still works for this session.
  }
}

interface UiState {
  view: AppView;
  setView: (view: AppView) => void;

  /** Start screen list: automations or scripts. */
  homeSection: HomeSection;
  setHomeSection: (section: HomeSection) => void;

  dialog: AppDialog | null;
  openDialog: (dialog: AppDialog) => void;
  closeDialog: () => void;

  libraryCollapsed: boolean;
  toggleLibrary: () => void;

  minimapVisible: boolean;
  toggleMinimap: () => void;

  /** The start screen's "set up AI" hint was closed for good. */
  aiHintDismissed: boolean;
  dismissAiHint: () => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  /** Show the automation's last real run once it has loaded (set when opening from the start screen). */
  showLastRunOnOpen: boolean;
  setShowLastRunOnOpen: (show: boolean) => void;

  /** Script the run dialog asks input fields for (`runScript`). */
  runScriptTarget: RunScriptTarget | null;
  openRunScript: (target: RunScriptTarget) => void;

  /** Node the "run from here" confirmation is about (`runFrom`). */
  runFromNodeId: string | null;
  openRunFrom: (nodeId: string) => void;

  /** What "Create with AI" builds (`aiFlow`). */
  aiFlowKind: AiFlowKind;
  /**
   * Opens "Create with AI" — for `kind`, or what fits where the user is: a
   * script in the scripts section or a script editor, else an automation.
   */
  openAiFlow: (kind?: AiFlowKind) => void;

  /** Run the AI explain dialog is about (`aiExplain`). */
  explainRunId: string | null;
  openExplain: (runId: string) => void;

  /** Action waiting for the user to confirm discarding unsaved changes. */
  pendingDiscard: (() => void) | null;
  /** What the pending discard is for — picks the confirmation text. */
  discardReason: DiscardReason;
  /** Asks "discard unsaved changes?" and runs `action` on confirm. */
  askDiscard: (action: () => void, reason?: DiscardReason) => void;
  /** Runs `action` right away, or first asks to discard unsaved changes. */
  runGuarded: (action: () => void) => void;
  confirmDiscard: () => void;
}

/**
 * UI-only state (which screen, which dialog, panel layout) — kept apart from
 * `flow-store`, which holds the automation itself and is undo/redo-tracked.
 */
export const useUiStore = create<UiState>((set, get) => ({
  view: 'home',
  setView: (view) => set({ view }),

  homeSection: 'automations',
  setHomeSection: (homeSection) => set({ homeSection }),

  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null, pendingDiscard: null }),

  libraryCollapsed: readFlag(LIBRARY_COLLAPSED_KEY, false),
  toggleLibrary: () => {
    const next = !get().libraryCollapsed;
    writeFlag(LIBRARY_COLLAPSED_KEY, next);
    set({ libraryCollapsed: next });
  },

  // Off by default: the canvas stays calm; switch it on from the dock or ⌘K.
  minimapVisible: readFlag(MINIMAP_VISIBLE_KEY, false),
  toggleMinimap: () => {
    const next = !get().minimapVisible;
    writeFlag(MINIMAP_VISIBLE_KEY, next);
    set({ minimapVisible: next });
  },

  aiHintDismissed: readFlag(AI_HINT_DISMISSED_KEY, false),
  dismissAiHint: () => {
    writeFlag(AI_HINT_DISMISSED_KEY, true);
    set({ aiHintDismissed: true });
  },

  inspectorTab: 'properties',
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  showLastRunOnOpen: false,
  setShowLastRunOnOpen: (showLastRunOnOpen) => set({ showLastRunOnOpen }),

  runScriptTarget: null,
  openRunScript: (runScriptTarget) => set({ runScriptTarget, dialog: 'runScript' }),

  runFromNodeId: null,
  openRunFrom: (runFromNodeId) => set({ runFromNodeId, dialog: 'runFrom' }),

  aiFlowKind: 'automation',
  openAiFlow: (kind) => {
    const { view, homeSection } = get();
    const fitting: AiFlowKind =
      view === 'home'
        ? homeSection === 'scripts'
          ? 'script'
          : 'automation'
        : (useFlowStore.getState().flowMetadata.kind ?? 'automation');
    set({ aiFlowKind: kind ?? fitting, dialog: 'aiFlow' });
  },

  explainRunId: null,
  openExplain: (explainRunId) => set({ explainRunId, dialog: 'aiExplain' }),

  pendingDiscard: null,
  discardReason: 'replace',
  askDiscard: (action, reason = 'replace') =>
    set({ pendingDiscard: action, discardReason: reason, dialog: 'discard' }),
  runGuarded: (action) => {
    if (useFlowStore.getState().hasRealChanges()) {
      get().askDiscard(action);
      return;
    }
    action();
  },
  confirmDiscard: () => {
    const action = get().pendingDiscard;
    set({ pendingDiscard: null, dialog: null });
    action?.();
  },
}));

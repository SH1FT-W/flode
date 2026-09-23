import { create } from 'zustand';
import { useFlowStore } from './flow-store';

export type AppView = 'home' | 'editor';
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
  | 'discard';

const LIBRARY_COLLAPSED_KEY = 'flode.libraryCollapsed';
const MINIMAP_VISIBLE_KEY = 'flode.minimapVisible';

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

  dialog: AppDialog | null;
  openDialog: (dialog: AppDialog) => void;
  closeDialog: () => void;

  libraryCollapsed: boolean;
  toggleLibrary: () => void;

  minimapVisible: boolean;
  toggleMinimap: () => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  /** Show the automation's last real run once it has loaded (set when opening from the start screen). */
  showLastRunOnOpen: boolean;
  setShowLastRunOnOpen: (show: boolean) => void;

  /** Action waiting for the user to confirm discarding unsaved changes. */
  pendingDiscard: (() => void) | null;
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

  inspectorTab: 'properties',
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  showLastRunOnOpen: false,
  setShowLastRunOnOpen: (showLastRunOnOpen) => set({ showLastRunOnOpen }),

  pendingDiscard: null,
  runGuarded: (action) => {
    if (useFlowStore.getState().hasRealChanges()) {
      set({ pendingDiscard: action, dialog: 'discard' });
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

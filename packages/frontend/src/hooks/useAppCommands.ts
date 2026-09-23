import { useReactFlow } from '@xyflow/react';
import {
  Eraser,
  FileCode,
  FileDown,
  FileUp,
  FolderOpen,
  House,
  Keyboard,
  Map as MapIcon,
  Maximize,
  Moon,
  PanelLeft,
  Plus,
  Save,
  SaveAll,
  Search,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeOverride } from '@/contexts/ThemeOverrideContext';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useQuickSave } from '@/hooks/useQuickSave';
import { exportFlowJson, importFlowJson } from '@/lib/flow-file';
import { showErrorToast } from '@/lib/haToast';
import type { ShortcutSpec } from '@/lib/shortcuts';
import { fitViewOptions } from '@/lib/viewport';
import { useFlowStore } from '@/store/flow-store';
import { type AppView, useUiStore } from '@/store/ui-store';

type IconComponent = React.ComponentType<{ className?: string }>;

export interface AppCommand {
  id: string;
  label: string;
  hint?: string;
  icon: IconComponent;
  shortcut?: ShortcutSpec;
  /** Views the command is offered in. */
  views: readonly AppView[];
  run: () => void;
}

const BOTH: readonly AppView[] = ['home', 'editor'];
const EDITOR: readonly AppView[] = ['editor'];

/** Starts a fresh automation in the editor (after confirming unsaved changes). */
export function useStartNewAutomation() {
  const { t } = useTranslation(['common']);
  return useCallback(
    () =>
      useUiStore.getState().runGuarded(() => {
        const { reset, setFlowName } = useFlowStore.getState();
        reset();
        setFlowName(t('defaults.newAutomation'));
        useUiStore.getState().setView('editor');
      }),
    [t]
  );
}

/**
 * App-level commands (save, navigation, import/export, appearance …) —
 * shown in the command palette and bound to keyboard shortcuts. Canvas node
 * actions (copy, align, tidy …) live in `useNodeActions`.
 */
export function useAppCommands(): AppCommand[] {
  const { t } = useTranslation(['ui', 'errors']);
  const { fitView } = useReactFlow();
  const { setThemeOverride } = useThemeOverride();
  const isDark = useDarkMode();
  const startNew = useStartNewAutomation();
  const quickSave = useQuickSave();

  return useMemo<AppCommand[]>(() => {
    const ui = useUiStore.getState;
    return [
      {
        id: 'palette',
        label: t('ui:dock.palette'),
        icon: Search,
        shortcut: 'ctrl+k',
        views: BOTH,
        run: () => ui().openDialog('palette'),
      },
      {
        id: 'save',
        label: t('ui:commands.save'),
        hint: t('ui:commands.saveHint'),
        icon: Save,
        shortcut: 'ctrl+s',
        views: EDITOR,
        run: () => {
          void quickSave();
        },
      },
      {
        id: 'saveAs',
        label: t('ui:save.saveAs'),
        hint: t('ui:save.saveAsHint'),
        icon: SaveAll,
        shortcut: 'ctrl+shift+s',
        views: EDITOR,
        run: () => ui().openDialog('save'),
      },
      {
        id: 'home',
        label: t('ui:commands.home'),
        icon: House,
        views: EDITOR,
        run: () => ui().setView('home'),
      },
      {
        id: 'new',
        label: t('ui:commands.new'),
        icon: Plus,
        views: BOTH,
        run: startNew,
      },
      {
        id: 'open',
        label: t('ui:commands.openAutomation'),
        icon: FolderOpen,
        shortcut: 'ctrl+o',
        views: EDITOR,
        run: () => ui().openDialog('openAutomation'),
      },
      {
        id: 'importYaml',
        label: t('ui:commands.importYaml'),
        icon: FileCode,
        views: BOTH,
        run: () => ui().openDialog('importYaml'),
      },
      {
        id: 'importJson',
        label: t('ui:commands.importJson'),
        icon: FileUp,
        views: EDITOR,
        run: () =>
          ui().runGuarded(() => {
            void importFlowJson().then((ok) => {
              if (!ok) showErrorToast(t('errors:import.fileReadFailed'));
            });
          }),
      },
      {
        id: 'exportJson',
        label: t('ui:commands.exportJson'),
        icon: FileDown,
        views: EDITOR,
        run: exportFlowJson,
      },
      {
        id: 'library',
        label: t('ui:commands.library'),
        icon: PanelLeft,
        shortcut: 'ctrl+b',
        views: EDITOR,
        run: () => ui().toggleLibrary(),
      },
      {
        id: 'minimap',
        label: t('ui:commands.minimap'),
        icon: MapIcon,
        views: EDITOR,
        run: () => ui().toggleMinimap(),
      },
      {
        id: 'fitView',
        label: t('ui:commands.fitView'),
        icon: Maximize,
        shortcut: 'shift+f',
        views: EDITOR,
        run: () => {
          void fitView(fitViewOptions());
        },
      },
      {
        id: 'theme',
        label: t('ui:commands.toggleTheme'),
        hint: t('ui:commands.toggleThemeHint'),
        icon: Moon,
        views: BOTH,
        run: () => setThemeOverride(isDark ? 'light' : 'dark'),
      },
      {
        id: 'shortcuts',
        label: t('ui:commands.shortcuts'),
        icon: Keyboard,
        shortcut: '?',
        views: BOTH,
        run: () => ui().openDialog('shortcuts'),
      },
      {
        id: 'clear',
        label: t('ui:commands.clear'),
        icon: Eraser,
        views: EDITOR,
        run: () => ui().openDialog('clear'),
      },
    ];
  }, [t, fitView, setThemeOverride, isDark, startNew, quickSave]);
}

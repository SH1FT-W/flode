import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ShortcutsDialog } from '@/components/command/ShortcutsDialog';
import { useHass } from '@/contexts/HassContext';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';
import { ConfirmDialog } from './ConfirmDialog';

// Code-split: dialogs load only when first opened.
const HassSettings = lazy(() =>
  import('@/components/panels/HassSettings').then((m) => ({ default: m.HassSettings }))
);
const ImportYamlDialog = lazy(() =>
  import('@/components/panels/ImportYamlDialog').then((m) => ({ default: m.ImportYamlDialog }))
);
const AutomationImportDialog = lazy(() =>
  import('@/components/panels/AutomationImportDialog').then((m) => ({
    default: m.AutomationImportDialog,
  }))
);
const AutomationSaveDialog = lazy(() =>
  import('@/components/panels/AutomationSaveDialog').then((m) => ({
    default: m.AutomationSaveDialog,
  }))
);

/** Every app-level dialog, driven by `useUiStore().dialog`. */
export function AppDialogs() {
  const { t } = useTranslation(['common', 'dialogs']);
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const confirmDiscard = useUiStore((s) => s.confirmDiscard);
  const { isRemote, config, setConfig } = useHass();
  const forceSettings = isRemote && (config.url === '' || config.token === '');

  return (
    <>
      <CommandPalette />
      <ShortcutsDialog />

      <Suspense fallback={null}>
        {isRemote && (dialog === 'settings' || forceSettings) && (
          <HassSettings isOpen onClose={closeDialog} config={config} onSave={setConfig} />
        )}
        {dialog === 'importYaml' && <ImportYamlDialog isOpen onClose={closeDialog} />}
        {dialog === 'openAutomation' && <AutomationImportDialog isOpen onClose={closeDialog} />}
        {dialog === 'save' && <AutomationSaveDialog isOpen onClose={closeDialog} />}
      </Suspense>

      <ConfirmDialog
        open={dialog === 'discard'}
        title={t('dialogs:import.discardTitle')}
        description={t('dialogs:import.discardDescription')}
        confirmLabel={t('dialogs:import.confirmDiscard')}
        cancelLabel={t('buttons.cancel')}
        onConfirm={confirmDiscard}
        onCancel={closeDialog}
      />
      <ConfirmDialog
        open={dialog === 'clear'}
        title={t('dialogs:import.discardTitle')}
        description={t('dialogs:import.discardDescription')}
        confirmLabel={t('dialogs:import.confirmDiscard')}
        cancelLabel={t('buttons.cancel')}
        onConfirm={() => {
          useFlowStore.getState().reset();
          closeDialog();
        }}
        onCancel={closeDialog}
      />
      <ConfirmDialog
        open={dialog === 'exit'}
        title={t('dialogs:exit.confirmTitle')}
        description={t('dialogs:exit.confirmDescription')}
        confirmLabel={t('dialogs:exit.confirmButton')}
        cancelLabel={t('buttons.cancel')}
        onConfirm={() => {
          closeDialog();
          window.history.back();
        }}
        onCancel={closeDialog}
      />
    </>
  );
}

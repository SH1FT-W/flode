import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useAppCommands } from '@/hooks/useAppCommands';
import { resolveNodeAction, useNodeActions } from '@/hooks/useNodeActions';
import { formatShortcut } from '@/lib/shortcuts';
import { useUiStore } from '@/store/ui-store';

/** Overview of every keyboard shortcut, generated from the same command/action lists that bind them. */
export function ShortcutsDialog() {
  const { t } = useTranslation(['ui']);
  const open = useUiStore((s) => s.dialog === 'shortcuts');
  const closeDialog = useUiStore((s) => s.closeDialog);
  const commands = useAppCommands();
  const { actions, context } = useNodeActions();

  const rows = [
    ...commands.map((c) => ({ id: c.id, label: c.label, keys: formatShortcut(c.shortcut) })),
    ...actions.map((a) => ({
      id: a.name,
      label: resolveNodeAction(a, context).label,
      keys: formatShortcut(a.shortcut),
    })),
  ].filter((row): row is { id: string; label: string; keys: string } => Boolean(row.keys));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('ui:shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('ui:shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 border-border border-b py-2 text-sm"
            >
              <span className="text-foreground">{row.label}</span>
              <Kbd>{row.keys}</Kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

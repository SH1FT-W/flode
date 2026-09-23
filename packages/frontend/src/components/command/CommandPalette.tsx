import { Workflow } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useAppCommands } from '@/hooks/useAppCommands';
import { useInsertNode } from '@/hooks/useInsertNode';
import { useLibraryEntries } from '@/hooks/useLibraryEntries';
import { resolveNodeAction, useNodeActions } from '@/hooks/useNodeActions';
import { useAutomationEntities, useOpenAutomation } from '@/hooks/useOpenAutomation';
import { showSuccessToast } from '@/lib/haToast';
import { NODE_COLORS } from '@/lib/node-colors';
import { formatShortcut, type ShortcutSpec } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

/** Automations listed before the user starts typing. */
const AUTOMATIONS_WITHOUT_QUERY = 5;

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Matches on the item's visible words (passed as cmdk `keywords`), not its
 * internal `value` id — every search word must appear somewhere.
 */
function paletteFilter(_value: string, search: string, keywords?: string[]): number {
  const haystack = (keywords ?? []).join(' ').toLocaleLowerCase();
  const words = search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}

interface PaletteItemProps {
  value: string;
  icon: IconComponent;
  iconClassName?: string;
  label: string;
  hint?: string;
  shortcut?: ShortcutSpec;
  disabled?: boolean;
  onRun: () => void;
}

function PaletteItem({
  value,
  icon: Icon,
  iconClassName,
  label,
  hint,
  shortcut,
  disabled,
  onRun,
}: PaletteItemProps) {
  const keys = formatShortcut(shortcut);
  return (
    <CommandItem
      value={value}
      keywords={hint ? [label, hint] : [label]}
      disabled={disabled}
      onSelect={onRun}
      className="gap-3 py-2"
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
          iconClassName
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {label}
        {hint && <span className="ml-2 text-muted-foreground text-xs">{hint}</span>}
      </span>
      {keys && <Kbd>{keys}</Kbd>}
    </CommandItem>
  );
}

function PaletteFooterHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      {children}
    </span>
  );
}

/**
 * ⌘K command palette: insert blocks, run commands and canvas actions, open
 * automations — one searchable list. Everything comes from the same sources
 * as the rest of the UI (app commands, node actions, block catalog).
 */
export function CommandPalette() {
  const { t } = useTranslation(['ui']);
  const open = useUiStore((s) => s.dialog === 'palette');
  const view = useUiStore((s) => s.view);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useAppCommands().filter((c) => c.id !== 'palette' && c.views.includes(view));
  const { actions, context } = useNodeActions();
  const entries = useLibraryEntries();
  const { insertNext } = useInsertNode();
  const automations = useAutomationEntities();
  const openAutomation = useOpenAutomation();

  const visibleAutomations = query.trim()
    ? automations
    : automations.slice(0, AUTOMATIONS_WITHOUT_QUERY);

  /** Close first, then run — commands may open another dialog. */
  const run = (action: () => void) => {
    closeDialog();
    setQuery('');
    action();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeDialog();
          setQuery('');
        }
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Radix's own auto-focus is unreliable inside HA's Shadow DOM — focus the search field explicitly.
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="data-[state=closed]:slide-out-to-top-[14vh] data-[state=open]:slide-in-from-top-[14vh] top-[14vh] max-w-[620px] translate-y-0 gap-0 overflow-hidden rounded-[18px] p-0 [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">{t('ui:palette.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('ui:palette.placeholder')}</DialogDescription>
        <Command
          filter={paletteFilter}
          className="bg-transparent [&_[cmdk-input-wrapper]]:px-4 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-input]]:h-14 **:[[cmdk-input]]:text-base"
        >
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t('ui:palette.placeholder')}
          />
          <CommandList className="max-h-[min(60vh,460px)] p-1.5">
            <CommandEmpty>{t('ui:palette.empty', { query })}</CommandEmpty>

            <CommandGroup heading={t('ui:palette.groups.commands')}>
              {commands.map((command) => (
                <PaletteItem
                  key={command.id}
                  value={`command:${command.id}`}
                  icon={command.icon}
                  label={command.label}
                  hint={command.hint}
                  shortcut={command.shortcut}
                  onRun={() => run(command.run)}
                />
              ))}
            </CommandGroup>

            {view === 'editor' && (
              <CommandGroup heading={t('ui:palette.groups.edit')}>
                {actions.map((action) => {
                  const { label, icon, enabled } = resolveNodeAction(action, context);
                  if (!enabled) return null;
                  return (
                    <PaletteItem
                      key={action.name}
                      value={`action:${action.name}`}
                      icon={icon}
                      label={label}
                      shortcut={action.shortcut}
                      onRun={() => run(() => action.execute(context))}
                    />
                  );
                })}
              </CommandGroup>
            )}

            {view === 'editor' && (
              <CommandGroup heading={t('ui:palette.groups.insert')}>
                {entries.map((entry) => (
                  <PaletteItem
                    key={entry.id}
                    value={entry.id}
                    icon={entry.config.icon}
                    iconClassName={NODE_COLORS[entry.config.color].chip}
                    label={entry.label}
                    hint={entry.description}
                    onRun={() =>
                      run(() => {
                        insertNext(entry.item);
                        showSuccessToast(t('ui:palette.inserted', { name: entry.label }));
                      })
                    }
                  />
                ))}
              </CommandGroup>
            )}

            {visibleAutomations.length > 0 && (
              <CommandGroup heading={t('ui:palette.groups.automations')}>
                {visibleAutomations.map((automation) => (
                  <PaletteItem
                    key={automation.entity_id}
                    value={automation.entity_id}
                    icon={Workflow}
                    label={automation.friendly_name}
                    hint={automation.enabled ? undefined : t('ui:home.off')}
                    onRun={() => run(() => openAutomation(automation))}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex flex-wrap gap-4 border-border border-t px-4 py-2.5 text-muted-foreground text-xs">
            <PaletteFooterHint keys={['↑', '↓']}>
              {t('ui:palette.footer.navigate')}
            </PaletteFooterHint>
            <PaletteFooterHint keys={['↵']}>{t('ui:palette.footer.run')}</PaletteFooterHint>
            <PaletteFooterHint keys={['esc']}>{t('ui:palette.footer.close')}</PaletteFooterHint>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

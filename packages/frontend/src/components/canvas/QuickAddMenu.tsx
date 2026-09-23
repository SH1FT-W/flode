import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useFuzzySearch } from '@/hooks/useFuzzySearch';
import type { InsertItem } from '@/hooks/useInsertNode';
import { type LibraryEntry, useLibraryEntries } from '@/hooks/useLibraryEntries';
import { NODE_COLORS } from '@/lib/node-colors';
import { getAvailableQuickAddTypes, type QuickAddDirection } from '@/lib/quick-add';
import { cn } from '@/lib/utils';

export interface QuickAddPosition {
  screenX: number;
  screenY: number;
}

interface QuickAddMenuProps {
  /** Screen position to anchor the menu at, or `null` when closed. */
  position: QuickAddPosition | null;
  direction: QuickAddDirection;
  onSelect: (item: InsertItem) => void;
  onClose: () => void;
}

const SEARCH_OPTIONS = { keys: ['label', 'description'], threshold: 0.4, ignoreLocation: true };

/**
 * Searchable block picker shown when a connection dragged from a handle is
 * dropped on empty canvas, or a node's "+" button is clicked — anchored to
 * that point via a zero-size `position: fixed` div.
 */
export function QuickAddMenu({ position, direction, onSelect, onClose }: QuickAddMenuProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const entries = useLibraryEntries();
  const inputRef = useRef<HTMLInputElement>(null);

  const available = useMemo<LibraryEntry[]>(() => {
    const { simple, compound } = getAvailableQuickAddTypes(direction);
    const allowed = new Set<string>([
      ...simple.map((c) => `node:${c.type}`),
      ...compound.map((c) => `block:${c.key}`),
    ]);
    return entries.filter((entry) => allowed.has(entry.id));
  }, [entries, direction]);

  const { query, setQuery, filteredItems } = useFuzzySearch(available, SEARCH_OPTIONS);

  return (
    <Popover
      open={position !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {position && (
        <>
          <PopoverAnchor asChild>
            <div
              style={{
                position: 'fixed',
                left: position.screenX,
                top: position.screenY,
                width: 0,
                height: 0,
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            className="w-72 p-0"
            align="start"
            side="right"
            sideOffset={8}
            onOpenAutoFocus={(event) => {
              // Radix's own auto-focus is unreliable inside HA's Shadow DOM — focus the search field explicitly.
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <Command shouldFilter={false}>
              <CommandInput
                ref={inputRef}
                placeholder={t('nodes:quickAdd.searchPlaceholder')}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>{t('combobox.noOptions')}</CommandEmpty>
                <CommandGroup>
                  {filteredItems.map((entry) => {
                    const Icon = entry.config.icon;
                    return (
                      <CommandItem
                        key={entry.id}
                        value={entry.id}
                        onSelect={() => onSelect(entry.item)}
                      >
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md',
                            NODE_COLORS[entry.config.color].chip
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{entry.label}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {entry.description}
                          </span>
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </>
      )}
    </Popover>
  );
}

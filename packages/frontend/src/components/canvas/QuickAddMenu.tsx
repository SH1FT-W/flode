import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompoundTypeConfig, NodeTypeConfig } from '@/components/panels/NodePalette';
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
import type { CompoundBlockKey } from '@/lib/block-factories';
import { getAvailableQuickAddTypes, type QuickAddDirection } from '@/lib/quick-add';

export interface QuickAddPosition {
  screenX: number;
  screenY: number;
}

type QuickAddItem =
  | { kind: 'simple'; config: NodeTypeConfig; label: string }
  | { kind: 'compound'; config: CompoundTypeConfig; label: string };

interface QuickAddMenuProps {
  /** Screen position to anchor the menu at, or `null` when closed. */
  position: QuickAddPosition | null;
  direction: QuickAddDirection;
  onSelectSimple: (config: NodeTypeConfig) => void;
  onSelectCompound: (key: CompoundBlockKey) => void;
  onClose: () => void;
}

/**
 * Searchable node-type picker shown when a connection dragged from a handle
 * is dropped on empty canvas (see FlowCanvas.tsx's `onConnectEnd`) — anchored
 * to the drop point via a zero-size `position: fixed` div rather than a real
 * trigger element, since there's no button to anchor to here.
 */
export function QuickAddMenu({
  position,
  direction,
  onSelectSimple,
  onSelectCompound,
  onClose,
}: QuickAddMenuProps) {
  const { t } = useTranslation(['common', 'nodes']);

  const items = useMemo<QuickAddItem[]>(() => {
    if (!position) return [];
    const { simple, compound } = getAvailableQuickAddTypes(direction);
    return [
      ...simple.map((config) => ({ kind: 'simple' as const, config, label: t(config.labelKey) })),
      ...compound.map((config) => ({
        kind: 'compound' as const,
        config,
        label: t(config.labelKey),
      })),
    ];
  }, [position, direction, t]);

  const { query, setQuery, filteredItems } = useFuzzySearch<QuickAddItem>(items, {
    keys: ['label'],
    threshold: 0.4,
    ignoreLocation: true,
  });

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
          <PopoverContent className="w-64 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                autoFocus
                placeholder={t('nodes:quickAdd.searchPlaceholder')}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>{t('combobox.noOptions')}</CommandEmpty>
                <CommandGroup>
                  {filteredItems.map((item) => (
                    <CommandItem
                      key={item.kind === 'simple' ? item.config.type : item.config.key}
                      value={item.label}
                      onSelect={() => {
                        if (item.kind === 'simple') {
                          onSelectSimple(item.config);
                        } else {
                          onSelectCompound(item.config.key);
                        }
                      }}
                    >
                      <item.config.icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </>
      )}
    </Popover>
  );
}

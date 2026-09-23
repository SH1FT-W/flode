import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { type DragEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFuzzySearch } from '@/hooks/useFuzzySearch';
import { useInsertNode } from '@/hooks/useInsertNode';
import { type LibraryEntry, type LibraryGroup, useLibraryEntries } from '@/hooks/useLibraryEntries';
import { compoundGroupOrder, DND_COMPOUND_MIME, DND_NODE_MIME } from '@/lib/node-catalog';
import { NODE_COLORS } from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

const GROUP_ORDER: readonly LibraryGroup[] = ['blocks', ...compoundGroupOrder];

function onDragStart(event: DragEvent<HTMLButtonElement>, entry: LibraryEntry) {
  if (entry.item.kind === 'simple') {
    event.dataTransfer.setData(
      DND_NODE_MIME,
      JSON.stringify({ type: entry.item.config.type, defaultData: entry.item.config.defaultData })
    );
  } else {
    event.dataTransfer.setData(DND_COMPOUND_MIME, JSON.stringify({ key: entry.item.key }));
  }
  event.dataTransfer.effectAllowed = 'move';
}

interface LibraryRowProps {
  entry: LibraryEntry;
  collapsed: boolean;
  onInsert: (entry: LibraryEntry) => void;
}

function LibraryRow({ entry, collapsed, onInsert }: LibraryRowProps) {
  const Icon = entry.config.icon;
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, entry)}
      onClick={() => onInsert(entry)}
      title={collapsed ? entry.label : entry.description}
      className={cn(
        'flex w-full cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted active:cursor-grabbing',
        collapsed && 'justify-center px-0'
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg',
          NODE_COLORS[entry.config.color].chip
        )}
      >
        <Icon className="size-3.5" />
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-[13px] text-foreground">{entry.label}</span>
          <span className="truncate text-[11.5px] text-muted-foreground">{entry.description}</span>
        </span>
      )}
    </button>
  );
}

/**
 * Block library (left sidebar): searchable, collapsible to an icon rail.
 * Click inserts after the selected node, drag places it freely.
 */
export function NodePalette() {
  const { t } = useTranslation(['ui', 'nodes']);
  const collapsed = useUiStore((s) => s.libraryCollapsed);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const { insertNext } = useInsertNode();
  const entries = useLibraryEntries();

  const searchOptions = useMemo(
    () => ({ keys: ['label', 'description'], threshold: 0.35, ignoreLocation: true }),
    []
  );
  const { query, setQuery, filteredItems } = useFuzzySearch(entries, searchOptions);

  const groupLabel = (group: LibraryGroup) =>
    group === 'blocks' ? t('ui:library.blocks') : t(`nodes:compoundBlocks.groups.${group}`);

  const handleInsert = (entry: LibraryEntry) => insertNext(entry.item);

  return (
    <aside
      className={cn(
        'hidden h-full min-h-0 flex-col border-border border-r bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      <div
        className={cn('flex items-center gap-2 px-3 pt-3 pb-2', collapsed && 'justify-center px-0')}
      >
        {!collapsed && (
          <h2 className="flex-1 font-semibold text-foreground text-sm">{t('ui:library.title')}</h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={toggleLibrary}
          aria-label={collapsed ? t('ui:library.expand') : t('ui:library.collapse')}
          title={collapsed ? t('ui:library.expand') : t('ui:library.collapse')}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      {!collapsed && (
        <label className="mx-3 mb-1 flex h-8 items-center gap-2 rounded-control border border-border bg-muted/40 px-2.5 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20">
          <Search className="size-3.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('ui:library.search')}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-3">
        {GROUP_ORDER.map((group) => {
          const items = filteredItems.filter((entry) => entry.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="pt-2">
              {!collapsed && (
                <div className="px-2 pt-1 pb-1 font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider">
                  {groupLabel(group)}
                </div>
              )}
              {items.map((entry) => (
                <LibraryRow
                  key={entry.id}
                  entry={entry}
                  collapsed={collapsed}
                  onInsert={handleInsert}
                />
              ))}
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {t('ui:library.empty')}
          </div>
        )}
      </div>
    </aside>
  );
}

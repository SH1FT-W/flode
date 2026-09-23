import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStartNewAutomation } from '@/hooks/useAppCommands';
import { useEditorTabs } from '@/hooks/useEditorTabs';
import { cn } from '@/lib/utils';
import { flowHasChanges, useFlowStore } from '@/store/flow-store';
import { type EditorTab, ensureActiveTab, useTabsStore } from '@/store/tabs-store';

interface TabItemProps {
  title: string;
  isActive: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function TabItem({ title, isActive, isDirty, onSelect, onClose }: TabItemProps) {
  const { t } = useTranslation(['ui']);
  return (
    <div
      className={cn(
        'group flex h-8 max-w-56 shrink-0 items-center gap-1.5 rounded-t-lg border border-transparent border-b-0 pr-1 pl-3 text-[13px]',
        isActive
          ? 'border-border border-solid bg-canvas font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onAuxClick={(event) => {
          // Middle click closes, like in a browser.
          if (event.button === 1) onClose();
        }}
        className="min-w-0 truncate text-left"
        title={title}
      >
        {title}
      </button>
      {isDirty && (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" title={t('ui:tabs.unsaved')} />
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('ui:tabs.close', { name: title })}
        title={t('ui:tabs.close', { name: title })}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
          !isActive && 'opacity-0 group-hover:opacity-100'
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Title and unsaved state of a background tab, from its parked snapshot. */
function parkedTabInfo(tab: EditorTab, fallbackTitle: string) {
  return {
    title: tab.snapshot?.flowName || fallbackTitle,
    isDirty: tab.snapshot ? flowHasChanges(tab.snapshot) : false,
  };
}

/**
 * Tab strip above the canvas: every open automation, the active one live from
 * the flow store, the others from their parked snapshots.
 */
export function EditorTabs() {
  const { t } = useTranslation(['ui', 'common']);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTitle = useFlowStore((s) => s.flowName);
  const activeDirty = useFlowStore((s) => flowHasChanges(s));
  const { switchTo, close } = useEditorTabs();
  const startNew = useStartNewAutomation();

  // The flow in the editor always has a tab (first start, or after a reload).
  useEffect(() => {
    ensureActiveTab();
  }, []);

  const fallbackTitle = t('common:defaults.newAutomation');

  return (
    <nav
      aria-label={t('ui:tabs.label')}
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-border border-b border-solid bg-card px-2"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const info = isActive
          ? { title: activeTitle || fallbackTitle, isDirty: activeDirty }
          : parkedTabInfo(tab, fallbackTitle);
        return (
          <TabItem
            key={tab.id}
            title={info.title}
            isActive={isActive}
            isDirty={info.isDirty}
            onSelect={() => switchTo(tab.id)}
            onClose={() => close(tab.id)}
          />
        );
      })}
      <button
        type="button"
        onClick={startNew}
        aria-label={t('ui:tabs.new')}
        title={t('ui:tabs.new')}
        className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </nav>
  );
}

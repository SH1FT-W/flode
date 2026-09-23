import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Save,
  Search,
  Settings,
  Wifi,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAppRoot } from '@/contexts/AppRootContext';
import { useHass } from '@/contexts/HassContext';
import { useAppCommands } from '@/hooks/useAppCommands';
import { useFlowIssues } from '@/hooks/useFlowIssues';
import { useQuickSave } from '@/hooks/useQuickSave';
import { formatShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';

/** Commands offered in the editor's "…" menu, in order; `null` = separator. */
const MORE_MENU = [
  'saveAs',
  null,
  'open',
  'importYaml',
  'importJson',
  'exportJson',
  null,
  'shortcuts',
  null,
  'clear',
];

function BrandOrMenuToggle({ showName }: { showName: boolean }) {
  const { t } = useTranslation(['common']);
  const appRoot = useAppRoot();
  const { narrow } = useHass();

  if (narrow) {
    // `composed: true` lets the event cross the Shadow DOM boundary to HA's own listener.
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle sidebar"
        onClick={() =>
          appRoot?.dispatchEvent(
            new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true })
          )
        }
      >
        <Menu className="size-5" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2" title={t('titles.appFullName')}>
      <img src={`${import.meta.env.BASE_URL}flode.svg`} alt="" className="size-7 rounded-lg" />
      {showName && (
        <span className="font-bold text-foreground text-sm tracking-wide">
          {t('titles.appName')}
        </span>
      )}
    </div>
  );
}

function SearchButton() {
  const { t } = useTranslation(['ui']);
  const openDialog = useUiStore((s) => s.openDialog);
  return (
    <button
      type="button"
      onClick={() => openDialog('palette')}
      className="flex h-8 items-center gap-2 rounded-control border border-border bg-muted/40 pr-1.5 pl-2.5 text-muted-foreground text-sm transition-colors hover:bg-muted sm:min-w-52"
    >
      <Search className="size-4" />
      <span className="hidden flex-1 text-left sm:inline">{t('ui:editor.search')}</span>
      <Kbd className="hidden sm:inline-flex">{formatShortcut('ctrl+k')}</Kbd>
    </button>
  );
}

/** Remote (dev) mode only: connection badge + settings. Panel mode is always connected. */
function ConnectionControls() {
  const { t } = useTranslation(['common']);
  const { isRemote, isLoading, connectionError, hass } = useHass();
  const openDialog = useUiStore((s) => s.openDialog);
  if (!isRemote) return null;

  const status = isLoading
    ? { label: t('status.connecting'), className: 'text-muted-foreground', icon: Loader2 }
    : connectionError
      ? { label: t('status.connectionError'), className: 'text-destructive', icon: AlertCircle }
      : hass?.connected
        ? { label: t('status.connected'), className: 'text-success', icon: Wifi }
        : null;

  return (
    <>
      {status && (
        <button
          type="button"
          onClick={() => openDialog('settings')}
          title={t('titles.clickToConfigure')}
          className={cn('hidden items-center gap-1.5 text-xs md:flex', status.className)}
        >
          <status.icon className={cn('size-3.5', isLoading && 'animate-spin')} />
          {status.label}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openDialog('settings')}
        title={t('titles.settings')}
      >
        <Settings className="size-5" />
      </Button>
    </>
  );
}

function HeaderBar({ children }: { children: ReactNode }) {
  return (
    <header className="z-10 flex h-13 shrink-0 items-center gap-3 border-border border-b bg-card px-3 sm:px-4">
      {children}
    </header>
  );
}

export function HomeHeader() {
  return (
    <HeaderBar>
      <BrandOrMenuToggle showName />
      <div className="flex-1" />
      <SearchButton />
      <ConnectionControls />
      <ThemeToggle />
    </HeaderBar>
  );
}

function SaveStatusPill() {
  const { t } = useTranslation(['ui']);
  const isSaving = useFlowStore((s) => s.isSaving);
  const automationId = useFlowStore((s) => s.automationId);
  const hasUnsaved = useFlowStore((s) => s.hasUnsavedChanges && s.hasRealChanges());

  const state = isSaving
    ? { label: t('ui:editor.saving'), className: 'bg-muted text-muted-foreground' }
    : hasUnsaved
      ? { label: t('ui:editor.unsaved'), className: 'bg-warning/15 text-warning' }
      : automationId
        ? { label: t('ui:editor.saved'), className: 'bg-success/15 text-success' }
        : { label: t('ui:editor.draft'), className: 'bg-muted text-muted-foreground' };

  return (
    <span
      className={cn(
        'hidden h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-medium text-xs md:inline-flex',
        state.className
      )}
    >
      {isSaving ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {state.label}
    </span>
  );
}

function MoreMenu() {
  const { t } = useTranslation(['ui', 'common']);
  const { isRemote } = useHass();
  const openDialog = useUiStore((s) => s.openDialog);
  const commands = useAppCommands();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('ui:editor.more')}
          title={t('ui:editor.more')}
        >
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {MORE_MENU.map((id, index) => {
          if (id === null) return <DropdownMenuSeparator key={`sep-${index}`} />;
          const command = commands.find((c) => c.id === id);
          if (!command) return null;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={command.run}
              className={cn(
                id === 'clear' && 'text-destructive focus:bg-destructive focus:text-white'
              )}
            >
              <command.icon />
              {command.label}
              {command.shortcut && (
                <DropdownMenuShortcut>{formatShortcut(command.shortcut)}</DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          );
        })}
        {!isRemote && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openDialog('exit')}>
              <LogOut />
              {t('common:titles.exit')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Warning pill with the number of save-blocking problems; opens the problem list. */
function IssuesBadge() {
  const { t } = useTranslation(['ui']);
  const issues = useFlowIssues();
  if (issues.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const { nodes, onNodesChange } = useFlowStore.getState();
        onNodesChange(nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
        useUiStore.getState().setInspectorTab('properties');
      }}
      className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full bg-warning/15 px-2.5 font-medium text-warning text-xs transition-colors hover:bg-warning/25"
    >
      <AlertTriangle className="size-3.5" />
      <span className="hidden sm:inline">{t('ui:issues.title', { count: issues.length })}</span>
      <span className="sm:hidden">{issues.length}</span>
    </button>
  );
}

export function EditorHeader() {
  const { t } = useTranslation(['ui']);
  const quickSave = useQuickSave();
  const flowName = useFlowStore((s) => s.flowName);
  const setFlowName = useFlowStore((s) => s.setFlowName);
  const isSaving = useFlowStore((s) => s.isSaving);
  const setView = useUiStore((s) => s.setView);

  return (
    <HeaderBar>
      <BrandOrMenuToggle showName={false} />
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          onClick={() => setView('home')}
          className="flex shrink-0 items-center rounded-lg py-1 pr-2 pl-0.5 font-medium text-primary text-sm transition-colors hover:bg-primary/10"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">{t('ui:editor.back')}</span>
        </button>
        <span className="text-muted-foreground/60">{'/'}</span>
        <input
          type="text"
          value={flowName}
          onChange={(event) => setFlowName(event.target.value)}
          aria-label={t('ui:editor.nameLabel')}
          placeholder={t('ui:editor.nameLabel')}
          className="min-w-0 max-w-md flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 py-1 font-semibold text-[15px] text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-primary focus:bg-muted/40"
        />
      </div>
      <IssuesBadge />
      <SaveStatusPill />
      <SearchButton />
      <ConnectionControls />
      <ThemeToggle />
      <MoreMenu />
      <Button onClick={() => void quickSave()} disabled={isSaving} className="h-8">
        {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
        <span className="hidden sm:inline">{t('ui:editor.save')}</span>
      </Button>
    </HeaderBar>
  );
}

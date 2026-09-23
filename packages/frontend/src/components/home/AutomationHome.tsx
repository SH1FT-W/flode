import { CircleSlash, History, Layers, Plus, Search, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiCreateButton } from '@/components/ai/AiCreateButton';
import { AiSetupHint } from '@/components/ai/AiSetupHint';
import { HomeCard } from '@/components/home/HomeCard';
import { ScriptList } from '@/components/home/ScriptList';
import { Button } from '@/components/ui/button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useHass } from '@/contexts/HassContext';
import { useStartNewAutomation, useStartNewScript } from '@/hooks/useAppCommands';
import { useAutomationCatalog } from '@/hooks/useAutomationCatalog';
import { useAutomationPreviews } from '@/hooks/useAutomationPreviews';
import { useOpenAutomation } from '@/hooks/useOpenAutomation';
import { isToday, useRelativeTime } from '@/hooks/useRelativeTime';
import { useToggleAutomation } from '@/hooks/useToggleAutomation';
import type { AutomationCatalogItem } from '@/lib/ha-api';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';
import { version } from '../../../../../custom_components/flode/manifest.json';

type HomeFilter = 'all' | 'on' | 'off' | 'today';
type HomeSort = 'name' | 'lastTriggered';
const FILTERS: readonly HomeFilter[] = ['all', 'on', 'off', 'today'];

function matchesFilter(item: AutomationCatalogItem, filter: HomeFilter): boolean {
  switch (filter) {
    case 'on':
      return item.enabled;
    case 'off':
      return !item.enabled && !item.unavailable;
    case 'today':
      return isToday(item.last_triggered);
    default:
      return true;
  }
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** Pill toggle used for the filter and sort rows. */
function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border border-border bg-card px-3 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground',
        active && 'border-foreground bg-foreground text-background hover:text-background'
      )}
    >
      {children}
    </button>
  );
}

interface AutomationCardProps {
  automation: AutomationCatalogItem;
  /** Plain-language summary of the automation's triggers. */
  preview?: string;
  onOpen: (automation: AutomationCatalogItem) => void;
}

/** Orphaned automation (entity without config) — shown, but can't be opened or toggled. */
function UnavailableCard({ automation }: { automation: AutomationCatalogItem }) {
  const { t } = useTranslation(['ui']);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border border-dashed bg-card/60 px-4 pt-3.5 pb-3">
      <div className="min-w-0">
        <div className="font-semibold text-[15px] text-muted-foreground leading-snug">
          {automation.friendly_name}
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{t('ui:home.unavailableHint')}</p>
      </div>
      <div className="mt-auto flex items-center gap-2 border-border border-t pt-2.5 text-muted-foreground text-xs">
        <CircleSlash className="size-3.5" />
        {t('ui:home.unavailable')}
      </div>
    </div>
  );
}

function AutomationCard({ automation, preview, onOpen }: AutomationCardProps) {
  const { t } = useTranslation(['ui', 'dialogs']);
  const toggleAutomation = useToggleAutomation();
  const formatRelativeTime = useRelativeTime();

  return (
    <HomeCard onOpen={() => onOpen(automation)} muted={!automation.enabled}>
      <div className="min-w-0">
        <div className="font-semibold text-[15px] text-foreground leading-snug">
          {automation.friendly_name}
        </div>
        {automation.description && (
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
            {automation.description}
          </p>
        )}
        {preview && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-foreground/80">
            <Zap className="size-3.5 shrink-0 text-trigger" />
            <span className="truncate">{preview}</span>
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2.5 border-border border-t pt-2.5 text-muted-foreground text-xs tabular-nums">
        {/* Toggling must not open the automation. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: click-shield only, the switch inside is the control */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard events reach the switch directly */}
        <span onClick={(event) => event.stopPropagation()} className="flex items-center">
          <ToggleSwitch
            checked={automation.enabled}
            onChange={(checked) => void toggleAutomation(automation, checked)}
            label={t('ui:home.toggleLabel', { name: automation.friendly_name })}
          />
        </span>
        <span>{automation.enabled ? t('ui:home.on') : t('ui:home.off')}</span>
        <span className="flex-1" />
        {automation.tags[0] && (
          <span className="max-w-28 truncate rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px]">
            {automation.tags[0]}
          </span>
        )}
        {automation.last_triggered ? (
          <button
            type="button"
            title={t('ui:lastRun.openLastRun')}
            onClick={(event) => {
              event.stopPropagation();
              useUiStore.getState().setShowLastRunOnOpen(true);
              onOpen(automation);
            }}
            className="flex items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            <History className="size-3" />
            {formatRelativeTime(automation.last_triggered)}
          </button>
        ) : (
          <span className="whitespace-nowrap">{formatRelativeTime(automation.last_triggered)}</span>
        )}
      </div>
    </HomeCard>
  );
}

/**
 * FLODE's start screen: every automation, grouped by area, searchable and
 * filterable — open one, switch it on/off, or start a new one.
 */
export function AutomationHome() {
  const { t } = useTranslation(['ui', 'dialogs']);
  const { hass, config, entities, isLoading } = useHass();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [sort, setSort] = useState<HomeSort>('name');
  const openAutomation = useOpenAutomation();
  const startNew = useStartNewAutomation();
  const startNewScript = useStartNewScript();
  const openDialog = useUiStore((s) => s.openDialog);
  const section = useUiStore((s) => s.homeSection);
  const setSection = useUiStore((s) => s.setHomeSection);
  const isScripts = section === 'scripts';
  const scriptCount = entities.filter((entity) => entity.entity_id.startsWith('script.')).length;

  const labels = useMemo(
    () => ({ noArea: t('dialogs:import.noArea'), otherArea: t('dialogs:import.otherArea') }),
    [t]
  );
  const { catalogItems, catalogByArea } = useAutomationCatalog({
    isOpen: true,
    hass,
    hassConfig: config,
    entities,
    searchTerm,
    sortColumn: sort,
    sortDirection: sort === 'lastTriggered' ? 'desc' : 'asc',
    labels,
  });
  const previews = useAutomationPreviews(catalogItems);

  const groups = Object.entries(catalogByArea)
    .map(([area, items]) => [area, items.filter((item) => matchesFilter(item, filter))] as const)
    .filter(([, items]) => items.length > 0);
  const onCount = catalogItems.filter((item) => item.enabled).length;
  const unavailableCount = catalogItems.filter((item) => item.unavailable).length;
  const summary = [
    t('ui:home.summary', {
      total: catalogItems.length,
      on: onCount,
      off: catalogItems.length - onCount - unavailableCount,
    }),
    unavailableCount > 0 ? t('ui:home.summaryUnavailable', { count: unavailableCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-bold text-3xl text-foreground tracking-tight">
              {isScripts ? t('ui:scripts.title') : t('ui:home.title')}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm tabular-nums">
              {isScripts ? t('ui:scripts.summary', { count: scriptCount }) : summary}
            </p>
          </div>
          {isScripts ? (
            <div className="flex gap-2">
              <AiCreateButton />
              <Button onClick={startNewScript}>
                <Plus />
                {t('ui:commands.newScript')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => openDialog('openAutomation')}
                title={t('ui:home.mergeHint')}
              >
                <Layers />
                {t('ui:home.openTogether')}
              </Button>
              <AiCreateButton />
              <Button onClick={startNew}>
                <Plus />
                {t('ui:home.newAutomation')}
              </Button>
            </div>
          )}
        </div>

        <fieldset className="m-0 flex w-fit gap-1 rounded-full border border-border border-solid bg-card p-1">
          {(['automations', 'scripts'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={section === key}
              onClick={() => setSection(key)}
              className={cn(
                'h-8 rounded-full px-4 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground',
                section === key && 'bg-foreground text-background hover:text-background'
              )}
            >
              {t(`ui:home.sections.${key}`)}
            </button>
          ))}
        </fieldset>

        <AiSetupHint />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-10 min-w-60 flex-1 items-center gap-2 rounded-control border border-border bg-card px-3 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20">
            <Search className="size-4 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('ui:home.searchPlaceholder')}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <fieldset
            className={cn('m-0 flex flex-wrap gap-1.5 border-0 p-0', isScripts && 'hidden')}
          >
            {FILTERS.map((key) => (
              <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                {t(`ui:home.filters.${key}`)}
              </Chip>
            ))}
          </fieldset>
          <fieldset className="m-0 flex gap-1.5 border-0 p-0">
            <Chip active={sort === 'name'} onClick={() => setSort('name')}>
              {t('ui:home.sortName')}
            </Chip>
            <Chip active={sort === 'lastTriggered'} onClick={() => setSort('lastTriggered')}>
              {t('ui:home.sortRecent')}
            </Chip>
          </fieldset>
        </div>

        {isScripts && <ScriptList searchTerm={searchTerm} sort={sort} />}

        {!isScripts &&
          groups.map(([area, items]) => (
            <section key={area} className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2 font-semibold text-muted-foreground text-sm">
                {area}
                <span className="font-medium text-muted-foreground/70 tabular-nums">
                  {items.length}
                </span>
              </h2>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                {items.map((automation) =>
                  automation.unavailable ? (
                    <UnavailableCard key={automation.entity_id} automation={automation} />
                  ) : (
                    <AutomationCard
                      key={automation.entity_id}
                      automation={automation}
                      preview={previews[automation.automation_id]}
                      onOpen={openAutomation}
                    />
                  )
                )}
              </div>
            </section>
          ))}

        {!isScripts && groups.length === 0 && (
          <div className="rounded-2xl border border-border border-dashed px-6 py-14 text-center text-muted-foreground text-sm">
            {isLoading
              ? t('ui:home.loading')
              : catalogItems.length === 0
                ? t('ui:home.emptyAll')
                : t('ui:home.empty', { query: searchTerm })}
          </div>
        )}

        <p className="pt-4 text-center text-muted-foreground/70 text-xs">{`FLODE v${version}`}</p>
      </div>
    </div>
  );
}

import { History, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HomeCard } from '@/components/home/HomeCard';
import { Button } from '@/components/ui/button';
import { useOpenAutomation } from '@/hooks/useOpenAutomation';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { useRunScript } from '@/hooks/useRunScript';
import {
  type ScriptCatalogItem,
  type ScriptSort,
  useScriptCatalog,
} from '@/hooks/useScriptCatalog';

function ScriptCard({ script }: { script: ScriptCatalogItem }) {
  const { t } = useTranslation(['ui']);
  const openAutomation = useOpenAutomation();
  const runScript = useRunScript();
  const formatRelativeTime = useRelativeTime();

  return (
    <HomeCard
      onOpen={() =>
        openAutomation({
          automation_id: script.script_id,
          kind: 'script',
          entity_id: script.entity_id,
          friendly_name: script.friendly_name,
        })
      }
    >
      <div className="font-semibold text-[15px] text-foreground leading-snug">
        {script.friendly_name}
      </div>
      <div className="mt-auto flex items-center gap-2.5 border-border border-t pt-2.5 text-muted-foreground text-xs tabular-nums">
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full border-solid px-3 text-xs"
          onClick={(event) => {
            event.stopPropagation();
            void runScript(script.script_id, script.friendly_name);
          }}
        >
          <Play />
          {t('ui:scripts.run')}
        </Button>
        {script.running && (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            {t('ui:scripts.running')}
          </span>
        )}
        <span className="flex-1" />
        <span className="flex items-center gap-1 whitespace-nowrap">
          {script.last_triggered && <History className="size-3" />}
          {formatRelativeTime(script.last_triggered ?? undefined)}
        </span>
      </div>
    </HomeCard>
  );
}

interface ScriptListProps {
  searchTerm: string;
  sort: ScriptSort;
}

/** The start screen's script section: every script, grouped by area. */
export function ScriptList({ searchTerm, sort }: ScriptListProps) {
  const { t } = useTranslation(['ui', 'dialogs']);
  const { items, groups } = useScriptCatalog(searchTerm, sort, t('dialogs:import.noArea'));

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border border-dashed px-6 py-14 text-center text-muted-foreground text-sm">
        {items.length === 0 && !searchTerm
          ? t('ui:scripts.emptyAll')
          : t('ui:home.empty', { query: searchTerm })}
      </div>
    );
  }

  return (
    <>
      {groups.map(([area, scripts]) => (
        <section key={area} className="flex flex-col gap-2.5">
          <h2 className="flex items-baseline gap-2 font-semibold text-muted-foreground text-sm">
            {area}
            <span className="font-medium text-muted-foreground/70 tabular-nums">
              {scripts.length}
            </span>
          </h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {scripts.map((script) => (
              <ScriptCard key={script.entity_id} script={script} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

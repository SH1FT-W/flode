import { useMemo } from 'react';
import { useHass } from '@/contexts/HassContext';

export interface ScriptCatalogItem {
  /** Config id — the entity's object id (`script.<id>`). */
  script_id: string;
  entity_id: string;
  friendly_name: string;
  last_triggered: string | null;
  running: boolean;
  area: string;
}

export type ScriptSort = 'name' | 'lastTriggered';

/**
 * Every script known to Home Assistant for the start screen, filtered by
 * `searchTerm` (name or area), sorted, and grouped by area like automations.
 */
export function useScriptCatalog(searchTerm: string, sort: ScriptSort, noAreaLabel: string) {
  const { entities, getAreaNameForEntity } = useHass();

  return useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const items: ScriptCatalogItem[] = entities
      .filter((entity) => entity.entity_id.startsWith('script.'))
      .map((entity) => {
        const name = entity.attributes?.friendly_name;
        const lastTriggered = entity.attributes?.last_triggered;
        return {
          script_id: entity.entity_id.slice('script.'.length),
          entity_id: entity.entity_id,
          friendly_name: typeof name === 'string' ? name : entity.entity_id,
          last_triggered: typeof lastTriggered === 'string' ? lastTriggered : null,
          running: entity.state === 'on',
          area: getAreaNameForEntity(entity.entity_id) ?? noAreaLabel,
        };
      })
      .filter(
        (item) =>
          !query ||
          item.friendly_name.toLowerCase().includes(query) ||
          item.area.toLowerCase().includes(query)
      )
      .sort((a, b) =>
        sort === 'lastTriggered'
          ? (b.last_triggered ?? '').localeCompare(a.last_triggered ?? '')
          : a.friendly_name.localeCompare(b.friendly_name)
      );

    const byArea = new Map<string, ScriptCatalogItem[]>();
    for (const item of items) byArea.set(item.area, [...(byArea.get(item.area) ?? []), item]);
    const groups = [...byArea.entries()].sort(([a], [b]) =>
      a === noAreaLabel ? 1 : b === noAreaLabel ? -1 : a.localeCompare(b)
    );
    return { items, groups };
  }, [entities, getAreaNameForEntity, searchTerm, sort, noAreaLabel]);
}

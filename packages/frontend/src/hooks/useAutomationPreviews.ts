import { isPlainObject } from '@flode/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHass } from '@/contexts/HassContext';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import type { AutomationCatalogItem } from '@/lib/ha-api';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { asString, summarizeTrigger } from '@/lib/node-summary';
import type { TriggerNodeData } from '@/store/flow-store';

interface TriggerPreview {
  first: TriggerNodeData;
  count: number;
}

/** First trigger of an automation config (`triggers`/legacy `trigger`, `trigger`/legacy `platform`). */
function extractTriggers(config: Record<string, unknown>): TriggerPreview | null {
  const raw = config.triggers ?? config.trigger;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(isPlainObject);
  const first = list[0];
  if (!first) return null;
  const platform = asString(first.trigger) ?? asString(first.platform) ?? '';
  return { first: { ...first, trigger: platform }, count: list.length };
}

/**
 * Plain-language "when" line per automation for the start screen, e.g.
 * "Bed light changes to On +1". Configs are fetched once per set of
 * automations (skipping unavailable ones); the text follows language/state
 * changes without refetching.
 */
export function useAutomationPreviews(items: AutomationCatalogItem[]): Record<string, string> {
  const { hass, config } = useHass();
  const context = useSummaryContext();
  const [triggers, setTriggers] = useState<Record<string, TriggerPreview>>({});
  const hassRef = useRef(hass);
  hassRef.current = hass;

  const ids = items
    .filter((item) => !item.unavailable)
    .map((item) => item.automation_id)
    .sort()
    .join('|');
  const hasHass = hass !== undefined;

  // `hasHass` re-runs this once HA is connected; `hass` itself changes on
  // every state update and is read via the ref to avoid refetching each time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const currentHass = hassRef.current;
    if (!currentHass || !ids) return;
    let cancelled = false;
    void getHomeAssistantAPI(currentHass, config)
      .getAutomationConfigsBatch(ids.split('|'))
      .then((configs) => {
        if (cancelled) return;
        const next: Record<string, TriggerPreview> = {};
        for (const [id, automationConfig] of Object.entries(configs)) {
          const preview = automationConfig ? extractTriggers(automationConfig) : null;
          if (preview) next[id] = preview;
        }
        setTriggers(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ids, hasHass, config]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, preview] of Object.entries(triggers)) {
      const title = summarizeTrigger(preview.first, context).title;
      out[id] = preview.count > 1 ? `${title} +${preview.count - 1}` : title;
    }
    return out;
  }, [triggers, context]);
}

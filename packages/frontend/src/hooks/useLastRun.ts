import { useCallback, useEffect, useRef, useState } from 'react';
import { useHass } from '@/contexts/HassContext';
import { getHomeAssistantAPI, type TraceListItem } from '@/lib/ha-api';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';

/** Newest trace first — HA's `trace/list` order isn't guaranteed. */
function newest(traces: TraceListItem[]): TraceListItem | null {
  return (
    [...traces].sort(
      (a, b) => new Date(b.timestamp.start).getTime() - new Date(a.timestamp.start).getTime()
    )[0] ?? null
  );
}

export interface LastRun {
  /** Summary of the newest stored run, `null` if there is none (yet). */
  latest: TraceListItem | null;
  isLoading: boolean;
  isShowing: boolean;
  show: () => Promise<void>;
  hide: () => void;
}

/**
 * The open automation's most recent real run (HA trace). Reloads whenever
 * the automation triggers again (its `last_triggered` changes), so the chip
 * stays live; `show()` overlays that run's path on the canvas.
 */
export function useLastRun(): LastRun {
  const { hass } = useHass();
  const automationId = useFlowStore((s) => s.automationId);
  const isShowing = useFlowStore((s) => s.isShowingTrace);
  const [latest, setLatest] = useState<TraceListItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hassRef = useRef(hass);
  hassRef.current = hass;

  const entityId =
    hass && automationId
      ? (getHomeAssistantAPI(hass).findAutomationEntityId(automationId) ?? undefined)
      : undefined;
  const lastTriggered = entityId ? hass?.states?.[entityId]?.attributes?.last_triggered : undefined;
  const hasHass = hass !== undefined;

  const show = useCallback(async () => {
    const currentHass = hassRef.current;
    if (!currentHass || !automationId || !latest) return;
    const details = await getHomeAssistantAPI(currentHass).getAutomationTraceDetails(
      automationId,
      latest.run_id
    );
    if (details) await useFlowStore.getState().showTrace(details);
  }, [automationId, latest]);

  const hide = useCallback(() => useFlowStore.getState().hideTrace(), []);

  // `lastTriggered` re-runs this when the automation fires again; `hass`
  // itself changes on every state update and is read via the ref.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const currentHass = hassRef.current;
    setLatest(null);
    if (!currentHass || !automationId) return;
    let cancelled = false;
    setIsLoading(true);
    void getHomeAssistantAPI(currentHass)
      .getAutomationTraces(automationId)
      .then((traces) => {
        if (!cancelled) setLatest(newest(traces));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [automationId, lastTriggered, hasHass]);

  // Opened from the start screen via "last triggered": show that run right away.
  useEffect(() => {
    if (latest && useUiStore.getState().showLastRunOnOpen) {
      useUiStore.getState().setShowLastRunOnOpen(false);
      void show();
    }
  }, [latest, show]);

  // While the overlay is shown, follow new runs live (the automation fired again).
  const shownRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || !isShowing || shownRunId.current === latest.run_id) return;
    shownRunId.current = latest.run_id;
    void show();
  }, [latest, isShowing, show]);

  return { latest, isLoading, isShowing, show, hide };
}

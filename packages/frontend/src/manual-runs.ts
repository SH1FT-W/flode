/**
 * "Run from here" executions. HA keeps no trace for `execute_script` (its own
 * "Run action" doesn't either), so FLODE lists them itself under "Runs" —
 * status, the cards that ran and what HA's logbook recorded for them.
 */
export interface ManualRun {
  id: string;
  /** The flow it belongs to (`graph.id`). */
  graphId: string;
  label: string;
  startedAt: string;
  nodeIds: string[];
  status: 'running' | 'done' | 'error';
  error?: string;
  contextId?: string;
  /** HA logbook entries caused by the run (`logbook/get_events` by context). */
  logbook: unknown[];
  /** All logbook polls are done (an empty logbook then means nothing changed). */
  logbookFinal?: boolean;
}

/** HA writes the logbook with a short delay — ask a few times after the run. */
export const LOGBOOK_POLL_MS = [1500, 4000, 8000] as const;

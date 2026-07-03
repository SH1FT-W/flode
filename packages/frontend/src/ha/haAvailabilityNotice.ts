import { toast } from 'sonner';
import { logger } from '@/lib/logger';

let hasNotified = false;

/**
 * Shows a single, dismissible toast the first time a native HA component
 * either fails to load or throws at runtime, instead of silently degrading
 * to FLODE's own fallback on every affected field with no explanation.
 * Deduped per session — later failures are logged only (via `logger`, which
 * is itself gated behind FLODE's debug flag).
 */
export function notifyHaComponentIssue(context: string): void {
  if (!hasNotified) {
    hasNotified = true;
    toast.warning('Native HA-Komponenten nicht verfügbar', {
      description: 'FLODE nutzt für einige Felder den eigenen Fallback statt HAs nativer UI.',
      duration: 6000,
    });
  }
  logger.warn(`[ha] ${context}`);
}

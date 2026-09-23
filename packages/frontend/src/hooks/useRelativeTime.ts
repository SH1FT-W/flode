import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Formatter for automation `last_triggered` timestamps: "just now", "5 min
 * ago", "3 h ago", "2 days ago", else a date.
 */
export function useRelativeTime(): (timestamp: string | undefined) => string {
  const { t } = useTranslation(['dialogs']);
  return useCallback(
    (timestamp) => {
      if (!timestamp) return t('dialogs:import.never');
      const date = new Date(timestamp);
      const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return t('dialogs:import.justNow');
      if (diffMins < 60) return t('dialogs:import.minutesAgo', { count: diffMins });
      if (diffHours < 24) return t('dialogs:import.hoursAgo', { count: diffHours });
      if (diffDays < 7) return t('dialogs:import.daysAgo', { count: diffDays });
      return date.toLocaleDateString();
    },
    [t]
  );
}

/** True when `timestamp` falls on the current local calendar day. */
export function isToday(timestamp: string | undefined, now: Date = new Date()): boolean {
  if (!timestamp) return false;
  return new Date(timestamp).toDateString() === now.toDateString();
}

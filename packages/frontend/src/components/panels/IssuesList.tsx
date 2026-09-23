import { AlertTriangle, ChevronRight, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type DisplayIssue, useFocusIssue } from '@/hooks/useFlowIssues';
import { nodeTypes } from '@/lib/node-catalog';
import { getNodeColorToken, NODE_COLORS } from '@/lib/node-colors';
import { cn } from '@/lib/utils';

interface IssuesListProps {
  issues: DisplayIssue[];
  /** Called after jumping to an issue (e.g. to close a dialog). */
  onNavigate?: () => void;
  /** Show the "no problems" state instead of rendering nothing. */
  showEmpty?: boolean;
}

/** Clickable list of save-blocking problems — each row jumps to its step. */
export function IssuesList({ issues, onNavigate, showEmpty = false }: IssuesListProps) {
  const { t } = useTranslation(['ui']);
  const focusIssue = useFocusIssue();

  if (issues.length === 0) {
    return showEmpty ? (
      <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-success text-xs">
        <CircleCheck className="size-4" />
        {t('ui:issues.none')}
      </div>
    ) : null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-warning/40 bg-warning/5">
      <div className="flex items-start gap-2 border-warning/30 border-b px-3 py-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <div className="font-semibold text-warning text-xs">
            {t('ui:issues.title', { count: issues.length })}
          </div>
          <div className="text-[11px] text-muted-foreground">{t('ui:issues.hint')}</div>
        </div>
      </div>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {issues.map((issue) => {
          const config = nodeTypes.find((c) => c.type === issue.nodeType);
          const Icon = config?.icon ?? AlertTriangle;
          return (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => {
                  focusIssue(issue);
                  onNavigate?.();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md',
                    issue.nodeType
                      ? NODE_COLORS[getNodeColorToken(issue.nodeType)].chip
                      : 'bg-warning/15 text-warning'
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground text-xs">
                    {issue.nodeLabel ?? t('ui:issues.automation')}
                  </span>
                  <span className="block text-muted-foreground text-xs">{issue.text}</span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

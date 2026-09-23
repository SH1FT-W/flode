import { memo } from 'react';
import { useMoreInfo } from '@/hooks/useMoreInfo';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { cn } from '@/lib/utils';
import { useEntityStateObject } from '@/store/hass-store';

/** States that read as "something is active" and get the warm glow dot. */
const ACTIVE_STATES = new Set([
  'on',
  'open',
  'opening',
  'home',
  'playing',
  'unlocked',
  'heat',
  'cool',
  'heating',
  'cleaning',
  'detected',
]);
const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

interface EntityStateChipProps {
  entityId: string;
}

/**
 * Live state of the entity a node is about, e.g. "● On" — clicking it opens
 * HA's more-info dialog. Renders nothing when the entity doesn't exist (yet).
 */
export const EntityStateChip = memo(function EntityStateChip({ entityId }: EntityStateChipProps) {
  // Subscribes to this one entity only — unrelated state changes don't re-render the card.
  const stateObj = useEntityStateObject(entityId);
  const summary = useSummaryContext();
  const openMoreInfo = useMoreInfo();
  if (!stateObj) return null;

  const unit = stateObj.attributes?.unit_of_measurement;
  const label =
    typeof unit === 'string' && unit && !Number.isNaN(Number(stateObj.state))
      ? `${stateObj.state} ${unit}`
      : summary.stateLabel(entityId, stateObj.state);
  const isActive = ACTIVE_STATES.has(stateObj.state);
  const isUnavailable = UNAVAILABLE_STATES.has(stateObj.state);

  return (
    <button
      type="button"
      className="nodrag nopan mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pr-2 pl-1.5 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        openMoreInfo(entityId);
      }}
      title={entityId}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full bg-muted-foreground/60',
          isActive && 'bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.22)]',
          isUnavailable && 'bg-destructive'
        )}
      />
      <span className="truncate">{label}</span>
    </button>
  );
});

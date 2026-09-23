import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface HomeCardProps {
  onOpen: () => void;
  /** Dimmed (e.g. a disabled automation). */
  muted?: boolean;
  children: ReactNode;
}

/**
 * Clickable start-screen card (automations, scripts). Not a <button>: cards
 * contain their own controls (switch, run button), and interactive elements
 * must not be nested inside a button.
 */
export function HomeCard({ onOpen, muted, children }: HomeCardProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: see above
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card px-4 pt-3.5 pb-3 text-left shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        muted && 'opacity-65'
      )}
    >
      {children}
    </div>
  );
}

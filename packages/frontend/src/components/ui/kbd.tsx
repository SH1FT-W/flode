import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-muted/60 px-1.5 font-medium font-sans text-[11px] text-muted-foreground tabular-nums',
        className
      )}
      {...props}
    />
  );
}

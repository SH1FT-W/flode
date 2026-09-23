import * as React from 'react';
import { cn } from '@/lib/utils';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  side: 'left' | 'right';
  className?: string;
  /** localStorage key to remember the dragged width across sessions. */
  storageKey?: string;
}

/** Stored width, if any and within bounds; storage may be unavailable (private mode). */
function readStoredWidth(key: string | undefined, min: number, max: number): number | undefined {
  if (!key) return undefined;
  try {
    const value = Number(window.localStorage.getItem(key));
    return value >= min && value <= max ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredWidth(key: string | undefined, width: number): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Storage unavailable — the width still applies for this session.
  }
}

export function ResizablePanel({
  children,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  side,
  className,
  storageKey,
}: ResizablePanelProps) {
  const [width, setWidth] = React.useState(
    () => readStoredWidth(storageKey, minWidth, maxWidth) ?? defaultWidth
  );
  const widthRef = React.useRef(width);
  widthRef.current = width;
  const [isResizing, setIsResizing] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      let newWidth: number;

      if (side === 'right') {
        newWidth = panelRect.right - e.clientX;
      } else {
        newWidth = e.clientX - panelRect.left;
      }

      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      writeStoredWidth(storageKey, widthRef.current);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth, side, storageKey]);

  return (
    <div ref={panelRef} className={cn('relative flex flex-col', className)} style={{ width }}>
      {/* Resize handle */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: this element is intentionally interactive */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/20',
          side === 'right' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
          isResizing && 'bg-primary/30'
        )}
      />
      {children}
    </div>
  );
}

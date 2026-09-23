import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Command, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { resolveNodeAction, useNodeActions } from '@/hooks/useNodeActions';
import { formatShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { fitViewOptions } from '@/lib/viewport';
import { useUiStore } from '@/store/ui-store';

/** Node actions that get a permanent spot in the dock; the rest live in ⌘K and the context menu. */
const DOCK_ACTIONS = ['undo', 'redo'] as const;

function withShortcut(label: string, shortcut: string | undefined): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

function DockSeparator() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

interface DockButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Toggle buttons: shows the on state and exposes it via aria-pressed. */
  pressed?: boolean;
  children: ReactNode;
  wide?: boolean;
}

function DockButton({ label, onClick, disabled, pressed, children, wide }: DockButtonProps) {
  return (
    <Button
      variant="ghost"
      size={wide ? 'default' : 'icon'}
      className={cn(
        'h-9 rounded-[10px]',
        wide ? 'px-3' : 'w-9',
        pressed && 'bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary'
      )}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

/** Floating glass toolbar at the bottom of the canvas: history, tidy up, zoom, command palette. */
export function CanvasDock() {
  const { t } = useTranslation(['ui']);
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const openDialog = useUiStore((s) => s.openDialog);
  const minimapVisible = useUiStore((s) => s.minimapVisible);
  const toggleMinimap = useUiStore((s) => s.toggleMinimap);
  const { actions, context } = useNodeActions();
  const tidy = actions.find((a) => a.name === 'tidy');

  return (
    <Panel position="bottom-center" className="mb-5!">
      <div
        role="toolbar"
        aria-label={t('ui:dock.label')}
        className="flode-glass flex items-center gap-0.5 rounded-[14px] border border-border p-1 shadow-float"
      >
        {DOCK_ACTIONS.map((name) => {
          const action = actions.find((a) => a.name === name);
          if (!action) return null;
          const { label, icon: Icon, enabled } = resolveNodeAction(action, context);
          return (
            <DockButton
              key={name}
              label={withShortcut(label, formatShortcut(action.shortcut))}
              onClick={() => action.execute(context)}
              disabled={!enabled}
            >
              <Icon />
            </DockButton>
          );
        })}
        {tidy && (
          <>
            <DockSeparator />
            <DockButton
              wide
              label={withShortcut(t('ui:dock.tidy'), formatShortcut(tidy.shortcut))}
              onClick={() => tidy.execute(context)}
              disabled={!resolveNodeAction(tidy, context).enabled}
            >
              <tidy.icon />
              {t('ui:dock.tidy')}
            </DockButton>
          </>
        )}
        <DockSeparator />
        <DockButton label={t('ui:dock.zoomOut')} onClick={() => void zoomOut({ duration: 200 })}>
          <Minus />
        </DockButton>
        <span className="w-12 text-center font-semibold text-muted-foreground text-xs tabular-nums">
          {`${Math.round(zoom * 100)} %`}
        </span>
        <DockButton label={t('ui:dock.zoomIn')} onClick={() => void zoomIn({ duration: 200 })}>
          <Plus />
        </DockButton>
        <DockButton label={t('ui:dock.fit')} onClick={() => void fitView(fitViewOptions())}>
          <Maximize />
        </DockButton>
        <DockButton label={t('ui:dock.minimap')} onClick={toggleMinimap} pressed={minimapVisible}>
          <MapIcon />
        </DockButton>
        <DockSeparator />
        <DockButton
          label={withShortcut(t('ui:dock.palette'), formatShortcut('ctrl+k'))}
          onClick={() => openDialog('palette')}
        >
          <Command />
        </DockButton>
      </div>
    </Panel>
  );
}

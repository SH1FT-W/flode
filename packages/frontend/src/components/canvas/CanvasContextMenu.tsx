import { AlignHorizontalJustifyStart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeAction, NodeActionContext } from '@/components/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resolveNodeAction, useNodeActions } from '@/hooks/useNodeActions';
import { formatShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

export interface ContextMenuState {
  x: number;
  y: number;
  target: 'node' | 'pane';
}

/** Menu sections per target — names refer to `useNodeActions`' actions. */
const NODE_SECTIONS = [
  ['duplicate', 'copy', 'cut', 'paste'],
  ['toggle-enabled', 'disconnect'],
] as const;
const ALIGN_ACTIONS = ['align-left', 'align-right', 'align-top', 'align-bottom'] as const;
const PANE_SECTIONS = [['paste', 'selectAll'], ['tidy']] as const;

interface ActionItemProps {
  action: NodeAction;
  context: NodeActionContext;
}

function ActionItem({ action, context }: ActionItemProps) {
  const { label, icon: Icon, enabled } = resolveNodeAction(action, context);
  return (
    <DropdownMenuItem
      disabled={!enabled}
      onSelect={() => action.execute(context)}
      className={cn(
        action.variant === 'destructive' && 'text-destructive focus:bg-destructive focus:text-white'
      )}
    >
      <Icon />
      <span>{label}</span>
      {action.shortcut && (
        <DropdownMenuShortcut>{formatShortcut(action.shortcut)}</DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

interface CanvasContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
}

/** Right-click menu for nodes and the empty canvas, built from the shared node actions. */
export function CanvasContextMenu({ state, onClose }: CanvasContextMenuProps) {
  const { t } = useTranslation(['common']);
  const { actions, context } = useNodeActions();
  const byName = (name: string) => actions.find((a) => a.name === name);
  const sections = state?.target === 'node' ? NODE_SECTIONS : PANE_SECTIONS;
  const deleteAction = byName('delete');
  const alignActions = ALIGN_ACTIONS.map(byName).filter((a): a is NodeAction => a !== undefined);
  const canAlign = context.selectedNodes.length >= 2;

  return (
    <DropdownMenu
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: state?.x ?? 0,
            top: state?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {sections.map((section, index) => (
          <div key={section.join()}>
            {index > 0 && <DropdownMenuSeparator />}
            {section.map((name) => {
              const action = byName(name);
              return action ? <ActionItem key={name} action={action} context={context} /> : null;
            })}
          </div>
        ))}
        {state?.target === 'node' && (
          <>
            {canAlign && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AlignHorizontalJustifyStart />
                    {t('toolbar.align')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {alignActions.map((action) => (
                      <ActionItem key={action.name} action={action} context={context} />
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {deleteAction && (
              <>
                <DropdownMenuSeparator />
                <ActionItem action={deleteAction} context={context} />
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

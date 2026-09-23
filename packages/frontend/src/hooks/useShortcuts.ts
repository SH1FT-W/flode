import { useEffect } from 'react';
import { useAppCommands } from '@/hooks/useAppCommands';
import { useNodeActions } from '@/hooks/useNodeActions';
import { isTypingTarget, matchesShortcut } from '@/lib/shortcuts';
import { useUiStore } from '@/store/ui-store';

/** Takes a handled shortcut away from the browser and from Home Assistant's own hotkeys. */
function claim(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Modifier combos that stay active while a text field has focus. */
const ALWAYS_ACTIVE = new Set(['palette', 'save']);

/**
 * Global keyboard shortcuts — app commands in every view, canvas node actions
 * only in the editor. Suspended while a dialog is open (dialogs handle their
 * own keys) and, apart from ⌘K/⌘S, while typing in a text field.
 */
export function useShortcuts(): void {
  const view = useUiStore((s) => s.view);
  const dialog = useUiStore((s) => s.dialog);
  const commands = useAppCommands();
  const { actions, context } = useNodeActions();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialog !== null || event.isComposing) return;
      const typing = isTypingTarget(event);

      const command = commands.find(
        (c) =>
          c.views.includes(view) &&
          matchesShortcut(event, c.shortcut) &&
          (!typing || ALWAYS_ACTIVE.has(c.id))
      );
      if (command) {
        claim(event);
        command.run();
        return;
      }

      if (view !== 'editor' || typing) return;
      const action = actions.find(
        (a) => matchesShortcut(event, a.shortcut) && (a.isEnabled ? a.isEnabled(context) : true)
      );
      if (action) {
        claim(event);
        action.execute(context);
      }
    };

    // Capture phase on window runs before Home Assistant's own (bubbling)
    // hotkey listeners — HA 2026.x binds ⌘K to its own search, which would
    // otherwise open on top of FLODE's command palette.
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [view, dialog, commands, actions, context]);
}

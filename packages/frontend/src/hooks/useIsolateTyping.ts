import { useEffect } from 'react';

/**
 * Keeps plain keystrokes (no ⌘/Ctrl/Alt) inside FLODE away from Home
 * Assistant's global single-key hotkeys ("e" = entity search, "c" = commands,
 * "a" = Assist, "m" = My link …) — both while typing in FLODE's fields and on
 * the canvas.
 *
 * HA listens on `window`; stopping the event at `document` (bubble phase)
 * happens after FLODE's own handlers (React's root listener inside the
 * shadow tree, Radix menus, cmdk, FLODE's shortcuts on window-capture) have
 * seen it, so nothing inside FLODE loses a key. Only active while FLODE is
 * mounted, i.e. while its panel is open.
 */
export function useIsolateTyping(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPlainKey =
        event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isPlainKey) event.stopPropagation();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}

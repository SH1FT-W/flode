import i18n from '@/i18n';
import { isMacOS } from '@/utils/useAgentPlatform';

/**
 * Shortcuts are written platform-neutrally as `ctrl+shift+k` — `ctrl` means
 * ⌘ on macOS and Ctrl elsewhere (same convention the node actions already use).
 */
export type ShortcutSpec = string | readonly string[];

export function shortcutList(spec: ShortcutSpec | undefined): readonly string[] {
  if (!spec) return [];
  return typeof spec === 'string' ? [spec] : spec;
}

/** Normalized shortcut string for a keyboard event, e.g. "ctrl+shift+k". */
export function eventToShortcut(event: KeyboardEvent): string {
  const modifier = isMacOS() ? event.metaKey : event.ctrlKey;
  let shortcut = '';
  if (modifier) shortcut += 'ctrl+';
  // Shift is implied by symbols like "?" (it's how they're typed), so it's
  // only recorded for letters, digits and named keys.
  const shiftImplied = event.key.length === 1 && !/[a-z0-9]/i.test(event.key);
  if (event.shiftKey && !shiftImplied) shortcut += 'shift+';
  if (event.altKey) shortcut += 'alt+';
  return shortcut + event.key.toLowerCase();
}

export function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec | undefined): boolean {
  const pressed = eventToShortcut(event);
  return shortcutList(spec).includes(pressed);
}

const MAC_SYMBOLS: Record<string, string> = {
  ctrl: '⌘',
  shift: '⇧',
  alt: '⌥',
  backspace: '⌫',
  delete: '⌦',
  enter: '↵',
  escape: 'esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

/** Keys whose name is printed on Windows/Linux keyboards in the user's language (Strg, Umschalt, Entf …). */
const LOCALIZED_KEYS = new Set(['ctrl', 'shift', 'alt', 'delete']);

const OTHER_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  backspace: '⌫',
  delete: 'Del',
  enter: 'Enter',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

function otherLabel(part: string): string {
  if (LOCALIZED_KEYS.has(part)) {
    return i18n.t(`common:shortcuts.${part}`, { defaultValue: OTHER_LABELS[part] });
  }
  return OTHER_LABELS[part] ?? part.toUpperCase();
}

/**
 * Display form of the first variant of a shortcut: "⌘⇧F" on macOS,
 * "Ctrl+Shift+F" elsewhere — "Strg+Umschalt+F" on a German Windows.
 */
export function formatShortcut(spec: ShortcutSpec | undefined): string | undefined {
  const first = shortcutList(spec)[0];
  if (!first) return undefined;
  const mac = isMacOS();
  const parts = first
    .split('+')
    .map((part) => (mac ? (MAC_SYMBOLS[part] ?? part.toUpperCase()) : otherLabel(part)));
  return mac ? parts.join('') : parts.join('+');
}

/**
 * True when a key event comes from a text field — shortcuts must not fire
 * while typing. Uses `composedPath()[0]` because FLODE runs inside a Shadow
 * DOM in panel mode, where `event.target` is retargeted to the shadow host.
 */
export function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    // HA's own web components (ha-textfield, ha-code-editor …) render their
    // inputs in nested shadow roots; composedPath()[0] already points at them.
    target.closest('[contenteditable="true"]') !== null
  );
}

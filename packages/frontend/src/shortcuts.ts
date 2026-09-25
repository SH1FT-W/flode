/**
 * FLODE 3's keyboard shortcuts in one table — the panel binds them, ⌘K shows
 * them as hints and the overview (?) lists them, so they can't drift apart.
 * Keys are written platform-neutrally: `mod` is ⌘ on macOS and Ctrl elsewhere.
 */
import type { StringKey } from './strings';

export type ShortcutId =
  | 'palette'
  | 'templates'
  | 'shortcuts'
  | 'save'
  | 'saveCopy'
  | 'undo'
  | 'redo'
  | 'add'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'toggleEnabled'
  | 'delete'
  | 'tidy'
  | 'fit'
  | 'minimap';

export type ShortcutGroup = 'general' | 'edit' | 'view';

export interface Shortcut {
  id: ShortcutId;
  group: ShortcutGroup;
  keys: readonly string[];
  label: StringKey;
  /** Works on the start page too (everything else needs an open flow). */
  global?: boolean;
  /** Belongs to text while typing in a field — only fires outside of inputs. */
  notInText?: boolean;
  /** Bound elsewhere (the canvas handles delete itself) — listed only. */
  listOnly?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'palette', group: 'general', keys: ['mod+k'], label: 'paletteTitle', global: true },
  { id: 'templates', group: 'general', keys: ['mod+j'], label: 'tplTitle', global: true },
  {
    id: 'shortcuts',
    group: 'general',
    keys: ['?'],
    label: 'shortcutsTitle',
    global: true,
    notInText: true,
  },
  { id: 'save', group: 'general', keys: ['mod+s'], label: 'save' },
  { id: 'saveCopy', group: 'general', keys: ['mod+shift+s'], label: 'ioSaveCopy' },
  { id: 'undo', group: 'edit', keys: ['mod+z'], label: 'undo', notInText: true },
  { id: 'redo', group: 'edit', keys: ['mod+shift+z', 'mod+y'], label: 'redo', notInText: true },
  { id: 'add', group: 'edit', keys: ['mod+b'], label: 'add', notInText: true },
  { id: 'copy', group: 'edit', keys: ['mod+c'], label: 'copyCard', notInText: true },
  { id: 'paste', group: 'edit', keys: ['mod+v'], label: 'pasteCard', notInText: true },
  { id: 'duplicate', group: 'edit', keys: ['mod+d'], label: 'duplicateCard', notInText: true },
  {
    id: 'toggleEnabled',
    group: 'edit',
    keys: ['mod+e'],
    label: 'toggleEnabledCard',
    notInText: true,
  },
  {
    id: 'delete',
    group: 'edit',
    keys: ['backspace', 'delete'],
    label: 'deleteCard',
    listOnly: true,
  },
  { id: 'tidy', group: 'view', keys: ['mod+shift+f'], label: 'tidy', notInText: true },
  { id: 'fit', group: 'view', keys: ['shift+f'], label: 'fit', notInText: true },
  { id: 'minimap', group: 'view', keys: ['shift+m'], label: 'minimap', notInText: true },
];

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** The pressed combination in table notation, e.g. "mod+shift+z". */
function eventKeys(event: KeyboardEvent): string {
  const mod = isMac() ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();
  // Shift is how symbols like "?" are typed — it's part of the key, not a modifier.
  const shiftIsKey = key.length === 1 && !/[a-z0-9]/.test(key);
  return `${mod ? 'mod+' : ''}${event.shiftKey && !shiftIsKey ? 'shift+' : ''}${event.altKey ? 'alt+' : ''}${key}`;
}

export function matchShortcut(event: KeyboardEvent): Shortcut | undefined {
  const pressed = eventKeys(event);
  return SHORTCUTS.find((shortcut) => !shortcut.listOnly && shortcut.keys.includes(pressed));
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
  backspace: '⌫',
  delete: '⌦',
};
const OTHER_NAMES: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  backspace: 'Backspace',
  delete: 'Del',
};

/** One combination for display: "⇧⌘Z" on a Mac, "Ctrl+Shift+Z" elsewhere. */
export function formatKeys(keys: string): string {
  const mac = isMac();
  const parts = keys.split('+').map((part) => {
    const named = (mac ? MAC_SYMBOLS : OTHER_NAMES)[part];
    return named ?? part.toUpperCase();
  });
  if (!mac) return parts.join('+');
  // macOS order: ⇧ before ⌘ (as in the menus).
  return parts.sort((a, b) => (a === '⇧' ? -1 : b === '⇧' ? 1 : 0)).join('');
}

/** The first combination of a shortcut, for hints (⌘K rows, tooltips). */
export function shortcutHint(id: string): string | undefined {
  const keys = SHORTCUTS.find((shortcut) => shortcut.id === id)?.keys[0];
  return keys ? formatKeys(keys) : undefined;
}

/** A tooltip with its shortcut, e.g. "Aufräumen (⇧⌘F)". */
export function labelWithHint(label: string, id: ShortcutId): string {
  const hint = shortcutHint(id);
  return hint ? `${label} (${hint})` : label;
}

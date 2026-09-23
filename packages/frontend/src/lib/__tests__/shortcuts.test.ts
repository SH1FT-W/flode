import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/useAgentPlatform', () => ({ isMacOS: () => true }));

const { eventToShortcut, formatShortcut, matchesShortcut, shortcutList } = await import(
  '../shortcuts'
);

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

describe('shortcuts (macOS)', () => {
  it('maps ⌘ to ctrl and lower-cases the key', () => {
    expect(eventToShortcut(keyEvent({ key: 'K', metaKey: true }))).toBe('ctrl+k');
    expect(eventToShortcut(keyEvent({ key: 'F', metaKey: true, shiftKey: true }))).toBe(
      'ctrl+shift+f'
    );
  });

  it('treats shift as implied for typed symbols like "?"', () => {
    expect(eventToShortcut(keyEvent({ key: '?', shiftKey: true }))).toBe('?');
  });

  it('matches any variant of a multi-shortcut', () => {
    expect(matchesShortcut(keyEvent({ key: 'Backspace' }), ['delete', 'backspace'])).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'x' }), 'ctrl+x')).toBe(false);
  });

  it('formats with macOS symbols', () => {
    expect(formatShortcut('ctrl+shift+f')).toBe('⌘⇧F');
    expect(formatShortcut(['delete', 'backspace'])).toBe('⌦');
    expect(formatShortcut(undefined)).toBeUndefined();
  });

  it('normalizes single and list specs', () => {
    expect(shortcutList('ctrl+s')).toEqual(['ctrl+s']);
    expect(shortcutList(undefined)).toEqual([]);
  });
});

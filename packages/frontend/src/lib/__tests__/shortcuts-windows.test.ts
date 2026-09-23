import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/useAgentPlatform', () => ({ isMacOS: () => false }));

const { default: i18n } = await import('@/i18n');
const { eventToShortcut, formatShortcut } = await import('../shortcuts');

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

describe('shortcuts (Windows/Linux)', () => {
  it('maps Ctrl (not the Windows key) to ctrl', () => {
    expect(eventToShortcut(keyEvent({ key: 'k', ctrlKey: true }))).toBe('ctrl+k');
    expect(eventToShortcut(keyEvent({ key: 'k', metaKey: true }))).toBe('k');
  });

  it('formats with English key names', async () => {
    await i18n.changeLanguage('en');
    expect(formatShortcut('ctrl+shift+f')).toBe('Ctrl+Shift+F');
    expect(formatShortcut('delete')).toBe('Del');
  });

  it('formats with the key names printed on German keyboards', async () => {
    await i18n.changeLanguage('de');
    expect(formatShortcut('ctrl+shift+f')).toBe('Strg+Umschalt+F');
    expect(formatShortcut('ctrl+k')).toBe('Strg+K');
    expect(formatShortcut('delete')).toBe('Entf');
    await i18n.changeLanguage('en');
  });
});

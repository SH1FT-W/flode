import { afterEach, describe, expect, it } from 'vitest';
import { copyToClipboard } from '../notify';

function toasts(): { target: EventTarget; messages: string[] } {
  const target = new EventTarget();
  const messages: string[] = [];
  target.addEventListener('hass-notification', (event) => {
    if (event instanceof CustomEvent) messages.push(String(event.detail.message));
  });
  return { target, messages };
}

function setClipboard(clipboard: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true });
}

describe('copyToClipboard', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  it('says "copied" only once the text is on the clipboard', async () => {
    const written: string[] = [];
    setClipboard({ writeText: async (text) => void written.push(text) });
    const { target, messages } = toasts();
    await copyToClipboard(target, () => 'a: 1', 'Kopiert');
    expect(written).toEqual(['a: 1']);
    expect(messages).toEqual(['Kopiert']);
  });

  it('reports a refused or missing clipboard instead of "copied"', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('denied')) });
    const refused = toasts();
    await copyToClipboard(refused.target, () => 'a: 1', 'Kopiert');
    expect(refused.messages).toEqual(['denied']);

    setClipboard(undefined);
    const missing = toasts();
    await copyToClipboard(missing.target, () => 'a: 1', 'Kopiert');
    expect(missing.messages).toHaveLength(1);
    expect(missing.messages[0]).not.toBe('Kopiert');
  });
});

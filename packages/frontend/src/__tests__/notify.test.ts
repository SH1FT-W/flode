import { afterEach, describe, expect, it } from 'vitest';
import { copyToClipboard, notify } from '../notify';

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

describe('notify', () => {
  it("hands HA's toast a button only when there is one", () => {
    const target = new EventTarget();
    const details: unknown[] = [];
    target.addEventListener('hass-notification', (event) => {
      if (event instanceof CustomEvent) details.push(event.detail);
    });
    let undone = 0;
    notify(target, 'Aufgeräumt', { text: 'Rückgängig', action: () => undone++ });
    notify(target, 'Gespeichert');
    expect(details[1]).toEqual({ message: 'Gespeichert' });
    const first = details[0];
    expect(first).toMatchObject({ message: 'Aufgeräumt', action: { text: 'Rückgängig' } });
    if (first && typeof first === 'object' && 'action' in first) {
      const { action } = first;
      if (
        action &&
        typeof action === 'object' &&
        'action' in action &&
        typeof action.action === 'function'
      )
        action.action();
    }
    expect(undone).toBe(1);
  });
});

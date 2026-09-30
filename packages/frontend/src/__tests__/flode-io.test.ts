import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The hidden file input `pickFlowJson` creates, without a DOM. */
class FakeInput extends EventTarget {
  type = '';
  accept = '';
  files: { text: () => Promise<string> }[] | null = null;
  click(): void {
    // The test plays the user: it fires `change` / `cancel` itself.
  }
}

let input: FakeInput;

beforeEach(() => {
  input = new FakeInput();
  Object.assign(globalThis, {
    document: { createElement: () => input, createTreeWalker: () => ({}) },
    customElements: { get: () => undefined, define: () => undefined },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'customElements');
});

describe('pickFlowJson', () => {
  it('resolves with nothing when the file dialog is cancelled', async () => {
    const { pickFlowJson } = await import('../flode-io');
    const picked = pickFlowJson();
    input.dispatchEvent(new Event('cancel'));
    await expect(picked).resolves.toBeNull();
  });

  it('rejects when the chosen file cannot be read', async () => {
    const { pickFlowJson } = await import('../flode-io');
    const picked = pickFlowJson();
    input.files = [{ text: () => Promise.reject(new Error('unreadable')) }];
    input.dispatchEvent(new Event('change'));
    await expect(picked).rejects.toThrow('unreadable');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { defineElement } from '../define-element';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'customElements');
  Reflect.deleteProperty(globalThis, 'HTMLElement');
});

describe('defineElement', () => {
  it('leaves an already defined tag alone (a newer bundle loaded into an open page)', () => {
    const registry = new Map<string, CustomElementConstructor>();
    Object.assign(globalThis, {
      HTMLElement: class {},
      customElements: {
        get: (tag: string) => registry.get(tag),
        define: (tag: string, element: CustomElementConstructor) => {
          if (registry.has(tag)) throw new Error(`"${tag}" has already been used`);
          registry.set(tag, element);
        },
      },
    });
    class First extends HTMLElement {}
    class Second extends HTMLElement {}
    defineElement('flode-panel', First);
    expect(() => defineElement('flode-panel', Second)).not.toThrow();
    expect(registry.get('flode-panel')).toBe(First);
  });
});

/**
 * Registers a FLODE element once. After an update HA loads the new bundle
 * (new `?v=`) into a page that still has the old one — defining the same tag
 * again would throw "already been used"; the open page keeps the old one
 * until it is reloaded.
 */
export function defineElement(tag: string, element: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, element);
}

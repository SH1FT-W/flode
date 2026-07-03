import { createElement, useEffect, useRef } from 'react';
import { useHass } from '@/contexts/HassContext';

export interface HaElementProps {
  /** Custom element tag name, e.g. `ha-entity-picker`. */
  tag: string;
  /**
   * Set as real JS properties on the element (not HTML attributes) — HA's
   * Lit components expect complex values (arrays, objects, `hass`) this way.
   * `hass` from context is merged in automatically on every update.
   */
  properties?: Record<string, unknown>;
  /** Event name → handler, wired via `addEventListener`/removed on cleanup. HA's convention: `value-changed` with `ev.detail.value`. */
  events?: Record<string, (ev: CustomEvent) => void>;
  className?: string;
}

/**
 * Generic React wrapper around a single HA custom element. This is the ONLY
 * place that should touch a `ha-*` tag directly — typed convenience
 * components (HaEntityPicker, HaSelector, ...) build on top of it. See
 * docs/ha-native-migration.md for why: HA's web components are undocumented
 * internal API, so every usage goes through one place that can adapt if
 * property/event names change.
 */
export function HaElement({ tag, properties, events, className }: HaElementProps) {
  const ref = useRef<HTMLElement>(null);
  const { hass } = useHass();

  // Re-set properties (incl. fresh `hass`) on every render — pickers need a
  // live `hass` to resolve entity states, friendly names, and icons.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Custom elements have an element-specific property surface TypeScript
    // can't know about — this is the external-API boundary the cast exists for.
    const target = el as unknown as Record<string, unknown>;
    target.hass = hass;
    for (const [key, value] of Object.entries(properties ?? {})) {
      target[key] = value;
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !events) return;
    const entries = Object.entries(events);
    for (const [name, handler] of entries) {
      el.addEventListener(name, handler as EventListener);
    }
    return () => {
      for (const [name, handler] of entries) {
        el.removeEventListener(name, handler as EventListener);
      }
    };
  }, [events]);

  return createElement(tag, { ref, className });
}

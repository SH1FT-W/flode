import { createElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { useHass } from '@/contexts/HassContext';
import { notifyHaComponentIssue } from './haAvailabilityNotice';

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
  /**
   * Rendered instead of the custom element if setting a property throws —
   * a breaking change in an undocumented HA component should degrade to
   * FLODE's own control, not crash the editor. A plain try/catch is used
   * rather than a React error boundary because the failure happens inside
   * an effect (setting properties on the DOM element), which error
   * boundaries don't catch.
   */
  fallback?: ReactNode;
}

/** Cheap, order-independent enough for the small config objects/arrays HA selectors take. */
function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Generic React wrapper around a single HA custom element. This is the ONLY
 * place that should touch a `ha-*` tag directly — typed convenience
 * components (HaEntityPicker, HaSelector, ...) build on top of it. See
 * docs/ha-native-migration.md for why: HA's web components are undocumented
 * internal API, so every usage goes through one place that can adapt if
 * property/event names change.
 */
export function HaElement({ tag, properties, events, className, fallback }: HaElementProps) {
  const ref = useRef<HTMLElement>(null);
  const { hass } = useHass();
  const [hasError, setHasError] = useState(false);
  // Tracks the last value actually written per property, so passing a fresh
  // object/array literal each render (e.g. `selector={{ time: {} }}`) with
  // the same content doesn't look like a change to the target element. Some
  // HA components (e.g. ha-selector) tear down and rebuild their internal
  // sub-component whenever a property's *reference* changes, which would
  // otherwise reset user input (e.g. mid-typing in a time field) on every
  // unrelated re-render.
  const lastValues = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (hasError) return;
    const el = ref.current;
    if (!el) return;
    try {
      // Custom elements have an element-specific property surface TypeScript
      // can't know about — this is the external-API boundary the cast exists for.
      const target = el as unknown as Record<string, unknown>;
      const allProps = { ...properties, hass };
      for (const [key, value] of Object.entries(allProps)) {
        if (isEqualValue(lastValues.current[key], value)) continue;
        target[key] = value;
        lastValues.current[key] = value;
      }
    } catch (error) {
      setHasError(true);
      notifyHaComponentIssue(`<${tag}> threw while setting properties: ${String(error)}`);
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !events || hasError) return;
    const entries = Object.entries(events);
    for (const [name, handler] of entries) {
      el.addEventListener(name, handler as EventListener);
    }
    return () => {
      for (const [name, handler] of entries) {
        el.removeEventListener(name, handler as EventListener);
      }
    };
  }, [events, hasError]);

  if (hasError) return <>{fallback}</>;

  return createElement(tag, { ref, className });
}

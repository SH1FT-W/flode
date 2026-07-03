import { useEffect, useState } from 'react';
import { ensureHaComponents } from './haComponentLoader';

/**
 * Whether all HA components in `names` are available (loaded or already
 * registered). Used by the typed HA*-wrapper components to decide between
 * rendering the native HA component or their `fallback`. Starts `false`
 * (fallback shown) until the check resolves — HA components are never
 * available synchronously on first render.
 */
export function useHaComponentsAvailable(names: string[]): boolean {
  const key = names.join(',');
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reconstructed from `key` rather than closing over `names` directly —
    // callers typically pass a fresh array literal each render, and we only
    // want to re-probe when the actual component list changes.
    ensureHaComponents(key.split(',')).then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return available;
}

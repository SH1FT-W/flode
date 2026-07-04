import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-category-picker'];

export interface HaCategoryPickerProps {
  value?: string;
  onChange: (value: string) => void;
  /** Category registry is scoped per domain, e.g. `"automation"` or `"scene"`. */
  scope: string;
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-category-picker` when it isn't available. */
  fallback?: ReactNode;
}

/**
 * `ha-category-picker` — native HA category picker for the given domain
 * scope. Handles creating new categories itself (fires `value-changed` with
 * the new category's id once created) — no separate creation call needed.
 */
export function HaCategoryPicker({
  value,
  onChange,
  scope,
  label,
  disabled,
  fallback = null,
}: HaCategoryPickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-category-picker"
      properties={{ value, scope, label, disabled }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string }).value),
      }}
      fallback={fallback}
    />
  );
}

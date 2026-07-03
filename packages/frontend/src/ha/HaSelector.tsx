import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-selector'];

/**
 * HA's selector config shape, e.g. `{ entity: {} }`, `{ action: {} }`,
 * `{ device: { multiple: true } }`, `{ number: { min: 0, max: 100 } }`.
 * Kept loose (undocumented, evolves with HA versions) — see
 * home-assistant/frontend's `src/data/selector.ts` for the current set.
 */
export type HaSelectorConfig = Record<string, unknown>;

export interface HaSelectorProps {
  selector: HaSelectorConfig;
  value?: unknown;
  onChange: (value: unknown) => void;
  label?: string;
  helper?: string;
  disabled?: boolean;
  required?: boolean;
  /** Rendered instead of `ha-selector` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/**
 * `ha-selector` — HA's generic, schema-driven selector. The single most
 * powerful native component: one element covers entity/device/area/number/
 * boolean/select/action (service call with full parameter UI) and more,
 * simply by varying `selector`.
 */
export function HaSelector({
  selector,
  value,
  onChange,
  label,
  helper,
  disabled,
  required,
  fallback = null,
}: HaSelectorProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-selector"
      properties={{ selector, value, label, helper, disabled, required }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: unknown }).value),
      }}
    />
  );
}

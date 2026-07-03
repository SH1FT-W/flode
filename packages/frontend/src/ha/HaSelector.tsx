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
 * `ha-selector` — HA's generic, schema-driven selector. One element covers
 * entity/device/area/number/boolean/select and more, simply by varying
 * `selector`. NOT for picking a single service to call — HA's `action`
 * selector is for editing a full action *sequence* (a list of action
 * configs), a different value shape entirely; use `HaServicePicker` for
 * "which service does this ActionNode call".
 *
 * Defaults `required` to `false` (FLODE's fields are mostly optional) —
 * `ha-selector` itself defaults to `required: true`.
 */
export function HaSelector({
  selector,
  value,
  onChange,
  label,
  helper,
  disabled,
  required = false,
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

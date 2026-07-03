import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-switch'];

export interface HaSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Rendered instead of `ha-switch` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/**
 * `ha-switch` — native HA toggle. Unlike the other HA components here, it
 * fires a plain `change` event (not `value-changed`) and exposes the new
 * state as a `checked` property on the element itself, matching a native
 * `<input type="checkbox">`.
 */
export function HaSwitch({ checked, onChange, disabled, fallback = null }: HaSwitchProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-switch"
      properties={{ checked, disabled }}
      events={{
        change: (ev) => onChange((ev.currentTarget as unknown as { checked: boolean }).checked),
      }}
    />
  );
}

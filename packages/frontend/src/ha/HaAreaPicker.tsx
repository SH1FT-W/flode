import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-area-picker'];

export interface HaAreaPickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-area-picker` when it isn't available. */
  fallback?: ReactNode;
}

/** `ha-area-picker` — native HA area picker, can create new areas inline. */
export function HaAreaPicker({
  value,
  onChange,
  label,
  disabled,
  fallback = null,
}: HaAreaPickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-area-picker"
      properties={{ value, label, disabled }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string }).value),
      }}
      fallback={fallback}
    />
  );
}

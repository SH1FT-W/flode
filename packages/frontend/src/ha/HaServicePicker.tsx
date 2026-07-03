import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-service-picker'];

export interface HaServicePickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-service-picker` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/**
 * `ha-service-picker` — native HA service autocomplete (e.g. `light.turn_on`),
 * value is a plain `"domain.service"` string. Not to be confused with
 * `ha-selector`'s `action` selector, which represents a full action
 * *sequence*, not a single service id — see HaSelector.tsx.
 */
export function HaServicePicker({ value, onChange, label, disabled, fallback = null }: HaServicePickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-service-picker"
      properties={{ value, label, disabled }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string }).value),
      }}
    />
  );
}

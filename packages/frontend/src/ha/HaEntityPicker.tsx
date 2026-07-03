import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-entity-picker'];

export interface HaEntityPickerProps {
  value?: string;
  onChange: (value: string) => void;
  includeDomains?: string[];
  excludeDomains?: string[];
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-entity-picker` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/** `ha-entity-picker` — native HA entity autocomplete (icons, friendly names, domain filtering). */
export function HaEntityPicker({
  value,
  onChange,
  includeDomains,
  excludeDomains,
  label,
  disabled,
  fallback = null,
}: HaEntityPickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-entity-picker"
      properties={{
        value,
        label,
        disabled,
        includeDomains,
        excludeDomains,
      }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string }).value),
      }}
    />
  );
}

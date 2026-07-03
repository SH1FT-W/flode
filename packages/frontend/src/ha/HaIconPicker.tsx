import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-icon-picker'];

export interface HaIconPickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-icon-picker` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/** `ha-icon-picker` — native HA MDI icon picker with search and live preview. */
export function HaIconPicker({ value, onChange, label, disabled, fallback = null }: HaIconPickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-icon-picker"
      properties={{ value, label, disabled }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string }).value),
      }}
    />
  );
}

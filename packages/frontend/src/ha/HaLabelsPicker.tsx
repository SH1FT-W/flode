import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-labels-picker'];

export interface HaLabelsPickerProps {
  value?: string[];
  onChange: (value: string[]) => void;
  label?: string;
  disabled?: boolean;
  /** Rendered instead of `ha-labels-picker` when it isn't available. */
  fallback?: ReactNode;
}

/** `ha-labels-picker` — native HA multi-label picker, can create new labels inline. */
export function HaLabelsPicker({
  value,
  onChange,
  label,
  disabled,
  fallback = null,
}: HaLabelsPickerProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-labels-picker"
      properties={{ value: value ?? [], label, disabled }}
      events={{
        'value-changed': (ev) => onChange((ev.detail as { value: string[] }).value),
      }}
      fallback={fallback}
    />
  );
}

import type { ReactNode } from 'react';
import { HaElement } from './HaElement';
import { useHaComponentsAvailable } from './useHaComponentsAvailable';

const REQUIRED = ['ha-select'];

export interface HaSelectOption {
  value: string | number;
  label?: string;
  secondary?: string;
  disabled?: boolean;
}

export interface HaSelectProps {
  value?: string | number;
  onChange: (value: string | number | undefined) => void;
  options: HaSelectOption[] | string[] | number[];
  label?: string;
  helper?: string;
  disabled?: boolean;
  required?: boolean;
  /** Rendered instead of `ha-select` when it isn't available (standalone dev, incompatible HA version). */
  fallback?: ReactNode;
}

/**
 * `ha-select` — native HA dropdown. Takes an `options` array directly as a
 * property (no child items needed). Fires a `selected` event (not
 * `value-changed`) with the new value in `ev.detail.value`.
 */
export function HaSelect({
  value,
  onChange,
  options,
  label,
  helper,
  disabled,
  required = false,
  fallback = null,
}: HaSelectProps) {
  const available = useHaComponentsAvailable(REQUIRED);
  if (!available) return <>{fallback}</>;

  return (
    <HaElement
      tag="ha-select"
      properties={{ value, options, label, helper, disabled, required }}
      events={{
        selected: (ev) => onChange((ev.detail as { value: string | number | undefined }).value),
      }}
      fallback={fallback}
    />
  );
}

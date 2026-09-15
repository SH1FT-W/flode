import { FormField } from '@/components/forms/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HaSelect } from '@/ha';
import type { PlatformKind } from '@/hooks/useAutomationPlatformDescriptions';
import { usePlatformLabels } from '@/hooks/usePlatformLabels';

interface PlatformTypeSelectProps {
  kind: PlatformKind;
  label: string;
  value: string;
  /** FLODE's built-in classic types, listed first */
  staticTypes: readonly string[];
  /** Target-based types described by Home Assistant, appended after the static ones */
  describedTypes: readonly string[];
  onChange: (value: string) => void;
}

/**
 * Type dropdown shared by trigger and condition editors. The current value is
 * always offered, even if neither list knows it (e.g. offline), so it isn't lost.
 */
export function PlatformTypeSelect({
  kind,
  label,
  value,
  staticTypes,
  describedTypes,
  onChange,
}: PlatformTypeSelectProps) {
  const { getLabel } = usePlatformLabels(kind);
  const sortedDescribedTypes = [...describedTypes].sort();
  const types = [...new Set([...staticTypes, ...sortedDescribedTypes, value])].filter(Boolean);
  const options = types.map((type) => ({ value: type, label: getLabel(type) }));

  return (
    <FormField label={label} required>
      <HaSelect
        value={value}
        onChange={(v) => onChange(String(v))}
        options={options}
        fallback={
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </FormField>
  );
}

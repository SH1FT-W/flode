import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HaSelector } from '@/ha';

export type DurationValue =
  | string
  | {
      hours?: number | string;
      minutes?: number | string;
      seconds?: number | string;
      milliseconds?: number | string;
    };

type DurationObject = {
  hours?: number | string;
  minutes?: number | string;
  seconds?: number | string;
  milliseconds?: number | string;
};

/** Parses a legacy "HH:MM:SS[.ms]" string into the object shape — HA accepts both formats equally, but only the object form has a native picker. */
function parseDurationString(value: string): DurationObject {
  const match = /^([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return {};
  const [, h, m, s, ms] = match;
  return {
    hours: Number(h),
    minutes: Number(m),
    seconds: Number(s),
    ...(ms ? { milliseconds: Number(ms) } : {}),
  };
}

export interface DurationInputProps {
  value: DurationValue;
  onChange: (val: DurationValue) => void;
}

/**
 * Reusable duration input component without label/description wrapper.
 * Reads legacy string values ("HH:MM:SS") for backward compatibility, but
 * always writes the `{ hours, minutes, seconds, milliseconds }` object HA's
 * native duration selector uses — both formats are equally valid in HA
 * automation YAML, and only the object form has a native picker.
 */
export function DurationInput({ value, onChange }: DurationInputProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const obj: DurationObject =
    typeof value === 'string' ? parseDurationString(value) : (value ?? {});

  const handleObjChange = (field: 'hours' | 'minutes' | 'seconds' | 'milliseconds', v: string) => {
    const num = v === '' ? undefined : Number(v);
    const updated = {
      ...obj,
      [field]: Number.isNaN(num) ? undefined : num,
    };
    Object.keys(updated).forEach((k) => {
      const v = updated[k as keyof typeof updated];
      if (v === undefined || v === null) {
        delete updated[k as keyof typeof updated];
      }
    });
    onChange(updated);
  };

  return (
    <HaSelector
      selector={{ duration: { enable_millisecond: true } }}
      value={obj}
      onChange={(v) => {
        if (!v || typeof v !== 'object') return;
        const cleaned = Object.fromEntries(
          Object.entries(v as Record<string, unknown>).filter(
            ([, val]) => val !== undefined && val !== null
          )
        );
        onChange(cleaned);
      }}
      fallback={
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-muted-foreground text-xs">
              {t('nodes:durationField.hours')}
            </Label>
            <Input
              type="number"
              min={0}
              value={obj.hours ?? ''}
              onChange={(e) => handleObjChange('hours', e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-muted-foreground text-xs">
              {t('nodes:durationField.minutes')}
            </Label>
            <Input
              type="number"
              min={0}
              value={obj.minutes ?? ''}
              onChange={(e) => handleObjChange('minutes', e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-muted-foreground text-xs">
              {t('nodes:durationField.seconds')}
            </Label>
            <Input
              type="number"
              min={0}
              value={obj.seconds ?? ''}
              onChange={(e) => handleObjChange('seconds', e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-muted-foreground text-xs">
              {t('nodes:durationField.milliseconds')}
            </Label>
            <Input
              type="number"
              min={0}
              value={obj.milliseconds ?? ''}
              onChange={(e) => handleObjChange('milliseconds', e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>
      }
    />
  );
}

export interface DurationFieldProps {
  label?: string;
  description?: string;
  value: DurationValue;
  onChange: (val: DurationValue) => void;
  fieldKey?: string; // e.g. 'delay' or 'timeout'
}

/**
 * Duration field with FormField wrapper for label and description.
 */
export function DurationField({ label, description, value, onChange }: DurationFieldProps) {
  const { t } = useTranslation(['common', 'nodes']);

  return (
    <FormField
      label={label ?? t('nodes:durationField.label')}
      description={description || t('nodes:durationField.description')}
    >
      <DurationInput value={value} onChange={onChange} />
    </FormField>
  );
}

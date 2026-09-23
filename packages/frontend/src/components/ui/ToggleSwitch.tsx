import { HaSwitch } from '@/ha';
import { Switch } from './switch';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}

/** HA's native switch, with FLODE's own Radix switch as fallback (standalone dev / older HA). */
export function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  return (
    <HaSwitch
      checked={checked}
      onChange={onChange}
      ariaLabel={label}
      fallback={<Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />}
    />
  );
}

import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { HassEntity } from '@/types/hass';

export const DOMAIN_STATES: Record<string, string[]> = {
  light: ['on', 'off', 'unavailable'],
  switch: ['on', 'off', 'unavailable'],
  binary_sensor: ['on', 'off', 'unavailable'],
  input_boolean: ['on', 'off'],
  cover: ['open', 'closed', 'opening', 'closing', 'unavailable'],
  lock: ['locked', 'unlocked', 'locking', 'unlocking', 'unavailable'],
  alarm_control_panel: [
    'disarmed',
    'armed_home',
    'armed_away',
    'armed_night',
    'armed_vacation',
    'armed_custom_bypass',
    'pending',
    'arming',
    'disarming',
    'triggered',
    'unavailable',
  ],
  climate: ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'off', 'unavailable'],
  fan: ['on', 'off', 'unavailable'],
  media_player: ['playing', 'paused', 'idle', 'off', 'on', 'standby', 'buffering', 'unavailable'],
  vacuum: ['cleaning', 'docked', 'paused', 'idle', 'returning', 'error', 'unavailable'],
  person: ['home', 'not_home', 'unavailable'],
  device_tracker: ['home', 'not_home', 'unavailable'],
  water_heater: [
    'electric',
    'gas',
    'heat_pump',
    'eco',
    'performance',
    'high_demand',
    'off',
    'unavailable',
  ],
  humidifier: ['on', 'off', 'unavailable'],
  update: ['on', 'off', 'unavailable'],
};

export const GENERIC_STATES = ['on', 'off', 'unavailable', 'unknown'];

export function getStateSuggestions(entityId: string, entities: HassEntity[]): string[] {
  const entity = entities.find((e) => e.entity_id === entityId);
  const domain = entityId.split('.')[0];
  const domainStates = DOMAIN_STATES[domain] ?? GENERIC_STATES;
  if (entity?.state) {
    return [entity.state, ...domainStates.filter((s) => s !== entity.state)];
  }
  return domainStates;
}

interface StateValueComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder: string;
}

function getStateLabel(state: string, t: (key: string, opts: { defaultValue: string }) => string): string {
  return t(`nodes:stateValues.${state}`, { defaultValue: state });
}

function labelDiffersFromValue(label: string, value: string): boolean {
  return label.toLowerCase() !== value.toLowerCase().replace(/_/g, ' ');
}

export function StateValueCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
}: StateValueComboboxProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return suggestions;
    const q = query.toLowerCase();
    return suggestions.filter(
      (s) => s.toLowerCase().includes(q) || getStateLabel(s, t).toLowerCase().includes(q)
    );
  }, [query, suggestions, t]);

  const showCustomEntry = query && !suggestions.includes(query);
  const displayValue = value ? getStateLabel(value, t) : '';

  const handleSelect = (selected: string) => {
    onChange(selected === value ? '' : selected);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('flex w-full justify-between', !value && 'text-muted-foreground')}
        >
          <span className="truncate">
            {value ? (
              <span>
                {displayValue}
                {labelDiffersFromValue(displayValue, value) && (
                  <span className="ml-1 font-mono text-muted-foreground text-xs">({value})</span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[286px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {filtered.length === 0 && !showCustomEntry && (
              <CommandEmpty>{t('combobox.noOptions')}</CommandEmpty>
            )}
            {showCustomEntry && (
              <CommandGroup>
                <CommandItem value={query} onSelect={handleSelect}>
                  <span className="mr-2 text-muted-foreground text-xs">
                    {t('stateTrigger.useValue')}
                  </span>
                  <span className="font-mono">{query}</span>
                  <Check
                    className={cn('ml-auto h-4 w-4', value === query ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((state) => {
                  const label = getStateLabel(state, t);
                  return (
                    <CommandItem key={state} value={state} onSelect={handleSelect}>
                      <span>{label}</span>
                      {labelDiffersFromValue(label, state) && (
                        <span className="ml-1 font-mono text-muted-foreground text-xs">({state})</span>
                      )}
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          value === state ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

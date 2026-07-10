import { Monitor, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeOverride } from '@/contexts/ThemeOverrideContext';
import type { ThemeOverride } from '@/lib/ha-theme';

const THEME_ICONS: Record<ThemeOverride, ComponentType<{ className?: string }>> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Header control to force FLODE's own light/dark palette independently of
 * Home Assistant's per-user profile theme — "auto" stops overriding and
 * falls back to whatever the user has set in HA (see lib/ha-theme.ts).
 */
export function ThemeToggle() {
  const { t } = useTranslation('common');
  const { themeOverride, setThemeOverride } = useThemeOverride();
  const Icon = THEME_ICONS[themeOverride];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t('theme.toggleLabel')}>
          <Icon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={themeOverride}
          onValueChange={(next) => setThemeOverride(next as ThemeOverride)}
        >
          <DropdownMenuRadioItem value="auto">
            <Monitor className="mr-2 h-4 w-4" />
            {t('theme.auto')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            {t('theme.light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            {t('theme.dark')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

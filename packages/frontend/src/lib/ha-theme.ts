import type { HassTheme, HassThemeVars, HomeAssistant } from '@/types/hass';
import { toHslTriplet } from './color';

/**
 * Maps our local shadcn-style CSS custom properties to Home Assistant theme
 * variable names, with light/dark fallback colors matching HA's own default
 * palette. Used both when running inside HA (real theme values) and in
 * standalone dev (fallbacks only, no `hass` available).
 *
 * `--trigger`/`--condition`/`--action` are FLODE's own node-type colors, but
 * derived from HA's semantic status colors by default so they still shift
 * with the active HA theme (per-node-type override remains possible later
 * via the same variable).
 */
const HA_THEME_TOKENS: Record<string, { haVar: string; light: string; dark: string }> = {
  background: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  foreground: { haVar: 'primary-text-color', light: '#212121', dark: '#e1e1e1' },
  card: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  'card-foreground': { haVar: 'primary-text-color', light: '#212121', dark: '#e1e1e1' },
  popover: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  'popover-foreground': { haVar: 'primary-text-color', light: '#212121', dark: '#e1e1e1' },
  primary: { haVar: 'primary-color', light: '#03a9f4', dark: '#03a9f4' },
  'primary-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  secondary: { haVar: 'secondary-background-color', light: '#e5e5e5', dark: '#202020' },
  'secondary-foreground': { haVar: 'primary-text-color', light: '#212121', dark: '#e1e1e1' },
  muted: { haVar: 'secondary-background-color', light: '#e5e5e5', dark: '#202020' },
  'muted-foreground': { haVar: 'secondary-text-color', light: '#727272', dark: '#9b9b9b' },
  accent: { haVar: 'accent-color', light: '#ff9800', dark: '#ff9800' },
  'accent-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  destructive: { haVar: 'error-color', light: '#db4437', dark: '#ff5252' },
  'destructive-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  border: { haVar: 'divider-color', light: '#e0e0e0', dark: '#383838' },
  input: { haVar: 'divider-color', light: '#e0e0e0', dark: '#383838' },
  ring: { haVar: 'primary-color', light: '#03a9f4', dark: '#03a9f4' },
  warning: { haVar: 'warning-color', light: '#ffa600', dark: '#ffb74d' },
  'warning-foreground': { haVar: 'primary-text-color', light: '#212121', dark: '#212121' },
  success: { haVar: 'success-color', light: '#43a047', dark: '#66bb6a' },
  'success-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  info: { haVar: 'info-color', light: '#039be5', dark: '#4fc3f7' },
  'info-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#212121' },

  // Node-type colors — derived from HA semantic colors, themable independently.
  trigger: { haVar: 'warning-color', light: '#ffa600', dark: '#ffb74d' },
  'trigger-foreground': { haVar: 'primary-text-color', light: '#212121', dark: '#212121' },
  condition: { haVar: 'info-color', light: '#039be5', dark: '#4fc3f7' },
  'condition-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#212121' },
  action: { haVar: 'success-color', light: '#43a047', dark: '#66bb6a' },
  'action-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
};

function getActiveThemeVars(themes: HomeAssistant['themes']): HassThemeVars {
  const name = themes.theme;
  if (!name || name === 'default') return {};
  const theme: HassTheme | undefined = themes.themes[name];
  if (!theme) return {};

  const mode = themes.darkMode ? theme.modes?.dark : theme.modes?.light;

  // Base (un-nested) vars apply to both modes unless a mode-specific override exists.
  const flatVars: HassThemeVars = {};
  for (const [key, value] of Object.entries(theme)) {
    if (key !== 'modes' && typeof value === 'string') {
      flatVars[key] = value;
    }
  }
  return { ...flatVars, ...mode };
}

/**
 * Resolves HA's current theme (or fallback defaults) into our local CSS
 * custom properties and writes them onto `target` (normally
 * `document.documentElement`). Safe to call on every `hass` update — it only
 * touches inline style properties, so standalone/dev mode (no `hass`) simply
 * keeps whatever static defaults are defined in index.css.
 */
export function applyHaTheme(target: HTMLElement, hass: Pick<HomeAssistant, 'themes'> | undefined): void {
  if (!hass?.themes) return;

  const themeVars = getActiveThemeVars(hass.themes);
  const isDark = hass.themes.darkMode ?? false;

  for (const [localVar, token] of Object.entries(HA_THEME_TOKENS)) {
    const rawValue = themeVars[token.haVar] ?? (isDark ? token.dark : token.light);
    const triplet = toHslTriplet(rawValue);
    if (triplet) {
      target.style.setProperty(`--${localVar}`, triplet);
    }
  }
}

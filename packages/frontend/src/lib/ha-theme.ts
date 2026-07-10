import type { HassTheme, HassThemeVars, HomeAssistant } from '@/types/hass';
import { toHslTriplet } from './color';

/**
 * Maps our local shadcn-style CSS custom properties to Home Assistant theme
 * variable names, with light/dark fallback colors matching HA's own default
 * ("Home Assistant Light"/"Home Assistant Dark") palette. Used both when
 * running inside HA (real theme values) and in standalone dev (fallbacks
 * only, no `hass` available).
 *
 * Fallback values are read directly from home-assistant/frontend's
 * `src/resources/theme/color/*.globals.ts` (colorStyles/darkColorStyles +
 * the semantic `--ha-color-*` token chain they resolve to), not
 * approximated — several semantic status colors (error/warning/success/info)
 * turned out to NOT change between light and dark in real HA, and
 * `primary-color`/`primary-text-color`/`secondary-text-color` had drifted
 * from HA's actual hex values in an earlier hand-rolled version of this
 * table.
 *
 * `--trigger`/`--condition`/`--action` are FLODE's own node-type colors, but
 * derived from HA's semantic status colors by default so they still shift
 * with the active HA theme (per-node-type override remains possible later
 * via the same variable).
 */
const HA_THEME_TOKENS: Record<string, { haVar: string; light: string; dark: string }> = {
  background: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  foreground: { haVar: 'primary-text-color', light: '#141414', dark: '#e1e1e1' },
  card: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  'card-foreground': { haVar: 'primary-text-color', light: '#141414', dark: '#e1e1e1' },
  popover: { haVar: 'card-background-color', light: '#ffffff', dark: '#1c1c1c' },
  'popover-foreground': { haVar: 'primary-text-color', light: '#141414', dark: '#e1e1e1' },
  primary: { haVar: 'primary-color', light: '#009ac7', dark: '#009ac7' },
  'primary-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  secondary: { haVar: 'secondary-background-color', light: '#e5e5e5', dark: '#282828' },
  'secondary-foreground': { haVar: 'primary-text-color', light: '#141414', dark: '#e1e1e1' },
  muted: { haVar: 'secondary-background-color', light: '#e5e5e5', dark: '#282828' },
  'muted-foreground': { haVar: 'secondary-text-color', light: '#5e5e5e', dark: '#9b9b9b' },
  accent: { haVar: 'accent-color', light: '#ff9800', dark: '#ff9800' },
  'accent-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  destructive: { haVar: 'error-color', light: '#db4437', dark: '#db4437' },
  'destructive-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  border: { haVar: 'divider-color', light: '#e0e0e0', dark: '#383838' },
  input: { haVar: 'divider-color', light: '#e0e0e0', dark: '#383838' },
  ring: { haVar: 'primary-color', light: '#009ac7', dark: '#009ac7' },
  warning: { haVar: 'warning-color', light: '#ffa600', dark: '#ffa600' },
  'warning-foreground': { haVar: 'primary-text-color', light: '#141414', dark: '#141414' },
  success: { haVar: 'success-color', light: '#43a047', dark: '#43a047' },
  'success-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  info: { haVar: 'info-color', light: '#039be5', dark: '#039be5' },
  'info-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },

  // Node-type colors — derived from HA semantic colors, themable independently.
  trigger: { haVar: 'warning-color', light: '#ffa600', dark: '#ffa600' },
  'trigger-foreground': { haVar: 'primary-text-color', light: '#141414', dark: '#141414' },
  condition: { haVar: 'info-color', light: '#039be5', dark: '#039be5' },
  'condition-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
  action: { haVar: 'success-color', light: '#43a047', dark: '#43a047' },
  'action-foreground': { haVar: 'text-primary-color', light: '#ffffff', dark: '#ffffff' },
};

/**
 * FLODE's own light/dark override — independent from Home Assistant's
 * per-user profile theme. `auto` means "don't override, mirror whatever the
 * user has set in HA" (the pre-existing behavior); `light`/`dark` force HA's
 * base palette (see `HA_THEME_TOKENS`' fallback colors), ignoring any custom
 * theme the user has selected.
 */
export type ThemeOverride = 'auto' | 'light' | 'dark';

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
 *
 * `override` lets FLODE force HA's base light/dark palette regardless of the
 * user's real HA theme/dark-mode setting — passing `'auto'` (the default)
 * preserves the original behavior of mirroring `hass.themes` exactly.
 *
 * When forcing `'light'`/`'dark'`, this also writes the underlying HA
 * variable itself (e.g. `--primary-text-color`, `--card-background-color`),
 * not just our aliased token — native HA web components FLODE embeds
 * (entity/area/label pickers, `ha-selector`, ...) read those directly and
 * otherwise keep inheriting the user's real custom theme from the host
 * document via normal CSS custom-property inheritance, which is what
 * produced a visually mixed result (FLODE's own chrome forced to the base
 * palette, native pickers still showing the custom theme). In `'auto'` mode
 * these are explicitly cleared so inheritance from the host resumes.
 */
export function applyHaTheme(
  target: HTMLElement,
  hass: Pick<HomeAssistant, 'themes'> | undefined,
  override: ThemeOverride = 'auto'
): void {
  if (!hass?.themes) return;

  const isAuto = override === 'auto';
  const themeVars = isAuto ? getActiveThemeVars(hass.themes) : {};
  const isDark = isAuto ? (hass.themes.darkMode ?? false) : override === 'dark';

  const haVarsSeen = new Set<string>();

  for (const [localVar, token] of Object.entries(HA_THEME_TOKENS)) {
    const rawValue = themeVars[token.haVar] ?? (isDark ? token.dark : token.light);
    const triplet = toHslTriplet(rawValue);
    if (triplet) {
      target.style.setProperty(`--${localVar}`, triplet);
    }

    if (haVarsSeen.has(token.haVar)) continue;
    haVarsSeen.add(token.haVar);
    if (isAuto) {
      target.style.removeProperty(`--${token.haVar}`);
    } else {
      target.style.setProperty(`--${token.haVar}`, isDark ? token.dark : token.light);
    }
  }
}

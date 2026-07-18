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
 * Newer MD3 design-system tokens (home-assistant/frontend's
 * `theme/color/semantic.globals.ts`, resolved from `core.globals.ts`'s
 * neutral scale) that some native HA components FLODE embeds read directly
 * for their own internal backgrounds — e.g. `ha-picker-field`'s
 * `ha-combo-box-item` (the "Entität auswählen" field) and `ha-select`'s
 * dropdown both use `--ha-color-form-background`. Unlike the legacy
 * `HA_THEME_TOKENS` set above, these don't reliably inherit into FLODE's
 * shadow tree from the real HA page even in `'auto'` mode (showed up as a
 * washed-out light-gray field in dark mode, unrelated to the light/dark
 * override feature), so they're mirrored explicitly here regardless of
 * `override` — always matching the same `isDark` state the rest of this
 * function already resolves.
 */
const HA_FORM_TOKENS: Record<string, { light: string; dark: string }> = {
  'ha-color-form-background': { light: '#f3f3f3', dark: '#363636' },
  'ha-color-form-background-hover': { light: '#e6e6e6', dark: '#4a4a4a' },
  'ha-color-form-background-disabled': { light: '#cccccc', dark: '#363636' },
};

/**
 * `@home-assistant/webawesome`-based components (the dropdown menu behind
 * `ha-select`/`ha-dropdown-item`, ...) read `--wa-color-text-normal` for
 * unselected item text. Real HA maps this to `--primary-text-color` (see
 * home-assistant/frontend's `theme/color/wa.globals.ts`), but only via a
 * rule scoped to the real page's `<html>` element — since that's a `var()`
 * reference rather than a literal value, it's re-resolved wherever
 * `--wa-color-text-normal` finally gets consumed, which turned out to
 * resolve incorrectly from inside FLODE's shadow tree (dropdown items
 * rendered as near-illegible dark-on-dark text even after
 * `--primary-text-color` itself was fixed), so mirror the same mapping
 * explicitly here instead of relying on it. `--wa-color-text-quiet` maps to
 * HA's `--secondary-text-color` for the same reason.
 */
const HA_WEBAWESOME_TEXT_TOKENS: Record<string, string> = {
  'wa-color-text-normal': 'primary-text-color',
  'wa-color-text-quiet': 'secondary-text-color',
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

function resolveThemeState(
  themes: HomeAssistant['themes'],
  override: ThemeOverride
): { isDark: boolean; themeVars: HassThemeVars } {
  const isAuto = override === 'auto';
  return {
    themeVars: isAuto ? getActiveThemeVars(themes) : {},
    isDark: isAuto ? (themes.darkMode ?? false) : override === 'dark',
  };
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
 * This also always writes the underlying HA variable itself (e.g.
 * `--primary-text-color`, `--card-background-color`), not just our aliased
 * token — native HA web components FLODE embeds (entity/area/label pickers,
 * `ha-selector`, the `@home-assistant/webawesome`-based dropdown behind
 * `ha-select`, ...) read those directly. In `'auto'` mode this used to just
 * `removeProperty` and rely on normal CSS custom-property inheritance from
 * the host document to fill it back in — that inheritance turned out to be
 * unreliable for at least some of these components even though they're
 * normal (non-portaled) descendants of FLODE's shadow tree, showing up as a
 * hardcoded light fallback (e.g. `var(--card-background-color, ..., #fff)`)
 * even in dark mode. So auto mode now explicitly sets the same
 * already-resolved value used for the local alias, instead of clearing and
 * hoping inheritance resumes.
 */
export function applyHaTheme(
  target: HTMLElement,
  hass: Pick<HomeAssistant, 'themes'> | undefined,
  override: ThemeOverride = 'auto'
): void {
  if (!hass?.themes) return;

  const { isDark, themeVars } = resolveThemeState(hass.themes, override);

  const haVarsSeen = new Set<string>();
  const haVarValues: Record<string, string> = {};

  for (const [localVar, token] of Object.entries(HA_THEME_TOKENS)) {
    const rawValue = themeVars[token.haVar] ?? (isDark ? token.dark : token.light);
    haVarValues[token.haVar] = rawValue;
    const triplet = toHslTriplet(rawValue);
    if (triplet) {
      target.style.setProperty(`--${localVar}`, triplet);
    }

    if (haVarsSeen.has(token.haVar)) continue;
    haVarsSeen.add(token.haVar);
    target.style.setProperty(`--${token.haVar}`, rawValue);
  }

  for (const [varName, token] of Object.entries(HA_FORM_TOKENS)) {
    target.style.setProperty(`--${varName}`, isDark ? token.dark : token.light);
  }

  for (const [varName, sourceHaVar] of Object.entries(HA_WEBAWESOME_TEXT_TOKENS)) {
    const rawValue = haVarValues[sourceHaVar];
    if (rawValue) {
      target.style.setProperty(`--${varName}`, rawValue);
    }
  }
}

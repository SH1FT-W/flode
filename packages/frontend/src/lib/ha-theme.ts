import type { HomeAssistant } from '@/types/hass';
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
  // Surfaces of HA's own popovers — e.g. the entity picker's search list
  // (`ha-generic-picker`, HA 2026.x) paints its list background from these.
  // Left unmirrored, FLODE's dark override showed that list as white with
  // the (already dark-mode) light text on top — nearly unreadable.
  'ha-color-surface-default': { light: '#ffffff', dark: '#1c1c1c' },
  'wa-color-surface-default': { light: '#ffffff', dark: '#1c1c1c' },
  'wa-color-surface-raised': { light: '#ffffff', dark: '#1c1c1c' },
  'mdc-theme-surface': { light: '#ffffff', dark: '#1c1c1c' },
  'primary-background-color': { light: '#fafafa', dark: '#111111' },
  'ha-color-fill-neutral-quiet-resting': { light: '#f3f3f3', dark: '#282828' },
  // Filled fields of older (MDC-based) HA pickers, e.g. the labels picker's
  // chip area — stayed #f5f5f5/#e6e6e6 (white box) under FLODE's dark override.
  'mdc-text-field-fill-color': { light: '#f5f5f5', dark: '#363636' },
  'ha-color-fill-neutral-normal-resting': { light: '#e6e6e6', dark: '#2a2a2a' },
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
 * `ha-dropdown-item`'s hover/focus background (`@home-assistant/webawesome`'s
 * `dropdown-item.styles.ts`) reads `--wa-color-neutral-fill-normal`, which
 * real HA maps to `--ha-color-fill-neutral-normal-resting` — `#e6e6e6` in
 * light mode, but only `#202020` in dark mode (`home-assistant/frontend`'s
 * `theme/color/core.globals.ts` neutral-10), a mere ~4 levels above the
 * `#1c1c1c` panel it sits on and barely perceptible as a hover cue. FLODE
 * doesn't mirror this variable at all today, so dropdown items fall back to
 * `@home-assistant/webawesome`'s own unthemed default. Deliberately mirrored
 * here with a *more* visible dark-mode value than HA's own (matching the
 * `ha-color-form-background-hover` contrast step already used elsewhere in
 * this file) rather than replicating HA's subtle default.
 */
const HA_WEBAWESOME_FILL_TOKENS: Record<string, { light: string; dark: string }> = {
  'wa-color-neutral-fill-normal': { light: '#e6e6e6', dark: '#4a4a4a' },
};

/**
 * FLODE's own light/dark setting. FLODE always uses its own palette (HA's
 * base colors, see `HA_THEME_TOKENS`' fallback values) and never a custom HA
 * theme's colors: `light`/`dark` pick the mode directly, `auto` follows
 * whether Home Assistant is currently in dark mode.
 */
export type ThemeOverride = 'auto' | 'light' | 'dark';

/** Dark or light: `auto` follows Home Assistant's current dark mode. */
function resolveIsDark(themes: HomeAssistant['themes'], override: ThemeOverride): boolean {
  return override === 'auto' ? (themes.darkMode ?? false) : override === 'dark';
}

/**
 * Writes FLODE's light or dark palette into our local CSS custom properties
 * on `target`. Safe to call on every `hass` update — it only touches inline
 * style properties, so standalone/dev mode (no `hass`) simply keeps the
 * static defaults from index.css.
 *
 * The active HA theme's own colors are deliberately not used, not even in
 * `auto` mode — that only decides between light and dark — so FLODE looks
 * the same under every custom theme.
 *
 * This also always writes the underlying HA variable itself (e.g.
 * `--primary-text-color`, `--card-background-color`), not just our aliased
 * token — native HA web components FLODE embeds (entity/area/label pickers,
 * `ha-selector`, the `@home-assistant/webawesome`-based dropdown behind
 * `ha-select`, ...) read those directly, and plain inheritance from the host
 * page proved unreliable for them.
 */
export function applyHaTheme(
  target: HTMLElement,
  hass: Pick<HomeAssistant, 'themes'> | undefined,
  override: ThemeOverride = 'auto'
): void {
  if (!hass?.themes) return;

  const isDark = resolveIsDark(hass.themes, override);

  const haVarsSeen = new Set<string>();
  const haVarValues: Record<string, string> = {};

  for (const [localVar, token] of Object.entries(HA_THEME_TOKENS)) {
    const rawValue = isDark ? token.dark : token.light;
    const triplet = toHslTriplet(rawValue);
    if (triplet) {
      target.style.setProperty(`--${localVar}`, triplet);
    }

    // Several local tokens intentionally share the same underlying HA
    // variable (e.g. `foreground` and `warning-foreground` both write
    // `primary-text-color`) but disagree on its value —
    // `warning-foreground`/`trigger-foreground` pin a mode-invariant dark
    // literal so text stays legible against their own colored badge
    // background. Only the first entry per haVar actually gets exported
    // (guarded below), so `haVarValues` — which HA_WEBAWESOME_TEXT_TOKENS
    // reads back out — must follow the same first-wins rule instead of
    // being overwritten by whichever entry happens to run last.
    if (haVarsSeen.has(token.haVar)) continue;
    haVarsSeen.add(token.haVar);
    haVarValues[token.haVar] = rawValue;
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

  for (const [varName, token] of Object.entries(HA_WEBAWESOME_FILL_TOKENS)) {
    target.style.setProperty(`--${varName}`, isDark ? token.dark : token.light);
  }
}

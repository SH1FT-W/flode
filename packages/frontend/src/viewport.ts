/** Below this width (phones) the side panels become a bottom sheet — same breakpoint as the CSS. */
const NARROW_QUERY = '(max-width: 760px)';

export function isNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

/** Share of the pane's height the phone bottom sheet covers (`.side.open`: 58 % + its margin). */
export const SHEET_SHARE = 0.6;

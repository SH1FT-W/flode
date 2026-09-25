/** Below this width (phones) the side panels become a bottom sheet — same breakpoint as the CSS. */
const NARROW_QUERY = '(max-width: 760px)';

export function isNarrow(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

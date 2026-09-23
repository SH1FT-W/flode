/** Matches Tailwind's `md` breakpoint — below it, the inspector becomes a bottom sheet. */
const NARROW_QUERY = '(max-width: 767px)';

export function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;
}

/**
 * How "show everything" frames the flow — shared by loading, importing, tidy
 * up and the dock. On phones a long horizontal flow would otherwise shrink to
 * an unreadable ~25 %, so there it stays readable and can be panned instead.
 */
export function fitViewOptions() {
  return { padding: 0.2, duration: 400, maxZoom: 1, minZoom: isNarrowViewport() ? 0.55 : 0.1 };
}

/** A finger held still this long asks for a menu (Android's long press; iOS reports none, #32). */
export const HOLD_MS = 500;

const ENDS = ['pointermove', 'pointerup', 'pointercancel'] as const;

/**
 * Runs `held` once the touch of `event` has stayed put for `HOLD_MS`. Lifting
 * the finger, or moving it `slack` px or more, first calls it off. Other
 * pointers (a mouse, a pen) have their own right-click. Returns a way to call
 * the wait off early.
 */
export function watchHold(event: PointerEvent, slack: number, held: () => void): () => void {
  if (event.pointerType !== 'touch') return () => undefined;
  const { pointerId, clientX, clientY } = event;
  const stop = () => {
    window.clearTimeout(timer);
    for (const type of ENDS) window.removeEventListener(type, onPointer, true);
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - clientX, e.clientY - clientY) < slack)
      return;
    stop();
  };
  const timer = window.setTimeout(() => {
    stop();
    held();
  }, HOLD_MS);
  for (const type of ENDS) window.addEventListener(type, onPointer, true);
  return stop;
}

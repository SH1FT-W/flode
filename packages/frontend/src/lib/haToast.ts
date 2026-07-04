import { toast as sonnerToast } from 'sonner';

let dispatchTarget: HTMLElement | null = null;

/**
 * Registers the DOM node `hass-notification` events get dispatched from.
 * Only called by panel-wrapper.ts (real HA panel mode) — standalone/remote
 * dev mode leaves this `null` so `showToast` falls back to FLODE's own
 * sonner-based toast, since there's no HA document to catch the event there.
 */
export function registerHaToastTarget(el: HTMLElement | null): void {
  dispatchTarget = el;
}

export interface HaToastOptions {
  description?: string;
  duration?: number;
}

function fireHassNotification(message: string, options?: HaToastOptions): boolean {
  if (!dispatchTarget) return false;
  const fullMessage = options?.description ? `${message} — ${options.description}` : message;
  dispatchTarget.dispatchEvent(
    new CustomEvent('hass-notification', {
      bubbles: true,
      composed: true,
      detail: { message: fullMessage, duration: options?.duration },
    })
  );
  return true;
}

/**
 * Shows a toast — HA's native bottom "hass-notification" snackbar when
 * FLODE is mounted as a real HA panel (bubbles/composed to cross the Shadow
 * DOM boundary into HA's own document), falls back to FLODE's own
 * sonner-based toast in standalone dev mode. `hass-notification` has no
 * success/warning/error variants of its own, so those map to the same call —
 * only the sonner fallback shows a differently styled toast per variant.
 */
export function showToast(message: string, options?: HaToastOptions): void {
  if (fireHassNotification(message, options)) return;
  sonnerToast(message, options);
}

export function showSuccessToast(message: string, options?: HaToastOptions): void {
  if (fireHassNotification(message, options)) return;
  sonnerToast.success(message, options);
}

export function showWarningToast(message: string, options?: HaToastOptions): void {
  if (fireHassNotification(message, options)) return;
  sonnerToast.warning(message, options);
}

export function showErrorToast(message: string, options?: HaToastOptions): void {
  if (fireHassNotification(message, options)) return;
  sonnerToast.error(message, options);
}

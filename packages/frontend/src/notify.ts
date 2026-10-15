import { errorMessage } from './ha';

/** A button in the toast (HA's own `action`). */
export interface ToastAction {
  text: string;
  action: () => void;
}

/** HA's toast at the bottom of the page — from any FLODE element. */
export function notify(from: EventTarget, message: string, action?: ToastAction): void {
  from.dispatchEvent(
    new CustomEvent('hass-notification', {
      detail: action ? { message, action } : { message },
      bubbles: true,
      composed: true,
    })
  );
}

/**
 * Copies `text()` and says `copied` — or, when the browser refuses (no
 * clipboard outside https, permission denied …), why it didn't work.
 */
export async function copyToClipboard(
  from: EventTarget,
  text: () => string | Promise<string>,
  copied: string
): Promise<void> {
  try {
    await navigator.clipboard.writeText(await text());
    notify(from, copied);
  } catch (error) {
    notify(from, errorMessage(error));
  }
}

/**
 * Opens a Home Assistant frontend page. Inside the HA panel this is an
 * in-app navigation (HA's router listens for `location-changed`); in remote
 * dev mode the page opens in a new tab of the configured instance.
 */
export function navigateInHomeAssistant(path: string, remoteBaseUrl?: string): void {
  if (remoteBaseUrl) {
    window.open(`${remoteBaseUrl.replace(/\/$/, '')}${path}`, '_blank', 'noopener');
    return;
  }
  window.history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

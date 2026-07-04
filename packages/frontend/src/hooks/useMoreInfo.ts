import { useAppRoot } from '@/contexts/AppRootContext';

/**
 * Opens HA's native "more info" dialog for an entity — fires `hass-more-info`
 * (bubbles, composed) so it crosses FLODE's Shadow DOM boundary into HA's own
 * document, where HA's root element listens for it. No-op in standalone dev
 * mode (no HA document to catch the event).
 */
export function useMoreInfo() {
  const appRoot = useAppRoot();

  return (entityId: string) => {
    appRoot?.dispatchEvent(
      new CustomEvent('hass-more-info', {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  };
}

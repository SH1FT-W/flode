/**
 * Standalone dev entry (index.html — `yarn dev` / local preview only).
 * The production HA panel is mounted by panel-wrapper.ts instead, straight
 * into a Shadow DOM. See app-mount.tsx for the shared mounting logic.
 */
import { mountFlodeApp } from './app-mount';
import { logger } from './lib/logger';

const rootElement = document.getElementById('root');
if (!rootElement) {
  logger.error('No #root element found');
} else {
  logger.info('FLODE starting in standalone mode');
  mountFlodeApp(rootElement, { forceMode: 'remote' });
}

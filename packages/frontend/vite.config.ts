import path from 'node:path';
import { defineConfig } from 'vite';

// One ES module HA loads as the panel (`flode-panel.js`); the transpiler
// (with elkjs) is split into a lazy chunk loaded when a flow is opened.
// Built straight into the integration, so `yarn dev` (watch) updates it too.
export default defineConfig({
  base: '/flode-hass/',
  build: {
    outDir: path.resolve(__dirname, '../../custom_components/flode/www'),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1700,
    lib: {
      entry: path.resolve(__dirname, 'src/flode-panel.ts'),
      formats: ['es'],
      fileName: () => 'flode-panel.js',
    },
  },
});

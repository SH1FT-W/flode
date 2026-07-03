import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: '/flode-hass/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The large chunks (transpiler+elkjs, code editor) are lazily loaded on
    // demand, not part of the initial payload — so the default 500 kB warning
    // is just noise here.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      input: {
        // Standalone dev preview only (`yarn dev` / index.html) — the real HA
        // panel is mounted by panel-wrapper.ts, not this entry.
        main: path.resolve(__dirname, 'index.html'),
        // Panel wrapper entry (loaded by HA as a module; mounts into a Shadow
        // DOM instead of an iframe, see panel-wrapper.ts for the rationale).
        'panel-wrapper': path.resolve(__dirname, 'src/panel-wrapper.ts'),
      },
      output: {
        // Ensure panel-wrapper has a predictable name for HA to load
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'panel-wrapper') {
            return 'assets/panel-wrapper.js';
          }
          return 'assets/[name]-[hash].js';
        },
        // Split heavy vendor libs into separate, long-term cacheable chunks
        // so the main bundle stays small and updates don't re-download vendors.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow') || id.includes('d3-')) return 'vendor-reactflow';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          // Everything else: let Rolldown decide. Deps used only by a lazy
          // route stay in that lazy chunk instead of bloating a shared vendor.
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});

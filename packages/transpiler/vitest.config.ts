import { defineConfig } from 'vitest/config';
import { flodeSourceAliases } from '../../vitest.aliases';

export default defineConfig({
  resolve: { alias: flodeSourceAliases },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});

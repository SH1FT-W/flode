import { defineProject } from 'vitest/config';
import { flodeSourceAliases } from '../../vitest.aliases';

export default defineProject({
  resolve: { alias: flodeSourceAliases },
  test: {
    name: '@flode/frontend',
    // Node by default; tests of real elements switch per file: `// @vitest-environment happy-dom`
    environment: 'node',
  },
});

import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@flode/frontend',
    // Node by default; tests of real elements switch per file: `// @vitest-environment happy-dom`
    environment: 'node',
  },
});

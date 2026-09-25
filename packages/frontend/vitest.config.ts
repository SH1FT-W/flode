import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@flode/frontend',
    environment: 'node',
  },
});

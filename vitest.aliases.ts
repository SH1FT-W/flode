import { fileURLToPath } from 'node:url';

/**
 * `@flode/*` resolved to each package's source for tests. The packages'
 * `exports` point at `dist/`, which is missing on a fresh clone and stale
 * after a change that wasn't rebuilt; tests must see the code as it is.
 */
export const flodeSourceAliases: Record<string, string> = Object.fromEntries(
  ['shared', 'transpiler', 'ui-core'].map((name) => [
    `@flode/${name}`,
    fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  ])
);

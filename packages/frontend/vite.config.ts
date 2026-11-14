import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

const outDir = path.resolve(__dirname, '../../custom_components/flode/www');
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * `.gz` / `.br` next to every script: HA serves the panel's files as they are,
 * and aiohttp picks such a sibling when the browser accepts it (≈ a quarter
 * of the bytes; plain-http HAs only get gzip).
 */
function precompress(): Plugin {
  return {
    name: 'flode-precompress',
    apply: 'build',
    async closeBundle() {
      const scripts = (await readdir(outDir)).filter((file) => file.endsWith('.js'));
      await Promise.all(
        scripts.map(async (file) => {
          const source = await readFile(path.join(outDir, file));
          const [gz, br] = await Promise.all([
            gzipAsync(source, { level: 9 }),
            brotliAsync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
          ]);
          await writeFile(path.join(outDir, `${file}.gz`), gz);
          await writeFile(path.join(outDir, `${file}.br`), br);
        })
      );
    },
  };
}

// One ES module HA loads as the panel (`flode-panel.js`); the transpiler
// (with elkjs) is split into a lazy chunk loaded when a flow is opened.
// Built straight into the integration, so `yarn dev` (watch) updates it too.
export default defineConfig({
  base: '/flode-hass/',
  plugins: [precompress()],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1700,
    // Vite's lib mode leaves ES output unminified.
    rolldownOptions: { output: { minify: true } },
    lib: {
      entry: path.resolve(__dirname, 'src/flode-panel.ts'),
      formats: ['es'],
      fileName: () => 'flode-panel.js',
    },
  },
});

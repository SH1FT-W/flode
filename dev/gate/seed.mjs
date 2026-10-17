// Puts the gate's flows into the test HA: every round-trip fixture of the
// transpiler tests, plus the gate's own flows (dev/gate/flows; a file with a
// `sequence:` is a script). Old gate flows are removed first. Writes
// .gate/seeded.json for the other steps.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  awaitEntities,
  configBody,
  configRoute,
  GATE_PREFIX,
  OUT_DIR,
  REPO,
  rest,
} from './lib.mjs';
import './cleanup.mjs';

const SOURCES = [
  path.join(REPO, '__tests__/yaml-automation-fixtures'),
  path.join(REPO, 'dev/gate/flows'),
];

const seeded = [];
const skipped = [];
for (const dir of SOURCES) {
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .sort()) {
    const loaded = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    // A file in automations.yaml style (a list) holds its automation as the first item.
    const config = Array.isArray(loaded) ? loaded[0] : loaded;
    const kind = 'sequence' in config ? 'script' : 'automation';
    const slug = file
      .replace(/\.yaml$/, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase();
    const id = `${GATE_PREFIX}${slug}`;
    const name = `FLODE Gate ${slug}`;
    const flow = { id, kind, name, file: path.relative(REPO, path.join(dir, file)) };
    try {
      await rest('POST', configRoute(flow), configBody(flow, { ...config, alias: name }));
    } catch (error) {
      // Some parser fixtures are deliberately not valid for HA itself — nothing to open then.
      skipped.push(`${file}: ${error.message.replace(/^.*?: \d+ /, '')}`);
      continue;
    }
    seeded.push({ ...flow, config: { ...config, alias: name } });
  }
}
const missing = await awaitEntities(seeded);
if (missing.length > 0) {
  console.log(`✗ HA has no entity for: ${missing.map((flow) => flow.name).join(', ')}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'seeded.json'), JSON.stringify(seeded, null, 2));
console.log(
  `✓ seeded ${seeded.length} flows (${seeded.filter((flow) => flow.kind === 'script').length} scripts)`
);
for (const line of skipped) console.log(`  · skipped (HA rejects it): ${line.slice(0, 160)}`);

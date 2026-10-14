// Puts the gate's automations into the test HA: every round-trip fixture of the
// transpiler tests, plus the gate's own flows (dev/gate/flows). Old gate
// automations are removed first. Writes .gate/seeded.json for the other steps.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { GATE_PREFIX, OUT_DIR, REPO, rest } from './lib.mjs';
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
    const config = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    const slug = file
      .replace(/\.yaml$/, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase();
    const id = `${GATE_PREFIX}${slug}`;
    const name = `FLODE Gate ${slug}`;
    try {
      await rest('POST', `config/automation/config/${id}`, { ...config, id, alias: name });
    } catch (error) {
      // Some parser fixtures are deliberately not valid for HA itself — nothing to open then.
      skipped.push(`${file}: ${error.message.replace(/^.*?: \d+ /, '')}`);
      continue;
    }
    seeded.push({
      id,
      name,
      file: path.relative(REPO, path.join(dir, file)),
      config: { ...config, alias: name },
    });
  }
}
// HA creates the entities a moment after the config is saved (longer right after a restart).
let missing = seeded;
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  const names = new Set(
    (await rest('GET', 'states')).map((state) => state.attributes.friendly_name)
  );
  missing = seeded.filter((flow) => !names.has(flow.name));
  if (missing.length === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (missing.length > 0) {
  console.log(`✗ HA has no entity for: ${missing.map((flow) => flow.name).join(', ')}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'seeded.json'), JSON.stringify(seeded, null, 2));
console.log(`✓ seeded ${seeded.length} automations`);
for (const line of skipped) console.log(`  · skipped (HA rejects it): ${line.slice(0, 160)}`);

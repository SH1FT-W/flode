/**
 * The hard rule: every fixture automation (the parser fixtures and the gate's
 * flows) opened the way the editor opens it and saved the way the editor saves
 * it must come back as the same Home Assistant config. "Same" is defined in
 * ha-equal.ts (key order, HA's key migration, FLODE's metadata block). Wanted
 * differences are listed in ALLOWED with their reason, and an entry whose
 * fixture round-trips cleanly again is reported, so the list never goes stale.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { firstDifference, internalKeysIn, normalizeHaConfig } from '../ha-equal';
import { YamlParser } from '../parser/YamlParser';
import { buildAutomationSaveConfig } from '../save-config';
import { parseScript, transpileScript } from '../script';
import { loadHaYaml } from '../yaml';

const REPO = join(__dirname, '../../../..');
const FIXTURE_DIRS = ['__tests__/yaml-automation-fixtures', 'dev/gate/flows'];

/** Fixtures that are meant to come back different, with the reason. */
const ALLOWED: Record<string, string> = {
  '02-knx-complex.yaml':
    'its trigger carries both platform: device and trigger: device, which HA itself rejects; FLODE writes only the current key',
  '08-sm-simple-cafe.yaml':
    'C.A.F.E. state machine with a tree-shaped flow: FLODE unwraps it and saves plain native steps (by design)',
};

interface Fixture {
  name: string;
  config: Record<string, unknown>;
  kind: 'automation' | 'script';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadFixtures(): Fixture[] {
  return FIXTURE_DIRS.flatMap((dir) =>
    readdirSync(join(REPO, dir))
      .filter((name) => name.endsWith('.yaml'))
      .sort()
      .map((name) => {
        const loaded = loadHaYaml(readFileSync(join(REPO, dir, name), 'utf8'));
        // A file in automations.yaml style (a list) holds its automation as the first item.
        const config = Array.isArray(loaded) ? loaded[0] : loaded;
        if (!isRecord(config)) throw new Error(`${name}: not a mapping`);
        return { name, config, kind: 'sequence' in config ? 'script' : 'automation' };
      })
  );
}

const transpiler = new FlowTranspiler();
/** The editor opens every flow with `keepBlocks` (blocks stay one card). */
const parser = new YamlParser({ keepBlocks: true });

/** Open and save once, as the panel does; returns what would be posted to HA. */
async function openAndSave(fixture: Fixture): Promise<Record<string, unknown>> {
  if (fixture.kind === 'script') {
    const parsed = await parseScript(transpiler, fixture.config, { keepBlocks: true });
    expect(parsed.errors ?? []).toEqual([]);
    expect(parsed.graph).toBeDefined();
    if (!parsed.graph) throw new Error('no graph');
    const saved = transpileScript(transpiler, parsed.graph);
    expect(saved.errors ?? []).toEqual([]);
    if (!saved.config) throw new Error('no config');
    return saved.config;
  }
  const parsed = await parser.parse(JSON.stringify(fixture.config));
  expect(parsed.errors ?? []).toEqual([]);
  expect(parsed.graph).toBeDefined();
  if (!parsed.graph) throw new Error('no graph');
  const saved = buildAutomationSaveConfig(transpiler, parsed.graph, {
    alias: parsed.graph.name,
    description: parsed.graph.description ?? '',
  });
  expect(saved.errors ?? []).toEqual([]);
  if (!saved.config) throw new Error('no config');
  return saved.config;
}

describe('every fixture comes back as the same Home Assistant config', () => {
  for (const fixture of loadFixtures()) {
    const allowed = ALLOWED[fixture.name];

    it(`${fixture.name}: ${allowed ? 'differs as allowed' : 'opens and saves unchanged'}`, async () => {
      const saved = await openAndSave(fixture);
      expect(internalKeysIn(saved)).toEqual([]);
      const before = normalizeHaConfig(fixture.config);
      const after = normalizeHaConfig(saved);
      if (allowed) {
        expect(
          firstDifference(before, after),
          `listed in ALLOWED but saves unchanged now (${allowed}); remove it there`
        ).not.toBeNull();
        return;
      }
      expect(firstDifference(before, after)).toBeNull();
      expect(after).toEqual(before);
    });

    it(`${fixture.name}: a second save changes nothing more`, async () => {
      const once = await openAndSave(fixture);
      const twice = await openAndSave({ ...fixture, config: once });
      expect(normalizeHaConfig(twice)).toEqual(normalizeHaConfig(once));
    });
  }
});

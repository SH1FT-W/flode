import { CORE_SCHEMA, load, Type } from 'js-yaml';

/** YAML's `<<` merge key — the same type js-yaml's default schema has. */
const MERGE_KEY_TYPE = new Type('tag:yaml.org,2002:merge', {
  kind: 'scalar',
  resolve: (data) => data === '<<' || data === null,
});

/**
 * How Home Assistant reads YAML: js-yaml's core schema plus `<<` merge keys —
 * its default schema without the timestamp type (and the explicit `!!binary`,
 * `!!set`, `!!omap`, `!!pairs` tags). HA keeps `2026-10-01 10:00:00` the text
 * it is; js-yaml's default would make it a Date, saved as
 * `2026-10-01T10:00:00.000Z`.
 */
const HA_YAML_SCHEMA = CORE_SCHEMA.extend({ implicit: [MERGE_KEY_TYPE] });

/** Loads YAML someone typed or pasted (an automation, a script, an AI reply). */
export function loadHaYaml(yaml: string): unknown {
  return load(yaml, { schema: HA_YAML_SCHEMA });
}

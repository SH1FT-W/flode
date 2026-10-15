import { CORE_SCHEMA, type DumpOptions, dump, load, Type } from 'js-yaml';

/**
 * Home Assistant reads YAML with PyYAML's YAML 1.1 rules, not the YAML 1.2
 * core schema js-yaml uses: `yes`/`on`/`Off` are booleans, `0755` is octal,
 * `1_000` a thousand and `1:30` (sexagesimal) ninety. Pasted YAML and AI
 * replies must mean to FLODE what they mean to HA.
 */

/** YAML's `<<` merge key — the same type js-yaml's default schema has. */
const MERGE_KEY_TYPE = new Type('tag:yaml.org,2002:merge', {
  kind: 'scalar',
  resolve: (data) => data === '<<' || data === null,
});

const BOOL_PATTERN =
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
const TRUE_WORDS = new Set(['yes', 'true', 'on']);

const BOOL_TYPE = new Type('tag:yaml.org,2002:bool', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string' && BOOL_PATTERN.test(data),
  construct: (data: string) => TRUE_WORDS.has(data.toLowerCase()),
  predicate: (data: unknown) => typeof data === 'boolean',
  represent: (data: unknown) => String(data),
});

const INT_PATTERN =
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;

const FLOAT_PATTERN =
  /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9_]+(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

/** `1:30:00` → 5400: base-60 digits, most significant first. */
function sexagesimal(value: string, parse: (digits: string) => number): number {
  return value.split(':').reduce((total, part) => total * 60 + parse(part), 0);
}

/** Splits the sign off a YAML number, without the `_` digit separators. */
function signed(data: string): { sign: number; digits: string } {
  const value = data.replace(/_/g, '');
  const sign = value.startsWith('-') ? -1 : 1;
  return { sign, digits: value.replace(/^[-+]/, '') };
}

function constructInt(data: string): number {
  const { sign, digits } = signed(data);
  if (digits.startsWith('0b')) return sign * Number.parseInt(digits.slice(2), 2);
  if (digits.startsWith('0x')) return sign * Number.parseInt(digits.slice(2), 16);
  if (digits.includes(':')) return sign * sexagesimal(digits, (d) => Number.parseInt(d, 10));
  if (digits.length > 1 && digits.startsWith('0')) return sign * Number.parseInt(digits, 8);
  return sign * Number.parseInt(digits, 10);
}

function constructFloat(data: string): number {
  const { sign, digits } = signed(data);
  const lower = digits.toLowerCase();
  if (lower === '.inf') return sign * Number.POSITIVE_INFINITY;
  if (lower === '.nan') return Number.NaN;
  if (digits.includes(':')) return sign * sexagesimal(digits, Number.parseFloat);
  return sign * Number.parseFloat(digits);
}

/** A float as YAML 1.1 reads it back — with a `.` before any exponent (`1.0e-7`). */
function representFloat(data: unknown): string {
  if (typeof data !== 'number' || Number.isNaN(data)) return '.nan';
  if (!Number.isFinite(data)) return data > 0 ? '.inf' : '-.inf';
  const text = String(data);
  return text.includes('.') ? text : text.replace(/e/, '.0e');
}

const INT_TYPE = new Type('tag:yaml.org,2002:int', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string' && INT_PATTERN.test(data),
  construct: constructInt,
  predicate: (data: unknown) => typeof data === 'number' && Number.isInteger(data),
  represent: (data: unknown) => String(data),
});

const FLOAT_TYPE = new Type('tag:yaml.org,2002:float', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string' && FLOAT_PATTERN.test(data),
  construct: constructFloat,
  predicate: (data: unknown) => typeof data === 'number' && !Number.isInteger(data),
  represent: representFloat,
});

/**
 * How Home Assistant reads YAML: js-yaml's core schema with YAML 1.1's
 * booleans and numbers (types of the same tag replace the core ones) plus `<<`
 * merge keys — without the timestamp type (and the explicit `!!binary`,
 * `!!set`, `!!omap`, `!!pairs` tags). HA keeps `2026-10-01 10:00:00` the text
 * it is; js-yaml's default would make it a Date, saved as `2026-10-01T10:00:00.000Z`.
 */
const HA_YAML_SCHEMA = CORE_SCHEMA.extend({
  implicit: [BOOL_TYPE, INT_TYPE, FLOAT_TYPE, MERGE_KEY_TYPE],
});

/** Loads YAML someone typed or pasted (an automation, a script, an AI reply). */
export function loadHaYaml(yaml: string): unknown {
  return load(yaml, { schema: HA_YAML_SCHEMA });
}

/**
 * Writes YAML that `loadHaYaml` (and HA) reads back as the same values — a
 * string like `1_000` or `0755` is quoted, so it stays a string.
 */
export function dumpHaYaml(value: unknown, options: DumpOptions = {}): string {
  return dump(value, { ...options, schema: HA_YAML_SCHEMA });
}

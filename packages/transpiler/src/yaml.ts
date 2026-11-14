import {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  type DumpOptions,
  dump,
  load,
  Type,
  YAMLException,
} from 'js-yaml';

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

/**
 * Whether js-yaml's default schema — what HA's own YAML editor in the browser
 * uses — reads `text` as something other than that text (YAML 1.2 numbers like
 * `0o17` or `1e3`, dates and times).
 */
function readOtherwiseInBrowser(text: string): boolean {
  try {
    return load(text, { schema: DEFAULT_SCHEMA }) !== text;
  } catch {
    return true;
  }
}

/**
 * Only for writing: a string either reader (HA or its browser editor) would take
 * for something else resolves to this type, so the dumper quotes it. It never
 * represents a value.
 */
const AMBIGUOUS_STRING_TYPE = new Type('tag:flode,2026:ambiguous-string', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string' && readOtherwiseInBrowser(data),
  predicate: () => false,
});

const DUMP_SCHEMA = HA_YAML_SCHEMA.extend({ implicit: [AMBIGUOUS_STRING_TYPE] });

/** HA's YAML style (what HA's own editor shows): two-space indent, no line wrapping, `"` quotes. */
export const HA_YAML_STYLE = {
  indent: 2,
  lineWidth: -1,
  quotingType: '"',
  forceQuotes: false,
} as const satisfies DumpOptions;

/** HA's style with the indent and line width a caller asked for (unset ones stay HA's). */
export function haYamlLayout(layout: { indent?: number; lineWidth?: number }): DumpOptions {
  return {
    indent: layout.indent ?? HA_YAML_STYLE.indent,
    lineWidth: layout.lineWidth ?? HA_YAML_STYLE.lineWidth,
  };
}

/**
 * Tags only Home Assistant's YAML loader knows (`!secret`, `!input` …): it
 * resolves them while reading its files. A config FLODE saves goes through
 * HA's config API as plain data, which has no way to hold such a tag.
 */
const HA_FILE_TAGS = new Set([
  '!secret',
  '!input',
  '!env_var',
  '!include',
  '!include_dir_list',
  '!include_dir_named',
  '!include_dir_merge_list',
  '!include_dir_merge_named',
]);

/** The tag js-yaml did not know (`unknown tag !<!secret>`), or `null`. */
function unknownTag(error: YAMLException): string | null {
  return /^unknown tag !<(.+)>/.exec(error.reason)?.[1] ?? null;
}

/** Loads YAML someone typed or pasted (an automation, a script, an AI reply). */
export function loadHaYaml(yaml: string): unknown {
  try {
    return load(yaml, { schema: HA_YAML_SCHEMA });
  } catch (error) {
    const tag = error instanceof YAMLException ? unknownTag(error) : null;
    if (error instanceof YAMLException && tag !== null && HA_FILE_TAGS.has(tag)) {
      throw new Error(
        `Line ${error.mark.line + 1}: ${tag} is a tag only Home Assistant's YAML files understand. FLODE saves through Home Assistant's editor, which cannot store it: put the value itself (or a template) there instead.`
      );
    }
    throw error;
  }
}

/**
 * Writes YAML that `loadHaYaml` (and HA) reads back as the same values — a
 * string like `1_000` or `0755` is quoted, so it stays a string — and that
 * HA's YAML editor in the browser reads the same way too (`2026-10-01`, `1e3`).
 */
export function dumpHaYaml(value: unknown, options: DumpOptions = {}): string {
  return dump(value, { ...HA_YAML_STYLE, ...options, schema: DUMP_SCHEMA });
}

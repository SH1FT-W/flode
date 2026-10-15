import { isPlainObject } from '@flode/shared';

/**
 * Renaming a variable inside Jinja templates (`{{ level * 2 }}` →
 * `{{ b_2__level * 2 }}`) — for merged automations whose variables clash.
 * Only identifiers inside `{{ … }}` / `{% … %}` are touched: never text
 * outside, string literals, attributes (`trigger.level`), filters or keyword
 * arguments. A template that binds the name itself (`{% set level = … %}`,
 * `{% for level in … %}`) can't be rewritten reliably.
 */

/** Replaces every string in `value` (at any depth) via `update`; unchanged parts keep their identity. */
export function mapStrings(value: unknown, update: (text: string) => string): unknown {
  if (typeof value === 'string') return update(value);
  if (Array.isArray(value)) {
    const mapped = value.map((item) => mapStrings(item, update));
    return mapped.some((item, index) => item !== value[index]) ? mapped : value;
  }
  if (!isPlainObject(value)) return value;
  let changed = false;
  const entries = Object.entries(value).map(([key, item]): [string, unknown] => {
    const mapped = mapStrings(item, update);
    if (mapped !== item) changed = true;
    return [key, mapped];
  });
  return changed ? Object.fromEntries(entries) : value;
}

const OPENERS: Record<string, string> = { '{{': '}}', '{%': '%}', '{#': '#}' };
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/y;
/** Statements that bind names — `{% set x = … %}`, `{% for x in … %}`, macro parameters … */
const BINDING_STATEMENT = /^\s*-?\s*(set|for|macro|call|with)\b/;

function previousSignificant(text: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(text[i] ?? '')) return text[i] ?? '';
  }
  return '';
}

function nextSignificant(text: string, index: number): string {
  let i = index;
  while (i < text.length && /\s/.test(text[i] ?? '')) i++;
  return text.slice(i, i + 2);
}

/** The positions of `name` used as a variable inside one Jinja expression (strings skipped). */
function variableUses(code: string, name: string): number[] {
  const uses: number[] = [];
  let i = 0;
  while (i < code.length) {
    const char = code[i] ?? '';
    if (char === "'" || char === '"') {
      i++;
      while (i < code.length && code[i] !== char) i += code[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    IDENTIFIER.lastIndex = i;
    const match = IDENTIFIER.exec(code);
    if (!match) {
      i++;
      continue;
    }
    const before = previousSignificant(code, i);
    const after = nextSignificant(code, i + match[0].length);
    const keyword = after.startsWith('=') && after !== '==';
    if (match[0] === name && before !== '.' && before !== '|' && !keyword) uses.push(i);
    i += match[0].length;
  }
  return uses;
}

/** Whether a statement binds `name` itself (then later uses mean the local one). */
function bindsName(code: string, name: string): boolean {
  const statement = BINDING_STATEMENT.exec(code);
  if (!statement) return false;
  const rest = code.slice(statement[0].length);
  const target =
    statement[1] === 'set'
      ? rest.split('=')[0]
      : statement[1] === 'for'
        ? rest.split(/\bin\b/)[0]
        : rest;
  return new RegExp(`(^|[^\\w.])${name}(?!\\w)`).test(target ?? '');
}

/**
 * `text` with the Jinja variable `from` renamed to `to`, or `null` when the
 * template binds `from` itself and can't be rewritten reliably.
 */
export function renameJinjaVariable(text: string, from: string, to: string): string | null {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const open = text.slice(index).search(/\{[{%#]/);
    if (open < 0) break;
    const start = index + open;
    const closer = OPENERS[text.slice(start, start + 2)] ?? '}}';
    const endAt = text.indexOf(closer, start + 2);
    const end = endAt < 0 ? text.length : endAt;
    const code = text.slice(start + 2, end);
    out += text.slice(index, start + 2);
    if (closer === '#}') {
      out += code;
    } else {
      if (closer === '%}' && bindsName(code, from)) return null;
      let last = 0;
      for (const use of variableUses(code, from)) {
        out += code.slice(last, use) + to;
        last = use + from.length;
      }
      out += code.slice(last);
    }
    out += text.slice(end, end + 2);
    index = end + 2;
  }
  return out + text.slice(index);
}

/** Whether a step (at any depth) defines `name` itself: `variables: {name: …}` or `response_variable: name`. */
export function definesVariable(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((item) => definesVariable(item, name));
  if (!isPlainObject(value)) return false;
  if (value.response_variable === name) return true;
  if (isPlainObject(value.variables) && name in value.variables) return true;
  return Object.values(value).some((item) => definesVariable(item, name));
}

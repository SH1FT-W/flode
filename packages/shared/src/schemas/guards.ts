/** A plain object (not `null`, not an array) — for narrowing `unknown` YAML/JSON values. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plain object (not `null`, not an array) — for narrowing `unknown` YAML/JSON values. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value HA accepts as one item or a list, as a list (`null`/`undefined` → empty). */
export function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** Maps a value HA accepts as one item or a list, keeping that shape. */
export function mapOneOrMany<T, R>(value: T | T[], map: (item: T) => R): R | R[] {
  return Array.isArray(value) ? value.map(map) : map(value);
}

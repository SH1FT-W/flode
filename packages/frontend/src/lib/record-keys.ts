/** `base`, or `base_1`, `base_2` … — the first key not in `existing`. */
export function uniqueKey(existing: readonly string[], base: string): string {
  let key = base;
  for (let n = 1; existing.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/** A copy of `record` with `oldKey` renamed to `newKey`, keeping the key order. */
export function renameKey<T>(
  record: Record<string, T>,
  oldKey: string,
  newKey: string
): Record<string, T> {
  if (oldKey === newKey) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === oldKey ? newKey : key, value])
  );
}

/** A copy of `record` without `key`. */
export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

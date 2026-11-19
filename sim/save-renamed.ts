export function renamedList(renames: ReadonlyMap<string, string>, value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const list: readonly unknown[] = value;
  return list.map((entry: unknown): unknown => (typeof entry === 'string' ? (renames.get(entry) ?? entry) : entry));
}

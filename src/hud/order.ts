export interface Move<T> {
  readonly item: T;
  readonly before: T | null;
}

export function moves<T>(current: readonly T[], desired: readonly T[]): readonly Move<T>[] {
  const working: T[] = [...current];
  const planned: Move<T>[] = [];
  desired.forEach((item: T, index: number): void => {
    if (working[index] === item) return;
    const from: number = working.indexOf(item);
    if (from >= 0) working.splice(from, 1);
    planned.push({ item, before: working[index] ?? null });
    working.splice(index, 0, item);
  });
  return planned;
}

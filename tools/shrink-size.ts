export type Size = readonly [number, number];

export function shrunkSize(size: Size, edge: number): Size | null {
  const [width, height]: Size = size;
  const longest: number = Math.max(width, height);
  if (longest <= edge) return null;
  const factor: number = edge / longest;
  return [Math.max(1, Math.round(width * factor)), Math.max(1, Math.round(height * factor))];
}

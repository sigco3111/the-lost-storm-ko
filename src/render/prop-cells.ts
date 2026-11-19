export const PROP_CELLS = {
  size: 20,
} as const;

export function propCell(x: number, z: number): string {
  return `${Math.floor(x / PROP_CELLS.size)}:${Math.floor(z / PROP_CELLS.size)}`;
}

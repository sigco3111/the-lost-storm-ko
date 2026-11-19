export const ATLAS_LAYOUT = {
  quarterUnits: 16,
  bigUnits: 4,
  quadrants: 4,
  smallPerQuadrant: 4,
  samplesPerAxis: 4,
  channels: 4,
} as const;

export interface AtlasCell {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export function bigCellCount(count: number): number {
  return Math.min(count, Math.floor((ATLAS_LAYOUT.quarterUnits - count) / (ATLAS_LAYOUT.bigUnits - 1)));
}

export function atlasCells(count: number, edge: number): AtlasCell[] {
  if (count < 1 || count > ATLAS_LAYOUT.quarterUnits) throw new Error(`an atlas holds 1 to ${ATLAS_LAYOUT.quarterUnits} tiles, not ${count}`);
  const big: number = bigCellCount(count);
  const half: number = edge / 2;
  const quarter: number = edge / 4;
  const quadrant = (index: number): AtlasCell => ({ x: (index % 2) * half, y: Math.floor(index / 2) * half, size: half });
  const cells: AtlasCell[] = Array.from({ length: big }, (_: unknown, index: number): AtlasCell => quadrant(index));
  for (let index: number = 0; cells.length < count; index += 1) {
    const corner: AtlasCell = quadrant(big + Math.floor(index / ATLAS_LAYOUT.smallPerQuadrant));
    const within: number = index % ATLAS_LAYOUT.smallPerQuadrant;
    cells.push({ x: corner.x + (within % 2) * quarter, y: corner.y + Math.floor(within / 2) * quarter, size: quarter });
  }
  return cells;
}

export function placeUv(cell: AtlasCell, edge: number, gutter: number, u: number, v: number): [number, number] {
  const inner: number = cell.size - 2 * gutter;
  return [(cell.x + gutter + u * inner) / edge, (cell.y + gutter + v * inner) / edge];
}

export function blankRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8Array(width * height * ATLAS_LAYOUT.channels) };
}

export function resample(source: Raster, size: number): Raster {
  const out: Raster = blankRaster(size, size);
  const n: number = ATLAS_LAYOUT.samplesPerAxis;
  const sx: number = source.width / size;
  const sy: number = source.height / size;
  for (let y: number = 0; y < size; y += 1) {
    for (let x: number = 0; x < size; x += 1) {
      const sum: number[] = [0, 0, 0, 0];
      for (let j: number = 0; j < n; j += 1) {
        const py: number = Math.min(source.height - 1, Math.floor((y + (j + 0.5) / n) * sy));
        for (let i: number = 0; i < n; i += 1) {
          const px: number = Math.min(source.width - 1, Math.floor((x + (i + 0.5) / n) * sx));
          const at: number = (py * source.width + px) * ATLAS_LAYOUT.channels;
          for (let c: number = 0; c < ATLAS_LAYOUT.channels; c += 1) sum[c] = (sum[c] ?? 0) + (source.data[at + c] ?? 0);
        }
      }
      const to: number = (y * size + x) * ATLAS_LAYOUT.channels;
      for (let c: number = 0; c < ATLAS_LAYOUT.channels; c += 1) out.data[to + c] = Math.round((sum[c] ?? 0) / (n * n));
    }
  }
  return out;
}

export function paste(atlas: Raster, tile: Raster, cell: AtlasCell, gutter: number): void {
  const inner: number = cell.size - 2 * gutter;
  if (tile.width !== inner || tile.height !== inner) throw new Error(`a tile for a ${cell.size} px cell must be ${inner} px, not ${tile.width}x${tile.height}`);
  for (let y: number = 0; y < cell.size; y += 1) {
    const ty: number = Math.min(inner - 1, Math.max(0, y - gutter));
    for (let x: number = 0; x < cell.size; x += 1) {
      const tx: number = Math.min(inner - 1, Math.max(0, x - gutter));
      const from: number = (ty * inner + tx) * ATLAS_LAYOUT.channels;
      const to: number = ((cell.y + y) * atlas.width + cell.x + x) * ATLAS_LAYOUT.channels;
      atlas.data.set(tile.data.subarray(from, from + ATLAS_LAYOUT.channels), to);
    }
  }
}

import type { ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { tileAtCell } from '../nav/layout.ts';

export function surfaceAt(zone: ZoneDef, x: number, z: number): string | null {
  return zone.floors[tileAtCell(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize))] ?? null;
}

export function nearestSurface(zone: ZoneDef, surfaces: readonly string[], from: Vec2, reach: number): Vec2 | null {
  const size: number = zone.cellSize;
  const span: number = Math.ceil(reach / size);
  const column: number = Math.floor(from.x / size);
  const row: number = Math.floor(from.z / size);
  let best: Vec2 | null = null;
  let bestDistance: number = reach;
  for (let r: number = row - span; r <= row + span; r += 1) {
    for (let c: number = column - span; c <= column + span; c += 1) {
      const surface: string | undefined = zone.floors[tileAtCell(zone, c, r)];
      if (surface === undefined || !surfaces.includes(surface)) continue;
      const centre: Vec2 = { x: (c + 0.5) * size, z: (r + 0.5) * size };
      const distance: number = Math.hypot(centre.x - from.x, centre.z - from.z);
      if (distance > bestDistance) continue;
      best = centre;
      bestDistance = distance;
    }
  }
  return best;
}

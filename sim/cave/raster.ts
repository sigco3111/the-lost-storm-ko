import type { ReadonlyVec2 } from '../math.ts';

export const ROCK: number = -1;

export const SMOOTH = {
  rounds: 6,
  rampKeep: 2,
  square: 3,
} as const;

export type RampAxis = 'x' | 'z';

export interface CaveRamp {
  readonly axis: RampAxis;
  readonly sign: 1 | -1;
  readonly line: number;
  readonly start: number;
  readonly width: number;
  readonly length: number;
}

export interface CaveRaster {
  readonly columns: number;
  readonly rows: number;
  readonly level: Int16Array;
  readonly feature: Int16Array;
  readonly letter: Uint8Array;
  readonly ramp: Uint8Array;
  conflict: boolean;
}

export function createRaster(columns: number, rows: number): CaveRaster {
  const count: number = columns * rows;
  return { columns, rows, level: new Int16Array(count).fill(ROCK), feature: new Int16Array(count).fill(ROCK), letter: new Uint8Array(count), ramp: new Uint8Array(count), conflict: false };
}

export function cellAt(raster: CaveRaster, column: number, row: number): number {
  return column < 0 || row < 0 || column >= raster.columns || row >= raster.rows ? -1 : row * raster.columns + column;
}

export function isFloor(raster: CaveRaster, index: number): boolean {
  return index >= 0 && ((raster.level[index] ?? ROCK) !== ROCK || raster.ramp[index] === 1);
}

export function paintCell(raster: CaveRaster, column: number, row: number, level: number, feature: number, letter: number): void {
  const index: number = cellAt(raster, column, row);
  if (index < 0) {
    raster.conflict = true;
    return;
  }
  if (raster.ramp[index] === 1) {
    raster.conflict = true;
    return;
  }
  const held: number = raster.level[index] ?? ROCK;
  if (held === level) return;
  if (held !== ROCK) {
    raster.conflict = true;
    return;
  }
  raster.level[index] = level;
  raster.feature[index] = feature;
  raster.letter[index] = letter;
}

export function paintRamp(raster: CaveRaster, column: number, row: number, feature: number, letter: number): void {
  const index: number = cellAt(raster, column, row);
  if (index < 0 || isFloor(raster, index)) {
    raster.conflict = true;
    return;
  }
  raster.ramp[index] = 1;
  raster.feature[index] = feature;
  raster.letter[index] = letter;
}

function segmentGap(px: number, pz: number, from: ReadonlyVec2, to: ReadonlyVec2): number {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const span: number = dx * dx + dz * dz;
  const along: number = span <= 0 ? 0 : Math.min(1, Math.max(0, ((px - from.x) * dx + (pz - from.z) * dz) / span));
  return Math.hypot(px - (from.x + dx * along), pz - (from.z + dz * along));
}

export function paintStroke(raster: CaveRaster, from: ReadonlyVec2, to: ReadonlyVec2, radius: number, level: number, feature: number, letter: number): void {
  const low: { readonly c: number; readonly r: number } = { c: Math.floor(Math.min(from.x, to.x) - radius) - 1, r: Math.floor(Math.min(from.z, to.z) - radius) - 1 };
  const high: { readonly c: number; readonly r: number } = { c: Math.ceil(Math.max(from.x, to.x) + radius) + 1, r: Math.ceil(Math.max(from.z, to.z) + radius) + 1 };
  for (let row: number = low.r; row <= high.r; row += 1) {
    for (let column: number = low.c; column <= high.c; column += 1) {
      if (segmentGap(column + 0.5, row + 0.5, from, to) <= radius) paintCell(raster, column, row, level, feature, letter);
    }
  }
}

export function rampCells(ramp: CaveRamp): { readonly column: number; readonly row: number; readonly along: number }[] {
  const cells: { readonly column: number; readonly row: number; readonly along: number }[] = [];
  for (let along: number = 0; along < ramp.length; along += 1) {
    for (let across: number = 0; across < ramp.width; across += 1) {
      const step: number = ramp.start + ramp.sign * along;
      const side: number = ramp.line - ramp.width / 2 + across;
      cells.push(ramp.axis === 'z' ? { column: side, row: step, along } : { column: step, row: side, along });
    }
  }
  return cells;
}

export function rampSidesClear(raster: CaveRaster, ramp: CaveRamp): boolean {
  for (let along: number = 0; along < ramp.length; along += 1) {
    const step: number = ramp.start + ramp.sign * along;
    for (const side of [ramp.line - ramp.width / 2 - 1, ramp.line + ramp.width / 2]) {
      const index: number = ramp.axis === 'z' ? cellAt(raster, side, step) : cellAt(raster, step, side);
      if (isFloor(raster, index)) return false;
    }
  }
  return true;
}

export function crowded(raster: CaveRaster, levelReach: number, featureReach: number): boolean {
  const { columns, rows } = raster;
  const reach: number = Math.max(levelReach, featureReach);
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      const here: number = row * columns + column;
      if (!isFloor(raster, here)) continue;
      const level: number = raster.level[here] ?? ROCK;
      const feature: number = raster.feature[here] ?? ROCK;
      for (let dr: number = 0; dr <= reach; dr += 1) {
        for (let dc: number = -reach; dc <= reach; dc += 1) {
          if (dr === 0 && dc <= 0) continue;
          const there: number = cellAt(raster, column + dc, row + dr);
          if (!isFloor(raster, there)) continue;
          const far: number = Math.max(Math.abs(dc), dr);
          const otherLevel: number = raster.level[there] ?? ROCK;
          if (far <= levelReach && level !== ROCK && otherLevel !== ROCK && otherLevel !== level) return true;
          if (far <= featureReach && Math.abs((raster.feature[there] ?? ROCK) - feature) > 1) return true;
        }
      }
    }
  }
  return false;
}

export function rockDistance(raster: CaveRaster): Int16Array {
  const { columns, rows } = raster;
  const far: Int16Array = new Int16Array(columns * rows).fill(-1);
  const queue: number[] = [];
  for (let index: number = 0; index < far.length; index += 1) {
    const column: number = index % columns;
    const row: number = Math.floor(index / columns);
    if (!isFloor(raster, index)) far[index] = 0;
    else if (column === 0 || row === 0 || column === columns - 1 || row === rows - 1) far[index] = 1;
    else continue;
    queue.push(index);
  }
  for (let head: number = 0; head < queue.length; head += 1) {
    const index: number = queue[head] ?? 0;
    const column: number = index % columns;
    const row: number = Math.floor(index / columns);
    for (let dr: number = -1; dr <= 1; dr += 1) {
      for (let dc: number = -1; dc <= 1; dc += 1) {
        const next: number = cellAt(raster, column + dc, row + dr);
        if (next < 0 || (far[next] ?? -1) >= 0) continue;
        far[next] = (far[index] ?? 0) + 1;
        queue.push(next);
      }
    }
  }
  return far;
}

export interface WallRise {
  readonly back: number;
  readonly side: number;
  readonly front: number;
}

export function wallLevels(raster: CaveRaster, band: number, rise: WallRise, top: number): Int16Array {
  const { columns, rows } = raster;
  const levels: Int16Array = Int16Array.from(raster.level);
  const source: Int32Array = new Int32Array(columns * rows).fill(-1);
  const steps: Int16Array = new Int16Array(columns * rows).fill(-1);
  const queue: number[] = [];
  for (let index: number = 0; index < source.length; index += 1) {
    if ((raster.level[index] ?? ROCK) === ROCK || raster.ramp[index] === 1) continue;
    source[index] = index;
    steps[index] = 0;
    queue.push(index);
  }
  for (let head: number = 0; head < queue.length; head += 1) {
    const index: number = queue[head] ?? 0;
    const column: number = index % columns;
    const row: number = Math.floor(index / columns);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: number = cellAt(raster, column + dc, row + dr);
      if (next < 0 || (steps[next] ?? -1) >= 0 || isFloor(raster, next)) continue;
      steps[next] = (steps[index] ?? 0) + 1;
      source[next] = source[index] ?? -1;
      queue.push(next);
    }
  }
  for (let index: number = 0; index < levels.length; index += 1) {
    if (isFloor(raster, index)) continue;
    const from: number = source[index] ?? -1;
    const far: number = steps[index] ?? -1;
    if (from < 0 || far < 0 || far > band) {
      levels[index] = top;
      continue;
    }
    const south: number = Math.floor(index / columns) - Math.floor(from / columns);
    const east: number = (index % columns) - (from % columns);
    const facing: number = south > 0 && east >= 0 ? rise.front : (south < 0 && east <= 0) || (south === 0 && east < 0) ? rise.back : rise.side;
    levels[index] = Math.min(top, (raster.level[from] ?? 0) + facing);
  }
  return levels;
}

export function evenRampSides(raster: CaveRaster, levels: Int16Array, ramp: CaveRamp): void {
  for (let along: number = 0; along < ramp.length; along += 1) {
    const step: number = ramp.start + ramp.sign * along;
    const sides: number[] = [ramp.line - ramp.width / 2 - 1, ramp.line + ramp.width / 2].map((side: number): number => (ramp.axis === 'z' ? cellAt(raster, side, step) : cellAt(raster, step, side)));
    const high: number = Math.max(...sides.map((index: number): number => (index < 0 ? ROCK : (levels[index] ?? ROCK))));
    for (const index of sides) if (index >= 0) levels[index] = high;
  }
}

function nearRamp(raster: CaveRaster, column: number, row: number, reach: number): boolean {
  for (let dr: number = -reach; dr <= reach; dr += 1) {
    for (let dc: number = -reach; dc <= reach; dc += 1) {
      const index: number = cellAt(raster, column + dc, row + dr);
      if (index >= 0 && raster.ramp[index] === 1) return true;
    }
  }
  return false;
}

function levelOf(raster: CaveRaster, column: number, row: number): number {
  const index: number = cellAt(raster, column, row);
  return index < 0 ? ROCK : (raster.level[index] ?? ROCK);
}

function settle(raster: CaveRaster, index: number, from: number): void {
  raster.level[index] = raster.level[from] ?? ROCK;
  raster.feature[index] = raster.feature[from] ?? ROCK;
  raster.letter[index] = raster.letter[from] ?? 0;
}

function squareHolds(raster: CaveRaster, column: number, row: number, level: number): boolean {
  for (let top: number = row - SMOOTH.square + 1; top <= row; top += 1) {
    for (let left: number = column - SMOOTH.square + 1; left <= column; left += 1) {
      let whole: boolean = true;
      for (let dr: number = 0; dr < SMOOTH.square && whole; dr += 1) {
        for (let dc: number = 0; dc < SMOOTH.square && whole; dc += 1) {
          const index: number = cellAt(raster, left + dc, top + dr);
          const held: number = index < 0 ? ROCK : (raster.level[index] ?? ROCK);
          if (held !== level || (index >= 0 && raster.ramp[index] === 1)) whole = false;
        }
      }
      if (whole) return true;
    }
  }
  return false;
}

function oneLevelAround(raster: CaveRaster, column: number, row: number): number {
  let found: number = ROCK;
  for (let dr: number = -SMOOTH.square + 1; dr < SMOOTH.square; dr += 1) {
    for (let dc: number = -SMOOTH.square + 1; dc < SMOOTH.square; dc += 1) {
      const level: number = levelOf(raster, column + dc, row + dr);
      if (level === ROCK) continue;
      if (found !== ROCK && found !== level) return ROCK;
      found = level;
    }
  }
  return found;
}

function smoothCell(raster: CaveRaster, column: number, row: number, fill: boolean): boolean {
  const index: number = row * raster.columns + column;
  const here: number = raster.level[index] ?? ROCK;
  if (!fill) {
    if (here === ROCK || squareHolds(raster, column, row, here)) return false;
    raster.level[index] = ROCK;
    raster.feature[index] = ROCK;
    raster.letter[index] = 0;
    return true;
  }
  if (here !== ROCK || squareHolds(raster, column, row, ROCK)) return false;
  const level: number = oneLevelAround(raster, column, row);
  if (level === ROCK) return false;
  const from: number = [cellAt(raster, column - 1, row), cellAt(raster, column + 1, row), cellAt(raster, column, row - 1), cellAt(raster, column, row + 1)].find((at: number): boolean => at >= 0 && raster.level[at] === level) ?? -1;
  if (from < 0) return false;
  settle(raster, index, from);
  return true;
}

function smoothPass(raster: CaveRaster, fill: boolean): boolean {
  let changed: boolean = false;
  for (let row: number = 0; row < raster.rows; row += 1) {
    for (let column: number = 0; column < raster.columns; column += 1) {
      if (raster.ramp[row * raster.columns + column] === 1 || nearRamp(raster, column, row, SMOOTH.rampKeep)) continue;
      if (smoothCell(raster, column, row, fill)) changed = true;
    }
  }
  return changed;
}

export function smoothRaster(raster: CaveRaster): void {
  for (let round: number = 0; round < SMOOTH.rounds; round += 1) {
    const opened: boolean = smoothPass(raster, false);
    const closed: boolean = smoothPass(raster, true);
    if (!opened && !closed) return;
  }
}

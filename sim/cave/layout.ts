import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { Rng } from '../rng.ts';
import type { CaveKit } from './kit.ts';
import type { CaveRamp, CaveRaster } from './raster.ts';
import { createRaster, crowded, paintCell, paintRamp, paintStroke, rampCells, rampSidesClear, smoothRaster } from './raster.ts';

export const CAVE_LAYOUT = {
  top: 29,
  step: 2,
  border: 5,
  stretch: { least: 0.85, most: 1.2 },
  rectStretch: { least: 0.7, most: 1.45 },
  wobble: [0.12, 0.1, 0.07],
  passage: { least: 9, most: 13 },
  spread: 1.12,
  apart: 5,
  candidates: 24,
  roomy: 20,
  downward: 0.15,
  jitter: 6,
  backtracks: 40,
  alcoves: { least: 2.5, widest: 4 },
  brush: 2.6,
  approachBrush: 1.9,
  approach: 4,
  bend: 0.35,
  rampAt: { least: 0.42, most: 0.6 },
  sway: 2,
  lead: 2,
  rampLength: 4,
  rampWidth: 4,
  levelReach: 2,
  featureReach: 3,
  pond: { size: 0.42, shore: 2 },
} as const;


export interface CaveChamber {
  readonly index: number;
  readonly centre: Vec2;
  readonly radius: number;
  readonly stretch: number;
  readonly turn: number;
  readonly level: number;
  readonly theme: string;
}

export interface CavePassage {
  readonly from: number;
  readonly to: number;
  readonly ramp: CaveRamp;
  readonly landing: Vec2;
}

export interface CellBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface CaveShape {
  readonly raster: CaveRaster;
  readonly chambers: readonly CaveChamber[];
  readonly passages: readonly CavePassage[];
}

function letterCode(letter: string): number {
  return letter.charCodeAt(0);
}

function inside(columns: number, rows: number, centre: ReadonlyVec2, reach: number): boolean {
  const edge: number = CAVE_LAYOUT.border + reach;
  return centre.x >= edge && centre.z >= edge && centre.x <= columns - edge && centre.z <= rows - edge;
}

function reachOf(kit: CaveKit, radius: number, stretch: number): number {
  return kit.shape.form === 'rect' ? Math.hypot(radius * stretch, radius / stretch) : radius * Math.max(stretch, 1 / stretch) * CAVE_LAYOUT.spread;
}

export function chamberBox(chamber: CaveChamber): CellBox {
  const halfX: number = chamber.radius * chamber.stretch;
  const halfZ: number = chamber.radius / chamber.stretch;
  return { left: Math.ceil(chamber.centre.x - halfX - 0.5), right: Math.floor(chamber.centre.x + halfX - 0.5), top: Math.ceil(chamber.centre.z - halfZ - 0.5), bottom: Math.floor(chamber.centre.z + halfZ - 0.5) };
}

function paintBox(raster: CaveRaster, box: CellBox, level: number, feature: number, letter: number): void {
  for (let row: number = box.top; row <= box.bottom; row += 1) {
    for (let column: number = box.left; column <= box.right; column += 1) paintCell(raster, column, row, level, feature, letter);
  }
}

function nextChamber(rng: Rng, kit: CaveKit, columns: number, rows: number, chambers: readonly CaveChamber[], rooms: number, top: number): CaveChamber | null {
  const last: CaveChamber | undefined = chambers.at(-1);
  if (last === undefined) return null;
  const index: number = chambers.length;
  let best: CaveChamber | null = null;
  let bestScore: number = -Infinity;
  for (let tries: number = 0; tries < CAVE_LAYOUT.candidates; tries += 1) {
    const angle: number = rng.range(0, Math.PI * 2);
    const shaped: CaveChamber = makeChamber(rng, kit, index, last.centre, rooms, top);
    const reach: number = reachOf(kit, shaped.radius, shaped.stretch);
    const hop: number = reach + reachOf(kit, last.radius, last.stretch) + rng.range(CAVE_LAYOUT.passage.least, CAVE_LAYOUT.passage.most);
    const candidate: CaveChamber = { ...shaped, centre: { x: last.centre.x + Math.cos(angle) * hop, z: last.centre.z + Math.sin(angle) * hop } };
    if (!inside(columns, rows, candidate.centre, reach)) continue;
    let nearest: number = CAVE_LAYOUT.roomy;
    let clear: boolean = true;
    for (const other of chambers) {
      if (other.index === last.index) continue;
      const gap: number = Math.hypot(other.centre.x - candidate.centre.x, other.centre.z - candidate.centre.z) - reach - reachOf(kit, other.radius, other.stretch);
      if (gap < CAVE_LAYOUT.apart) clear = false;
      nearest = Math.min(nearest, gap);
    }
    if (!clear) continue;
    const score: number = nearest + candidate.centre.z * CAVE_LAYOUT.downward + rng.range(0, CAVE_LAYOUT.jitter);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function makeChamber(rng: Rng, kit: CaveKit, index: number, centre: Vec2, rooms: number, top: number): CaveChamber {
  const radius: number = rng.range(kit.shape.radiusLeast, kit.shape.radiusMost) * rooms;
  const rect: boolean = kit.shape.form === 'rect';
  const stretch: number = rect ? rng.range(CAVE_LAYOUT.rectStretch.least, CAVE_LAYOUT.rectStretch.most) : rng.range(CAVE_LAYOUT.stretch.least, CAVE_LAYOUT.stretch.most);
  return { index, centre, radius, stretch, turn: rect ? 0 : rng.range(0, Math.PI), level: top - CAVE_LAYOUT.step * index, theme: kit.letters.themes[rng.int(0, kit.letters.themes.length - 1)] ?? kit.letters.passage };
}

function placeChambers(rng: Rng, kit: CaveKit, columns: number, rows: number, count: number, rooms: number, top: number): CaveChamber[] | null {
  const chambers: CaveChamber[] = [makeChamber(rng, kit, 0, { x: rng.range(columns * 0.2, columns * 0.8), z: CAVE_LAYOUT.border + kit.shape.radiusMost * rooms * 1.4 }, rooms, top)];
  let backtracks: number = 0;
  while (chambers.length < count) {
    const next: CaveChamber | null = nextChamber(rng, kit, columns, rows, chambers, rooms, top);
    if (next !== null) {
      chambers.push(next);
      continue;
    }
    backtracks += 1;
    if (backtracks > CAVE_LAYOUT.backtracks || chambers.length <= 1) return null;
    chambers.pop();
  }
  return chambers;
}

function blobReach(rng: Rng): (angle: number) => number {
  const phases: number[] = CAVE_LAYOUT.wobble.map((): number => rng.range(0, Math.PI * 2));
  return (angle: number): number => 1 + CAVE_LAYOUT.wobble.reduce((sum: number, part: number, at: number): number => sum + part * Math.sin(angle * (at + 1) + (phases[at] ?? 0)), 0);
}

function paintBlob(raster: CaveRaster, rng: Rng, centre: ReadonlyVec2, radius: number, stretch: number, turn: number, level: number, feature: number, letter: (dx: number, dz: number) => string): void {
  const wobble: (angle: number) => number = blobReach(rng);
  const reach: number = Math.ceil(radius * Math.max(stretch, 1 / stretch) * (1 + CAVE_LAYOUT.wobble.reduce((sum: number, part: number): number => sum + part, 0))) + 1;
  const cos: number = Math.cos(turn);
  const sin: number = Math.sin(turn);
  for (let row: number = Math.floor(centre.z - reach); row <= Math.ceil(centre.z + reach); row += 1) {
    for (let column: number = Math.floor(centre.x - reach); column <= Math.ceil(centre.x + reach); column += 1) {
      const dx: number = column + 0.5 - centre.x;
      const dz: number = row + 0.5 - centre.z;
      const u: number = (dx * cos + dz * sin) / (radius * stretch);
      const v: number = (-dx * sin + dz * cos) / (radius / stretch);
      if (Math.hypot(u, v) <= wobble(Math.atan2(v, u))) paintCell(raster, column, row, level, feature, letterCode(letter(dx, dz)));
    }
  }
}

function paintChamber(raster: CaveRaster, rng: Rng, kit: CaveKit, chamber: CaveChamber): void {
  const feature: number = chamber.index * 2;
  if (kit.shape.form === 'rect') {
    paintBox(raster, chamberBox(chamber), chamber.level, feature, letterCode(chamber.theme));
    return;
  }
  const pond: { readonly x: number; readonly z: number; readonly size: number } | null = rng.chance(kit.shape.pondChance) ? { x: rng.range(-0.3, 0.3) * chamber.radius, z: rng.range(-0.3, 0.3) * chamber.radius, size: chamber.radius * CAVE_LAYOUT.pond.size } : null;
  const letter = (dx: number, dz: number): string => {
    if (pond === null) return chamber.theme;
    const gap: number = Math.hypot(dx - pond.x, dz - pond.z);
    return gap <= pond.size ? kit.letters.pond : gap <= pond.size + CAVE_LAYOUT.pond.shore ? kit.letters.shore : chamber.theme;
  };
  paintBlob(raster, rng, chamber.centre, chamber.radius, chamber.stretch, chamber.turn, chamber.level, feature, letter);
  const alcoves: number = rng.int(0, kit.shape.alcoves);
  for (let at: number = 0; at < alcoves; at += 1) {
    const angle: number = rng.range(0, Math.PI * 2);
    const size: number = rng.range(CAVE_LAYOUT.alcoves.least, CAVE_LAYOUT.alcoves.widest);
    const out: number = chamber.radius * 0.95;
    paintBlob(raster, rng, { x: chamber.centre.x + Math.cos(angle) * out, z: chamber.centre.z + Math.sin(angle) * out }, size, 1, 0, chamber.level, feature, (): string => chamber.theme);
  }
}

function bent(rng: Rng, from: ReadonlyVec2, to: ReadonlyVec2): Vec2 {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const sway: number = rng.range(-CAVE_LAYOUT.bend, CAVE_LAYOUT.bend);
  return { x: (from.x + to.x) / 2 - dz * sway, z: (from.z + to.z) / 2 + dx * sway };
}

interface PassageLine {
  readonly axis: 'x' | 'z';
  readonly sign: 1 | -1;
  readonly line: number;
  readonly begin: number;
  readonly piece: number;
}

function linePoint(run: PassageLine, step: number): Vec2 {
  return run.axis === 'z' ? { x: run.line, z: step + 0.5 } : { x: step + 0.5, z: run.line };
}

function paintWinding(raster: CaveRaster, rng: Rng, run: PassageLine, from: CaveChamber, to: CaveChamber, feature: number, letter: number): void {
  const { sign, begin, piece } = run;
  const upper: Vec2 = linePoint(run, begin);
  const lower: Vec2 = linePoint(run, begin + sign * (piece - 1));
  const upperApproach: Vec2 = linePoint(run, begin - sign * CAVE_LAYOUT.approach);
  const lowerApproach: Vec2 = linePoint(run, begin + sign * (piece - 1 + CAVE_LAYOUT.approach));
  const upperBend: Vec2 = bent(rng, from.centre, upperApproach);
  const lowerBend: Vec2 = bent(rng, lowerApproach, to.centre);
  paintStroke(raster, from.centre, upperBend, CAVE_LAYOUT.brush, from.level, feature, letter);
  paintStroke(raster, upperBend, upperApproach, CAVE_LAYOUT.brush, from.level, feature, letter);
  paintStroke(raster, upperApproach, upper, CAVE_LAYOUT.approachBrush, from.level, feature, letter);
  paintStroke(raster, lower, lowerApproach, CAVE_LAYOUT.approachBrush, to.level, feature, letter);
  paintStroke(raster, lowerApproach, lowerBend, CAVE_LAYOUT.brush, to.level, feature, letter);
  paintStroke(raster, lowerBend, to.centre, CAVE_LAYOUT.brush, to.level, feature, letter);
}

function band(run: PassageLine, alongFrom: number, alongTo: number, acrossFrom: number, acrossTo: number): CellBox {
  const along: readonly [number, number] = [Math.min(alongFrom, alongTo), Math.max(alongFrom, alongTo)];
  const across: readonly [number, number] = [Math.min(acrossFrom, acrossTo), Math.max(acrossFrom, acrossTo)];
  return run.axis === 'z' ? { left: across[0], right: across[1], top: along[0], bottom: along[1] } : { left: along[0], right: along[1], top: across[0], bottom: across[1] };
}

function corridorTo(raster: CaveRaster, run: PassageLine, chamber: CaveChamber, end: number, feature: number, letter: number): void {
  const half: number = CAVE_LAYOUT.rampWidth / 2;
  const along: number = Math.round(run.axis === 'z' ? chamber.centre.z : chamber.centre.x);
  const across: number = Math.round(run.axis === 'z' ? chamber.centre.x : chamber.centre.z);
  paintBox(raster, band(run, along - half, along + half - 1, across, run.line), chamber.level, feature, letter);
  paintBox(raster, band(run, along, end, run.line - half, run.line + half - 1), chamber.level, feature, letter);
}

function paintCorridors(raster: CaveRaster, run: PassageLine, from: CaveChamber, to: CaveChamber, feature: number, letter: number): void {
  corridorTo(raster, run, from, run.begin - run.sign, feature, letter);
  corridorTo(raster, run, to, run.begin + run.sign * run.piece, feature, letter);
}

function paintPassage(raster: CaveRaster, rng: Rng, kit: CaveKit, from: CaveChamber, to: CaveChamber): CavePassage {
  const feature: number = from.index * 2 + 1;
  const letter: number = letterCode(kit.letters.passage);
  const dx: number = to.centre.x - from.centre.x;
  const dz: number = to.centre.z - from.centre.z;
  const axis: 'x' | 'z' = Math.abs(dz) >= Math.abs(dx) ? 'z' : 'x';
  const sign: 1 | -1 = (axis === 'z' ? dz : dx) >= 0 ? 1 : -1;
  const at: number = rng.range(CAVE_LAYOUT.rampAt.least, CAVE_LAYOUT.rampAt.most);
  const sway: number = rng.range(-CAVE_LAYOUT.sway, CAVE_LAYOUT.sway);
  const piece: number = CAVE_LAYOUT.lead * 2 + CAVE_LAYOUT.rampLength;
  const mid: Vec2 = { x: from.centre.x + dx * at, z: from.centre.z + dz * at };
  const line: number = Math.round(axis === 'z' ? mid.x + sway : mid.z + sway);
  const begin: number = Math.round((axis === 'z' ? mid.z : mid.x) - (sign * piece) / 2);
  const ramp: CaveRamp = { axis, sign, line, start: begin + sign * CAVE_LAYOUT.lead, width: CAVE_LAYOUT.rampWidth, length: CAVE_LAYOUT.rampLength };
  const run: PassageLine = { axis, sign, line, begin, piece };
  if (kit.shape.form === 'rect') paintCorridors(raster, run, from, to, feature, letter);
  else paintWinding(raster, rng, run, from, to, feature, letter);
  for (let along: number = 0; along < piece; along += 1) {
    const step: number = begin + sign * along;
    for (let across: number = 0; across < CAVE_LAYOUT.rampWidth; across += 1) {
      const side: number = line - CAVE_LAYOUT.rampWidth / 2 + across;
      const column: number = axis === 'z' ? side : step;
      const row: number = axis === 'z' ? step : side;
      if (along < CAVE_LAYOUT.lead) paintCell(raster, column, row, from.level, feature, letter);
      else if (along >= CAVE_LAYOUT.lead + CAVE_LAYOUT.rampLength) paintCell(raster, column, row, to.level, feature, letter);
    }
  }
  for (const cell of rampCells(ramp)) paintRamp(raster, cell.column, cell.row, feature, letter);
  return { from: from.index, to: to.index, ramp, landing: linePoint(run, begin + sign * (piece + 1)) };
}

export function deepestChambers(top: number): number {
  return Math.floor(top / CAVE_LAYOUT.step) + 1;
}

export function shapeCave(rng: Rng, kit: CaveKit, columns: number, rows: number, count: number, rooms: number, top: number): CaveShape | null {
  const chambers: CaveChamber[] | null = placeChambers(rng, kit, columns, rows, count, rooms, top);
  if (chambers === null) return null;
  const raster: CaveRaster = createRaster(columns, rows);
  for (const chamber of chambers) paintChamber(raster, rng, kit, chamber);
  const passages: CavePassage[] = [];
  for (let index: number = 0; index + 1 < chambers.length; index += 1) {
    const from: CaveChamber | undefined = chambers[index];
    const to: CaveChamber | undefined = chambers[index + 1];
    if (from === undefined || to === undefined) return null;
    passages.push(paintPassage(raster, rng, kit, from, to));
  }
  if (raster.conflict) return null;
  smoothRaster(raster);
  if (!passages.every((passage: CavePassage): boolean => rampSidesClear(raster, passage.ramp))) return null;
  if (crowded(raster, CAVE_LAYOUT.levelReach, CAVE_LAYOUT.featureReach)) return null;
  return { raster, chambers, passages };
}

import { TERRAIN_MARKS } from '../content/terrain-types.ts';
import type { PropDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { propBlockers } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { CaveChamber, CavePassage, CaveShape, CellBox } from './layout.ts';
import { CAVE_LAYOUT, chamberBox, deepestChambers, shapeCave } from './layout.ts';
import type { CaveKit, KitFamily, KitPiece, KitRow, KitRowSide } from './kit.ts';
import type { CaveRaster } from './raster.ts';
import { cellAt, evenRampSides, isFloor, rockDistance, ROCK, wallLevels } from './raster.ts';

export const CAVE_GEN = {
  cellSize: 2,
  attempts: 400,
  rockTop: CAVE_LAYOUT.top + 1,
  exitInset: 3,
  arrivalAway: 5,
  waypointAway: { least: 6, most: 12, best: 8 },
  standClear: 2,
  packClear: 3,
  edgeClear: { least: 2, most: 3 },
  safeReach: 16.5,
  packApart: 12,
  packTries: 300,
  templateSpread: 2,
  checkpointEvery: 3,
  checkpointReach: 6,
  clusterTries: 60,
  keepClear: 4,
  blockerKeep: 5.5,
  packKeep: 3,
  rampKeep: 2,
  blockerClear: 3,
  blockerApart: 2.5,
  screen: 14,
  screenStep: 2,
  stairQuarters: [1, 3],
  propSpin: 360,
  rowTurns: { wide: [0, 180, 90], deep: [90, 270, 0] },
} as const;

export interface LevelBand {
  readonly from: number;
  readonly to: number;
}

export interface ScreenLimit {
  readonly monsters: number;
  readonly lights: number;
}

export interface CaveRequest {
  readonly seed: number;
  readonly columns: number;
  readonly rows: number;
  readonly chambers: number;
  readonly levels: LevelBand;
  readonly packs: number;
  readonly packScale: number;
  readonly roomScale: number;
  readonly top: number;
  readonly ranks: readonly CaveRankShare[];
  readonly screen: ScreenLimit;
}

export interface CaveRankShare {
  readonly rank: string;
  readonly share: number;
}

export interface CaveMaker {
  readonly kit: CaveKit;
  readonly defs: ReadonlyMap<string, PropDef>;
  readonly judge: ((layout: CaveLayout) => readonly string[]) | null;
}

export interface CaveProp {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotationDegrees: number;
}

export interface CaveMember {
  readonly monster: string;
  readonly count: number;
}

export interface CavePack {
  readonly x: number;
  readonly z: number;
  readonly level: number;
  readonly members: readonly CaveMember[];
  readonly waits: number | null;
  readonly rank: string | null;
}

export interface CaveLayout {
  readonly seed: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly tiles: readonly string[];
  readonly levels: readonly string[];
  readonly chambers: readonly CaveChamber[];
  readonly passages: readonly CavePassage[];
  readonly props: readonly CaveProp[];
  readonly packs: readonly CavePack[];
  readonly start: Vec2;
  readonly entrance: Vec2;
  readonly waypoint: Vec2;
  readonly descent: Vec2;
  readonly descentArrival: Vec2;
  readonly checkpoints: readonly Vec2[];
}

export type CaveResult = { readonly ok: true; readonly layout: CaveLayout; readonly attempts: number } | { readonly ok: false; readonly problem: string };

interface Ground {
  readonly raster: CaveRaster;
  readonly clear: Int16Array;
  readonly size: number;
}

function centreOf(ground: Ground, index: number): Vec2 {
  return { x: ((index % ground.raster.columns) + 0.5) * ground.size, z: (Math.floor(index / ground.raster.columns) + 0.5) * ground.size };
}

function indexAt(ground: Ground, point: ReadonlyVec2): number {
  return cellAt(ground.raster, Math.floor(point.x / ground.size), Math.floor(point.z / ground.size));
}

function cellsWhere(ground: Ground, keep: (index: number) => boolean): number[] {
  const found: number[] = [];
  for (let index: number = 0; index < ground.clear.length; index += 1) if (keep(index)) found.push(index);
  return found;
}

function chamberCell(ground: Ground, chamber: CaveChamber, index: number, clear: number): boolean {
  return ground.raster.feature[index] === chamber.index * 2 && ground.raster.ramp[index] !== 1 && (ground.clear[index] ?? 0) >= clear;
}

function farthest(ground: Ground, cells: readonly number[], from: ReadonlyVec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestGap: number = -1;
  for (const index of cells) {
    const point: Vec2 = centreOf(ground, index);
    const gap: number = distance(point, from);
    if (gap > bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best;
}

function nearest(ground: Ground, cells: readonly number[], to: ReadonlyVec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestGap: number = Infinity;
  for (const index of cells) {
    const point: Vec2 = centreOf(ground, index);
    const gap: number = distance(point, to);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best;
}

function toward(from: ReadonlyVec2, to: ReadonlyVec2, away: number): Vec2 {
  const gap: number = Math.max(distance(from, to), 0.001);
  const share: number = Math.min(1, away / gap);
  return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share };
}

function metres(ground: Ground, cell: ReadonlyVec2): Vec2 {
  return { x: cell.x * ground.size, z: cell.z * ground.size };
}

interface Spots {
  readonly start: Vec2;
  readonly entrance: Vec2;
  readonly waypoint: Vec2;
  readonly descent: Vec2;
  readonly descentArrival: Vec2;
  readonly checkpoints: readonly Vec2[];
}

function placeSpots(ground: Ground, shape: CaveShape): Spots | null {
  const first: CaveChamber | undefined = shape.chambers[0];
  const second: CaveChamber | undefined = shape.chambers[1];
  const last: CaveChamber | undefined = shape.chambers.at(-1);
  const into: CavePassage | undefined = shape.passages.at(-1);
  if (first === undefined || second === undefined || last === undefined || into === undefined) return null;
  const firstCells: number[] = cellsWhere(ground, (index: number): boolean => chamberCell(ground, first, index, CAVE_GEN.exitInset));
  const entrance: Vec2 | null = farthest(ground, firstCells, metres(ground, second.centre));
  if (entrance === null) return null;
  const standing: number[] = cellsWhere(ground, (index: number): boolean => chamberCell(ground, first, index, CAVE_GEN.standClear));
  const start: Vec2 | null = nearest(ground, standing, toward(entrance, metres(ground, first.centre), CAVE_GEN.arrivalAway));
  if (start === null) return null;
  const waypointCells: number[] = firstCells.filter((index: number): boolean => {
    const point: Vec2 = centreOf(ground, index);
    const gap: number = distance(point, start);
    return gap >= CAVE_GEN.waypointAway.least && gap <= CAVE_GEN.waypointAway.most && distance(point, entrance) >= CAVE_GEN.waypointAway.least;
  });
  let waypoint: Vec2 | null = null;
  let miss: number = Infinity;
  for (const index of waypointCells) {
    const point: Vec2 = centreOf(ground, index);
    const off: number = Math.abs(distance(point, start) - CAVE_GEN.waypointAway.best);
    if (off < miss) {
      waypoint = point;
      miss = off;
    }
  }
  if (waypoint === null) return null;
  const lastCells: number[] = cellsWhere(ground, (index: number): boolean => chamberCell(ground, last, index, CAVE_GEN.exitInset));
  const descent: Vec2 | null = farthest(ground, lastCells, metres(ground, into.landing));
  if (descent === null) return null;
  const lastStanding: number[] = cellsWhere(ground, (index: number): boolean => chamberCell(ground, last, index, CAVE_GEN.standClear));
  const descentArrival: Vec2 | null = nearest(ground, lastStanding, toward(descent, metres(ground, last.centre), CAVE_GEN.arrivalAway));
  if (descentArrival === null) return null;
  const checkpoints: Vec2[] = [];
  for (const passage of shape.passages) {
    if (passage.to % CAVE_GEN.checkpointEvery !== 0 || passage.to === shape.chambers.length - 1) continue;
    const landing: Vec2 = metres(ground, passage.landing);
    const spot: Vec2 | null = nearest(ground, cellsWhere(ground, (index: number): boolean => ground.raster.ramp[index] !== 1 && isFloor(ground.raster, index) && (ground.clear[index] ?? 0) >= CAVE_GEN.standClear && distance(centreOf(ground, index), landing) <= ground.size * CAVE_GEN.checkpointReach), landing);
    if (spot !== null) checkpoints.push(spot);
  }
  return { start, entrance, waypoint, descent, descentArrival, checkpoints };
}

function safePoints(spots: Spots): Vec2[] {
  return [spots.start, spots.entrance, spots.waypoint, spots.descent, spots.descentArrival, ...spots.checkpoints];
}

function screenPeak(points: readonly { readonly at: ReadonlyVec2; readonly weight: number }[], around: ReadonlyVec2): number {
  let peak: number = 0;
  const reach: number = CAVE_GEN.screen;
  for (let dz: number = -reach; dz <= reach; dz += CAVE_GEN.screenStep) {
    for (let dx: number = -reach; dx <= reach; dx += CAVE_GEN.screenStep) {
      if (Math.hypot(dx, dz) > reach) continue;
      const eye: Vec2 = { x: around.x + dx, z: around.z + dz };
      let seen: number = 0;
      for (const point of points) if (distance(point.at, eye) <= reach) seen += point.weight;
      peak = Math.max(peak, seen);
    }
  }
  return peak;
}

function memberCount(members: readonly CaveMember[]): number {
  return members.reduce((sum: number, member: CaveMember): number => sum + member.count, 0);
}

function scaledMembers(template: KitFamily, scale: number): CaveMember[] {
  return template.members.map((member): CaveMember => ({ monster: member.monster, count: Math.max(1, Math.round(member.count * scale)) }));
}

function placePacks(rng: Rng, ground: Ground, shape: CaveShape, spots: Spots, request: CaveRequest, kit: CaveKit): CavePack[] | null {
  const safe: Vec2[] = safePoints(spots);
  const fighting: CaveChamber[] = shape.chambers.slice(1);
  const room: number[][] = fighting.map((chamber: CaveChamber): number[] => cellsWhere(ground, (index: number): boolean => chamberCell(ground, chamber, index, CAVE_GEN.packClear) && safe.every((point: Vec2): boolean => distance(point, centreOf(ground, index)) >= CAVE_GEN.safeReach)));
  const total: number = room.reduce((sum: number, cells: number[]): number => sum + cells.length, 0);
  if (total === 0) return null;
  const quotas: number[] = room.map((cells: number[]): number => Math.floor((cells.length / total) * request.packs));
  const order: number[] = room.map((_cells: number[], at: number): number => at).toSorted((a: number, b: number): number => ((room[b]?.length ?? 0) / total) * request.packs - (quotas[b] ?? 0) - (((room[a]?.length ?? 0) / total) * request.packs - (quotas[a] ?? 0)));
  let spare: number = request.packs - quotas.reduce((sum: number, quota: number): number => sum + quota, 0);
  for (const at of order) {
    if (spare <= 0) break;
    quotas[at] = (quotas[at] ?? 0) + 1;
    spare -= 1;
  }
  const packs: CavePack[] = [];
  const span: number = Math.max(1, shape.chambers.length - 2);
  const templates: readonly KitFamily[] = kit.families;
  for (let at: number = 0; at < fighting.length; at += 1) {
    const chamber: CaveChamber | undefined = fighting[at];
    const cells: number[] = room[at] ?? [];
    if (chamber === undefined || cells.length === 0) continue;
    const share: number = (chamber.index - 1) / span;
    let placed: number = 0;
    for (let tries: number = 0; tries < CAVE_GEN.packTries && placed < (quotas[at] ?? 0); tries += 1) {
      const spot: Vec2 = centreOf(ground, cells[rng.int(0, cells.length - 1)] ?? 0);
      if (packs.some((pack: CavePack): boolean => distance(pack, spot) < CAVE_GEN.packApart)) continue;
      const pick: number = Math.min(templates.length - 1, Math.max(0, Math.round(share * (templates.length - 1)) + rng.int(-CAVE_GEN.templateSpread, CAVE_GEN.templateSpread)));
      const template: KitFamily | undefined = templates[pick];
      if (template === undefined) return null;
      const members: CaveMember[] = scaledMembers(template, request.packScale);
      const weighed: { readonly at: Vec2; readonly weight: number }[] = [...packs.map((pack: CavePack): { readonly at: Vec2; readonly weight: number } => ({ at: { x: pack.x, z: pack.z }, weight: memberCount(pack.members) })), { at: spot, weight: memberCount(members) }];
      if (screenPeak(weighed, spot) > request.screen.monsters) continue;
      packs.push({ x: spot.x, z: spot.z, level: Math.round(request.levels.from + (request.levels.to - request.levels.from) * share), members, waits: template.waits, rank: null });
      placed += 1;
    }
  }
  return packs.length === request.packs ? packs : null;
}

interface Dressing {
  readonly ground: Ground;
  readonly props: CaveProp[];
  readonly lights: Vec2[];
  readonly blockers: { readonly at: Vec2; readonly reach: number }[];
  readonly keep: readonly Vec2[];
  readonly packs: readonly CavePack[];
  readonly nearRamp: Uint8Array;
  readonly screen: ScreenLimit;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function tryProp(dressing: Dressing, defs: ReadonlyMap<string, PropDef>, prop: string, at: Vec2, level: number, turn: number, hug: boolean = false): boolean {
  const def: PropDef | undefined = defs.get(prop);
  const index: number = indexAt(dressing.ground, at);
  if (def === undefined || index < 0 || !isFloor(dressing.ground.raster, index) || dressing.ground.raster.level[index] !== level || dressing.nearRamp[index] === 1) return false;
  if (dressing.keep.some((point: Vec2): boolean => distance(point, at) < CAVE_GEN.keepClear)) return false;
  const rotationDegrees: number = ((Math.round(turn) % CAVE_GEN.propSpin) + CAVE_GEN.propSpin) % CAVE_GEN.propSpin;
  const blocking: boolean = propBlockers(def, at.x, at.z, rotationDegrees).length > 0;
  if (blocking) {
    const reach: number = Math.max(def.blockRadius, def.blockLength / 2 + def.blockRadius, 1);
    if (!hug && (dressing.ground.clear[index] ?? 0) * dressing.ground.size < reach + CAVE_GEN.blockerClear * dressing.ground.size) return false;
    if (dressing.packs.some((pack: CavePack): boolean => distance(pack, at) < CAVE_GEN.packKeep + reach)) return false;
    if (dressing.keep.some((point: Vec2): boolean => distance(point, at) < CAVE_GEN.blockerKeep + reach)) return false;
    if (dressing.blockers.some((other): boolean => distance(other.at, at) < other.reach + reach + CAVE_GEN.blockerApart)) return false;
  }
  if (def.light !== null) {
    const weighed: { readonly at: Vec2; readonly weight: number }[] = [...dressing.lights.map((point: Vec2): { readonly at: Vec2; readonly weight: number } => ({ at: point, weight: 1 })), { at, weight: 1 }];
    if (screenPeak(weighed, at) > dressing.screen.lights) return false;
    dressing.lights.push(at);
  }
  if (blocking) dressing.blockers.push({ at, reach: Math.max(def.blockRadius, def.blockLength / 2 + def.blockRadius, 1) });
  dressing.props.push({ prop, x: rounded(at.x), z: rounded(at.z), y: 0, rotationDegrees });
  return true;
}

function rampMask(ground: Ground): Uint8Array {
  const mask: Uint8Array = new Uint8Array(ground.clear.length);
  const { columns } = ground.raster;
  for (let index: number = 0; index < mask.length; index += 1) {
    if (ground.raster.ramp[index] !== 1) continue;
    const column: number = index % columns;
    const row: number = Math.floor(index / columns);
    for (let dr: number = -CAVE_GEN.rampKeep - CAVE_LAYOUT.lead; dr <= CAVE_GEN.rampKeep + CAVE_LAYOUT.lead; dr += 1) {
      for (let dc: number = -CAVE_GEN.rampKeep - CAVE_LAYOUT.lead; dc <= CAVE_GEN.rampKeep + CAVE_LAYOUT.lead; dc += 1) {
        const near: number = cellAt(ground.raster, column + dc, row + dr);
        if (near >= 0) mask[near] = 1;
      }
    }
  }
  return mask;
}

function stairs(ground: Ground, shape: CaveShape, kit: CaveKit): CaveProp[] {
  const placed: CaveProp[] = [];
  for (const passage of shape.passages) {
    const { ramp } = passage;
    const low: number = Math.min(ramp.start, ramp.start + ramp.sign * (ramp.length - 1));
    const rotationDegrees: number = ramp.axis === 'z' ? (ramp.sign > 0 ? 0 : 180) : ramp.sign > 0 ? 90 : 270;
    for (const quarter of CAVE_GEN.stairQuarters) {
      const along: number = (low + quarter) * ground.size;
      const across: number = ramp.line * ground.size;
      placed.push({ prop: kit.stairs.prop, x: ramp.axis === 'z' ? across : along, z: ramp.axis === 'z' ? along : across, y: kit.stairs.y, rotationDegrees });
    }
  }
  return placed;
}

interface RowLine {
  readonly across: number;
  readonly turn: number;
}

function rowLines(row: KitRow, low: number, high: number, turns: readonly [number, number, number]): RowLine[] {
  return row.sides.flatMap((side: KitRowSide): RowLine[] => (side === 'long' ? [{ across: low + row.inset, turn: turns[0] }, { across: high - row.inset, turn: turns[1] }] : [{ across: (low + high) / 2, turn: turns[2] }]));
}

function placeRows(dressing: Dressing, defs: ReadonlyMap<string, PropDef>, kit: CaveKit, shape: CaveShape): void {
  const { size } = dressing.ground;
  for (const chamber of shape.chambers) {
    const box: CellBox = chamberBox(chamber);
    const wide: boolean = box.right - box.left >= box.bottom - box.top;
    const along: readonly [number, number] = wide ? [box.left * size, (box.right + 1) * size] : [box.top * size, (box.bottom + 1) * size];
    const across: readonly [number, number] = wide ? [box.top * size, (box.bottom + 1) * size] : [box.left * size, (box.right + 1) * size];
    for (const row of kit.rows) {
      const span: number = along[1] - along[0] - row.inset * 2;
      if (span < 0) continue;
      const count: number = Math.floor(span / row.step) + 1;
      const first: number = (along[0] + along[1]) / 2 - ((count - 1) * row.step) / 2;
      for (const line of rowLines(row, across[0], across[1], wide ? CAVE_GEN.rowTurns.wide : CAVE_GEN.rowTurns.deep)) {
        for (let at: number = 0; at < count; at += 1) {
          const step: number = first + at * row.step;
          tryProp(dressing, defs, row.prop, wide ? { x: step, z: line.across } : { x: line.across, z: step }, chamber.level, line.turn, true);
        }
      }
    }
  }
}

function dress(rng: Rng, ground: Ground, shape: CaveShape, spots: Spots, packs: readonly CavePack[], request: CaveRequest, maker: CaveMaker): CaveProp[] {
  const { kit, defs } = maker;
  const { clusters, caches } = kit;
  const floorTiles: number = cellsWhere(ground, (index: number): boolean => isFloor(ground.raster, index)).length;
  const dressing: Dressing = { ground, props: stairs(ground, shape, kit), lights: [], blockers: [], keep: safePoints(spots), packs, nearRamp: rampMask(ground), screen: request.screen };
  placeRows(dressing, defs, kit, shape);
  const edges: number[] = cellsWhere(ground, (index: number): boolean => {
    const clear: number = ground.clear[index] ?? 0;
    return isFloor(ground.raster, index) && ground.raster.ramp[index] !== 1 && (ground.raster.feature[index] ?? 1) % 2 === 0 && clear >= CAVE_GEN.edgeClear.least && clear <= CAVE_GEN.edgeClear.most;
  });
  if (edges.length === 0 || clusters.length === 0) return dressing.props;
  const wantLoose: number = Math.round(kit.density.props * floorTiles);
  let loose: number = 0;
  for (let tries: number = 0; tries < wantLoose * CAVE_GEN.clusterTries && loose < wantLoose; tries += 1) {
    const cluster: readonly KitPiece[] | undefined = clusters[rng.int(0, clusters.length - 1)];
    const anchor: number = edges[rng.int(0, edges.length - 1)] ?? 0;
    if (cluster === undefined) continue;
    const centre: Vec2 = centreOf(ground, anchor);
    const level: number = ground.raster.level[anchor] ?? ROCK;
    const spin: number = rng.range(0, Math.PI * 2);
    const cos: number = Math.cos(spin);
    const sin: number = Math.sin(spin);
    for (const member of cluster) {
      const at: Vec2 = { x: centre.x + member.dx * cos - member.dz * sin, z: centre.z + member.dx * sin + member.dz * cos };
      if (tryProp(dressing, defs, member.prop, at, level, member.turn - (spin * 180) / Math.PI)) loose += 1;
    }
  }
  const wantCaches: number = caches.length === 0 ? 0 : Math.round(kit.density.caches * floorTiles);
  let cached: number = 0;
  for (let tries: number = 0; tries < wantCaches * CAVE_GEN.clusterTries && cached < wantCaches; tries += 1) {
    const anchor: number = edges[rng.int(0, edges.length - 1)] ?? 0;
    const prop: string = caches[rng.int(0, caches.length - 1)] ?? '';
    if (tryProp(dressing, defs, prop, centreOf(ground, anchor), ground.raster.level[anchor] ?? ROCK, rng.range(0, CAVE_GEN.propSpin))) cached += 1;
  }
  return dressing.props;
}

function tileLines(raster: CaveRaster): string[] {
  const lines: string[] = [];
  for (let row: number = 0; row < raster.rows; row += 1) {
    let line: string = '';
    for (let column: number = 0; column < raster.columns; column += 1) {
      const index: number = row * raster.columns + column;
      line += isFloor(raster, index) ? String.fromCharCode(raster.letter[index] ?? 0) : ' ';
    }
    lines.push(line);
  }
  return lines;
}

function levelLines(raster: CaveRaster, levels: Int16Array): string[] {
  const lines: string[] = [];
  for (let row: number = 0; row < raster.rows; row += 1) {
    let line: string = '';
    for (let column: number = 0; column < raster.columns; column += 1) {
      const index: number = row * raster.columns + column;
      line += raster.ramp[index] === 1 ? TERRAIN_MARKS.ramp : (TERRAIN_MARKS.levels[Math.max(0, levels[index] ?? 0)] ?? '0');
    }
    lines.push(line);
  }
  return lines;
}

export function rankDeepest(packs: readonly CavePack[], ranks: readonly CaveRankShare[]): CavePack[] {
  const named: (string | null)[] = packs.map((): string | null => null);
  let from: number = packs.length;
  for (const entry of ranks) {
    const until: number = Math.max(0, from - Math.ceil(entry.share * packs.length));
    for (let at: number = until; at < from; at += 1) named[at] = entry.rank;
    from = until;
  }
  return packs.map((pack: CavePack, at: number): CavePack => ({ ...pack, rank: named[at] ?? null }));
}

function attempt(rng: Rng, request: CaveRequest, maker: CaveMaker): CaveLayout | null {
  const shape: CaveShape | null = shapeCave(rng, maker.kit, request.columns, request.rows, request.chambers, request.roomScale, request.top);
  if (shape === null) return null;
  const ground: Ground = { raster: shape.raster, clear: rockDistance(shape.raster), size: CAVE_GEN.cellSize };
  const spots: Spots | null = placeSpots(ground, shape);
  if (spots === null) return null;
  const placed: CavePack[] | null = placePacks(rng, ground, shape, spots, request, maker.kit);
  if (placed === null) return null;
  const packs: CavePack[] = rankDeepest(placed, request.ranks);
  const props: CaveProp[] = dress(rng, ground, shape, spots, packs, request, maker);
  const levels: Int16Array = wallLevels(shape.raster, maker.kit.walls.band, maker.kit.walls, CAVE_GEN.rockTop);
  for (const passage of shape.passages) evenRampSides(shape.raster, levels, passage.ramp);
  return { seed: request.seed, columns: request.columns, rows: request.rows, cellSize: CAVE_GEN.cellSize, tiles: tileLines(shape.raster), levels: levelLines(shape.raster, levels), chambers: shape.chambers, passages: shape.passages, props, packs, ...spots };
}

function rankShareProblem(ranks: readonly CaveRankShare[]): string | null {
  const bad: CaveRankShare | undefined = ranks.find((entry: CaveRankShare): boolean => entry.rank === '' || !(entry.share >= 0 && entry.share <= 1));
  if (bad !== undefined) return `a rank share names a rank and a share from 0 to 1, not ${bad.rank === '' ? 'no rank' : bad.rank} at ${bad.share}`;
  const total: number = ranks.reduce((sum: number, entry: CaveRankShare): number => sum + entry.share, 0);
  return total > 1 ? `the rank shares add up to ${total}, more than every pack` : null;
}

export function requestProblem(request: Pick<CaveRequest, 'chambers' | 'packs' | 'levels' | 'packScale' | 'roomScale' | 'top' | 'ranks'>): string | null {
  if (!Number.isInteger(request.top) || request.top < CAVE_LAYOUT.step || request.top > CAVE_LAYOUT.top) return `a cave's first chamber stands at a whole level from ${CAVE_LAYOUT.step} to ${CAVE_LAYOUT.top}, not ${request.top}`;
  if (!Number.isInteger(request.chambers) || request.chambers < 2 || request.chambers > deepestChambers(request.top)) return `a cave that starts at level ${request.top} has 2 to ${deepestChambers(request.top)} chambers, not ${request.chambers}`;
  if (!Number.isInteger(request.packs) || request.packs < 1) return `a cave has at least one pack, not ${request.packs}`;
  if (!Number.isInteger(request.levels.from) || !Number.isInteger(request.levels.to) || request.levels.from < 1 || request.levels.to < request.levels.from) return `the level band runs from a whole level of at least 1 up, not ${request.levels.from} to ${request.levels.to}`;
  if (!(request.packScale > 0)) return `the pack scale is above zero, not ${request.packScale}`;
  if (!(request.roomScale > 0)) return `the room scale is above zero, not ${request.roomScale}`;
  return rankShareProblem(request.ranks);
}

function kitProps(kit: CaveKit, defs: ReadonlyMap<string, PropDef>): string | null {
  const named: readonly string[] = [kit.stairs.prop, ...kit.caches, ...kit.rows.map((row: KitRow): string => row.prop), ...kit.clusters.flatMap((cluster: readonly KitPiece[]): string[] => cluster.map((piece: KitPiece): string => piece.prop))];
  const missing: readonly string[] = [...new Set(named.filter((prop: string): boolean => !defs.has(prop)))];
  if (missing.length > 0) return `kit ${kit.id} names props the game does not have: ${missing.join(', ')}`;
  const plain: readonly string[] = kit.caches.filter((prop: string): boolean => (defs.get(prop)?.cache ?? null) === null);
  return plain.length > 0 ? `kit ${kit.id} names caches that are not caches: ${plain.join(', ')}` : null;
}

export function generateCave(request: CaveRequest, maker: CaveMaker): CaveResult {
  const refused: string | null = requestProblem(request) ?? kitProps(maker.kit, maker.defs);
  if (refused !== null) return { ok: false, problem: refused };
  const rng: Rng = createRng(request.seed);
  let last: readonly string[] = [];
  for (let tries: number = 1; tries <= CAVE_GEN.attempts; tries += 1) {
    const layout: CaveLayout | null = attempt(rng, request, maker);
    if (layout === null) continue;
    const problems: readonly string[] = maker.judge === null ? [] : maker.judge(layout);
    if (problems.length === 0) return { ok: true, layout, attempts: tries };
    last = problems;
  }
  return { ok: false, problem: `no layout fits after ${CAVE_GEN.attempts} attempts${last.length > 0 ? `; the last failed: ${last.slice(0, 3).join('; ')}` : ''}` };
}

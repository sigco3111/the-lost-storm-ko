import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { floorAt, heightAt } from '../../sim/nav/terrain.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import type { Field } from './ground-terrain.ts';
import { GROUND_TERRAIN, sampleField, shownTiles } from './ground-terrain.ts';
import { CAMERA } from './iso-camera.ts';
import { CUTAWAY, frontWeight, highWeight, ringWeight, terrainHides, throughWindow } from './prop-cutaway.ts';
import type { FloorTest, PassThrough } from './terrain-lift.ts';
import { liftAt, rayToFloor, rayToSurface } from './terrain-lift.ts';

export const TERRAIN_SIGHT = {
  march: 0.1,
  nearTarget: 0.4,
  reach: 2,
  heights: [0.15, 0.95, 1.75],
  aspect: 16 / 9,
  near: 1,
  far: 220,
  floorRise: 0.35,
} as const;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CrossingCut = (x: number, y: number, z: number) => boolean;

export interface TerrainSight {
  drawnHeight(x: number, z: number): number | null;
  blocks(eye: Point3, target: Point3, cut: CrossingCut | null): boolean;
}

export function drawsTerrain(zone: ZoneDef): boolean {
  return zone.terrain !== null && zone.terrain.rough !== null;
}

interface Drawn {
  readonly field: Field;
  readonly shown: Uint8Array;
  readonly columns: number;
  readonly cellSize: number;
}

function heightIn(drawn: Drawn, x: number, z: number): number | null {
  const { field } = drawn;
  const fx: number = x / GROUND_TERRAIN.step;
  const fz: number = z / GROUND_TERRAIN.step;
  const column: number = Math.floor(fx);
  const row: number = Math.floor(fz);
  if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) return null;
  if (drawn.shown[Math.floor(z / drawn.cellSize) * drawn.columns + Math.floor(x / drawn.cellSize)] !== 1) return null;
  const tx: number = fx - column;
  const tz: number = fz - row;
  const at = (c: number, r: number): number => field.heights[r * field.columns + c] ?? 0;
  const top: number = at(column, row) + (at(column + 1, row) - at(column, row)) * tx;
  const bottom: number = at(column, row + 1) + (at(column + 1, row + 1) - at(column, row + 1)) * tx;
  return top + (bottom - top) * tz;
}

const made: WeakMap<ZoneDef, TerrainSight> = new WeakMap<ZoneDef, TerrainSight>();

export function createTerrainSight(zone: ZoneDef): TerrainSight | null {
  if (!drawsTerrain(zone)) return null;
  const known: TerrainSight | undefined = made.get(zone);
  if (known !== undefined) return known;
  const drawn: Drawn = {
    field: sampleField(zone),
    shown: shownTiles(zone, Math.ceil(zone.outside?.reach ?? TERRAIN_SIGHT.reach)),
    columns: zone.tiles[0]?.length ?? 0,
    cellSize: zone.cellSize,
  };
  const sight: TerrainSight = {
    drawnHeight: (x: number, z: number): number | null => heightIn(drawn, x, z),
    blocks(eye: Point3, target: Point3, cut: CrossingCut | null): boolean {
      const length: number = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
      const steps: number = Math.floor((length - TERRAIN_SIGHT.nearTarget) / TERRAIN_SIGHT.march);
      const start: number | null = heightIn(drawn, eye.x, eye.z);
      let above: boolean | null = start === null ? null : eye.y > start;
      for (let step: number = 1; step <= steps; step += 1) {
        const t: number = (step * TERRAIN_SIGHT.march) / length;
        const x: number = eye.x + (target.x - eye.x) * t;
        const y: number = eye.y + (target.y - eye.y) * t;
        const z: number = eye.z + (target.z - eye.z) * t;
        const ground: number | null = heightIn(drawn, x, z);
        const now: boolean | null = ground === null ? null : y > ground;
        if (above === true && now === false && (cut === null || !cut(x, y, z))) return true;
        above = now;
      }
      return false;
    },
  };
  made.set(zone, sight);
  return sight;
}

const view: PerspectiveCamera = new PerspectiveCamera(CAMERA.fov, TERRAIN_SIGHT.aspect, TERRAIN_SIGHT.near, TERRAIN_SIGHT.far);
const centre: Vector3 = new Vector3();
const projected: Vector3 = new Vector3();
const toView: Vector3 = new Vector3();

export function cameraEye(zone: ZoneDef, x: number, z: number): Vector3 {
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const lookY: number = liftAt(zone, x, z) + CAMERA.lookHeight;
  return new Vector3(x + Math.sin(yaw) * Math.cos(pitch) * CAMERA.distance, lookY + Math.sin(pitch) * CAMERA.distance, z + Math.cos(yaw) * Math.cos(pitch) * CAMERA.distance);
}

function depthOf(x: number, y: number, z: number): number {
  return -toView.set(x, y, z).applyMatrix4(view.matrixWorldInverse).z;
}

export function heroHidden(sight: TerrainSight, zone: ZoneDef, x: number, z: number, cutaway: boolean): boolean {
  const floor: number = liftAt(zone, x, z);
  const eye: Vector3 = cameraEye(zone, x, z);
  view.position.copy(eye);
  view.lookAt(x, floor + CAMERA.lookHeight, z);
  view.updateMatrixWorld(true);
  const heroDepth: number = depthOf(x, floor + CUTAWAY.heroHeight, z);
  centre.set(x, floor + CUTAWAY.heroHeight, z).project(view);
  return TERRAIN_SIGHT.heights.every((height: number): boolean => {
    projected.set(x, floor + height, z).project(view);
    const ring: number = ringWeight(((projected.x - centre.x) * TERRAIN_SIGHT.aspect) / 2, (projected.y - centre.y) / 2);
    const cut: CrossingCut | null = cutaway ? (px: number, py: number, pz: number): boolean => ring * frontWeight(heroDepth, depthOf(px, py, pz)) * highWeight(py - floor) >= CUTAWAY.cleared : null;
    return sight.blocks(eye, { x, y: floor + height, z }, cut);
  });
}

export function clickHeight(zone: ZoneDef): (x: number, z: number) => number {
  const sight: TerrainSight | null = createTerrainSight(zone);
  if (sight === null) return (x: number, z: number): number => heightAt(zone, x, z);
  return (x: number, z: number): number => sight.drawnHeight(x, z) ?? Number.NaN;
}

const CELL_CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export function clickFloor(zone: ZoneDef): FloorTest {
  const drawn: boolean = drawsTerrain(zone);
  const floorY = (x: number, z: number): number => (drawn ? liftAt(zone, x, z) : heightAt(zone, x, z));
  const step: number = GROUND_TERRAIN.step;
  return (x: number, y: number, z: number): boolean => {
    if (!floorAt(zone, x, z)) return false;
    let low: number = floorY(x, z);
    let high: number = low;
    const left: number = Math.floor(x / step) * step;
    const top: number = Math.floor(z / step) * step;
    for (const [across, down] of CELL_CORNERS) {
      const cx: number = left + across * step;
      const cz: number = top + down * step;
      if (!floorAt(zone, cx, cz)) continue;
      const height: number = floorY(cx, cz);
      low = Math.min(low, height);
      high = Math.max(high, height);
    }
    return y >= low - TERRAIN_SIGHT.floorRise && y <= high + TERRAIN_SIGHT.floorRise;
  };
}

export type ClickRule = 'surface' | 'floor';

export interface FloorSpot {
  readonly x: number;
  readonly z: number;
}

export interface ClickLanding {
  readonly miss: number;
  readonly windowed: boolean;
  readonly nearer: boolean;
}

const clickRay: Ray = new Ray();
const landed: Vector3 = new Vector3();

export function clickLanding(sight: TerrainSight, zone: ZoneDef, hero: FloorSpot, target: FloorSpot, radius: number | null, rule: ClickRule): ClickLanding {
  const heroFloor: number = liftAt(zone, hero.x, hero.z);
  const floor: number = liftAt(zone, target.x, target.z);
  const eye: Vector3 = cameraEye(zone, hero.x, hero.z);
  view.position.copy(eye);
  view.lookAt(hero.x, heroFloor + CAMERA.lookHeight, hero.z);
  view.updateMatrixWorld(true);
  const opened: boolean = radius !== null && terrainHides(sight, { x: hero.x, z: hero.z, floor: heroFloor }, eye);
  centre.set(hero.x, heroFloor + CUTAWAY.heroHeight, hero.z).project(view);
  projected.set(target.x, floor, target.z).project(view);
  const through: PassThrough | null =
    opened && radius !== null
      ? throughWindow({ level: 1, depth: depthOf(hero.x, heroFloor + CUTAWAY.heroHeight, hero.z), floor: heroFloor, across: ((projected.x - centre.x) / 2) * TERRAIN_SIGHT.aspect, up: (projected.y - centre.y) / 2, radius, inverse: view.matrixWorldInverse })
      : null;
  clickRay.origin.copy(eye);
  clickRay.direction.set(target.x - eye.x, floor - eye.y, target.z - eye.z).normalize();
  const heightOf: (x: number, z: number) => number = clickHeight(zone);
  const isFloor: FloorTest = clickFloor(zone);
  const hit: Vector3 | null = rule === 'floor' ? rayToFloor(clickRay, heightOf, isFloor, landed, through) : rayToSurface(clickRay, heightOf, landed, through);
  const nearer: boolean = hit !== null && isFloor(hit.x, hit.y, hit.z) && hit.distanceTo(eye) < Math.hypot(target.x - eye.x, floor - eye.y, target.z - eye.z);
  return { miss: hit === null ? Number.POSITIVE_INFINITY : Math.hypot(hit.x - target.x, hit.z - target.z), windowed: through !== null, nearer };
}

export function clickMiss(sight: TerrainSight, zone: ZoneDef, x: number, z: number, window: boolean, rule: ClickRule = 'floor'): number {
  return clickLanding(sight, zone, { x, z }, { x, z }, window ? CUTAWAY.radius : null, rule).miss;
}

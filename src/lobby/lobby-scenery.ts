import type { Camera, Material, Object3D } from 'three';
import { AdditiveBlending, Box3, BufferGeometry, Color, ConeGeometry, DataTexture, Euler, Group, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, RGBAFormat, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef } from '../../sim/content/types.ts';
import { loadModel } from '../render/character-loader.ts';
import { lookOf, withPropLook } from '../render/prop-surface.ts';
import type { PropLook } from '../render/prop-surface.ts';
import { dressedProp } from '../render/surfaces.ts';
import type { PropDressing } from '../render/surfaces.ts';
import type { GroundContact } from './lobby-contact.ts';
import { groundHeight } from './lobby-ground.ts';
import type { Mound } from './lobby-ground.ts';
import { stepSpring } from './lobby-orbit.ts';
import type { Spring } from './lobby-orbit.ts';
import type { Flash, Glow, Lamp, LobbySet, Roost, Rubble, SetPiece, Skyline } from './lobby-sets.ts';
import { setMounds } from './lobby-sets.ts';
import { skirtMaterial, skirtRubble, skirtUniforms } from './lobby-skirt.ts';
import type { SkirtGround, SkirtUniforms } from './lobby-skirt.ts';
import { skylineGeometry, skylineWindows } from './lobby-skyline.ts';
import type { RingPoint } from './lobby-skyline.ts';

export const LOBBY_SCENERY = {
  wet: 0.12,
  swayHz: 0.21,
  roostSwayDegrees: 5,
  roostSwayHz: 0.27,
  roostColor: 0x15120f,
  roostWidth: 0.4,
  roostSides: 5,
  glowTexture: 64,
  window: { size: 0.42, strength: 0.95, color: '#ffb766' },
  lamp: { decay: 2, slowHz: 1.3, fastHz: 3.7, fastShare: 0.4, slowPhase: 0.37, fastPhase: 0.61 },
  noContact: 1000,
  presence: { freq: 0.45, damping: 1 },
  solidAt: 0.999,
  flash: { rise: 0.05, fall: 0.42, echoAfter: 0.16, echo: 0.6 },
} as const;

const DEGREES: number = Math.PI / 180;

export function pieceSeat(piece: SetPiece, mounds: readonly Mound[]): number {
  return groundHeight(piece.x, piece.z, mounds) - piece.sink + piece.y;
}

interface PieceScratch {
  readonly tilt: Euler;
  readonly turn: Quaternion;
  readonly seat: Vector3;
  readonly size: Vector3;
}

const PIECE_SCRATCH: PieceScratch = { tilt: new Euler(), turn: new Quaternion(), seat: new Vector3(), size: new Vector3() };

export function pieceMatrixInto(target: Matrix4, piece: SetPiece, scale: number, mounds: readonly Mound[], swayRadians: number): Matrix4 {
  const { tilt, turn, seat, size }: PieceScratch = PIECE_SCRATCH;
  turn.setFromEuler(tilt.set(piece.pitchDegrees * DEGREES, piece.yawDegrees * DEGREES + swayRadians, piece.rollDegrees * DEGREES, 'YXZ'));
  return target.compose(seat.set(piece.x, pieceSeat(piece, mounds), piece.z), turn, size.setScalar(scale * piece.size));
}

export function pieceMatrix(piece: SetPiece, scale: number, mounds: readonly Mound[], swayRadians: number): Matrix4 {
  return pieceMatrixInto(new Matrix4(), piece, scale, mounds, swayRadians);
}

export function swayAngle(piece: SetPiece, seconds: number, index: number): number {
  return Math.sin(seconds * LOBBY_SCENERY.swayHz * Math.PI * 2 + index * 1.7) * piece.swayDegrees * DEGREES;
}

export interface FlashState {
  wait: number;
  since: number;
}

export function strikeShape(since: number): number {
  const spec = LOBBY_SCENERY.flash;
  const pulse = (age: number): number => (age < 0 ? 0 : age < spec.rise ? age / spec.rise : Math.exp(-(age - spec.rise) / spec.fall));
  return Math.min(1, pulse(since) + spec.echo * pulse(since - spec.echoAfter));
}

export function stepFlash(state: FlashState, flash: Flash, dt: number, random: () => number): number {
  state.since += dt;
  state.wait -= dt;
  if (state.wait <= 0) {
    state.since = 0;
    state.wait = flash.everyMin + (flash.everyMax - flash.everyMin) * random();
  }
  return strikeShape(state.since) * flash.strength;
}

export function featherShare(radius: number): number {
  const inside: number = Math.max(0, 1 - radius * radius);
  return inside * inside;
}

function featherTexture(): DataTexture {
  const size: number = LOBBY_SCENERY.glowTexture;
  const data: Uint8Array = new Uint8Array(size * size * 4);
  for (let y: number = 0; y < size; y += 1) {
    for (let x: number = 0; x < size; x += 1) {
      const value: number = Math.round(featherShare(Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1)) * 255);
      data.fill(value, (y * size + x) * 4, (y * size + x) * 4 + 3);
      data[(y * size + x) * 4 + 3] = 255;
    }
  }
  const texture: DataTexture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

interface LoadedProp {
  readonly def: PropDef;
  readonly gltf: GLTF;
}

interface Fading {
  readonly material: MeshStandardMaterial | MeshBasicMaterial;
  readonly base: number;
  readonly keepsBlend: boolean;
}

interface Swaying {
  readonly mesh: InstancedMesh;
  readonly object: Matrix4;
  readonly piece: SetPiece;
  readonly scale: number;
  readonly slot: number;
  readonly index: number;
}

export interface SetDressing {
  readonly lamps: Group;
  build(): Promise<Group>;
  asSolid<T>(work: () => T): T;
  show(instant: boolean): void;
  step(dt: number, camera: Camera): number;
}

export function lampFlicker(seconds: number, index: number, flicker: number): number {
  const spec = LOBBY_SCENERY.lamp;
  const slow: number = Math.sin((seconds * spec.slowHz + index * spec.slowPhase) * Math.PI * 2);
  const fast: number = Math.sin((seconds * spec.fastHz + index * spec.fastPhase) * Math.PI * 2);
  return Math.max(0, 1 + flicker * ((1 - spec.fastShare) * slow + spec.fastShare * fast));
}

export function lampLights(lamps: readonly Lamp[]): readonly PointLight[] {
  return lamps.map((lamp: Lamp): PointLight => {
    const light: PointLight = new PointLight(new Color(lamp.color), 0, lamp.distance, LOBBY_SCENERY.lamp.decay);
    light.position.set(lamp.x, lamp.y, lamp.z);
    return light;
  });
}

export function windowGlows(skylines: readonly Skyline[]): readonly Glow[] {
  const spec = LOBBY_SCENERY.window;
  return skylines.flatMap((skyline: Skyline): Glow[] => skylineWindows(skyline).map((point: RingPoint): Glow => ({ x: point.x, y: point.y, z: point.z, size: spec.size, color: spec.color, strength: spec.strength })));
}

function dressOf(set: LobbySet, def: PropDef, material: MeshStandardMaterial, groundDressed: boolean): Readonly<Record<string, string>> {
  if (groundDressed) return { [material.name]: set.ground };
  return set.stone === null ? def.surfaces : { [material.name]: set.stone };
}

function ownMaterial(content: Content, set: LobbySet, def: PropDef, material: MeshStandardMaterial, ground: number, groundDressed: boolean): MeshStandardMaterial | null {
  const dress: Readonly<Record<string, string>> = dressOf(set, def, material, groundDressed);
  const dressing: PropDressing = { wet: LOBBY_SCENERY.wet, ground: set.skirt === null ? ground : ground - LOBBY_SCENERY.noContact };
  const made: Material = dressedProp(content, dress, material, dressing);
  if (!(made instanceof MeshStandardMaterial)) return null;
  const look: PropLook | undefined = lookOf(made);
  const own: MeshStandardMaterial = look === undefined ? made.clone() : withPropLook(made.clone(), look);
  own.color.multiplyScalar(set.shade);
  if (def.tint !== null) own.color.multiply(new Color(def.tint));
  return own;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

type RoostMesh = InstancedMesh<ConeGeometry, MeshStandardMaterial>;
type GlowMesh = InstancedMesh<PlaneGeometry, MeshBasicMaterial>;

function roostMesh(roosts: readonly Roost[]): RoostMesh {
  const geometry: ConeGeometry = new ConeGeometry(LOBBY_SCENERY.roostWidth / 2, 1, LOBBY_SCENERY.roostSides);
  geometry.rotateX(Math.PI);
  geometry.translate(0, -0.5, 0);
  const material: MeshStandardMaterial = new MeshStandardMaterial({ color: LOBBY_SCENERY.roostColor, roughness: 1 });
  return new InstancedMesh<ConeGeometry, MeshStandardMaterial>(geometry, material, roosts.length);
}

function glowMesh(glows: readonly Glow[]): GlowMesh {
  const material: MeshBasicMaterial = new MeshBasicMaterial({ alphaMap: featherTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
  const mesh: GlowMesh = new InstancedMesh<PlaneGeometry, MeshBasicMaterial>(new PlaneGeometry(1, 1), material, glows.length);
  glows.forEach((glow: Glow, index: number): void => {
    mesh.setColorAt(index, new Color(glow.color).multiplyScalar(glow.strength));
  });
  mesh.frustumCulled = false;
  return mesh;
}

export function footprintOf(gltf: GLTF, scale: number): number {
  const box: Box3 = new Box3().setFromObject(gltf.scene);
  return (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * scale;
}

export function createSetDressing(set: LobbySet, content: Content, loader: GLTFLoader, contact: GroundContact, ground: SkirtGround | null, random: () => number = Math.random): SetDressing {
  const mounds: readonly Mound[] = setMounds(set);
  const skirt: SkirtUniforms | null = set.skirt === null || ground === null ? null : skirtUniforms(set.skirt, ground, contact);
  const allGlows: readonly Glow[] = [...set.glows, ...windowGlows(set.skylines)];
  const group: Group = new Group();
  const fading: Fading[] = [];
  const swaying: Swaying[] = [];
  const presence: Spring = { x: 0, v: 0 };
  const flashState: FlashState = { wait: set.flash === null ? 0 : set.flash.everyMin * random(), since: Number.POSITIVE_INFINITY };
  const lamps: Group = new Group();
  const bulbs: readonly PointLight[] = lampLights(set.lamps);
  if (bulbs.length > 0) lamps.add(...bulbs);
  let shown: boolean = false;
  let solid: boolean = false;
  let amount: number = 0;
  let seconds: number = 0;
  let roosts: RoostMesh | null = null;
  let glows: GlowMesh | null = null;
  const toFade = (material: MeshStandardMaterial | MeshBasicMaterial, keepsBlend: boolean): void => {
    fading.push({ material, base: material.opacity, keepsBlend });
    material.transparent = true;
    material.opacity = 0;
  };

  const placeProp = (def: PropDef, gltf: GLTF, pieces: readonly SetPiece[], groundDressed: boolean): void => {
    const floorHeight: number = pieces.reduce((sum: number, piece: SetPiece): number => sum + groundHeight(piece.x, piece.z, mounds), 0) / pieces.length;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const geometry: unknown = object.geometry;
      const material: unknown = object.material;
      if (!(material instanceof MeshStandardMaterial) || !isGeometry(geometry)) return;
      const own: MeshStandardMaterial | null = ownMaterial(content, set, def, material, floorHeight, groundDressed);
      if (own === null) return;
      if (skirt !== null && pieces.every((piece: SetPiece): boolean => piece.skirt)) skirtMaterial(own, skirt);
      toFade(own, false);
      const mesh: InstancedMesh = new InstancedMesh(geometry, own, pieces.length);
      mesh.castShadow = set.shadows;
      mesh.receiveShadow = set.shadows;
      const local: Matrix4 = object.matrixWorld.clone();
      pieces.forEach((piece: SetPiece, slot: number): void => {
        mesh.setMatrixAt(slot, new Matrix4().multiplyMatrices(pieceMatrix(piece, def.scale, mounds, 0), local));
        if (piece.swayDegrees > 0) swaying.push({ mesh, object: local, piece, scale: def.scale, slot, index: swaying.length });
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
  };

  const assemble = async (): Promise<void> => {
    const byKey: Map<string, SetPiece[]> = new Map<string, SetPiece[]>();
    for (const piece of set.pieces) byKey.set(`${piece.prop}:${piece.skirt}`, [...(byKey.get(`${piece.prop}:${piece.skirt}`) ?? []), piece]);
    const rubbleProp: string | null = set.skirt?.rubble?.prop ?? null;
    const ids: readonly string[] = [...new Set([...set.pieces.map((piece: SetPiece): string => piece.prop), ...(rubbleProp === null ? [] : [rubbleProp])])];
    const models: Map<string, LoadedProp> = new Map<string, LoadedProp>();
    await Promise.all(
      ids.map(async (id: string): Promise<void> => {
        const def: PropDef | undefined = content.props.get(id);
        if (def === undefined) return;
        const gltf: GLTF | null = await loadModel(loader, def.model).catch((): null => null);
        if (gltf !== null) models.set(id, { def, gltf });
      }),
    );
    for (const pieces of byKey.values()) {
      const first: SetPiece | undefined = pieces[0];
      const model: LoadedProp | undefined = first === undefined ? undefined : models.get(first.prop);
      if (model !== undefined) placeProp(model.def, model.gltf, pieces, false);
    }
    const rubble: Rubble | null = set.skirt?.rubble ?? null;
    const rubbleModel: LoadedProp | undefined = rubble === null ? undefined : models.get(rubble.prop);
    if (rubble !== null && rubbleModel !== undefined) {
      const footprint = (piece: SetPiece): number => {
        const model: LoadedProp | undefined = models.get(piece.prop);
        return model === undefined ? 0 : footprintOf(model.gltf, model.def.scale * piece.size);
      };
      const stones: readonly SetPiece[] = skirtRubble(set.pieces, rubble, footprint);
      if (stones.length > 0) placeProp(rubbleModel.def, rubbleModel.gltf, stones, true);
    }
    for (const skyline of set.skylines) {
      const material: MeshBasicMaterial = new MeshBasicMaterial({ color: new Color(skyline.color), fog: false });
      toFade(material, false);
      group.add(new Mesh(skylineGeometry(skyline), material));
    }
    if (set.roosts.length > 0) {
      const hanging: RoostMesh = roostMesh(set.roosts);
      toFade(hanging.material, false);
      group.add(hanging);
      roosts = hanging;
    }
    if (allGlows.length > 0) {
      const lit: GlowMesh = glowMesh(allGlows);
      toFade(lit.material, true);
      group.add(lit);
      glows = lit;
      faced.set(Number.NaN, Number.NaN, Number.NaN, Number.NaN);
    }
  };

  let building: Promise<Group> | null = null;
  const settle = (share: number, final: boolean): void => {
    for (const entry of fading) {
      entry.material.opacity = entry.base * share;
      entry.material.transparent = final ? entry.keepsBlend : true;
    }
  };

  const at: Matrix4 = new Matrix4();
  const facing: Quaternion = new Quaternion();
  const point: Vector3 = new Vector3();
  const size: Vector3 = new Vector3();
  const swung: Matrix4 = new Matrix4();
  const tilt: Euler = new Euler();
  const faced: Quaternion = new Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN);

  return {
    lamps,
    build(): Promise<Group> {
      building ??= assemble().then((): Group => group);
      return building;
    },
    asSolid<T>(work: () => T): T {
      settle(1, true);
      try {
        return work();
      } finally {
        if (solid) settle(1, true);
        else settle(amount, false);
      }
    },
    show(instant: boolean): void {
      shown = true;
      if (!instant) return;
      solid = true;
      amount = 1;
      presence.x = 1;
      settle(1, true);
    },
    step(dt: number, camera: Camera): number {
      seconds += dt;
      if (shown && !solid) {
        amount = Math.min(1, Math.max(0, stepSpring(presence, 1, LOBBY_SCENERY.presence.freq, LOBBY_SCENERY.presence.damping, dt)));
        solid = amount >= LOBBY_SCENERY.solidAt;
        if (solid) amount = 1;
        for (const entry of fading) {
          entry.material.opacity = entry.base * (solid ? 1 : amount);
          if (solid && !entry.keepsBlend) entry.material.transparent = false;
        }
      }
      for (let index: number = 0; index < bulbs.length; index += 1) {
        const light: PointLight | undefined = bulbs[index];
        const lamp: Lamp | undefined = set.lamps[index];
        if (light !== undefined) light.intensity = lamp === undefined ? 0 : lamp.intensity * amount * lampFlicker(seconds, index, lamp.flicker);
      }
      for (const sway of swaying) {
        sway.mesh.setMatrixAt(sway.slot, at.multiplyMatrices(pieceMatrixInto(swung, sway.piece, sway.scale, mounds, swayAngle(sway.piece, seconds, sway.index)), sway.object));
        sway.mesh.instanceMatrix.needsUpdate = true;
      }
      const hanging: RoostMesh | null = roosts;
      if (hanging !== null) {
        for (let index: number = 0; index < set.roosts.length; index += 1) {
          const roost: Roost | undefined = set.roosts[index];
          if (roost === undefined) continue;
          const swing: number = Math.sin(seconds * LOBBY_SCENERY.roostSwayHz * Math.PI * 2 + index * 2.3) * LOBBY_SCENERY.roostSwayDegrees * DEGREES;
          hanging.setMatrixAt(index, at.compose(point.set(roost.x, roost.y, roost.z), facing.setFromEuler(tilt.set(0, index, swing)), size.setScalar(roost.size)));
        }
        hanging.instanceMatrix.needsUpdate = true;
      }
      const lit: GlowMesh | null = glows;
      if (lit !== null && !faced.equals(camera.quaternion)) {
        faced.copy(camera.quaternion);
        for (let index: number = 0; index < allGlows.length; index += 1) {
          const glow: Glow | undefined = allGlows[index];
          if (glow !== undefined) lit.setMatrixAt(index, at.compose(point.set(glow.x, glow.y, glow.z), camera.quaternion, size.setScalar(glow.size)));
        }
        lit.instanceMatrix.needsUpdate = true;
      }
      return set.flash === null ? 0 : stepFlash(flashState, set.flash, dt, random);
    },
  };
}

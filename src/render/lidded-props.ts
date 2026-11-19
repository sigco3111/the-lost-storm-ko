import type { Material, Object3D } from 'three';
import { BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PropDef, PropLid } from '../../sim/content/types.ts';
import type { OpenService } from '../../sim/world/service-types.ts';
import { loadModel } from './character-loader.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';
import type { LidEvent, LidStep, LidSwing } from './prop-lid.ts';
import { closedSwing, lidAngle, openAt, splitAtSeam, stepLid } from './prop-lid.ts';

export const LIDDED_PROPS = {
  glowRadius: 0.95,
  glowFill: 0.55,
  glowBand: 0.3,
  glowWidth: 0.45,
  glowWobble: 0.2,
  glowStrength: 0.2,
} as const;

const INNER_GLOW: Color = new Color(0xffb460);

export interface LiddedPlacement {
  readonly def: PropDef;
  readonly lid: PropLid;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export type LidDress = (def: PropDef, material: MeshStandardMaterial) => Material;

export interface LiddedProps {
  readonly group: Group;
  readonly ready: Promise<void>;
  update(service: OpenService | null, time: number, dt: number): void;
  takeEvents(): LidEvent[];
  dispose(): void;
}

interface LiddedView {
  readonly placed: LiddedPlacement;
  readonly hinge: Group;
  readonly glow: GroundLight;
  readonly swing: LidSwing;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function dressModel(model: GLTF, placed: LiddedPlacement, dress: LidDress, root: Group, hinge: Group, geometries: BufferGeometry[]): void {
  const toHinge: Matrix4 = new Matrix4().makeTranslation(0, -placed.lid.seam, -placed.lid.hinge);
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh)) return;
    const shape: unknown = child.geometry;
    const source: unknown = child.material;
    if (!isGeometry(shape) || !(source instanceof MeshStandardMaterial)) return;
    const material: Material = dress(placed.def, source);
    const whole: BufferGeometry = shape.clone().applyMatrix4(child.matrixWorld);
    const base: BufferGeometry = splitAtSeam(whole, placed.lid.seam, false);
    const top: BufferGeometry = splitAtSeam(whole, placed.lid.seam, true).applyMatrix4(toHinge);
    whole.dispose();
    for (const [geometry, parent] of [[base, root], [top, hinge]] as const) {
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      const mesh: Mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  });
}

export function createLiddedProps(loader: GLTFLoader, placements: readonly LiddedPlacement[], dress: LidDress): LiddedProps {
  const group: Group = new Group();
  const geometries: BufferGeometry[] = [];
  let events: LidEvent[] = [];
  const views: LiddedView[] = placements.map((placed: LiddedPlacement): LiddedView => {
    const glow: GroundLight = createGroundLight(INNER_GLOW, { kind: 'round', radius: LIDDED_PROPS.glowRadius, inner: 0, arc: Math.PI * 2 }, { fill: LIDDED_PROPS.glowFill, band: LIDDED_PROPS.glowBand, width: LIDDED_PROPS.glowWidth, wobble: LIDDED_PROPS.glowWobble });
    glow.mesh.position.set(placed.x, placed.y + GROUND_LIGHT.height, placed.z);
    glow.pose(0, 0);
    group.add(glow.mesh);
    return { placed, hinge: new Group(), glow, swing: closedSwing() };
  });
  const ready: Promise<void> = Promise.all(
    views.map(async (view: LiddedView): Promise<void> => {
      const model: GLTF = await loadModel(loader, view.placed.def.model);
      const root: Group = new Group();
      view.hinge.position.set(0, view.placed.lid.seam, view.placed.lid.hinge);
      root.add(view.hinge);
      dressModel(model, view.placed, dress, root, view.hinge, geometries);
      root.position.set(view.placed.x, view.placed.y, view.placed.z);
      root.rotation.y = view.placed.yaw;
      root.scale.setScalar(view.placed.def.scale);
      group.add(root);
    }),
  ).then((): void => undefined);
  return {
    group,
    ready,
    update(service: OpenService | null, time: number, dt: number): void {
      for (const view of views) {
        const step: LidStep = stepLid(view.swing, openAt(service, view.placed), dt);
        if (step === 'opened') events.push({ type: 'lid-opened', x: view.placed.x, z: view.placed.z });
        if (step === 'landed') events.push({ type: 'lid-closed', x: view.placed.x, z: view.placed.z });
        view.hinge.rotation.x = lidAngle(view.placed.lid, view.swing.value);
        view.glow.pose(clamp01(view.swing.value) * LIDDED_PROPS.glowStrength, time);
      }
    },
    takeEvents(): LidEvent[] {
      const taken: LidEvent[] = events;
      events = [];
      return taken;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const view of views) view.glow.dispose();
      group.removeFromParent();
    },
  };
}

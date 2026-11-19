import type { Object3D } from 'three';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef, ZoneDef } from '../../sim/content/types.ts';
import type { TunnelPoint, TunnelRoof, ZoneTunnel } from '../../sim/content/tunnel-types.ts';
import { loadModel } from './character-loader.ts';
import type { CutSpring } from './prop-cutaway.ts';
import { springCut } from './prop-cutaway.ts';
import { liftAt } from './terrain-lift.ts';

export const TUNNEL_ROOF = {
  feather: 3,
  ghost: 0.1,
} as const;

const DEGREES: number = Math.PI / 180;

export type RoofDress = (def: PropDef, material: MeshStandardMaterial) => MeshStandardMaterial[];

export interface TunnelRoofs {
  readonly group: Group;
  readonly ready: Promise<void>;
  update(x: number, z: number, dt: number): void;
  dispose(): void;
}

export function pathDistance(path: readonly TunnelPoint[], x: number, z: number): number {
  let best: number = Number.POSITIVE_INFINITY;
  for (let index: number = 1; index < path.length; index += 1) {
    const from: TunnelPoint | undefined = path[index - 1];
    const to: TunnelPoint | undefined = path[index];
    if (from === undefined || to === undefined) continue;
    const dx: number = to.x - from.x;
    const dz: number = to.z - from.z;
    const span: number = dx * dx + dz * dz;
    const along: number = span > 0 ? Math.min(1, Math.max(0, ((x - from.x) * dx + (z - from.z) * dz) / span)) : 0;
    best = Math.min(best, Math.hypot(from.x + dx * along - x, from.z + dz * along - z));
  }
  return best;
}

export function underShare(tunnel: ZoneTunnel, x: number, z: number): number {
  const beyond: number = pathDistance(tunnel.path, x, z) - tunnel.width / 2;
  return Math.min(1, Math.max(0, 1 - beyond / TUNNEL_ROOF.feather));
}

export function roofOpacity(level: number): number {
  return 1 - (1 - TUNNEL_ROOF.ghost) * Math.min(1, Math.max(0, level));
}

function standardMaterials(value: unknown): MeshStandardMaterial[] {
  if (value instanceof MeshStandardMaterial) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial);
}

async function buildPiece(loader: GLTFLoader, zone: ZoneDef, def: PropDef, piece: TunnelRoof, dress: RoofDress, group: Group): Promise<MeshStandardMaterial[]> {
  const gltf: GLTF = await loadModel(loader, def.model);
  const object: Object3D = gltf.scene.clone(true);
  object.position.set(piece.x, piece.y + liftAt(zone, piece.x, piece.z), piece.z);
  object.rotation.y = piece.rotationDegrees * DEGREES;
  object.scale.setScalar(def.scale * piece.size);
  const worn: MeshStandardMaterial[] = [];
  object.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh)) return;
    const shared: unknown = child.material;
    const own: MeshStandardMaterial[] = standardMaterials(shared).map((material: MeshStandardMaterial): MeshStandardMaterial => dress(def, material)[0] ?? material.clone());
    const first: MeshStandardMaterial | undefined = own[0];
    if (Array.isArray(shared) && own.length === shared.length) child.material = own;
    else if (!Array.isArray(shared) && first !== undefined) child.material = first;
    else return;
    child.castShadow = false;
    child.receiveShadow = true;
    for (const material of own) material.transparent = true;
    worn.push(...own);
  });
  group.add(object);
  return worn;
}

export function createTunnelRoofs(loader: GLTFLoader, content: Content, zone: ZoneDef, dress: RoofDress): TunnelRoofs {
  const group: Group = new Group();
  const springs: CutSpring[] = zone.tunnels.map((): CutSpring => ({ level: 0, velocity: 0 }));
  const materials: MeshStandardMaterial[][] = zone.tunnels.map((): MeshStandardMaterial[] => []);
  const ready: Promise<void> = Promise.all(
    zone.tunnels.flatMap((tunnel: ZoneTunnel, index: number): Promise<void>[] =>
      tunnel.roof.map(async (piece: TunnelRoof): Promise<void> => {
        const def: PropDef | undefined = content.props.get(piece.prop);
        if (def === undefined) return;
        materials[index]?.push(...(await buildPiece(loader, zone, def, piece, dress, group)));
      }),
    ),
  ).then((): void => undefined);
  return {
    group,
    ready,
    update(x: number, z: number, dt: number): void {
      zone.tunnels.forEach((tunnel: ZoneTunnel, index: number): void => {
        const spring: CutSpring = springCut(springs[index] ?? { level: 0, velocity: 0 }, underShare(tunnel, x, z), dt);
        springs[index] = spring;
        const opacity: number = roofOpacity(spring.level);
        for (const material of materials[index] ?? []) {
          material.opacity = opacity;
          material.depthWrite = opacity > TUNNEL_ROOF.ghost * 2;
        }
      });
    },
    dispose(): void {
      group.removeFromParent();
      for (const list of materials) for (const material of list) material.dispose();
    },
  };
}

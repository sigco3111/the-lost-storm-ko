import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material, Object3D } from 'three';
import { InstancedMesh, Mesh, SkinnedMesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

function attributeShape(name: string, attribute: Attribute): string {
  const gpu: string = 'gpuType' in attribute ? String(attribute.gpuType) : 'shared';
  return `${name}:${String(attribute.itemSize)}:${String(attribute.normalized)}:${attribute.array.constructor.name}:${gpu}`;
}

export function geometryShape(geometry: BufferGeometry): string {
  const plain: string[] = Object.entries(geometry.attributes).map(([name, attribute]: [string, Attribute]): string => attributeShape(name, attribute)).toSorted();
  const morphs: string[] = Object.entries(geometry.morphAttributes).map(([name, list]: [string, readonly Attribute[] | undefined]): string => `${name}x${String(list?.length ?? 0)}`).toSorted();
  return [geometry.index === null ? 'flat' : 'indexed', String(geometry.morphTargetsRelative), ...plain, '#', ...morphs].join('|');
}

function soleMaterial(mesh: Mesh): Material | null {
  const material: Material | Material[] = mesh.material;
  return Array.isArray(material) ? null : material;
}

function grouped<T>(items: readonly T[], keyOf: (item: T) => string | null): T[][] {
  const groups: Map<string, T[]> = new Map<string, T[]>();
  const order: T[][] = [];
  for (const item of items) {
    const key: string | null = keyOf(item);
    const found: T[] | undefined = key === null ? undefined : groups.get(key);
    if (found !== undefined) {
      found.push(item);
      continue;
    }
    const fresh: T[] = [item];
    if (key !== null) groups.set(key, fresh);
    order.push(fresh);
  }
  return order;
}

function skinnedKey(piece: SkinnedMesh): string | null {
  const material: Material | null = soleMaterial(piece);
  if (material === null) return null;
  piece.updateWorldMatrix(true, false);
  const bones: string = piece.skeleton.bones.map((bone: Object3D): string => bone.name).join(',');
  return [material.uuid, bones, piece.matrixWorld.elements.join(','), piece.bindMatrix.elements.join(','), geometryShape(piece.geometry)].join('#');
}

export function mergeSkinnedAlike(pieces: readonly SkinnedMesh[]): SkinnedMesh[] {
  return grouped(pieces, skinnedKey).flatMap((group: SkinnedMesh[]): SkinnedMesh[] => {
    const first: SkinnedMesh | undefined = group[0];
    const material: Material | null = first === undefined ? null : soleMaterial(first);
    if (first === undefined || material === null || group.length === 1) return group;
    const merged: SkinnedMesh = new SkinnedMesh(mergeGeometries(group.map((piece: SkinnedMesh): BufferGeometry => piece.geometry), false), material);
    merged.name = first.name;
    first.matrixWorld.decompose(merged.position, merged.quaternion, merged.scale);
    merged.updateMatrixWorld(true);
    merged.bind(first.skeleton, first.bindMatrix);
    return [merged];
  });
}

function rigid(object: Object3D): object is Mesh {
  return object instanceof Mesh && !(object instanceof SkinnedMesh) && !(object instanceof InstancedMesh) && object.children.length === 0;
}

function rigidKey(mesh: Mesh): string | null {
  const material: Material | null = soleMaterial(mesh);
  if (material === null || mesh.parent === null) return null;
  return [mesh.parent.uuid, material.uuid, String(mesh.visible), String(mesh.castShadow), String(mesh.receiveShadow), String(mesh.renderOrder), geometryShape(mesh.geometry)].join('#');
}

export function mergeRigidAlike(root: Object3D): Object3D {
  const meshes: Mesh[] = [];
  root.traverse((object: Object3D): void => {
    if (rigid(object)) meshes.push(object);
  });
  for (const group of grouped(meshes, rigidKey)) {
    const first: Mesh | undefined = group[0];
    const parent: Object3D | null = first?.parent ?? null;
    const material: Material | null = first === undefined ? null : soleMaterial(first);
    if (first === undefined || parent === null || material === null || group.length === 1) continue;
    const placed: BufferGeometry[] = group.map((mesh: Mesh): BufferGeometry => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const merged: Mesh = new Mesh(mergeGeometries(placed, false), material);
    for (const copy of placed) copy.dispose();
    merged.name = first.name;
    merged.visible = first.visible;
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    parent.add(merged);
    for (const mesh of group) mesh.removeFromParent();
  }
  return root;
}

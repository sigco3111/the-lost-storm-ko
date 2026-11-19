import type { BufferGeometry, Object3D, Skeleton } from 'three';
import { Box3, Mesh, SkinnedMesh, Vector3 } from 'three';

export const ACTOR_BOUNDS = {
  flesh: 0.15,
} as const;

const rigid: Box3 = new Box3();
const skeletal: Box3 = new Box3();
const joint: Vector3 = new Vector3();

function skinnedPart(object: Object3D): object is SkinnedMesh {
  return object instanceof SkinnedMesh;
}

function rigidPart(object: Object3D): object is Mesh {
  return object instanceof Mesh && !(object instanceof SkinnedMesh);
}

function addRigid(mesh: Mesh, out: Box3): void {
  mesh.updateWorldMatrix(false, false);
  const geometry: BufferGeometry = mesh.geometry;
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  if (geometry.boundingBox === null) return;
  out.union(rigid.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
}

export function actorBounds(root: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  skeletal.makeEmpty();
  const skeletons: Skeleton[] = [];
  root.traverse((node: Object3D): void => {
    if (skinnedPart(node)) {
      if (!skeletons.includes(node.skeleton)) skeletons.push(node.skeleton);
      return;
    }
    if (rigidPart(node)) addRigid(node, out);
  });
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) skeletal.expandByPoint(joint.setFromMatrixPosition(bone.matrixWorld));
  }
  if (!skeletal.isEmpty()) out.union(skeletal.expandByScalar(ACTOR_BOUNDS.flesh));
  return out;
}

import type { Object3D } from 'three';
import { Mesh, MeshDepthMaterial } from 'three';

export function createCoinStacks(source: Object3D): () => Object3D {
  const depth: MeshDepthMaterial = new MeshDepthMaterial();
  return (): Object3D => {
    const stack: Object3D = source.clone();
    stack.traverse((object: Object3D): void => {
      if (object instanceof Mesh) object.customDepthMaterial = depth;
    });
    return stack;
  };
}

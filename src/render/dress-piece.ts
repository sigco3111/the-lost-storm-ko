import type { SkinnedMesh } from 'three';
import { MeshStandardMaterial } from 'three';
import type { Dresser } from './character-loader.ts';

export function dressPiece(mesh: SkinnedMesh, dresser: Dresser, surfaces: Readonly<Record<string, string>>): SkinnedMesh {
  const worn: unknown = mesh.material;
  if (!(worn instanceof MeshStandardMaterial) || surfaces[worn.name] === undefined) return mesh;
  const dressed: SkinnedMesh = mesh.clone();
  mesh.updateWorldMatrix(true, false);
  mesh.matrixWorld.decompose(dressed.position, dressed.quaternion, dressed.scale);
  dressed.material = dresser(surfaces, worn);
  return dressed;
}

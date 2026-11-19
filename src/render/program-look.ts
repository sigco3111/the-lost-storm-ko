import type { BufferGeometry, Material, Object3D } from 'three';
import { Mesh, SkinnedMesh, Texture } from 'three';

const TEXTURE_SLOTS: readonly string[] = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'lightMap',
  'displacementMap',
  'envMap',
  'specularMap',
  'matcap',
  'gradientMap',
  'specularColorMap',
  'specularIntensityMap',
  'anisotropyMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
];

const PHYSICAL_FEATURES: readonly string[] = ['anisotropy', 'clearcoat', 'dispersion', 'retroreflectivity', 'iridescence', 'sheen', 'transmission'];

function featureOn(material: Material, feature: string): boolean {
  const value: unknown = Reflect.get(material, feature);
  return typeof value === 'number' && value > 0;
}

function materialLook(material: Material): string {
  const slots: string = TEXTURE_SLOTS.map((slot: string): string => (Reflect.get(material, slot) instanceof Texture ? '1' : '0')).join('');
  const features: string = PHYSICAL_FEATURES.map((feature: string): string => (featureOn(material, feature) ? '1' : '0')).join('');
  const flat: unknown = Reflect.get(material, 'flatShading');
  return [material.type, material.side, material.transparent, material.alphaTest > 0, material.alphaHash, material.vertexColors, flat === true, material.customProgramCacheKey(), slots, features].join('/');
}

function geometryLook(geometry: BufferGeometry): string {
  return [Object.keys(geometry.attributes).toSorted().join(','), Object.keys(geometry.morphAttributes).toSorted().join(',')].join('/');
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

export function programLook(mesh: Mesh): string {
  const held: Material | Material[] = mesh.material;
  const materials: readonly Material[] = Array.isArray(held) ? held : [held];
  return [mesh instanceof SkinnedMesh, mesh.castShadow, mesh.receiveShadow, geometryLook(mesh.geometry), ...materials.map(materialLook)].join('|');
}

export function looksOf(root: Object3D): Set<string> {
  const looks: Set<string> = new Set<string>();
  root.traverse((object: Object3D): void => {
    if (isMesh(object)) looks.add(programLook(object));
  });
  return looks;
}

export function newLooks(roots: readonly Object3D[]): Object3D[] {
  const seen: Set<string> = new Set<string>();
  return roots.filter((root: Object3D): boolean => {
    const fresh: string[] = [...looksOf(root)].filter((look: string): boolean => !seen.has(look));
    for (const look of fresh) seen.add(look);
    return fresh.length > 0;
  });
}

import { Color } from 'three';
import type { MeshStandardMaterial } from 'three';

export function tintProp(material: MeshStandardMaterial, tint: string | null): MeshStandardMaterial {
  if (tint !== null) material.color.multiply(new Color(tint));
  return material;
}

import type { BufferGeometry, Material } from 'three';
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

export const KEEPSAKE = {
  cover: 0x3e2c1d,
  wornCover: 0x4f3925,
  strap: 0x251a10,
  buckle: 0xb08a43,
  pages: 0xb9ad8e,
  width: 0.4,
  depth: 0.3,
  thickness: 0.085,
  board: 0.016,
  pageInset: 0.014,
  spineRadius: 0.0425,
  bands: [-0.1, 0, 0.1],
  bandRadius: 0.047,
  bandLength: 0.014,
  strapWidth: 0.05,
  strapRise: 0.007,
  strapLength: 0.45,
  buckleSize: 0.034,
  coverRoughness: 0.82,
  pageRoughness: 0.95,
  metalRoughness: 0.4,
  metalness: 0.75,
  yaw: 0.5,
} as const;

export interface Keepsake {
  readonly group: Group;
  dispose(): void;
}

function leather(color: number, roughness: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness });
}

export function createKeepsake(): Keepsake {
  const group: Group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const part = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number, shadow: boolean): Mesh => {
    geometries.push(geometry);
    materials.push(material);
    const mesh: Mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    return mesh;
  };
  const { width, depth, thickness, board } = KEEPSAKE;
  const cover: MeshStandardMaterial = leather(KEEPSAKE.cover, KEEPSAKE.coverRoughness);
  const worn: MeshStandardMaterial = leather(KEEPSAKE.wornCover, KEEPSAKE.coverRoughness);
  const strap: MeshStandardMaterial = leather(KEEPSAKE.strap, KEEPSAKE.coverRoughness);
  const pages: MeshStandardMaterial = leather(KEEPSAKE.pages, KEEPSAKE.pageRoughness);
  const brass: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(KEEPSAKE.buckle), roughness: KEEPSAKE.metalRoughness, metalness: KEEPSAKE.metalness });
  const book: Group = new Group();
  const inset: number = KEEPSAKE.pageInset;
  const pagesFrom: number = -width / 2 + KEEPSAKE.spineRadius * 0.6;
  const pagesTo: number = width / 2 - inset;
  book.add(
    part(new BoxGeometry(width, board, depth), cover, 0, board / 2, 0, true),
    part(new BoxGeometry(width, board, depth), worn, 0, thickness - board / 2, 0, true),
    part(new BoxGeometry(pagesTo - pagesFrom, thickness - board * 2 + 0.004, depth - inset * 2), pages, (pagesTo + pagesFrom) / 2, thickness / 2, 0, false),
  );
  const spine: Mesh = part(new CylinderGeometry(KEEPSAKE.spineRadius, KEEPSAKE.spineRadius, depth, 20), cover, -width / 2, thickness / 2, 0, true);
  spine.rotation.x = Math.PI / 2;
  book.add(spine);
  for (const z of KEEPSAKE.bands) {
    const band: Mesh = part(new CylinderGeometry(KEEPSAKE.bandRadius, KEEPSAKE.bandRadius, KEEPSAKE.bandLength, 20), strap, -width / 2, thickness / 2, z, false);
    band.rotation.x = Math.PI / 2;
    book.add(band);
  }
  const lead: number = width * KEEPSAKE.strapLength;
  const edge: number = width / 2;
  book.add(
    part(new BoxGeometry(lead, KEEPSAKE.strapRise, KEEPSAKE.strapWidth), strap, edge - lead / 2 + KEEPSAKE.strapRise, thickness + KEEPSAKE.strapRise / 2, 0, false),
    part(new BoxGeometry(KEEPSAKE.strapRise, thickness * 0.8, KEEPSAKE.strapWidth), strap, edge + KEEPSAKE.strapRise / 2, thickness * 0.55, 0, false),
    part(new BoxGeometry(KEEPSAKE.buckleSize, KEEPSAKE.strapRise * 1.4, KEEPSAKE.buckleSize), brass, edge - KEEPSAKE.buckleSize * 1.1, thickness + KEEPSAKE.strapRise * 1.6, 0, false),
  );
  book.rotation.y = KEEPSAKE.yaw;
  group.add(book);
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

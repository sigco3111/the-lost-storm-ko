import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Mesh, MeshPhysicalMaterial, Texture } from 'three';
import { programLook } from './program-look.ts';

function physical(material: MeshPhysicalMaterial): string {
  return programLook(new Mesh(new BoxGeometry(1, 1, 1), material));
}

void test('a physical material with a specular texture is a look of its own, as a staff from a glTF with specular maps needs', (): void => {
  const plain: string = physical(new MeshPhysicalMaterial({ map: new Texture() }));
  assert.notEqual(physical(new MeshPhysicalMaterial({ map: new Texture(), specularIntensityMap: new Texture() })), plain);
  assert.notEqual(physical(new MeshPhysicalMaterial({ map: new Texture(), specularColorMap: new Texture() })), plain);
});

void test('a physical feature switched on makes a new look, and its strength does not', (): void => {
  const plain: string = physical(new MeshPhysicalMaterial());
  const looks: Set<string> = new Set<string>([
    plain,
    physical(new MeshPhysicalMaterial({ clearcoat: 1 })),
    physical(new MeshPhysicalMaterial({ sheen: 1 })),
    physical(new MeshPhysicalMaterial({ transmission: 1 })),
    physical(new MeshPhysicalMaterial({ iridescence: 1 })),
  ]);
  assert.equal(looks.size, 5);
  assert.equal(physical(new MeshPhysicalMaterial({ clearcoat: 0.3 })), physical(new MeshPhysicalMaterial({ clearcoat: 0.9 })));
});

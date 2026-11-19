import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Texture } from 'three';
import { looksOf, newLooks, programLook } from './program-look.ts';

function model(material: MeshStandardMaterial): Group {
  const group: Group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1), material));
  return group;
}

void test('meshes that differ only in colour, size or texture image share a look', (): void => {
  const red: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 'red', map: new Texture() }));
  const blue: Mesh = new Mesh(new SphereGeometry(2), new MeshStandardMaterial({ color: 'blue', roughness: 0.2, map: new Texture() }));
  assert.equal(programLook(red), programLook(blue));
});

void test('a texture slot, a side, a material kind or a shadow makes a new look', (): void => {
  const plain: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  const looks: Set<string> = new Set<string>([
    programLook(plain),
    programLook(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ normalMap: new Texture() }))),
    programLook(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ side: DoubleSide }))),
    programLook(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())),
  ]);
  const shadowed: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  shadowed.castShadow = true;
  looks.add(programLook(shadowed));
  assert.equal(looks.size, 5);
});

void test('only the models that bring a look not seen before are kept, in order', (): void => {
  const first: Group = model(new MeshStandardMaterial({ map: new Texture() }));
  const same: Group = model(new MeshStandardMaterial({ map: new Texture(), color: 'green' }));
  const other: Group = model(new MeshStandardMaterial({ normalMap: new Texture() }));
  const both: Group = new Group();
  both.add(model(new MeshStandardMaterial({ map: new Texture() })), model(new MeshStandardMaterial({ normalMap: new Texture() })));
  assert.deepEqual(newLooks([first, same, other, both]), [first, other]);
  assert.equal(looksOf(both).size, 2);
});

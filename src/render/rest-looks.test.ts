import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import type { Material } from 'three';
import type { RigGlow } from './ghost-material.ts';
import { createRigGlow } from './ghost-material.ts';
import type { MeshLooks, RestLooks } from './rest-looks.ts';
import { createMeshLooks, glowAtRest, REST_LOOKS, restingMaterial, restLook, sharesLook } from './rest-looks.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';

void test('a glow is at rest only when nothing it drives would change a pixel', (): void => {
  const glow: RigGlow = createRigGlow();
  assert.equal(glowAtRest(glow), true);
  glow.hover.value.setRGB(REST_LOOKS.glowEpsilon / 2, 0, 0);
  assert.equal(glowAtRest(glow), true);
  glow.flash.value.setRGB(1, 1, 1);
  assert.equal(glowAtRest(glow), false);
  const shaded: RigGlow = createRigGlow();
  shaded.shadeMix.value = 0.01;
  assert.equal(glowAtRest(shaded), false);
  const wet: RigGlow = createRigGlow();
  wet.shadeWet.value = 0.2;
  assert.equal(glowAtRest(wet), false);
  const ranked: RigGlow = createRigGlow();
  ranked.rankRim.value.setRGB(0.4, 0.3, 0);
  assert.equal(glowAtRest(ranked), false);
  const coloured: RigGlow = createRigGlow();
  coloured.shade.value.setRGB(1, 0, 0);
  assert.equal(glowAtRest(coloured), true);
});

void test('one rest look is made for each source and look, and reused by every character that asks', (): void => {
  const source: MeshStandardMaterial = new MeshStandardMaterial();
  let made: number = 0;
  const make = (): MeshStandardMaterial => {
    made += 1;
    return new MeshStandardMaterial();
  };
  const first: MeshStandardMaterial = restLook(source, 'red', make);
  assert.equal(restLook(source, 'red', make), first);
  assert.notEqual(restLook(source, 'blue', make), first);
  assert.notEqual(restLook(new MeshStandardMaterial(), 'red', make), first);
  assert.equal(made, 3);
});

void test('a material drawn differently from its rest look keeps its own', (): void => {
  const own: MeshStandardMaterial = new MeshStandardMaterial();
  const rest: MeshStandardMaterial = new MeshStandardMaterial();
  const rests: RestLooks = new Map<Material, Material>([[own, rest]]);
  assert.equal(restingMaterial(own, rests), rest);
  own.transparent = true;
  own.opacity = 0.5;
  assert.equal(restingMaterial(own, rests), own);
  const unknown: MeshStandardMaterial = new MeshStandardMaterial();
  assert.deepEqual(restingMaterial([unknown, own], rests), [unknown, own]);
});

void test('meshes swap to their rest looks together and back to their own, and a forgotten mesh gets its own back', (): void => {
  const own: MeshStandardMaterial = new MeshStandardMaterial();
  const rest: MeshStandardMaterial = new MeshStandardMaterial();
  const mesh: Mesh = new Mesh(new BoxGeometry(1, 1, 1), own);
  const looks: MeshLooks = createMeshLooks(new Map<Material, Material>([[own, rest]]));
  looks.keep(mesh);
  looks.settle(true);
  assert.equal(mesh.material, rest);
  assert.equal(looks.resting(), true);
  looks.settle(false);
  assert.equal(mesh.material, own);
  looks.settle(true);
  looks.forget(mesh);
  assert.equal(mesh.material, own);
});

void test('a crusted monster keeps its own materials, because its crust is patched onto them after they are made', (): void => {
  assert.equal(sharesLook({ crust: null }, false), true);
  assert.equal(sharesLook({ crust: null }, true), false);
  const crusted: Parameters<typeof sharesLook>[0] = { crust: must(loadContent().monsters.get('cinder_hound'), 'cinder_hound').crust };
  assert.notEqual(crusted.crust, null);
  assert.equal(sharesLook(crusted, false), false);
});

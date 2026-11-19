import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackSide, BoxGeometry, DataTexture, DirectionalLight, DoubleSide, FrontSide, Mesh, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, PointLight, Scene } from 'three';
import type { Material } from 'three';
import { shadowLights, shadowStandIn, withShadowStandIns } from './shadow-warm.ts';

function only(material: Material | Material[]): Material {
  assert.ok(!Array.isArray(material));
  return material;
}

void test('a caster is drawn into the shadow map by a depth material with its own map, cut-out and the opposite face, as the shadow pass builds it', (): void => {
  const map: DataTexture = new DataTexture(new Uint8Array(4), 1, 1);
  const leaf: MeshStandardMaterial = new MeshStandardMaterial({ map, alphaTest: 0.4, side: FrontSide });
  const made: MeshDepthMaterial | MeshDistanceMaterial = shadowStandIn(leaf, false, false);
  assert.ok(made instanceof MeshDepthMaterial);
  assert.equal(made.map, map);
  assert.equal(made.alphaTest, 0.4);
  assert.equal(made.side, BackSide);
  assert.equal(shadowStandIn(new MeshStandardMaterial({ side: DoubleSide }), false, false).side, DoubleSide);
  assert.equal(shadowStandIn(new MeshStandardMaterial({ side: FrontSide }), false, true).side, FrontSide);
  const shaded: MeshStandardMaterial = new MeshStandardMaterial({ side: FrontSide });
  shaded.shadowSide = DoubleSide;
  assert.equal(shadowStandIn(shaded, false, false).side, DoubleSide);
  const covered: MeshStandardMaterial = new MeshStandardMaterial({ alphaToCoverage: true });
  assert.equal(shadowStandIn(covered, false, false).alphaTest, 0.5);
  assert.ok(shadowStandIn(leaf, true, false) instanceof MeshDistanceMaterial);
});

void test('a material keeps one stand-in, so the program it compiled stays held until the shadow pass takes it', (): void => {
  const stone: MeshStandardMaterial = new MeshStandardMaterial();
  assert.equal(shadowStandIn(stone, false, false), shadowStandIn(stone, false, false));
  assert.notEqual(shadowStandIn(stone, false, false), shadowStandIn(stone, true, false));
});

void test('only casters wear their stand-ins while the work runs, and every mesh gets its own material back after it, even when the work throws', (): void => {
  const scene: Scene = new Scene();
  const caster: Mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  caster.castShadow = true;
  const ground: Mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const pair: Mesh = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]);
  pair.castShadow = true;
  const custom: MeshDepthMaterial = new MeshDepthMaterial();
  const shaped: Mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  shaped.castShadow = true;
  shaped.customDepthMaterial = custom;
  scene.add(caster, ground, pair, shaped);
  const own: readonly (Material | Material[])[] = [caster.material, ground.material, pair.material, shaped.material];
  withShadowStandIns(scene, false, false, (): void => {
    assert.ok(only(caster.material) instanceof MeshDepthMaterial);
    assert.equal(ground.material, own[1]);
    assert.ok(Array.isArray(pair.material) && pair.material.every((material: Material): boolean => material instanceof MeshDepthMaterial));
    assert.equal(shaped.material, custom);
  });
  assert.deepEqual([caster.material, ground.material, pair.material, shaped.material], own);
  assert.throws((): void => withShadowStandIns(scene, false, false, (): void => {
    throw new Error('compile failed');
  }));
  assert.deepEqual([caster.material, ground.material, pair.material, shaped.material], own);
});

void test('the shadow kinds to warm follow the lights that cast: a point light needs distance materials, the others depth materials', (): void => {
  const scene: Scene = new Scene();
  assert.deepEqual(shadowLights(scene), { depth: false, distance: false });
  const sun: DirectionalLight = new DirectionalLight();
  scene.add(sun);
  assert.deepEqual(shadowLights(scene), { depth: false, distance: false });
  sun.castShadow = true;
  assert.deepEqual(shadowLights(scene), { depth: true, distance: false });
  const lamp: PointLight = new PointLight();
  lamp.castShadow = true;
  scene.add(lamp);
  assert.deepEqual(shadowLights(scene), { depth: true, distance: true });
});

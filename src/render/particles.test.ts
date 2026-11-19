import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { BufferAttribute, BufferGeometry, Color, Points, Scene } from 'three';
import type { BurstOptions } from './particles.ts';
import { burstCount, createParticles, particleAlpha, PARTICLES } from './particles.ts';

void test('a particle eases in from nothing and fades out to nothing, whatever its life', (): void => {
  for (const span of [0.1, 0.3, 1.2]) {
    assert.equal(particleAlpha(span, span), 0);
    assert.equal(particleAlpha(0, span), 0);
    assert.ok(particleAlpha(span - 1 / 120, span) < 0.5);
    for (let life: number = span; life > 0; life -= span / 50) {
      const alpha: number = particleAlpha(life, span);
      assert.ok(alpha >= 0 && alpha <= 1);
    }
  }
  assert.ok(particleAlpha(0.6, 1.2) > 0.99);
  assert.equal(particleAlpha(0.5, 0), 0);
});

void test('a burst never spawns more than the cap, and density scales it', (): void => {
  assert.equal(burstCount(1000, 1, 0.5), PARTICLES.burstCap);
  assert.equal(burstCount(20, 0.5, 0), 10);
  assert.equal(burstCount(20, 0, 0.99), 0);
  assert.equal(burstCount(-4, 1, 0.5), 0);
});

function attributeOf(scene: Scene, name: string): { readonly version: number; readonly array: unknown } {
  const points: unknown = scene.children.find((child: Object3D): boolean => child instanceof Points);
  assert.ok(points instanceof Points);
  const geometry: unknown = points.geometry;
  assert.ok(geometry instanceof BufferGeometry);
  const attribute: unknown = geometry.getAttribute(name);
  assert.ok(attribute instanceof BufferAttribute);
  return { version: attribute.version, array: attribute.array };
}

function versionOf(scene: Scene, name: string): number {
  return attributeOf(scene, name).version;
}

const SPARK: BurstOptions = { x: 1, y: 1, z: 1, count: 6, color: new Color(1, 0.5, 0), speed: { min: 1, max: 2 }, lift: { min: 1, max: 2 }, life: { min: 0.2, max: 0.3 }, size: { min: 0.2, max: 0.4 }, gravity: 1, drag: 1, dirX: 0, dirZ: 1, spread: 1, jitter: 0.2 };

void test('colours upload only when a burst writes them, and a field with nothing alive uploads its clear frame once and then rests', (): void => {
  const scene: Scene = new Scene();
  const particles = createParticles(scene);
  const tint: number = versionOf(scene, 'tint');
  particles.burst(SPARK);
  assert.equal(versionOf(scene, 'tint'), tint + 1);
  particles.update(0.01);
  assert.equal(versionOf(scene, 'tint'), tint + 1, 'moving sparks leaves their colours alone');
  for (let frame: number = 0; frame < 40; frame += 1) particles.update(0.01);
  const alphas: unknown = attributeOf(scene, 'alpha').array;
  assert.ok(alphas instanceof Float32Array && alphas.every((alpha: number): boolean => alpha === 0), 'every spark has faded');
  const settled: number = versionOf(scene, 'alpha');
  particles.update(0.01);
  particles.update(0.01);
  assert.equal(versionOf(scene, 'alpha'), settled, 'nothing alive, nothing uploaded');
  particles.burst(SPARK);
  particles.update(0.01);
  assert.equal(versionOf(scene, 'alpha'), settled + 1, 'a new burst wakes the field');
});

void test('every spark of one burst stands on the floor under the burst', (): void => {
  const scene: Scene = new Scene();
  const particles = createParticles(scene);
  particles.burst({ ...SPARK, count: 12, jitter: 0, y: 0, lift: { min: -50, max: -50 } });
  particles.update(0.1);
  const positions: unknown = attributeOf(scene, 'position').array;
  assert.ok(positions instanceof Float32Array);
  for (let index: number = 0; index < 12; index += 1) assert.ok(Math.abs((positions[index * 3 + 1] ?? 0) - PARTICLES.floorGap) < 1e-6, 'held at the floor gap above flat ground');
});

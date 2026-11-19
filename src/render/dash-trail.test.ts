import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { Color, Mesh, Scene, ShaderMaterial } from 'three';
import type { BurstOptions, ParticleSystem } from './particles.ts';
import { createDashTrails, DASH_TRAIL, dashTrailKeeper } from './dash-trail.ts';
import type { DashTrails } from './dash-trail.ts';

function quietParticles(bursts: BurstOptions[]): ParticleSystem {
  return {
    burst(options: BurstOptions): void {
      bursts.push(options);
    },
    update(): void {
      bursts.length = 0;
    },
    setDensity(): void {
      bursts.length = 0;
    },
    clear(): void {
      bursts.length = 0;
    },
  };
}

function trailMaterial(object: Object3D | undefined): ShaderMaterial {
  const material: unknown = object instanceof Mesh ? object.material : null;
  assert.ok(material instanceof ShaderMaterial);
  return material;
}

function programOf(material: ShaderMaterial): string {
  return [material.vertexShader, material.fragmentShader, material.transparent, material.depthWrite, material.depthTest, material.blending, material.side, JSON.stringify(material.defines)].join('|');
}

void test('the dash trail keeper is built like a live trail, so it holds the trail shader that every dash draws with', (): void => {
  const scene: Scene = new Scene();
  const trails = createDashTrails(scene, quietParticles([]));
  trails.start(1, { x: 2, z: 3 }, { x: 0, z: 1 }, new Color(0xff0000), null);
  const live: ShaderMaterial = trailMaterial(scene.children[0]);
  const keeper = dashTrailKeeper(new Color(0xffffff));
  assert.equal(programOf(keeper.material), programOf(live));
  const positions: unknown = keeper.geometry.getAttribute('position').array;
  const alphas: unknown = keeper.geometry.getAttribute('alpha').array;
  assert.ok(positions instanceof Float32Array && positions.every((value: number): boolean => value === 0), 'the keeper has no area to draw');
  assert.ok(alphas instanceof Float32Array && alphas.every((value: number): boolean => value === 0), 'the keeper is fully clear');
  trails.clear();
  assert.equal(scene.children.length, 0);
});

interface Recorded {
  readonly bursts: BurstOptions[];
  readonly trails: DashTrails;
}

function recorder(): Recorded {
  const bursts: BurstOptions[] = [];
  const particles: ParticleSystem = {
    burst(options: BurstOptions): void {
      bursts.push(options);
    },
    setDensity(): void {},
    update(): void {},
    clear(): void {},
  };
  return { bursts, trails: createDashTrails(new Scene(), particles) };
}

void test('a roll on water throws foam that falls back where a plain roll kicks up dust', (): void => {
  const foam: Color = new Color(0.8, 0.9, 1);
  const wet: Recorded = recorder();
  wet.trails.start(1, { x: 0, z: 0 }, { x: 1, z: 0 }, new Color(0.2, 0.5, 0.8), foam);
  wet.trails.land({ x: 5, z: 0 }, { x: 1, z: 0 }, new Color(0.2, 0.5, 0.8), foam);
  assert.equal(wet.bursts.length, 2);
  for (const burst of wet.bursts) {
    assert.ok(burst.color.equals(foam));
    assert.equal(burst.gravity, DASH_TRAIL.splash.gravity);
    assert.equal(burst.count, DASH_TRAIL.puffCount);
  }
  const dry: Recorded = recorder();
  const dust: Color = new Color(0.5, 0.4, 0.3);
  dry.trails.start(1, { x: 0, z: 0 }, { x: 1, z: 0 }, dust, null);
  const puff: BurstOptions | undefined = dry.bursts[0];
  assert.ok(puff !== undefined);
  assert.ok(puff.color.equals(dust.clone().multiplyScalar(DASH_TRAIL.dustShade)));
  assert.equal(puff.gravity, DASH_TRAIL.dust.gravity);
  dry.trails.clear();
  wet.trails.clear();
});

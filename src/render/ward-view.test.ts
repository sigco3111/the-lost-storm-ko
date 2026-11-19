import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { WardDef } from '../../sim/content/scene-types.ts';
import type { World } from '../../sim/world/types.ts';
import { lowerWard, raiseWard, stepWards } from '../../sim/world/wards.ts';
import type { WardState } from '../../sim/world/wards.ts';
import { createWardView, WARD_VIEW } from './ward-view.ts';

const DT: number = 1 / 30;
const WARD: WardDef = { radius: 4, rise: 0.8, fall: 0.8, lifetime: 30, admits: ['player'], stopsStrikes: true, grace: 2 };

function strengthOf(scene: Scene): number {
  const group = must(scene.children[0], 'the ward');
  const dome = must(group.children[0], 'the dome');
  return dome.scale.x / WARD.radius;
}

void test('a ward is drawn where it stands, swells in as it rises and out as it falls, and is gone with it', (): void => {
  const world: World = withoutGlitches(worldIn(loadContent(), 'hideout', 2));
  const scene: Scene = new Scene();
  const view = createWardView(scene, false);
  const ward: WardState = raiseWard(world, WARD, must(world.npcs[0], 'an owner'), world.player.pos);
  view.update(DT, world);
  assert.equal(scene.children.length, 1);
  assert.deepEqual({ x: must(scene.children[0], 'the ward').position.x, z: must(scene.children[0], 'the ward').position.z }, { x: ward.pos.x, z: ward.pos.z });
  const sizes: number[] = [];
  for (let elapsed: number = 0; elapsed < WARD.rise + DT; elapsed += DT) {
    stepWards(world, DT);
    view.update(DT, world);
    sizes.push(strengthOf(scene));
  }
  assert.ok(sizes.every((size: number, index: number): boolean => index === 0 || size >= (sizes[index - 1] ?? 0)), 'it never shrinks while rising');
  assert.ok((sizes[0] ?? 1) < WARD_VIEW.growFrom + 0.05 && Math.abs((sizes.at(-1) ?? 0) - 1) < 1e-9, 'from small to whole, with no jump');
  assert.ok(sizes.slice(1).every((size: number, index: number): boolean => size - (sizes[index] ?? 0) < 0.12), 'each frame moves a little');
  lowerWard(ward);
  for (let elapsed: number = 0; elapsed < WARD.fall + WARD.grace + DT * 2; elapsed += DT) {
    stepWards(world, DT);
    view.update(DT, world);
  }
  assert.equal(scene.children.length, 0);
});

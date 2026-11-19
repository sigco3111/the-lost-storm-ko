import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { distance } from '../math.ts';
import { arriveWith, stepNpcs, walkNpc } from './npc-walk.ts';
import type { NpcState, World } from './types.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;

function standing(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), `npc ${id}`);
}

void test('a walking npc covers its pace along its route, turns the way it goes, and stands still with nowhere to go', (): void => {
  const world: World = worldIn(content, 'hideout', 1);
  const npc: NpcState = standing(world, 'warden_guide');
  const from = { x: npc.pos.x, z: npc.pos.z };
  npc.route = [{ x: from.x + 1, z: from.z }, { x: from.x + 1, z: from.z + 3 }];
  npc.pace = 2;
  walkNpc(npc, 1);
  assert.ok(Math.abs(npc.pos.x - (from.x + 1)) < 1e-9 && Math.abs(npc.pos.z - (from.z + 1)) < 1e-9);
  assert.equal(npc.route.length, 1);
  assert.equal(npc.motion, 'stride');
  assert.ok(Math.abs(npc.gait - Math.hypot(1, 1)) < 1e-9);
  walkNpc(npc, 1);
  assert.equal(npc.route.length, 0);
  walkNpc(npc, 1);
  assert.equal(npc.motion, 'still');
  assert.equal(npc.gait, 0);
});

void test('an npc who came with the hero arrives beside him and walks to his own place, then faces the way he always does', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  enterZone(world, zoneOf(content, 'hideout'), { type: 'exit', exit: 'west' });
  const npc: NpcState = standing(world, 'warden_guide');
  arriveWith(world, { npc: 'warden_guide', pace: 3 });
  assert.ok(distance(npc.pos, world.player.pos) < 3);
  assert.ok(npc.route.length > 0);
  for (let elapsed: number = 0; elapsed < 20 && npc.route.length > 0; elapsed += DT) stepNpcs(world, DT);
  assert.deepEqual({ x: npc.pos.x, z: npc.pos.z }, { x: npc.placement.x, z: npc.placement.z });
  assert.equal(npc.facing, npc.homeFacing);
  arriveWith(world, { npc: 'nobody', pace: 3 });
  assert.deepEqual({ x: npc.pos.x, z: npc.pos.z }, { x: npc.placement.x, z: npc.placement.z });
});

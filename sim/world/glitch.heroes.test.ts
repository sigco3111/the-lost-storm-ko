import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { setGlitchesEnabled, stepGlitch } from './glitch.ts';
import type { World, WorldEvent } from './types.ts';

const RIVAL = { id: 9001, sourceId: 9002, amount: 5 } as const;

function struck(world: World, targetId: number): WorldEvent {
  return { type: 'damage', targetId, sourceId: RIVAL.sourceId, targetTeam: 'player', amount: RIVAL.amount, crit: false, killed: false, pos: offset(0, 0), direction: { x: 1, z: 0 }, skill: shapeSkill('cleave'), burn: false };
}

void test('another hero being struck is not a fight for the primary hero, and the primary being struck is', (): void => {
  const world: World = shapeArena([]);
  setGlitchesEnabled(world, false);
  const before: number = world.glitch.lastFight;
  world.events = [struck(world, RIVAL.id)];
  stepGlitch(world, 0);
  assert.equal(world.glitch.lastFight, before);
  world.events = [struck(world, world.player.id)];
  stepGlitch(world, 0);
  assert.equal(world.glitch.lastFight, world.time);
});

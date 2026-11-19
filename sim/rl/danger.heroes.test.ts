import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, SHAPE_DT, shapeArena } from '../../test/shape-support.ts';
import { stepWorld } from '../world/step.ts';
import type { PlayerState, World } from '../world/types.ts';
import { dangerAround } from './danger.ts';

const DUEL = { rival: 1, apart: 1.5 } as const;

function rivalOf(world: World, party: number): PlayerState {
  const apart: PlayerState = shapeArena(['cleave']).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: offset(DUEL.apart, 0), party };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

void test('a rival hero winding up a blow at a hero is danger to that hero, and an ally winding up is not', (): void => {
  const world: World = shapeArena(['cleave']);
  world.player.pos = offset(0, 0);
  const rival: PlayerState = rivalOf(world, DUEL.rival);
  assert.equal(dangerAround(world, world.player)[0], 0);
  stepWorld(world, [{ type: 'skill', slot: 0, aim: world.player.pos, targetId: world.player.id, by: rival.id }], SHAPE_DT);
  assert.equal(rival.action?.phase, 'windup');
  assert.equal(dangerAround(world, world.player)[0], 1);
  rival.party = 0;
  assert.equal(dangerAround(world, world.player)[0], 0);
});

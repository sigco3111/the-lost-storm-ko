import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { kill } from './combat.ts';
import type { FlaskState, MonsterState, PlayerState, World } from './types.ts';

const FALL: Vec2 = { x: 0, z: 1 };

function joined(world: World, at: Vec2): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z } };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

void test('a kill by a second hero counts for that hero and fills its flasks, while the party keeps the experience', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(-3, 0));
  const foe: MonsterState = dummy(world, offset(0, 4));
  const flask: FlaskState = must(second.flasks[0], 'the second hero flask');
  flask.charges = 0;
  const primary: FlaskState = must(world.player.flasks[0], 'the primary flask');
  const before = { kills: world.player.kills, charges: primary.charges, xp: world.player.xp } as const;
  kill(world, foe, FALL, second.id);
  assert.equal(second.kills, 1);
  assert.ok(flask.charges > 0);
  assert.equal(world.player.kills, before.kills);
  assert.equal(primary.charges, before.charges);
  assert.ok(world.player.xp > before.xp);
});

void test('a kill with no hero behind it still counts for the primary hero', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const before: number = world.player.kills;
  kill(world, foe, FALL);
  assert.equal(world.player.kills, before + 1);
});

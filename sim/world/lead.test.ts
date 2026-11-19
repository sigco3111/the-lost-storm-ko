import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ledAim } from './lead.ts';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import { stepWorld } from './step.ts';
import type { HazardState, WorldEvent } from './types.ts';

const DT: number = 1 / 60;

const caller: MonsterDef = must(ARENA_CONTENT.monsters.get('test_caller'), 'test_caller');
const LEADING: Content = { ...ARENA_CONTENT, monsters: new Map([...ARENA_CONTENT.monsters, ['test_leader', { ...caller, id: 'test_leader', behaviour: { type: 'ranged', preferredRange: 9, retreatRange: 4.5, lead: 1.2 } }]]) };

void test('a still hero is aimed at where it stands', (): void => {
  const world = arena(1);
  world.player.moving = false;
  assert.deepEqual(ledAim(world.player, 1), { x: world.player.pos.x, z: world.player.pos.z });
});

void test('a walking hero is aimed at where its path takes it after the lead, turning the corners it will turn', (): void => {
  const world = arena(1);
  const { x, z } = world.player.pos;
  world.player.moving = true;
  world.player.tempo = 1;
  world.player.path = [{ x: x + 2, z }, { x: x + 2, z: z + 10 }];
  const speed: number = world.player.stats.moveSpeed;
  const aim = ledAim(world.player, 4 / speed);
  assert.ok(Math.abs(aim.x - (x + 2)) < 1e-9);
  assert.ok(Math.abs(aim.z - (z + 2)) < 1e-9);
  assert.deepEqual(ledAim(world.player, 0), { x, z });
  assert.deepEqual(ledAim(world.player, 1000), { x: x + 2, z: z + 10 });
});

void test('a ranged monster that leads marks the ground ahead of a walking hero, not under it', (): void => {
  const world = arena(1, LEADING);
  place(world, 'test_leader', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const hero = world.player;
  const seen: HazardState[] = [];
  for (let step: number = 0; step < Math.round(0.6 / DT) && seen.length === 0; step += 1) {
    hero.pos = { ...ARENA_CENTRE };
    hero.path = [{ x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 30 }];
    hero.moving = true;
    const events: WorldEvent[] = stepWorld(world, [], DT);
    seen.push(...events.flatMap((event: WorldEvent): HazardState[] => (event.type === 'hazard' && !event.burst ? [event.hazard] : [])));
  }
  const mark: HazardState = must(seen[0], 'a mark was placed');
  assert.ok(mark.pos.z - ARENA_CENTRE.z > 2, `the mark leads the hero along its walk (${mark.pos.z - ARENA_CENTRE.z})`);
  assert.ok(Math.abs(mark.pos.x - ARENA_CENTRE.x) < 1.5);
});

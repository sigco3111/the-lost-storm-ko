import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { Command, MonsterState, World } from '../../sim/world/types.ts';
import { enterZone } from '../../sim/world/zones.ts';
import type { WalkReport } from './body-walk.ts';
import { BODY_WALK, missingBodies, open, walkBodies, walkRoute } from './body-walk.ts';
import { setOffView } from '../render/actor-guard.ts';

const content: Content = loadContent();

function bodyAt(x: number, z: number): Group {
  const root: Group = new Group();
  root.position.set(x, 0, z);
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return root;
}

function freshWorld(): World {
  return createWorld(content, { seed: 7, save: null, opening: true });
}

void test('the walk goes from the opening through the Hall, the Hideout and the Last Gate into the caves, each exit leading on to the next step', (): void => {
  const route = walkRoute(content);
  assert.deepEqual(route.problems, []);
  assert.deepEqual(route.steps.map((step): string => step.exit.to), ['hall_of_time', 'hideout', 'hall_of_time', 'keepers_gate', 'under_hall']);
});

void test('the walk opens flag and level gates and leaves the others to the world', (): void => {
  const world: World = freshWorld();
  assert.equal(open(world, { type: 'flag', flag: 'keeper_defeated', is: 'defeated', not: false }), true);
  assert.equal(world.flags['keeper_defeated'], 'defeated');
  assert.equal(open(world, { type: 'level', atLeast: 8, not: false }), true);
  assert.equal(world.player.level, 8);
  assert.equal(open(world, { type: 'visited', zone: 'no_such_zone', not: false }), false);
});

void test('a live monster with no drawn body near it is named, and a dead one is not', (): void => {
  const world: World = freshWorld();
  enterZone(world, must(content.zones.get('keepers_gate'), 'keepers_gate'), { type: 'start' });
  const boss: MonsterState = must(world.monsters[0], 'the Reckoner');
  assert.deepEqual(missingBodies(world.monsters, [bodyAt(boss.pos.x + 5, boss.pos.z)]), [`${boss.def.id}#${boss.id}`]);
  assert.deepEqual(missingBodies(world.monsters, [bodyAt(boss.pos.x, boss.pos.z)]), []);
  const hidden: Group = bodyAt(boss.pos.x, boss.pos.z);
  hidden.visible = false;
  assert.equal(missingBodies(world.monsters, [hidden]).length, 1);
  const offView: Group = bodyAt(boss.pos.x, boss.pos.z);
  setOffView(offView, true);
  assert.deepEqual(missingBodies(world.monsters, [offView]), []);
  boss.alive = false;
  assert.deepEqual(missingBodies(world.monsters, []), []);
});

void test('the walk travels the whole route, looks after each arrival, and fails on every live monster left without a body', async (): Promise<void> => {
  const world: World = freshWorld();
  const scene: Group = new Group();
  const travel = (command: Command): void => {
    if (command.type !== 'travel') return;
    const exit = must(world.zone.exits.find((candidate): boolean => candidate.id === command.exit), command.exit);
    const zone: ZoneDef = must(content.zones.get(exit.to), exit.to);
    enterZone(world, zone, { type: 'start' });
    scene.clear();
    for (const monster of world.monsters) if (monster.def.id !== 'timekeeper_gatekeeper') scene.add(bodyAt(monster.pos.x, monster.pos.z));
  };
  const slept: number[] = [];
  const report: WalkReport = await walkBodies({ world, scene, send: travel, sleep: (ms: number): Promise<void> => {
    slept.push(ms);
    return Promise.resolve();
  } });
  assert.equal(world.zone.id, 'under_hall');
  assert.equal(report.looks.length, BODY_WALK.looks.length * (BODY_WALK.route.length + 1));
  assert.equal(report.ok, false);
  assert.ok(report.problems.length > 0);
  assert.ok(report.problems.every((problem: string): boolean => problem.startsWith('keepers_gate') && problem.includes('timekeeper_gatekeeper')));
  assert.ok(slept.every((ms: number): boolean => ms > 0 && ms <= BODY_WALK.pollMs));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { MonsterState, World, WorldEvent } from '../world/types.ts';
import type { Arena } from './arena.ts';
import { createArena } from './arena.ts';
import { RL } from './contract.ts';
import type { Recall } from './recall.ts';
import { createRecall, noteSeen, recallEvents, recentAmount } from './recall.ts';

const CONTENT: Content = loadContent();
const SKILL = must(CONTENT.skills.get('cleave'), 'cleave');
const LATER = { step: 0.1 } as const;

function hit(world: World, targetId: number, sourceId: number, amount: number): WorldEvent {
  return { type: 'damage', targetId, sourceId, targetTeam: targetId === world.player.id ? 'player' : 'monster', amount, crit: false, killed: false, pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 }, skill: SKILL, burn: false };
}

void test('damage taken and dealt count for the recent window, then fade', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 31, jitter: 0, waves: 1 });
  const world: World = arena.world;
  const foe: MonsterState = must(world.monsters[0], 'a foe');
  const recall: Recall = createRecall();
  recallEvents(recall, world, world.player, [hit(world, world.player.id, foe.id, 12), hit(world, foe.id, world.player.id, 30)]);
  assert.equal(recentAmount(recall.taken, world.time), 12);
  assert.equal(recentAmount(recall.dealt, world.time), 30);
  assert.deepEqual(recall.lastHit, { time: world.time, sourceId: foe.id });
  world.time += RL.recentWindow + LATER.step;
  assert.equal(recentAmount(recall.taken, world.time), 0);
  assert.equal(recentAmount(recall.dealt, world.time), 0);
});

void test('a sighting is kept by monster id for the memory window, then dropped', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 31, jitter: 0, waves: 1 });
  const world: World = arena.world;
  const foe: MonsterState = must(world.monsters[0], 'a foe');
  const recall: Recall = createRecall();
  noteSeen(recall, world, [foe]);
  assert.deepEqual(recall.sightings.get(foe.id), { pos: { x: foe.pos.x, z: foe.pos.z }, time: world.time });
  world.time += RL.memoryWindow + LATER.step;
  noteSeen(recall, world, []);
  assert.equal(recall.sightings.has(foe.id), false);
});

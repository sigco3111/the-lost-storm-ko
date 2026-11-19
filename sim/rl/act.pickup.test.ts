import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { roomFor } from '../stacks.ts';
import { dropOnGround } from '../world/ground.ts';
import { makeItem } from '../world/ledger.ts';
import { must } from '../../test/support.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, GroundItem, ItemInstance, World, WorldEvent } from '../world/types.ts';
import { actionOf, commandsFor, NO_CARRY } from './act.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { MOVE_CHOICES, PICKUP_CHOICE, RL, SKILL_CHOICES } from './contract.ts';
import type { Observation } from './observe.ts';

const CONTENT: Content = loadContent();
const PICKUP_MASK: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets + PICKUP_CHOICE;
const WALK = { ticks: 300 } as const;
const FAR = { gap: 8 } as const;

function quietArena(): Arena {
  const arena: Arena = createArena(CONTENT, { seed: 17, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  return arena;
}

void test('pick up is offered only while something lies within reach', (): void => {
  const arena: Arena = quietArena();
  const bare: Observation = arenaObservation(arena);
  assert.equal(bare.mask[PICKUP_MASK], 0);
  assert.deepEqual(commandsFor(arena.world, { move: 0, skill: 0, target: 0, use: PICKUP_CHOICE }, bare.view), []);
  dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 7 });
  assert.equal(arenaObservation(arena).mask[PICKUP_MASK], 1);
});

void test('the pick up choice walks to the nearest thing on the ground and takes it', (): void => {
  const arena: Arena = quietArena();
  const gold: GroundItem = dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 7 });
  const seen: Observation = arenaObservation(arena);
  const commands: Command[] = commandsFor(arena.world, { move: 0, skill: 0, target: 0, use: PICKUP_CHOICE }, seen.view);
  assert.deepEqual(commands, [{ type: 'pickup', groundId: gold.id }]);
  const from: Vec2 = { x: arena.world.player.pos.x, z: arena.world.player.pos.z };
  assert.equal(actionOf(commands, seen.view, from, NO_CARRY).use, PICKUP_CHOICE);
  let taken: boolean = false;
  for (let tick: number = 0; tick < WALK.ticks && !taken; tick += 1) {
    const events: WorldEvent[] = stepWorld(arena.world, tick === 0 ? commands : [], RL.tick);
    taken = events.some((event: WorldEvent): boolean => event.type === 'pickup' && event.ground.id === gold.id);
  }
  assert.ok(taken, 'the hero never picked the gold up');
});

void test('pick up wins over a move or a skill chosen in the same decision', (): void => {
  const arena: Arena = quietArena();
  const gold: GroundItem = dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 7 });
  const commands: Command[] = commandsFor(arena.world, { move: 3, skill: 1, target: 0, use: PICKUP_CHOICE }, arenaObservation(arena).view);
  assert.deepEqual(commands.filter((command: Command): boolean => command.type !== 'hold'), [{ type: 'pickup', groundId: gold.id }]);
});

void test('with a full bag the pick up choice passes over an item for gold it can take', (): void => {
  const arena: Arena = quietArena();
  const world: World = arena.world;
  const level: number = world.player.level;
  world.player.inventory = world.player.inventory.map((): ItemInstance => must(makeItem(world, level, null, null, { kind: 'monster', monster: 'cave_rat', zone: world.zone.id }), 'an item to fill the bag'));
  const stuck: ItemInstance = must(makeItem(world, level, null, null, { kind: 'monster', monster: 'cave_rat', zone: world.zone.id }), 'an item that will not fit');
  assert.equal(roomFor(world.content, world.player.inventory, stuck), 0);
  dropOnGround(world, world.player.pos, { kind: 'item', item: stuck });
  assert.equal(arenaObservation(arena).mask[PICKUP_MASK], 0);
  const gold: GroundItem = dropOnGround(world, { x: world.player.pos.x + FAR.gap, z: world.player.pos.z }, { kind: 'gold', amount: 7 });
  const seen: Observation = arenaObservation(arena);
  assert.equal(seen.mask[PICKUP_MASK], 1);
  assert.deepEqual(commandsFor(world, { move: 0, skill: 0, target: 0, use: PICKUP_CHOICE }, seen.view), [{ type: 'pickup', groundId: gold.id }]);
});

void test('pick up lets go of a held skill even when the same skill is chosen', (): void => {
  const arena: Arena = quietArena();
  const gold: GroundItem = dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 7 });
  arena.world.player.held = [0];
  const commands: Command[] = commandsFor(arena.world, { move: 0, skill: 1, target: 0, use: PICKUP_CHOICE }, arenaObservation(arena).view);
  assert.deepEqual(commands, [{ type: 'hold', slot: 0, down: false }, { type: 'pickup', groundId: gold.id }]);
});

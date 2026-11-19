import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena } from '../../test/shape-support.ts';
import type { Command, PlayerState, World } from '../world/types.ts';
import { commandsFor } from './act.ts';
import { observe } from './observe.ts';
import { createRecall } from './recall.ts';

const DUEL = { rival: 1, apart: 2 } as const;

void test('a second hero acting from its seat sends commands for itself, aimed at the hero it targets', (): void => {
  const world: World = shapeArena(['cleave']);
  world.player.pos = offset(0, 0);
  const apart: PlayerState = shapeArena(['cleave']).player;
  const rival: PlayerState = { ...apart, id: world.nextId, pos: offset(DUEL.apart, 0), party: DUEL.rival };
  world.nextId += 1;
  world.heroes.push(rival);
  const seen = observe(world, { situation: 'duel', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: { minRarity: 0 } }, rival);
  const commands: Command[] = commandsFor(world, { move: 0, skill: 1, target: 0, use: 0 }, seen.view);
  const swing: Command | undefined = commands.find((command: Command): boolean => command.type === 'skill');
  assert.ok(swing !== undefined && swing.type === 'skill');
  assert.equal(swing.by, rival.id);
  assert.equal(swing.targetId, world.player.id);
  assert.ok(commands.every((command: Command): boolean => command.by === rival.id));
  const own = observe(world, { situation: 'duel', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: { minRarity: 0 } }, world.player);
  assert.ok(commandsFor(world, { move: 0, skill: 1, target: 0, use: 0 }, own.view).every((command: Command): boolean => command.by === undefined));
});

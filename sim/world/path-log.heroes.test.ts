import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createWorld } from './create.ts';
import type { PathEntry } from './glitch-types.ts';
import { recordPath } from './path-log.ts';
import type { World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const RIVAL = { id: 9001 } as const;

function fell(actorId: number): WorldEvent {
  return { type: 'death', actorId, team: 'player', pos: { x: 0, z: 0 }, direction: { x: 0, z: 1 } };
}

void test('another hero falling is not a death on the primary hero path, and the primary falling is', (): void => {
  const world: World = createWorld(content, { seed: 1, save: null });
  world.events = [fell(RIVAL.id)];
  recordPath(world, 0.5);
  assert.notEqual(world.path.entries.at(-1)?.act, 'death');
  world.events = [fell(world.player.id)];
  recordPath(world, 0.5);
  assert.deepEqual(world.path.entries.slice(-1).map((entry: PathEntry): string => entry.act), ['death']);
});

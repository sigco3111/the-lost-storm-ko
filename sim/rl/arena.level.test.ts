import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Arena } from './arena.ts';
import { createArena } from './arena.ts';
import { readReplay, recordReplay } from './replay.ts';

const CONTENT: Content = loadContent();

void test('an arena asked for a level benches the hero at it and rolls everything else as before', (): void => {
  const free: Arena = createArena(CONTENT, { seed: 91, jitter: 0.2, waves: 2 });
  const asked: Arena = createArena(CONTENT, { seed: 91, jitter: 0.2, waves: 2, level: free.world.player.level });
  assert.deepEqual(asked.world.player.bar, free.world.player.bar);
  assert.deepEqual(asked.world.player.equipped, free.world.player.equipped);
  assert.deepEqual(asked.world.monsters.map((monster): string => monster.def.id), free.world.monsters.map((monster): string => monster.def.id));
  const other: number = free.world.player.level === 12 ? 3 : 12;
  assert.equal(createArena(CONTENT, { seed: 91, jitter: 0.2, waves: 2, level: other }).world.player.level, other);
});

void test('a replay keeps the level it was asked for', (): void => {
  const replay = recordReplay(createArena(CONTENT, { seed: 93, jitter: 0, waves: 1, level: 11 }), [], 'test');
  assert.equal(readReplay(JSON.parse(JSON.stringify(replay))).options.level, 11);
  const free = recordReplay(createArena(CONTENT, { seed: 93, jitter: 0, waves: 1 }), [], 'test');
  assert.equal('level' in readReplay(JSON.parse(JSON.stringify(free))).options, false);
});

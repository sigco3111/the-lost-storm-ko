import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Arena } from './arena.ts';
import { arenaRunning, createArena } from './arena.ts';
import { ACTION_HEADS } from './contract.ts';
import type { Replay } from './replay.ts';
import { actionFrom, playStep, readReplay, recordReplay, replayArena } from './replay.ts';

const CONTENT: Content = loadContent();
const STEPS: number = 120;

function played(seed: number): { readonly arena: Arena; readonly replay: Replay } {
  const arena: Arena = createArena(CONTENT, { seed, jitter: 0.2, waves: 2 });
  const rng = createRng(seed);
  const actions: number[][] = [];
  for (let step: number = 0; step < STEPS && arenaRunning(arena); step += 1) {
    const list: number[] = ACTION_HEADS.map((choices: number): number => rng.int(0, choices - 1));
    actions.push(list);
    playStep(arena, actionFrom(list));
  }
  return { arena, replay: recordReplay(arena, actions, 'test') };
}

void test('a replay plays the same fight again, step for step', (): void => {
  const { arena, replay } = played(41);
  const again: Arena = replayArena(CONTENT, replay);
  assert.equal(again.world.time, arena.world.time);
  assert.deepEqual(again.world.player.pos, arena.world.player.pos);
  assert.equal(again.world.player.life, arena.world.player.life);
  assert.equal(again.total, arena.total);
  assert.deepEqual(again.world.monsters.map((monster): number => monster.life), arena.world.monsters.map((monster): number => monster.life));
});

void test('a replay survives JSON and refuses a broken one', (): void => {
  const { replay } = played(42);
  assert.deepEqual(readReplay(JSON.parse(JSON.stringify(replay))), replay);
  assert.throws((): Replay => readReplay({ ...replay, actions: [[1, 2]] }));
  assert.throws((): Replay => readReplay({ ...replay, outcome: 'maybe' }));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { dropOnGround } from '../world/ground.ts';
import type { GroundItem } from '../world/types.ts';
import type { Arena } from './arena.ts';
import { afterTick, ARENA, createArena } from './arena.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();
const SCATTER = { seeds: 8 } as const;

function clearedArena(): Arena {
  const arena: Arena = createArena(CONTENT, { seed: 23, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  arena.world.ground = [];
  return arena;
}

void test('the last wave cleared with gold on the ground leaves time to loot, then wins', (): void => {
  const arena: Arena = clearedArena();
  dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 5 });
  assert.equal(afterTick(arena, []), REWARD.wave + REWARD.win);
  assert.equal(arena.outcome, 'running');
  arena.world.time += ARENA.lootTime;
  assert.equal(afterTick(arena, []), 0);
  assert.equal(arena.outcome, 'won');
});

void test('the last wave cleared with nothing wanted left wins at once', (): void => {
  const arena: Arena = { ...clearedArena(), pickup: { minRarity: CONTENT.rarities.length } };
  afterTick(arena, []);
  assert.equal(arena.outcome, 'won');
});

void test('each cleared wave scatters a few items of rolled rarity around the hero', (): void => {
  let scattered: number = 0;
  for (let seed: number = 1; seed <= SCATTER.seeds; seed += 1) {
    const arena: Arena = createArena(CONTENT, { seed, jitter: 0, waves: 1 });
    arena.world.monsters = [];
    arena.world.ground = [];
    afterTick(arena, []);
    const items: GroundItem[] = arena.world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'item');
    assert.ok(items.length <= ARENA.drops.max);
    scattered += items.length;
  }
  assert.ok(scattered > 0, 'no wave clear scattered any item');
});

void test('looting ends the moment the last wanted loot is gone', (): void => {
  const arena: Arena = clearedArena();
  dropOnGround(arena.world, arena.world.player.pos, { kind: 'gold', amount: 5 });
  afterTick(arena, []);
  arena.world.ground = [];
  afterTick(arena, []);
  assert.equal(arena.outcome, 'won');
});

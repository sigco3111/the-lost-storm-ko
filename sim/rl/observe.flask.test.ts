import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { FlaskState } from '../world/types.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import { MOVE_CHOICES, RL, SKILL_CHOICES } from './contract.ts';

const CONTENT: Content = loadContent();
const USE_AT: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets;

void test('a flask that would be refused for a full pool cannot be chosen, and opens once the pool drops', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 95, jitter: 0, waves: 1 });
  const hero = arena.world.player;
  const slot: number = hero.flasks.findIndex((flask: FlaskState): boolean => flask.def.resource === 'life');
  assert.ok(slot >= 0);
  hero.life = hero.maxLife;
  assert.equal(arenaObservation(arena).mask[USE_AT + slot + 1], 0);
  hero.life = hero.maxLife / 2;
  assert.equal(arenaObservation(arena).mask[USE_AT + slot + 1], 1);
});
